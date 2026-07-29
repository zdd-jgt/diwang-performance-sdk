# 技术决策

1. 使用 pnpm Monorepo，统一管理 SDK、共享协议、服务和基础设施。
2. `packages/contracts` 提供 TypeScript 类型和独立的运行时 Schema 入口，SDK 只导入类型。
3. 使用 INP 取代 FID 作为当前 Core Web Vital。
4. 使用 SQS 解耦日志接收与 ECS Cleaner，并通过 DLQ 保存多次失败的数据。
5. ECS Cleaner 保持无状态，不在任务内长时间缓存 Parquet 文件。
6. 使用 Firehose 完成缓冲、JSON 转 Parquet 和 S3 分区落盘。
7. 清洗数据使用 Parquet + Snappy；分区采用服务端接收日期，数据量足够时再细分到小时。
8. Athena 用于历史和半实时查询；React 不直接持有 AWS 凭据访问 Athena。
9. 最终开发总结采用中文精简格式，并如实区分代码完成、本地验证、AWS 验证和生产可用。
10. 开发使用 Codex 内部会话直接执行，不使用 VS Code Claude/ECC worker；阶段交接通过本目录三个 Markdown 文件完成。
11. SDK 对性能会话使用 `sampleRate` 采样；错误事件不采样，但统一受单页每分钟事件上限约束。
12. SDK 使用 `addEventListener` 捕获异常和生命周期事件，不覆盖宿主已有的全局处理函数。
13. CLS 使用 1 秒间隔、5 秒总长的最大会话窗口；INP 按每 50 次交互取一个最差值近似 P98。
14. 常规事件通过空闲回调批量发送；页面隐藏和错误优先使用 `sendBeacon`，失败时降级为 `fetch keepalive`。
15. SDK 只从 `@diwang/contracts` 导入类型，浏览器运行时产物不得包含 Zod。
16. Ingest Lambda 使用共享 Zod Schema 严格校验批次，客户端无法写入服务端接收时间。
17. 单次接收请求限制为 240 KiB，为 SQS 消息信封保留空间；单批事件仍不得超过 50 条。
18. SQS 消息只补充服务端 `receivedAt` 和 API `requestId`，当前不采集来源 IP。
19. 接收成功返回 202；队列暂时不可用返回 503 和通用错误，不返回 AWS 异常、队列地址或请求体。
20. Cleaner 输出扁平 JSON 记录，分区日期只从 Ingest 的服务端 `receivedAt` 派生。
21. LCP、CLS、INP 评分由 Cleaner 重新计算，不信任客户端提交的评分。
22. Firehose 部分失败时只重试失败记录；全部成功后才删除 SQS 消息，整体保持至少一次处理语义。
23. 无效或处理失败的 SQS 消息不主动删除，由 SQS redrive 策略在达到接收次数后送入 DLQ。
24. Cleaner 使用 Node 22 自包含 bundle、非 root 容器用户和 SIGTERM/SIGINT 优雅停止。
25. 项目严格按六阶段设计推进；第 3、4 阶段验收完成前不得进入第 5 阶段。
26. SDK 上报受限长度的 User-Agent；Cleaner 使用 MIT 许可的 Bowser 解析浏览器、操作系统和平台，不把原始 UA 写入清洗记录。
27. Ingest 使用 SQS FIFO，按 `projectId` 分组、按 `batchId` 去重；同一批次禁止混入多个项目。
28. Cleaner 使用 `eventId` 作为稳定 `recordId`，相同输入生成相同 Firehose 记录；Firehose 仍是至少一次语义，第 5 阶段必须在查询层按 `recordId` 去重。
29. 第 3 阶段 SAM 模板采用 `prepare-only`，只授予 Lambda 对目标队列的 `sqs:SendMessage` 权限，不执行部署。
30. 第 5 阶段使用独立 `template-storage.yaml`，避免修改已验收的接收链路模板；两份模板在部署时可作为独立 Stack 管理。
31. Firehose 只按 Cleaner 从服务端 `receivedAt` 派生的 `partitionDate` 动态分区，不按 `projectId` 切分 S3 前缀，避免低流量项目产生大量小文件。
32. Firehose 使用 Glue 固定 Schema 将 JSON 转为 Snappy Parquet；S3 目标层保持 `UNCOMPRESSED`，压缩由 Parquet Serializer 负责。
33. Glue 表使用日期分区投影，不每日创建 Partition；Athena 查询必须包含日期条件，并由 WorkGroup 强制结果位置、SSE-S3 和单查询扫描上限。
34. Firehose 至少一次写入产生的重复记录不在存储层删除；Athena 去重视图按稳定 `recordId` 和最新 `receivedAt` 保留一条。
35. 遥测数据桶和 Athena 结果桶均设置 `Retain`；Stack 删除不会删除桶，桶内对象仍按各自生命周期清理。
36. 生产接入项目固定为 `hono-sam-aws-learning`，页面来源固定为 `https://hono-sam-profile.pages.dev`；项目白名单和 CORS 不视为强身份认证。
37. 性能会话采样率为 10%，错误事件保持采集，但仍受 SDK 单页事件限流约束。
38. SDK 以自包含 `.tgz` 放入业务前端 `vendor/`，Cloudflare 构建不依赖本机绝对路径或未发布的 npm 包。
39. Cloudflare Pages 使用 `CF_PAGES_COMMIT_SHA` 作为 SDK `release`，本地构建回退为 `local`。
40. Cleaner 不采用 24 小时 ECS Service，改为 EventBridge Scheduler 每 5 分钟启动一个 Fargate Task。
41. Cleaner 连续 2 次空轮询后退出，单次最多运行 240 秒；处理成功才删除 SQS 消息。
42. 现有私有子网 NAT 已失效，学习阶段 Cleaner 使用现有公网子网、临时公网 IP和零入站独立安全组。
43. 第一版继续按服务端接收日期分区，不细分小时；Firehose 使用 64 MB 或 5 分钟缓冲。
44. 第 35 条原“遥测数据不自动过期”策略已调整：遥测对象 30 天、Athena 结果 7 天、CloudWatch 日志 14 天。
45. 生产部署采用手动 CloudFormation Change Set；Cleaner Scheduler 首次部署默认禁用，镜像和手动 Task 验收通过后再单独启用。
46. 当前 AWS 账号 Lambda 总并发额度为 5，无法设置任何预留并发；Ingest 使用共享并发，并由 HTTP API 路由限流和账号并发上限控制入口负载，后续提高账号额度后再评估独立预留并发。
47. Firehose `OpenXJsonSerDe` 必须启用 `CaseInsensitive=true`，因为 Glue 会把 camelCase Schema 列规范为小写；关闭后 Parquet 只保留分区值，其余业务列均为 `NULL`。
