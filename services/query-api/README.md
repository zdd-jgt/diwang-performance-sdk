# 地网 Query API

该服务只监听 `127.0.0.1:4174`，使用本机 AWS 默认凭据读取 Athena，再向浏览器返回地网 Dashboard DTO。AWS 凭据不会进入浏览器代码。

## 配置

默认值已经对应当前生产环境。需要覆盖时：

```bash
cp services/query-api/.env.example services/query-api/.env
```

`.env` 只保存区域和 Athena 资源标识，不要写入 Access Key、Secret Key 或会话令牌。服务使用 AWS SDK 默认凭据链，例如当前终端的 `AWS_PROFILE` 或已经登录的本机凭据。

## 本地启动

在仓库根目录执行：

```bash
pnpm dev:dashboard
```

启动后：

- Query API 健康检查：`http://127.0.0.1:4174/health`
- 地网数据面板：`http://127.0.0.1:4173/`

Dashboard 默认查询真实 Athena 数据。开发纯界面时可运行 `pnpm dev:dashboard:mock`，该模式不会访问 AWS。

## 接口

- `GET /health`
- `GET /api/dashboard/projects`
- `GET /api/dashboard/snapshot?projectId=hono-sam-aws-learning&range=7d`

查询结果缓存 60 秒；Athena 超时或失败时只返回安全错误，不暴露 SQL、S3 路径或 AWS 原始错误。
