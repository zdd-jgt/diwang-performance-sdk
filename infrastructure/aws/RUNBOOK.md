# 第 3 阶段 AWS 接收链路 Runbook

## 执行模式

- 环境：尚未选择，模板默认参数为 `dev`。
- 模式：`prepare-only`。
- 当前仅准备 `template-ingest.yaml`，未创建或修改任何 AWS 资源。

## 模板资源

- API Gateway HTTP API：`POST /v1/collect`，带 CORS、路由限流和无来源 IP 的访问日志。
- Ingest Lambda：Node.js 22、ARM64、256 MB、10 秒超时、预留并发 10。
- SQS FIFO：按 `projectId` 分组，按 `batchId` 去重，SQS 托管加密。
- FIFO DLQ：失败 5 次后转入，保留 14 天；删除 Stack 时继续保留。
- CloudWatch Logs：API 和 Lambda 日志默认保留 14 天。

## 本地验收

```bash
pnpm --filter @diwang/aws-infrastructure test
pnpm --filter @diwang/aws-infrastructure typecheck
pnpm build
```

`SAM_CLI_TELEMETRY=0 sam validate --lint --template-file infrastructure/aws/template-ingest.yaml`
已于 2026-07-28 在本地通过，未连接 AWS 账号或创建资源。

## 部署后健康检查

1. 使用不含个人数据的合成指标请求 `POST /v1/collect`，预期返回 `202`。
2. 检查 Lambda `Errors`、`Throttles` 和 API 5xx 指标为 0。
3. 检查主队列 `ApproximateAgeOfOldestMessage` 未持续增长。
4. 检查 DLQ 可见消息数为 0；非 0 时先导出并分析，不直接删除。

## 成本与影响

部署后会产生 API Gateway、Lambda、SQS、CloudWatch Logs 和 X-Ray 用量费用。模板通过限流、预留并发和日志保留期限制风险，但费用不会等于零。

## 回滚

1. 停止客户端流量或将 SDK `logUrl` 切回上一版本。
2. 删除 CloudFormation Stack 以移除 API、Lambda、主队列和日志组。
3. DLQ 设置为 `Retain`，回滚后仍可能产生少量存储费用。
4. 审核并导出 DLQ 后，需再次获得确认才能删除保留队列。

## 未执行的外部动作

- 未运行 `sam deploy`、CloudFormation、AWS CLI 或任何远程流水线。
- 未创建 IAM、API Gateway、Lambda、SQS、DLQ 或日志组。
- 未访问 AWS 账号、Region、凭据或账单。
