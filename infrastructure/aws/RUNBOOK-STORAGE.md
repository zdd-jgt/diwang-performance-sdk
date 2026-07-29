# 第 5 阶段存储查询 Runbook

## 执行模式

- 环境：`production`，Region 为 `ap-northeast-1`。
- 模式：`requires-confirmation`，已于 2026-07-29 获得用户确认并执行。
- Stack：`diwang-performance-production-storage`，当前状态为 `CREATE_COMPLETE`。

## 模板资源

- S3 数据桶：保存 `telemetry/partition_date=YYYY-MM-DD/` 下的 Parquet 文件，默认 30 天自动过期，Stack 删除时保留桶。
- S3 查询结果桶：保存 Athena 结果，7 天自动过期，Stack 删除时保留。
- Glue Database/Table：固定映射 Cleaner 输出列，使用日期分区投影，不需要每日创建 Glue Partition。
- Firehose：`DirectPut`，从 JSON 提取服务端 `partitionDate`，转换为 Snappy Parquet 后写入 S3。
- Cleaner 写权限：只允许 `firehose:PutRecordBatch` 到目标 Delivery Stream。
- Athena WorkGroup：强制加密结果位置，启用 CloudWatch 指标，并限制单次扫描字节数。
- Athena NamedQuery：创建按 `recordId` 保留最新记录的去重视图，以及近 7 天 Core Web Vitals P50/P95/P99 查询。

## 本地验收

```bash
pnpm --use-node-version=22.23.1 --filter @diwang/aws-infrastructure test
pnpm --use-node-version=22.23.1 --filter @diwang/aws-infrastructure typecheck
SAM_CLI_TELEMETRY=0 sam validate --lint --template-file infrastructure/aws/template-storage.yaml
```

## 部署后健康检查

1. 用不含个人信息的合成记录调用目标 Firehose，确认 DeliveryToS3 成功数增长。
2. 确认 S3 只产生 `partition_date=YYYY-MM-DD` 形式的主数据前缀，错误记录进入 `errors/`。
3. 在 Glue 中检查列类型与 Parquet 文件一致。
4. 先执行 `create_telemetry_deduplicated_view`，再把分位数查询中的 `replace_me` 改为目标 `projectId`。
5. 检查 Athena 扫描字节数、失败查询和 WorkGroup 单查询上限。

## 成本与影响

部署后会产生 S3 存储与请求、Firehose 数据处理和格式转换、Glue Catalog、Athena 扫描、CloudWatch Logs/指标费用。动态日期分区和 Parquet 可减少 Athena 扫描量，但费用不会为零。两个 S3 桶均设置 `Retain`；数据对象继续执行 30 天生命周期，查询结果继续执行 7 天生命周期。

## 回滚

1. 停止 Cleaner 写入或把 `FIREHOSE_STREAM_NAME` 切回上一版本。
2. 删除 CloudFormation Stack，移除 Firehose、Glue、Athena、IAM 和日志资源。
3. 数据桶与查询结果桶会保留；确认数据已归档且再次取得删除授权后再清理。
4. 若只回滚查询逻辑，恢复上一版 Athena View SQL，不需要改写 Parquet 数据。

## 本次部署结果

- Firehose 已为 `ACTIVE`，启用 JSON → Snappy Parquet、动态日期分区和 64 MiB/300 秒缓冲。
- 遥测桶使用 AES256、禁止公开访问并设置 30 天生命周期；Athena 结果设置 7 天生命周期。
- Glue 表已确认为 Parquet，日期分区投影范围为 `2025-01-01,NOW`。
- Athena WorkGroup 已启用强制结果位置和单查询 1 GiB 扫描上限。
- Athena 去重 View 已创建成功，原始表可定位当天分区中的 1 行。
- 首次端到端查询未通过：除 `partition_date` 外所有 Parquet 列均为 `NULL`。根因是 Glue 列名被规范为小写，而 Firehose `OpenXJsonSerDe.CaseInsensitive=false` 无法映射 Cleaner 的 camelCase JSON。
- 已在本地把 SerDe 改为大小写不敏感并增加回归断言，IaC 16/16、类型检查和 SAM lint 通过。
- Storage 更新 Change Set 已执行，Stack 为 `UPDATE_COMPLETE`；Firehose 为 `ACTIVE`、版本 2，实际 `CaseInsensitive=true` 且没有失败描述。
- 静态差异只有 `CaseInsensitive: false → true`，Firehose 原地更新且未替换资源。IAM Policy 仅因引用 Firehose ARN 被动态标记，没有权限内容扩大。
- 修复后重新发送 1 条合成事件并运行 Cleaner，第二个 Parquet 为 4,550 字节。
- Athena 去重 View 精确查询成功返回 `projectId`、`recordId`、LCP `2400`、评级、接收时间、release 和页面 URL，扫描 1,012 字节；业务列不再为 `NULL`。
- 现有无效合成 Parquet 不含个人数据，将按 30 天生命周期过期。
