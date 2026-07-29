# 地网数据分析面板

`app/` 是地网 Performance SDK 的本地数据分析 Dashboard。默认通过本地 Query API 查询真实 Athena 数据，浏览器不保存 AWS 凭据。

## 本地启动

在仓库根目录执行：

```bash
pnpm dev:dashboard
```

然后访问 `http://127.0.0.1:4173/`。Athena 是半实时查询，通常需要 1–5 秒或更久。

只开发界面、不访问 AWS 时：

```bash
pnpm dev:dashboard:mock
```

Mock 模式可切换正常数据、空数据和查询失败三种场景，页面会明确标记为“模拟数据”。

## 当前功能

- 单项目与 24 小时、7 天、30 天范围筛选。
- 事件数、会话数、错误数、错误率 KPI。
- LCP、CLS、INP 的 P50、P95、P99 趋势。
- 按 LCP P95 排序的慢页面 Top 10。
- 错误分类、脱敏样本列表和详情抽屉。
- 1440px、1280px 与移动端响应式布局。

## 数据接口

- `GET /api/dashboard/projects`
- `GET /api/dashboard/snapshot?projectId=hono-sam-aws-learning&range=7d`

DTO 统一定义在 `packages/contracts/src/dashboard.ts`。真实模式由 `services/query-api` 查询 Athena；`scenario` 参数只在显式 Mock 模式使用。

## 验证

```bash
pnpm --filter @diwang/dashboard test
pnpm --filter @diwang/dashboard typecheck
pnpm --filter @diwang/dashboard build
```

本地启动不会创建 AWS 资源。真实模式会产生少量 Athena 按扫描量计费；60 秒缓存可减少重复查询。Query API 公网部署、鉴权和 SSR 不在当前范围内。
