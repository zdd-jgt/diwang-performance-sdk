# 项目上下文

## 目标

开发一个低侵入的前端性能与错误监控 SDK，将日志可靠写入 AWS，由 ECS 清洗后以 Parquet 格式保存到 S3，并通过 Athena 查询。

## 已确认链路

```text
浏览器 SDK
→ API Gateway
→ Ingest Lambda
→ SQS + DLQ
→ ECS Cleaner
→ Firehose
→ S3 Parquet
→ Glue + Athena
```

## 开发边界

- 当前采用 pnpm Monorepo 和 TypeScript。
- Core Web Vitals 使用 LCP、CLS、INP，不把 FID 作为当前核心指标。
- ECS 负责无状态清洗，Firehose 负责缓冲、Parquet 转换和 S3 落盘。
- S3 使用服务端接收时间分区，避免信任客户端时间。
- Athena 用于离线或半实时分析，不承诺实时搜索体验。
- AWS 部署必须经过用户确认，未部署不能写成云端验证通过。

## 最终交付

- 可构建、可测试的 SDK、日志接收、清洗和基础设施代码。
- 实际验收证据。
- 两页左右的中文 `docs/开发总结.md`。

## 严格阶段顺序

1. 项目基础：Monorepo、共享类型、日志 Schema、测试框架。
2. 性能 SDK：性能采集、错误捕获、队列、采样、限流、上报。
3. 日志接收：API Gateway、Ingest Lambda、SQS、DLQ。
4. 日志清洗：ECS Cleaner、脱敏、UA 解析、指标评级、幂等重试。
5. 存储查询：Firehose、Parquet、S3 分区、Glue、Athena。
6. 部署验收与总结：AWS 受控部署、成本核对、完整验收、`docs/开发总结.md`。

不得因为局部代码存在就宣称整个阶段完成。阶段 3-5 可先完成本地代码与模板，但真实 AWS 验证统一属于阶段 6，并且必须先取得用户确认。
