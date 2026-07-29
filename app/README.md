# Performance Dashboard

`app/` 是 Performance SDK 的本地数据分析 Dashboard 第一版，用于学习和验证最终 Athena 分析界面的信息架构。

## 本地启动

在仓库根目录执行：

```bash
pnpm --filter @diwang/dashboard dev
```

然后访问 `http://127.0.0.1:5173/`。查询会模拟 1–5 秒延迟，可切换正常、空数据和查询失败三种场景。

## 当前功能

- 单项目与 24 小时、7 天、30 天范围筛选。
- 事件数、会话数、错误数、错误率 KPI。
- LCP、CLS、INP 的 P50、P95、P99 趋势。
- 按 LCP P95 排序的慢页面 Top 10。
- 错误分类、脱敏样本列表和详情抽屉。
- 1440px、1280px 与移动端响应式布局。

## Mock Query API

- `GET /api/dashboard/projects`
- `GET /api/dashboard/snapshot?projectId=shop-web&range=7d&scenario=success`

DTO 统一定义在 `packages/contracts/src/dashboard.ts`。未来接入真实 Athena 时，由服务端 `services/query-api` 实现相同响应结构，浏览器不得持有 AWS 凭据或直接访问 Athena。

## 验证

```bash
pnpm --filter @diwang/dashboard test
pnpm --filter @diwang/dashboard typecheck
pnpm --filter @diwang/dashboard build
```

当前版本仅使用本地 Mock 数据，不创建 AWS 资源，也不会产生 AWS 费用。SSR、真实 Query API、鉴权与部署不在第一版范围内。

