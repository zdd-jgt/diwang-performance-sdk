# 当前交接

## 当前阶段

第 2-4 阶段功能代码和本地模板已实现，但验收未闭环；必须先完成本文件中的修复项，暂不得进入第 5 阶段。

## 已完成

- 已建立项目级会话交接规则。
- 已创建 pnpm Monorepo、统一 TypeScript 配置和根级脚本。
- 已创建 `@diwang/contracts` 日志契约包。
- 已实现 Metric、Error、Batch 的 Zod Schema 与 TypeScript 类型。
- 已隔离类型入口和运行时 Schema，根入口不会加载 Zod。
- 已增加 12 个日志契约单元测试。
- 已创建 `@diwang/sdk` 浏览器 SDK 包，提供 `init()` 和实例化生命周期。
- 已实现 LCP、CLS、INP、FP、FCP、TBT 和 Navigation Timing 指标采集。
- CLS 使用会话窗口，INP 使用交互时长近似 P98，并按当前 Core Web Vitals 阈值评分。
- 已实现 JS、资源加载和未处理 Promise 异常采集，不覆盖宿主 `window.onerror`。
- 已实现空闲批处理、队列上限、每分钟限流、`sendBeacon` 与 `fetch keepalive` 降级。
- 已移除页面与资源 URL 的凭据、查询参数和片段，并遮盖常见敏感赋值。
- SDK 运行时产物不包含 Zod 或 `@diwang/contracts` 运行时代码。
- 已增加 22 个 SDK 单元测试。
- 已扩展 `IngestQueueMessage` 契约，统一服务端接收时间、API 请求 ID 和原始批次结构。
- 已创建 `@diwang/ingest` Lambda 服务，适配 API Gateway HTTP API v2 请求。
- 已实现 POST 与 Content-Type 校验、Base64 解码、240 KiB 体积限制和 Zod 严格校验。
- 已实现 SQS 单批入队；成功返回 202，队列失败返回不泄露内部信息的 503。
- 接收端不采集来源 IP，不记录请求体、凭据或校验详情。
- Ingest 构建会内联 AWS SDK、共享契约和 Zod，生成单文件自包含 Lambda 产物。
- 已增加 12 个 Ingest 单元测试，覆盖正常、Base64、边界、非法输入、队列故障和配置缺失。
- 已扩展扁平化 `CleanTelemetryRecord` 契约，适配 Firehose、Glue 和 Parquet 固定列。
- 已创建无状态 `@diwang/cleaner` 服务，支持 SQS 长轮询和 SIGTERM/SIGINT 优雅停止。
- 已实现 URL 与错误文本复清洗，并在服务端重新计算 LCP、CLS、INP 评分。
- 已实现 Firehose 批量写入和部分失败记录重试；仅在全部写入成功后删除 SQS 消息。
- 非法或处理失败的 SQS 消息不会删除，留给队列 redrive/DLQ 策略处理。
- 已提供 Node 22 非 root、多阶段构建的 Cleaner Dockerfile。
- 已增加 19 个 Cleaner 单元测试。
- SDK 已采集并限制 User-Agent；Cleaner 使用 Bowser 解析浏览器、操作系统和平台类型。
- 同一日志批次已限制为同一 `projectId`；Ingest 按 `projectId` 设置 FIFO Message Group、按 `batchId` 设置去重 ID。
- 清洗记录已增加稳定 `recordId=eventId`，相同消息重复清洗会生成相同记录。
- 已创建第 3 阶段 `prepare-only` SAM 模板，定义 HTTP API、Ingest Lambda、FIFO SQS、FIFO DLQ、限流、日志保留和最小 IAM。
- 已提供基础设施健康检查、成本影响和回滚 Runbook。
- 已增加 3 个 IaC 静态测试和 2 个 Dockerfile 静态测试。

## 修改文件

- `AGENTS.md`
- `.agent/PROJECT.md`
- `.agent/HANDOFF.md`
- `.agent/DECISIONS.md`
- `.gitignore`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `packages/contracts/`
- `packages/sdk/`
- `services/ingest/`
- `services/cleaner/`
- `infrastructure/aws/`
- `.dockerignore`

## 验证结果

- `pnpm test`：68/68 通过（Contracts 12，SDK 22，Ingest 12，Cleaner 19，IaC 3）。
- `pnpm typecheck`：通过。
- `pnpm build`：通过。
- `git diff --check`：命令通过，但当前所有项目文件均未跟踪，不能作为有效的差异验收证据。
- SDK ESM 产物 21.91 KB，CJS 产物 22.95 KB。
- Ingest 自包含 ESM 产物约 1.31 MB。
- Cleaner 自包含 ESM 产物约 1.42 MB。

## 遗留问题

- SDK 在发送前先从内存队列移除事件，`fetch` 失败后会静默丢失日志，缺少重试或重新入队。
- SDK 只按事件条数分批，没有落实 64KB Payload 边界；实测合法 50 条批次可达到 230029 bytes。
- 敏感文本正则无法完整遮盖 `Authorization: Bearer abc123`，会残留真实令牌 `abc123`。
- Git 尚无基线，`git ls-files` 为空，当前所有文件均为未跟踪状态。
- 根 `package.json` 要求 Node 24，但 Lambda、Cleaner 构建和 Docker 使用 Node 22，版本约束不一致。
- 测试代码存在多处 `as unknown as` 双重断言，应改为类型安全的测试桩。
- 尚未创建或部署任何 AWS 资源。
- 尚未在 AWS 创建 API Gateway、Lambda、SQS 或 DLQ 资源。
- 尚未进行真实 Lambda、API Gateway 或 SQS 集成验证。
- 尚未进行真实 SQS、Firehose、S3 或 ECS 集成验证。
- `docker build` 未通过环境验证：本机 Docker daemon 未运行，未创建本地镜像。
- `sam validate --lint` 未执行：`sam` 不在默认命令允许列表，当前没有用户对该命令的明确授权。
- FIFO 去重覆盖相同 `batchId` 的重复入队；Firehose 仍可能至少一次写入，第 5 阶段需按稳定 `recordId` 构建 Athena 去重视图。
- API 鉴权、API Gateway 限流和 WAF 规则需在基础设施阶段确定。
- 尚未做真实浏览器性能开销、Lighthouse 或离线恢复验证。
- 当前网络失败会静默隔离，不包含 IndexedDB 离线持久化与补发。
- Git 安装或 npm 发布策略尚未最终确定。
- `.agent/STATE.json` 保留此前未执行的 Bridge 等待记录；后续直接会话不依赖该状态。

## 下一步

按顺序修复并重新验收：

1. 为 SDK 增加按字节分批、发送失败重新入队和有限重试测试。
2. 修复 Bearer/Cookie 等敏感文本遮盖并增加回归测试。
3. 统一 Node 运行版本。
4. 清理测试中的双重断言。
5. 经用户确认后建立 Git 基线。
6. 补真实浏览器验证、Docker 构建和 `sam validate --lint`。

以上通过后才能进入第 5 阶段 Firehose、Parquet、S3、Glue 和 Athena。
