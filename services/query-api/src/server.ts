import { createServer } from "node:http";

import {
  createDashboardQueryService,
  routeDashboardRequest
} from "./app.js";
import { readQueryApiConfig } from "./config.js";

const config = readQueryApiConfig();
const service = createDashboardQueryService(config);

const server = createServer((request, response) => {
  void routeDashboardRequest(service, request.method, request.url)
    .then((result) => {
      response.statusCode = result?.status ?? 404;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.setHeader("Cache-Control", "no-store");
      response.end(
        JSON.stringify(
          result?.payload ?? { message: "请求的查询接口不存在" }
        )
      );
    })
    .catch(() => {
      response.statusCode = 500;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.setHeader("Cache-Control", "no-store");
      response.end(
        JSON.stringify({ message: "地网查询服务暂时不可用，请稍后重试" })
      );
    });
});

server.listen(config.port, config.host, () => {
  console.log(
    `地网查询服务已启动：http://${config.host}:${config.port}`
  );
});
