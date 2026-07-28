# 前端性能与错误监控 SDK 开发与设计文档 (`diwang-performance-sdk`)

## 一、 项目简介

`diwang-performance-sdk` 是一款无侵入、高性能的前端监控 SDK。
通过浏览器原生 `PerformanceObserver` API 异步无损采集 Core Web Vitals（LCP、FID、CLS）及传统性能指标（FP、FCP、TBT、Navigation Timing），同时捕获前端运行时异常（JS 报错、资源加载失败、Promise 异常）。

SDK 采用 **分级队列调度 + 空闲上报 (`requestIdleCallback`)** 机制，将日志自动化发送至指定的 AWS 日志服务入口（API Gateway / NLB），后续由部署在 Amazon ECS 上的日志清洗服务进行解析、Sourcemap 还原与落库。

---

## 二、 整体架构与日志处理链路

```text
+-----------------------------------------------------------------------------------+
|                                 客户端 SDK                                         |
|                                                                                   |
|  [Performance Observer]            [Error Catching]                               |
|  (FP/FCP/LCP/FID/CLS/TBT/Nav)     (JS/Resource/Promise Error)                     |
|            │                                │                                     |
|            └────────────────► [格式化 & 评分] ◄─┘                                    |
|                                     │                                             |
|                         [requestIdleCallback 调度队列]                            |
|                                     │                                             |
|                               [sendLogs 通道]                                     |
|                      (sendBeacon / fetch keepalive)                               |
+─────────────────────────────────────┼─────────────────────────────────────────────+
                                      │ HTTPS POST (logUrl)
                                      ▼
+-----------------------------------------------------------------------------------+
|                              AWS 日志清洗架构                                      |
|                                                                                   |
|                 [AWS API Gateway / NLB] ──► [Amazon Kinesis]                      |
|                                                    │                              |
|                                                    ▼                              |
|                                     [Amazon ECS 日志清洗容器]                      |
|                                                    │                              |
|                               ┌────────────────────┴────────────────────┐         |
|                               ▼                                         ▼         |
|                    [Amazon OpenSearch (实时/看板)]               [S3 / Athena (冷存)]|
+-----------------------------------------------------------------------------------+

```

---

## 三、 SDK 项目目录结构

```text
src/
├── index.ts                     # SDK 主入口 (DiwangSDK 类 / init 函数)
├── config/
│   └── index.ts                 # 全局配置中心 (logUrl 校验及基础配置)
├── typings/
│   └── types.ts                 # TS 类型定义文件
├── performance/
│   ├── observeInstances.ts      # Observer 实例集中存储数组
│   ├── performanceObserver.ts   # PerformanceObserver 基础封装与销毁
│   ├── observe.ts               # 性能指标采集调度中心
│   ├── paint.ts                 # FP, FCP, LCP
│   ├── firstInput.ts            # FID
│   ├── cumulativeLayoutShift.ts # CLS
│   ├── totalBlockingTime.ts     # TBT (longtask)
│   └── getNavigationTiming.ts   # Navigation Timing 基础指标解析
├── error/
│   └── index.ts                 # ErrorTrace 错误监听类 (onerror, addEventListener, unhandledrejection)
└── data/
    ├── report.ts                # Payload 格式化与底层 sendBeacon / fetch 发送逻辑
    └── scheduler.ts             # 基于 requestIdleCallback 的队列与优先级调度器

```

---

## 四、 核心功能代码实现

### 1. 类型定义 (`src/typings/types.ts`)

```typescript
export enum AskPriority {
  URGENT = 'urgent', // 错误日志、页面隐藏时的 Final 终值指标
  IDLE = 'idle',     // 常规分步采集的性能指标
}

export interface IVitalsScore {
  lcpScore: 'good' | 'needs-improvement' | 'poor';
  clsScore: 'good' | 'needs-improvement' | 'poor';
  fidScore: 'good' | 'needs-improvement' | 'poor';
}

export interface IDiwangOptions {
  /** AWS 日志接收端 API 地址 (必填) */
  logUrl: string;
  /** 是否开启全局异常捕获，默认 true */
  captureError?: boolean;
  /** 是否开启资源加载 timing 监控 */
  resourceTiming?: boolean;
  /** 是否开启 Element Timing 监控 */
  elementTiming?: boolean;
  /** 自定义分析回调 */
  analyticsTracker?: (data: Record<string, any>) => void;
  /** 指标采集的最大超时阈值 (ms) */
  maxTime?: number;
}

```

### 2. 配置中心 (`src/config/index.ts`)

```typescript
import { IDiwangOptions } from '../typings/types';

export const IYidengConfig: Required<Pick<IDiwangOptions, 'logUrl' | 'captureError' | 'maxTime'>> & IDiwangOptions = {
  logUrl: '',
  captureError: true,
  resourceTiming: false,
  elementTiming: false,
  maxTime: 15000,
};

export const setConfig = (options: IDiwangOptions) => {
  if (!options || !options.logUrl) {
    throw new Error('[Performance SDK] 初始化失败：logUrl 属于必填参数！');
  }
  Object.assign(IYidengConfig, options);
};

```

### 3. 性能采集调度 (`src/performance/observe.ts`)

```typescript
import { po, disconnectPerfObserversHidden } from './performanceObserver';
import { reportData } from '../data/scheduler';
import { AskPriority } from '../typings/types';

let lcpValue = 0;
let clsValue = 0;
let tbtValue = 0;

export const initPerformanceObserver = () => {
  // 1. FP & FCP
  po('paint', (entries) => {
    entries.forEach((entry) => {
      if (entry.name === 'first-paint') {
        reportData({ name: 'FP', value: entry.startTime }, AskPriority.IDLE);
      } else if (entry.name === 'first-contentful-paint') {
        reportData({ name: 'FCP', value: entry.startTime }, AskPriority.IDLE);
        initTBTObserver();
      }
    });
  });

  // 2. LCP
  po('largest-contentful-paint', (entries) => {
    const lastEntry = entries[entries.length - 1];
    lcpValue = lastEntry.startTime;
  });

  // 3. CLS
  po('layout-shift', (entries) => {
    entries.forEach((entry: any) => {
      if (!entry.hadRecentInput) {
        clsValue += entry.value;
      }
    });
  });

  // 4. FID
  po('first-input', (entries) => {
    const firstInput = entries[0];
    if (firstInput) {
      const fid = firstInput.processingStart - firstInput.startTime;
      reportData({ name: 'FID', value: fid }, AskPriority.IDLE);
      schedulePostFidReports();
    }
  });

  // 页面隐藏时清理 Observer 并上报 Final 值
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      reportData({ name: 'LCP_FINAL', value: lcpValue }, AskPriority.URGENT);
      reportData({ name: 'CLS_FINAL', value: clsValue }, AskPriority.URGENT);
      reportData({ name: 'TBT_FINAL', value: tbtValue }, AskPriority.URGENT);
      disconnectPerfObserversHidden();
    }
  });
};

function initTBTObserver() {
  po('longtask', (entries) => {
    entries.forEach((entry) => {
      if (entry.duration > 50) {
        tbtValue += entry.duration - 50;
      }
    });
  });
}

function schedulePostFidReports() {
  reportData({ name: 'LCP', value: lcpValue }, AskPriority.IDLE);
  reportData({ name: 'CLS', value: clsValue }, AskPriority.IDLE);
  setTimeout(() => reportData({ name: 'TBT_5S', value: tbtValue }, AskPriority.IDLE), 5000);
  setTimeout(() => reportData({ name: 'TBT_10S', value: tbtValue }, AskPriority.IDLE), 10000);
}

```

### 4. 错误监控模块 (`src/error/index.ts`)

```typescript
import { reportData } from '../data/scheduler';
import { AskPriority } from '../typings/types';

export class ErrorTrace {
  constructor() {
    this.initGlobalErrors();
    this.initResourceErrors();
    this.initUnhandledRejection();
  }

  private initGlobalErrors() {
    window.onerror = (message, source, lineno, colno, error) => {
      reportData({
        type: 'JS_ERROR',
        message: String(message),
        source,
        lineno,
        colno,
        stack: error?.stack || ''
      }, AskPriority.URGENT);
    };
  }

  private initResourceErrors() {
    window.addEventListener('error', (event) => {
      const target = event.target as HTMLElement;
      if (target && (target.tagName || (target as any).src)) {
        reportData({
          type: 'RESOURCE_ERROR',
          tagName: target.tagName,
          url: (target as any).src || (target as any).href
        }, AskPriority.URGENT);
      }
    }, true);
  }

  private initUnhandledRejection() {
    window.addEventListener('unhandledrejection', (event) => {
      reportData({
        type: 'PROMISE_ERROR',
        reason: event.reason?.stack || String(event.reason)
      }, AskPriority.URGENT);
    });
  }
}

```

### 5. 上报与队列调度 (`src/data/report.ts` & `scheduler.ts`)

```typescript
// src/data/report.ts
import { IYidengConfig } from '../config';
import { AskPriority } from '../typings/types';

export function formatPayload(data: Record<string, any>) {
  return {
    ...data,
    timestamp: Date.now(),
    pageUrl: window.location.href,
    userAgent: navigator.userAgent,
    sdkVersion: '1.0.0',
  };
}

export function sendLogs(logs: Array<Record<string, any>>, priority: AskPriority): void {
  const url = IYidengConfig.logUrl;
  if (!url) return;

  if (IYidengConfig.analyticsTracker) {
    logs.forEach((log) => IYidengConfig.analyticsTracker!(log));
  }

  const payloadString = JSON.stringify(logs);

  if (priority === AskPriority.URGENT && navigator.sendBeacon) {
    const blob = new Blob([payloadString], { type: 'application/json' });
    if (navigator.sendBeacon(url, blob)) return;
  }

  fetch(url, {
    method: 'POST',
    body: payloadString,
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
  }).catch((err) => console.error('[Performance SDK] 日志上报 AWS 失败:', err));
}

// src/data/scheduler.ts
import { AskPriority } from '../typings/types';
import { formatPayload, sendLogs } from './report';

const logQueue: Array<Record<string, any>> = [];
let isScheduled = false;

export const reportData = (data: Record<string, any>, priority: AskPriority = AskPriority.IDLE) => {
  const formattedData = formatPayload(data);

  if (priority === AskPriority.URGENT) {
    sendLogs([formattedData], priority);
    return;
  }

  logQueue.push(formattedData);
  scheduleFlush();
};

function scheduleFlush() {
  if (isScheduled) return;
  isScheduled = true;

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback((deadline) => {
      if (deadline.timeRemaining() > 0 || deadline.didTimeout) {
        flushQueue();
      }
      isScheduled = false;
    });
  } else {
    setTimeout(() => {
      flushQueue();
      isScheduled = false;
    }, 1000);
  }
}

function flushQueue() {
  if (logQueue.length === 0) return;
  const chunk = logQueue.splice(0, logQueue.length);
  sendLogs(chunk, AskPriority.IDLE);
}

```

---

## 五、 SDK 仓库构建配置 (针对 Git 方式导入优化)

为了支持使用者直接通过 **Git 仓库链接** 安装，SDK 本身的 `package.json` 需要配置 `prepare` 脚本及产物导出入口：

```json
{
  "name": "diwang-performance-sdk",
  "version": "1.0.0",
  "description": "前端性能与错误监控 SDK",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts",
    "prepare": "npm run build"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.0.0"
  }
}

```

> **注意**：配置 `"prepare": "npm run build"` 后，当业务项目运行 `pnpm add git+...` 安装时，包管理器会自动执行构建拉取，无需将 `dist/` 构建产物提交到 Git 代码库中。

---

## 六、 业务项目接入指南 (Git 安装方式)

### 1. 安装命令

在前端业务工程根目录下，通过 Git 地址直接安装：

```bash
# pnpm (推荐)
pnpm add git+https://github.com/your-org/diwang-performance-sdk.git#main

# npm
npm install git+https://github.com/your-org/diwang-performance-sdk.git#main

# 锁定指定分支/TAG 版本
pnpm add git+https://github.com/your-org/diwang-performance-sdk.git#v1.0.0

```

安装完成后，业务项目的 `package.json` 会自动增加依赖声明：

```json
{
  "dependencies": {
    "diwang-performance-sdk": "git+https://github.com/your-org/diwang-performance-sdk.git#main"
  }
}

```

### 2. 代码初始化

在业务项目（React / Vue / 原生 TS）的**入口文件最顶部**引入并调用 `init()` 函数：

```typescript
// src/main.ts 或 src/main.tsx
import { init } from 'diwang-performance-sdk';

// 优先执行 SDK 初始化，保证最早捕获首屏渲染指标与启动阶段报错
init({
  logUrl: 'https://logs-api.yourdomain.com/v1/collect', // 你的 AWS API Gateway / NLB 接口
  captureError: true,
  maxTime: 15000,
});

```

---

## 七、 AWS ECS 清洗服务逻辑指导

上报至 AWS 的数据流经 API Gateway / Kinesis 后，由部署在 ECS Fargate 容器中的清洗服务进行清洗：

```typescript
// ECS 洗数据服务处理逻辑伪代码
export async function processLogBatch(rawLogs: any[]) {
  return rawLogs.map((log) => {
    const cleanLog = {
      ...log,
      serverTimestamp: new Date().toISOString(),
    };

    // 1. User Agent 设备与系统解析
    cleanLog.device = parseUserAgent(log.userAgent);

    // 2. 针对 JS 错误进行 Sourcemap 还原
    if (cleanLog.type === 'JS_ERROR' && cleanLog.stack) {
      cleanLog.mappedStack = resolveSourceMap(cleanLog.source, cleanLog.lineno, cleanLog.colno);
    }

    // 3. Core Web Vitals 得分核算
    if (cleanLog.name === 'LCP' || cleanLog.name === 'LCP_FINAL') {
      cleanLog.rating = cleanLog.value <= 2500 ? 'good' : cleanLog.value <= 4000 ? 'needs-improvement' : 'poor';
    }

    return cleanLog;
  });
}

```