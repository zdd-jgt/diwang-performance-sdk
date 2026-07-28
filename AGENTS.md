# AGENTS.md

## 会话交接

- 每个新会话开始先读取 `docs/learn-Performance-sdk.md`、`docs/diwang-performance-sdk-PRD.md`。
- 然后读取 `.agent/PROJECT.md`、`.agent/HANDOFF.md`、`.agent/DECISIONS.md`。
- 以当前代码、配置和测试结果为准；交接文件只用于快速恢复上下文。
- 每个开发阶段结束后，精简更新 `.agent/HANDOFF.md`，不得粘贴完整聊天记录。
- Codex 直接会话只维护上述三个交接文件。
- 未显式调用 `$agent-dev` 时，不得修改 `.agent/STATE.json`、`.agent/plans/` 或 `.agent/execution/`。

## 开发规则

- 默认使用中文沟通、注释和项目文档。
- 使用 pnpm Monorepo；公共日志协议集中放在 `packages/contracts`。
- 浏览器 SDK 不得打包服务端运行时校验依赖；公共类型使用 `import type`。
- 保持 SDK 无侵入、低开销，不覆盖宿主应用已有的全局处理函数。
- 当前代码、测试和构建结果优先于 PRD 中的示例代码。
- 不得记录密码、令牌、密钥、Cookie、表单内容或其他敏感信息。
- AWS 创建资源、部署和可能产生费用的操作必须先说明资源、区域和成本并取得确认。

## 验收与总结

- 每个阶段依次运行相关单元测试、类型检查和构建，不得虚构结果。
- 最终生成精简中文总结 `docs/开发总结.md`。
- 总结只包含目标、完成内容、问题与解决、验收结果、完成状态和 AWS 成本。
