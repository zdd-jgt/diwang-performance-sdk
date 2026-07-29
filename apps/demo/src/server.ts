import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { parseTelemetryBatch } from "./receiver.js";
import { DemoStore } from "./store.js";

const MAX_REQUEST_BYTES = 256 * 1024;
const DEFAULT_PORT = 4174;
const publicRoot = new URL("./public/", import.meta.url);

const staticFiles = new Map([
  ["/", { filename: "index.html", contentType: "text/html; charset=utf-8" }],
  ["/app.js", { filename: "app.js", contentType: "text/javascript; charset=utf-8" }],
  ["/app.js.map", { filename: "app.js.map", contentType: "application/json" }],
  ["/styles.css", { filename: "styles.css", contentType: "text/css; charset=utf-8" }]
]);

export function createDemoServer(store = new DemoStore()) {
  return createServer(async (request, response) => {
    try {
      await handleRequest(request, response, store);
    } catch {
      sendJson(response, 500, { error: "DEMO_INTERNAL_ERROR" });
    }
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  store: DemoStore
): Promise<void> {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && requestUrl.pathname === "/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/state") {
    sendJson(response, 200, store.snapshot());
    return;
  }

  if (request.method === "DELETE" && requestUrl.pathname === "/api/state") {
    store.clear();
    response.writeHead(204).end();
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/collect") {
    const body = await readBody(request);
    if (body === undefined) {
      sendJson(response, 413, { error: "PAYLOAD_TOO_LARGE" });
      return;
    }

    let input: unknown;
    try {
      input = JSON.parse(body);
    } catch {
      sendJson(response, 400, { error: "INVALID_JSON" });
      return;
    }

    const batch = parseTelemetryBatch(input);
    if (!batch) {
      sendJson(response, 400, { error: "INVALID_TELEMETRY_BATCH" });
      return;
    }
    store.add(batch);
    sendJson(response, 202, { accepted: true });
    return;
  }

  if (request.method === "GET") {
    const staticFile = staticFiles.get(requestUrl.pathname);
    if (staticFile) {
      try {
        const content = await readFile(new URL(staticFile.filename, publicRoot));
        response.writeHead(200, {
          "Content-Type": staticFile.contentType,
          "Cache-Control": "no-store"
        });
        response.end(content);
      } catch {
        sendJson(response, 500, { error: "DEMO_ASSET_MISSING" });
      }
      return;
    }
  }

  sendJson(response, 404, { error: "NOT_FOUND" });
}

async function readBody(request: IncomingMessage): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > MAX_REQUEST_BYTES) {
      return undefined;
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  value: unknown
): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(value));
}

function resolvePort(value: string | undefined): number {
  const port = value ? Number(value) : DEFAULT_PORT;
  return Number.isInteger(port) && port >= 1 && port <= 65_535
    ? port
    : DEFAULT_PORT;
}

const executedFile = process.argv[1];
if (
  executedFile &&
  fileURLToPath(import.meta.url) === executedFile
) {
  const port = resolvePort(process.env.DEMO_PORT);
  const server = createDemoServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`Diwang SDK Demo: http://127.0.0.1:${port}/`);
  });
}
