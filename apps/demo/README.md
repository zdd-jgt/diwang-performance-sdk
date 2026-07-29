# Diwang SDK 本地 Demo

## 启动

```bash
pnpm --use-node-version=22.23.1 --filter @diwang/demo dev
```

浏览器访问：`http://127.0.0.1:4174/`

## 可以演示什么

- 查看 SDK 与本地接收端状态。
- 触发 JS、Promise 和资源加载错误。
- 查看 SDK 脱敏后的最新事件。
- 查看接收批次、事件数量和本地事件流。
- 清空仅保存在 Node.js 进程内存中的演示数据。

Demo 不连接 AWS，也不会产生云费用。

## 本地验收

先启动 Demo，再在另一个终端执行：

```bash
pnpm --use-node-version=22.23.1 --filter @diwang/demo acceptance:http
```
