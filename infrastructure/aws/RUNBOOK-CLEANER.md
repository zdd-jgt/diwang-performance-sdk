# ECS Cleaner 定时任务 Runbook

## 当前模式

- 目标环境：`production`，Region 为 `ap-northeast-1`。
- 模式：`requires-confirmation`，已于 2026-07-29 获得用户确认并执行。
- Stack：`diwang-performance-production-cleaner`，当前状态为 `CREATE_COMPLETE`。
- ECR、IAM、ECS Task Definition、Scheduler、DLQ、日志组和安全组已创建；镜像 `0.1.0` 已推送，手动 Task 验收已完成。
- 复用现有 `hono-sam-cluster` 和 VPC；不使用已失效 NAT 的私有子网。
- 使用同一 VPC 的公网子网，Fargate Task 启动时分配临时公网 IP。

## 运行行为

- EventBridge Scheduler 每 5 分钟启动 1 个 Fargate Task。
- Task 使用 0.25 vCPU、512 MiB、Linux ARM64。
- 连续 2 次 SQS 长轮询为空后退出，最多运行 240 秒。
- 安全组不允许任何入站，仅允许 TCP 443 出站。
- Cleaner 只获得目标 SQS 的消费权限和目标 Firehose 的 `PutRecordBatch` 权限。
- Scheduler 默认 `DISABLED`，必须在镜像推送和手动验收后单独启用。

## 安全部署顺序

1. 构建 Ingest 与 Cleaner，并验证三个模板。
2. 为 Ingest、Storage、Cleaner 分别创建 CloudFormation Change Set，不执行。
3. 审核资源、IAM、保留策略和费用后取得部署确认。
4. 先部署 Ingest 和 Storage。
5. 部署 Cleaner Stack，保持 `ScheduleState=DISABLED`。
6. 使用 Cleaner Stack 输出的 ECR 地址构建并推送 `linux/arm64` 镜像。
7. 手动运行一次 ECS Task，确认能拉取镜像、消费 SQS 并写入 Firehose。
8. 创建第二个 Change Set，将 `ScheduleState` 改为 `ENABLED`。

## 必要参数

- `VpcId`：现有 VPC。
- `PublicSubnetId`：带 Internet Gateway 默认路由的现有公网子网。
- `IngestQueueUrl`、`IngestQueueArn`：来自 Ingest Stack 输出。
- `FirehoseDeliveryStreamName`、`FirehoseDeliveryStreamArn`：来自 Storage Stack 输出。
- `EcsClusterName=hono-sam-cluster`。

资源 ID 不写入仓库；创建 Change Set 时从已核对的 AWS 输出传入。

## 成本与回滚

- 会产生 Fargate、临时公网 IPv4、ECR、CloudWatch Logs、Scheduler 和少量 SQS 请求费用。
- ECR 仓库设置为 `Retain`，只保留最新 10 个镜像；Stack 删除后仍需确认是否清理。
- 回滚时先禁用 Scheduler，再停止运行中的 Task，最后删除 Stack。
- Scheduler DLQ 保留 14 天；处理失败消息前不得直接清空。

## 本地验收

```bash
pnpm --use-node-version=22.23.1 --filter @diwang/cleaner test
pnpm --use-node-version=22.23.1 --filter @diwang/cleaner typecheck
pnpm --use-node-version=22.23.1 --filter @diwang/cleaner build
SAM_CLI_TELEMETRY=0 sam validate --lint --template-file infrastructure/aws/template-cleaner.yaml
```

## 本次部署结果

- Scheduler 已确认为 `DISABLED`，不会自动启动 Fargate Task。
- ECR 使用 AES256、不可变标签和推送扫描；`0.1.0` 已确认为 `linux/arm64`、约 58 MB，扫描状态为 `COMPLETE` 且没有发现项。
- 安全组无入站规则，仅允许 TCP 443 出站。
- 首次 ECR push 长时间无输出且远端没有形成标签，终止后核对主机和 Docker 到 ECR 的认证连通性，再次推送成功。
- 手动 Task 退出码为 0，日志统计 `received=1`、`processed=1`、`failed=0`；主队列与 DLQ 均为 0。
- Firehose 在约 5 分钟缓冲后写入 `partition_date=2026-07-29`；首次文件因 SerDe 大小写缺陷业务列为 `NULL`。
- Storage 修复后第二次手动 Task 同样以退出码 0 完成，`received=1`、`processed=1`、`failed=0`，生成 4,550 字节的新 Parquet。
- Athena 精确查询已成功读取完整合成字段；Scheduler 继续保持禁用。
