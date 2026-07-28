import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const port = 4173;
const root = new URL("./", import.meta.url);
const htmlPath = fileURLToPath(new URL("index.html", root));
const sdkPath = fileURLToPath(new URL("../dist/index.js", root));
const batches = [];

const server = createServer(async (request, response) => {
  if (request.method === "POST" && request.url === "/collect") {
    let body = "";
    for await (const chunk of request) {
      body += chunk;
    }
    try {
      batches.push(JSON.parse(body));
      response.writeHead(202).end();
    } catch {
      response.writeHead(400).end();
    }
    return;
  }

  if (request.url === "/results") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(batches));
    return;
  }

  const path = request.url?.startsWith("/sdk.js") ? sdkPath : htmlPath;
  try {
    const content = await readFile(path);
    response.writeHead(200, {
      "Content-Type": path.endsWith(".js")
        ? "text/javascript; charset=utf-8"
        : "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    response.end(content);
  } catch {
    response.writeHead(500).end();
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`SDK browser acceptance: http://127.0.0.1:${port}/?token=browser-secret`);
});

setTimeout(() => server.close(), 120_000).unref();
