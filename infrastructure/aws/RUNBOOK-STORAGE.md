# 第 5 阶段存储查询 Runbook

## 执行模式

- 环境：`local`。
- 模式：`prepare-only`。
- 当前只准备 `template-storage.yaml` 和 Athena SQL，未创建或修改 AWS 资源。

## 模板资源

- S3 数据桶：保存 `telemetry/partition_date=YYYY-MM-DD/` 下的 Parquet 文件，Stack 删除时保留。
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

部署后会产生 S3 存储与请求、Firehose 数据处理和格式转换、Glue Catalog、Athena 扫描、CloudWatch Logs/指标费用。动态日期分区和 Parquet 可减少 Athena 扫描量，但费用不会为零。两个 S3 桶均设置 `Retain`，Stack 删除后仍可能持续产生存储费用。

## 回滚

1. 停止 Cleaner 写入或把 `FIREHOSE_STREAM_NAME` 切回上一版本。
2. 删除 CloudFormation Stack，移除 Firehose、Glue、Athena、IAM 和日志资源。
3. 数据桶与查询结果桶会保留；确认数据已归档且再次取得删除授权后再清理。
4. 若只回滚查询逻辑，恢复上一版 Athena View SQL，不需要改写 Parquet 数据。

## 未执行的外部动作

- 未运行 `sam deploy`、CloudFormation、AWS CLI、Athena 查询或远程流水线。
- 未创建 S3、Firehose、Glue、Athena、IAM 或 CloudWatch 资源。
- 未访问 AWS 账号、Region、凭据或账单。
