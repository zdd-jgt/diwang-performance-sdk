# 当前交接

## 当前阶段

第 1-5 阶段本地代码、模板和静态验收已完成。尚未进入第 6 阶段；真实浏览器、AWS 部署、Parquet 文件和 Athena 查询均未做云端验证。

## 已完成

- 已建立 pnpm Monorepo、共享协议、Node 22 运行口径、测试框架和 Git 基线。
- SDK 已实现性能与错误采集、采样、限流、64 KiB 分批、Beacon/fetch、内存重试和完整敏感信息脱敏。
- Ingest 已实现 API Gateway HTTP API v2 校验、240 KiB 限制、FIFO SQS 入队和 DLQ 模板。
- Cleaner 已实现复清洗、UA 解析、指标重评、稳定 `recordId=eventId`、Firehose 部分失败重试和安全删除 SQS 消息。
- `template-ingest.yaml` 已定义 API Gateway、Lambda、FIFO SQS/DLQ、限流、日志和最小 IAM。
- `template-storage.yaml` 已定义：
  - 两个加密、禁止公开访问并设置 `Retain` 的 S3 桶。
  - Glue Database/Table 及 Cleaner 固定列映射。
  - 基于服务端 `partitionDate` 的日期动态分区和 Glue 分区投影。
  - Firehose `DirectPut`、JSON 转 Snappy Parquet、错误前缀和投递日志。
  - Cleaner 仅对目标流执行 `firehose:PutRecordBatch` 的 IAM Policy。
  - Athena WorkGroup 的结果加密、7 天结果保留、扫描上限和 CloudWatch 指标。
  - 按 `projectId + partition_date + recordId` 去重的 View Saved Query，隔离租户并保留日期分区裁剪。
  - 包含今天在内 7 个自然日的 LCP/CLS/INP P50/P95/P99 Saved Query。
- `ProjectName` 最大 43 字符，确保拼接最坏环境名后 Firehose 名称不超过 64 字符。
- 已提供独立 Athena SQL 文件和 `RUNBOOK-STORAGE.md`。
- `packages/sdk/browser-acceptance/` 已纳入 Git，但真实浏览器 PASS 仍未执行。

## 本地验证结果

- 实际 Node：`22.23.1`。
- `pnpm --use-node-version=22.23.1 test`：85/85 通过。
  - Contracts 12
  - SDK 29
  - Ingest 12
  - Cleaner 22
  - IaC 10
- `pnpm --use-node-version=22.23.1 typecheck`：通过。
- `pnpm --use-node-version=22.23.1 build`：通过。
- `SAM_CLI_TELEMETRY=0 sam validate --lint --template-file infrastructure/aws/template-ingest.yaml`：通过。
- `SAM_CLI_TELEMETRY=0 sam validate --lint --template-file infrastructure/aws/template-storage.yaml`：通过。
- Cleaner 本地镜像 `diwang-cleaner:local` 已构建成功。

## 尚未执行与风险

- 未运行 `sam deploy`、CloudFormation、AWS CLI、Athena 查询或任何远程流水线。
- 未创建 S3、Firehose、Glue、Athena、IAM、ECS、API Gateway、Lambda、SQS 或 DLQ。
- 未验证真实 Firehose JSON→Parquet 转换、S3 动态分区、Glue 读取或 Athena SQL 执行。
- Athena NamedQuery 只保存 SQL；部署后必须先执行创建去重 View 的查询。
- Firehose 保持至少一次语义，查询方必须使用去重 View。
- 两个 S3 桶设置 `Retain`，部署后即使删除 Stack 仍可能产生存储费用。
- SDK 离线重试仅在内存中，不包含 IndexedDB 持久化。
- 真实浏览器性能影响、API 鉴权、WAF、扩缩容和实际成本仍待第 6 阶段验证。

## 下一步

1. 进入第 6 阶段前，明确 AWS 账号、Region、环境、预算、资源命名和回滚授权。
2. 先运行真实浏览器验收，再审查两个 Stack 的 CloudFormation Change Set。
3. 获得单独确认后才可部署接收与存储 Stack、ECS Cleaner，并执行合成数据端到端验证。
4. 云端验收后核对账单和保留资源，最后生成 `docs/开发总结.md`。
