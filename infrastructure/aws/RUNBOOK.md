# AWS 接收链路 Runbook

## 执行模式

- 目标环境：`production`，Region 为 `ap-northeast-1`。
- 模式：`requires-confirmation`，已于 2026-07-29 获得用户确认并执行。
- Stack：`diwang-performance-production-ingest`，当前状态为 `CREATE_COMPLETE`。

## 模板资源

- API Gateway HTTP API：`POST /v1/collect`，带 CORS、路由限流和无来源 IP 的访问日志。
- Ingest Lambda：Node.js 22、ARM64、256 MB、10 秒超时；使用账号共享并发，由 API 路由限流约束入口流量。
- SQS FIFO：按 `projectId` 分组，按 `batchId` 去重，SQS 托管加密。
- FIFO DLQ：失败 5 次后转入，保留 14 天；删除 Stack 时继续保留。
- CloudWatch Logs：API 和 Lambda 日志默认保留 14 天。
- 生产部署必须显式传入：
  - `AllowedOrigin=https://hono-sam-profile.pages.dev`
  - `AllowedProjectId=hono-sam-aws-learning`

> CORS 和项目白名单不是身份认证。它们用于限制浏览器来源和普通项目串写，不能阻止伪造请求；第一版通过 API 限流控制风险。

## 本地验收

```bash
pnpm --filter @diwang/aws-infrastructure test
pnpm --filter @diwang/aws-infrastructure typecheck
pnpm build
```

`SAM_CLI_TELEMETRY=0 sam validate --lint --template-file infrastructure/aws/template-ingest.yaml`
已在本地通过。

## 部署后健康检查

1. 使用不含个人数据的合成指标请求 `POST /v1/collect`，预期返回 `202`。
2. 检查 Lambda `Errors`、`Throttles` 和 API 5xx 指标为 0。
3. 检查主队列 `ApproximateAgeOfOldestMessage` 未持续增长。
4. 检查 DLQ 可见消息数为 0；非 0 时先导出并分析，不直接删除。

## 成本与影响

部署后会产生 API Gateway、Lambda、SQS、CloudWatch Logs 和 X-Ray 用量费用。模板通过 API 路由限流、账号并发上限和日志保留期限制风险，但费用不会等于零。共享并发可能与账号内其他 Lambda 竞争，后续提高账号配额后再评估独立预留并发。

## 回滚

1. 停止客户端流量或将 SDK `logUrl` 切回上一版本。
2. 删除 CloudFormation Stack 以移除 API、Lambda、主队列和日志组。
3. DLQ 设置为 `Retain`，回滚后仍可能产生少量存储费用。
4. 审核并导出 DLQ 后，需再次获得确认才能删除保留队列。

## 本次部署结果

- 首次创建因账号 Lambda 总并发额度仅为 5，无法设置预留并发 10 而自动回滚。
- 已删除空的保留 DLQ，移除预留并发配置后重新部署成功；入口流量继续由 API 路由限流和账号并发上限约束。
- 使用不含个人信息的合成指标执行健康检查，API 返回 `202`，主队列收到 1 条消息，DLQ 为 0。
- Cleaner 尚未部署，合成消息会保留在主队列，等待后续端到端验收消费。
