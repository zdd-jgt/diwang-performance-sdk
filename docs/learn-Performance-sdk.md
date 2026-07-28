这个任务是一个典型的 **“端到端全栈可观测性系统（APM / Real User Monitoring）”** 工程架构。

它将你的前端专业能力（性能 SDK）与云计算基础设施（AWS 日志收集 + ECS 容器化数据清洗）、数据可视化连接在一起。

---

## 1. 核心意图与学习目标

```
[前端 SDK (数据采集)] ➔ [AWS Kinesis/Api Gateway (接收端)] 
       ➔ [ECS (Fluent Bit/Logstash 清洗与聚合)] ➔ [OpenSearch/Timestream (存储)] 
              ➔ [前端 Dashboard (可视化图表)]

```

| 维度 | 核心意图（要让你懂什么） | 核心学习目标（能力提升） |
| --- | --- | --- |
| **1. 性能 SDK 开发** | **无侵入与低性能开销**。SDK 不能为了收集数据而拖慢宿主应用的性能。 | • 熟练运用 `PerformanceObserver` API（LCP, FID, CLS, INP）<br>

<br>• 掌握 `navigator.sendBeacon` 与 Web Worker 异步上报<br>

<br>• 设计 SDK 的生命周期管理与插件化架构 |
| **2. AWS + ECS 清洗** | **高并发海量数据的处理能力**。如何低成本、高可靠地解析非结构化日志。 | • 理解 AWS 日志架构（CloudWatch / Kinesis / ECS FireLens）<br>

<br>• 使用 ECS 部署 **Fluent Bit / Logstash / Go 微服务** 进行日志结构化提取<br>

<br>• 掌握数据清洗逻辑（过滤垃圾数据、IP转地理位置、UserAgent解析） |
| **3. 可视化 Dashboard** | **数据落地与业务价值**。把干瘪的数字转换为对开发和产品有指导意义的图表。 | • 大数据量下的看板性能优化（Sampling 抽样渲染）<br>

<br>• 熟练绘制时序图表（如 P50 / P95 / P99 响应延迟分布图）<br>

<br>• 告警阈值配置与异常下钻（Drill-down） |

---

## 2. 实际业务场景与应用

* **大厂 APM (Application Performance Monitoring) 系统**：如 Datadog、New Relic、阿里云 ARMS、腾讯云 RUM 的底层原理。
* **核心业务页面的性能护航**：在电商双11、大促上线期间，实时观察 FP、LCP 是否因新代码变慢，及时做灰度止损。
* **全链路 Trace 追踪与排障**：当用户报错“页面卡死”时，通过 SDK 上报的日志 ID 关联到后端日志，定位是 CDN 问题、API 延迟还是前端渲染死循环。

---

## 3. 开发时要考量的关键问题 (Checklist)

### A. 性能 SDK 开发考量

* **对宿主应用零污染**：
* **全局污染**：绝不污染全局作用域（使用闭包或 Module 包裹）。
* **异常隔离**：SDK 内部的任何运行时报错（`try-catch`）绝不能导致宿主页面崩掉。


* **上报时机与策略**：
* **数据丢失 vs 请求频次**：是来一条报一条，还是批量（Batching）累积 10 条或每 5 秒上报一次？
* **页面卸载上报**：用户直接关闭标签页时，常规 `fetch` 会被取消，必须优先使用 `navigator.sendBeacon` 或 `fetch` 的 `keepalive: true` 选项。



### B. ECS 日志清洗考量

* **清洗吞吐量**：当上报并发突增 100 倍时，ECS 任务如何利用 Auto Scaling（HPA）弹性扩容？
* **方案选择**：
* **轻量级**：在 ECS 上跑 **AWS FireLens (Fluent Bit)** 做日志提取直接转存 OpenSearch/S3。
* **自定义级**：自己用 Go/Node.js 写 ECS 清洗服务，支持复杂的业务逻辑匹配。



### C. 可视化页面考量

* **分位数（Percentiles）替代平均值**：
* *绝对不要只看平均耗时！* 100 个用户里有 99 个 100ms，1 个 10 秒，平均值会被拉高。可视化图表一定要展示 **P50, P90, P95, P99** 耗时。



---

## 4. 如何进行边界约束与验证 (Validation & Guardrails)

这是决定整个架构能否稳健运行的关键步骤：

### 边界约束 (Boundaries & Thresholds)

```
[SDK 端限流 / 采样] ➔ [服务端 Payload 限制] ➔ [ECS 存储上限/ TTL]

```

1. **客户端采样率控制 (Sampling Rate)**：
* **约束**：UV 极高的场景下，100% 采集会烧光 AWS 账单。
* **实施**：SDK 配置 `sampleRate: 0.1`（仅采集 10% 的正常用户），但对于错误日志（Error）保持 100% 上报。


2. **熔断与降级机制 (SDK Rate Limiting)**：
* **约束**：若宿主页面出现无限循环报错，SDK 不能连续发几万条请求打瘫网关。
* **实施**：SDK 内部设置**窗口滑动限流**（如：同一页面单分钟最多允许上报 50 条日志，超额抛弃并打印警告）。


3. **Payload 体积上限**：
* **约束**：限制单条上报日志最大不能超过 64KB（防止栈追踪 Stack Trace 过长导致网络阻塞）。


4. **数据存储生命周期 (TTL)**：
* **约束**：热日志存 OpenSearch 保留 14 天；归档日志转 AWS S3 Glacier，避免磁盘爆满。



---

### 验证方法 (How to Validate)

你可以按照以下步骤对每个环节进行“破坏性验证”：

| 验证阶段 | 测试操作 | 预期合格标准 |
| --- | --- | --- |
| **1. 无侵入性验证** | 在 Lighthouse / WebPageTest 中对比：<br>

<br>① 引入 SDK 前<br>

<br>② 引入 SDK 后 | 宿主页面的 Performance Score 降幅低于 1~2 分；CPU 主线程阻塞时间（TBT）无明显增加。 |
| **2. 极限抗压验证** | 用 JMeter / k6 对 AWS 上报网关打 10000 QPS 突发流量。 | SDK 自动触发限流丢包或降级；ECS 清洗队列（如 SQS/Kinesis）不丢数据，弹性扩容正常。 |
| **3. 极端离线验证** | SDK 采集数据时，手动在 Chrome DevTools 将网络切为 `Offline`，随后切回 `Online`。 | SDK 可以在本地 `indexedDB` /内存中暂存日志，并在网络恢复后补发（Retry 机制）。 |
| **4. 准确性验证** | 手动模拟慢加载（如 Chrome 限制 3G 网速）与 JS Error。 | 可视化 Dashboard 能在 1 分钟内准确反映出这一条高延迟与错误记录的 P95 抖动。 |