const baseUrl = process.env.DEMO_URL ?? "http://127.0.0.1:4174";

const health = await fetch(`${baseUrl}/health`);
assert(health.status === 200, `健康检查返回 ${health.status}`);

await fetch(`${baseUrl}/api/state`, { method: "DELETE" });

const invalid = await fetch(`${baseUrl}/collect`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ events: [] })
});
assert(invalid.status === 400, `非法批次返回 ${invalid.status}`);

const batch = {
  schemaVersion: 1,
  batchId: "d85eaefa-f6e6-4531-8c6f-8863d5e047ff",
  events: [
    {
      schemaVersion: 1,
      eventId: "5542cc1d-1f57-4204-a7db-ef859f524699",
      projectId: "diwang-demo",
      sessionId: "http-smoke",
      clientTimestamp: Date.now(),
      sdkVersion: "0.1.0",
      sampleRate: 1,
      page: {
        url: `${baseUrl}/`
      },
      eventType: "metric",
      metric: {
        name: "LCP",
        value: 1800,
        rating: "good"
      }
    }
  ]
};

const accepted = await fetch(`${baseUrl}/collect`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(batch)
});
assert(accepted.status === 202, `合法批次返回 ${accepted.status}`);

const stateResponse = await fetch(`${baseUrl}/api/state`);
const state = await stateResponse.json();
assert(state.batchCount === 1, `批次数为 ${state.batchCount}`);
assert(state.eventCount === 1, `事件数为 ${state.eventCount}`);
assert(state.events?.[0]?.metric?.name === "LCP", "未返回 LCP 事件");

const cleared = await fetch(`${baseUrl}/api/state`, { method: "DELETE" });
assert(cleared.status === 204, `清空操作返回 ${cleared.status}`);

console.log("Demo HTTP acceptance: PASS");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
