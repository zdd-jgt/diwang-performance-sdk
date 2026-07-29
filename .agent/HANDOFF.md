# 当前交接

## 当前阶段

学习版全链路已经完成：SDK、Ingest、Cleaner、Parquet/Glue/Athena、Cloudflare 真实项目接入和本地「地网」真实数据面板均已验收；Scheduler 已启用。

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
- `packages/sdk/browser-acceptance/` 已纳入 Git，并已取得真实浏览器 PASS。
- `apps/demo` 已提供本地交互 Demo：
  - 展示 SDK、本地接收端、批次和事件状态。
  - 可触发 JS、Promise、资源错误并查看脱敏数据。
  - 内置内存接收端、协议校验、清空操作和 HTTP 验收脚本，不连接 AWS。
- `app/` 与 `services/query-api/` 已提供本地「地网」数据分析 Dashboard：
  - 默认由仅监听 `127.0.0.1` 的 Query API 使用本机 AWS 凭据查询真实 Athena；浏览器不持有凭据。
  - 显式 Mock 模式继续支持正常、空数据和查询失败测试。
  - 支持项目与时间范围筛选、KPI、LCP/CLS/INP 分位数趋势、慢页面 Top 10。
  - 支持错误分类、脱敏样本列表与详情抽屉，以及正常、空数据、查询失败状态。
  - 产品名称和主要界面文案已统一为「地网」中文界面。
  - `pnpm dev:dashboard` 同时启动 Query API 与 Dashboard；`pnpm dev:dashboard:mock` 只启动 Mock 面板。
- 生产接入准备已完成：
  - Ingest 增加 `AllowedProjectId` 白名单，生产 CORS 仅允许 `https://hono-sam-profile.pages.dev`。
  - S3 遥测对象默认 30 天过期；Athena 结果 7 天、CloudWatch 日志 14 天。
  - 新增 `template-cleaner.yaml`：复用现有 VPC 和 `hono-sam-cluster`，公网子网临时公网 IP，独立零入站安全组。
  - Cleaner 在北京时间每天 02:00 启动，连续 2 次空轮询或最多 240 秒后退出；模板默认禁用，生产验收后已单独启用。
  - SDK 包改为自包含产物，类型和浏览器代码不依赖未发布的 contracts/Zod。
- Hono React 前端使用 `frontend/vendor/diwang-sdk-0.1.0.tgz`，性能采样 10%、错误采集开启，版本取 Cloudflare `CF_PAGES_COMMIT_SHA`。
- Cloudflare Pages Production 已配置真实 `VITE_PERFORMANCE_LOG_URL`、开启 `main` 自动部署并重新部署成功。
- `diwang-performance-production-ingest` 已在 `ap-northeast-1` 部署成功；合成请求返回 `202`，主队列收到 1 条消息，DLQ 为 0。
- `diwang-performance-production-storage` 已部署成功；Firehose 为 `ACTIVE`，S3、Glue、Athena 配置已做只读验收。
- `diwang-performance-production-cleaner` 已更新成功；Scheduler 为 `cron(0 2 * * ? *)`、`Asia/Shanghai`、`ENABLED`，ECR、Task Definition、IAM、DLQ、日志组和零入站安全组已创建。
- Cleaner `0.1.0` 已推送到 ECR，远端平台为 `linux/arm64`；扫描为 `COMPLETE` 且没有发现项。
- 首次 ECR push 挂起且远端标签不存在，终止后完成认证和网络诊断，安全重试成功。
- 手动 Cleaner Task 正常退出，`received=1`、`processed=1`、`failed=0`；主队列和 DLQ 均为 0。
- Firehose 已生成日期分区的 AES256 Parquet；验收文件为 2,859 字节，文件头尾都是 `PAR1`，错误前缀为空。
- Athena 去重 View DDL 执行成功；原始表当天分区 `count(*)=1`。
- SerDe 修复后第二次 Cleaner Task 退出码为 0，生成 4,550 字节的新 Parquet。
- Athena 精确查询成功返回完整 `projectId`、`recordId`、LCP `2400`、评级、接收时间、release 和页面 URL，扫描 1,012 字节。
- 新增一次已授权真实 Cleaner 验收：Task 退出码 0，`received=2`、`processed=2`、`failed=0`，主队列由 2 归零，DLQ 保持 0。
- Firehose 新增 6,186 字节 Parquet；真实 Query API 返回 10 条事件、2 个会话，并识别线上 Hono 页面 LCP P95 为 932ms。
- Athena 首次 Dashboard 查询发现 bigint `clientTimestamp` 与 varchar `receivedAt` 类型不兼容；改为 UTC ISO 转换并完成测试、真实 Athena 和浏览器复验。
- 当前 AWS 账号 Lambda 总并发额度为 5；已移除无法落地的预留并发 10，改用账号共享并发和 API 路由限流。

## 本地验证结果

- 实际 Node：`22.23.1`。
- 根测试：150/150 通过。
  - Dashboard 19
  - Query API 32
  - Demo 3
  - Contracts 12
  - SDK 29
  - Ingest 14
  - Cleaner 25
  - IaC 16
- 根类型检查：通过。
- 根构建：通过。
- Dashboard Chrome 验收通过：
  - 1440px、1280px、390px 均无横向溢出。
  - 正常、空数据、查询失败三种状态通过。
  - 图表切换、错误抽屉、键盘焦点和移动端布局通过。
- `pnpm --use-node-version=22.23.1 --filter @diwang/demo acceptance:http`：通过。
- `SAM_CLI_TELEMETRY=0 sam validate --lint --template-file infrastructure/aws/template-ingest.yaml`：通过。
- `SAM_CLI_TELEMETRY=0 sam validate --lint --template-file infrastructure/aws/template-storage.yaml`：通过。
- `SAM_CLI_TELEMETRY=0 sam validate --lint --template-file infrastructure/aws/template-cleaner.yaml`：通过。
- Ingest Stack：`CREATE_COMPLETE`；API 合成健康检查 HTTP `202`。
- Storage Stack：`UPDATE_COMPLETE`；Firehose、S3、Glue、Athena 实际配置和查询核对通过。
- Cleaner 本地镜像 `diwang-cleaner:acceptance` 已构建成功：ARM64、`node` 用户、约 58 MB。
- Docker Desktop 已启动，本地 Cleaner 镜像再次核对为 ARM64、`node` 用户、58,373,022 字节。
- Hono 项目 Node 单测 21/21、Go 全部测试、根类型检查通过。
- Hono 前端 build、lint 和浏览器启动验收通过；提交 SHA 与日志地址已确认写入构建产物。
- Hono 线上页面可访问且控制台无错误；生产 JS 包包含正确 API 地址与项目 ID。10% 采样受控验收前主队列为 0，30 次加载后为 2，确认浏览器 SDK → Ingest → SQS 链路成功。
- 地网真实 Athena 浏览器验收通过：真实数据标识、10 条事件、2 个会话、真实 Hono 页面 0.93s，控制台无错误。
- Dashboard 浏览器产物未发现 AWS 凭据、账号、S3 路径或 QueryExecutionId 标记。

## 尚未执行与风险

- 已按用户授权创建并执行 Ingest、Storage、Cleaner Change Set，推送 ECR 镜像，运行两次手动 ECS Task、执行 Athena 验收并完成 Cloudflare 生产部署。
- 三个 Stack 相关资源已经创建并开始按使用量计费；Scheduler 已启用，每天会产生一次 Fargate Task、临时公网 IPv4、日志及相关请求费用。
- 已验证真实 Firehose JSON→Parquet、S3 动态日期分区、Glue 读取、Athena View 和精确 SQL 查询。
- 首次 Athena 验收发现 SerDe 大小写缺陷；已修复为 `CaseInsensitive=true`、增加回归测试并完成生产复验。
- Firehose 保持至少一次语义，查询方必须使用去重 View。
- 两个 S3 桶设置 `Retain`，部署后即使删除 Stack 仍可能产生存储费用。
- SDK 离线重试仅在内存中，不包含 IndexedDB 持久化。
- Demo 的 HTTP 端到端验收已通过；本次运行时没有可用浏览器实例，因此 Demo 视觉与按钮交互仍需补一次浏览器验收。
- Dashboard 目前只在本地运行；公网部署、鉴权和 SSR 尚未实现。
- API 强身份认证、WAF、扩缩容、真实浏览器长期性能影响和精确账单仍需后续验证。
- 现有私有子网的 NAT 路由为 `blackhole`，原 NAT Gateway 已不存在；Cleaner 第一版改用现有公网子网并分配临时公网 IP。
- 当前 Lambda 总并发额度只有 5，Ingest 与账号内其他 Lambda 共享并发，存在高负载时相互竞争的风险。
- 项目白名单和 CORS 不是强身份认证，第一版仍可能被伪造请求；通过限流降低风险，正式生产可增加 WAF 或服务端签名。
- Scheduler 启用前主队列有 2 条线上采样验收消息，等待首次北京时间 02:00 自动清洗。

## 下一步

1. 本地查看真实数据：确认 AWS 默认凭据可用后运行 `pnpm dev:dashboard`，访问 `http://127.0.0.1:4173/`。
2. 继续观察每天 02:00 Scheduler、队列/DLQ、Parquet 和 Athena 扫描量。
3. 到 AWS Billing 核对实际费用；如果需要公网 Dashboard，再单独设计鉴权、部署和 SSR。
