import { describe, expect, it, vi } from "vitest";

import { AsyncTtlCache } from "../src/cache.js";

describe("异步 TTL 缓存", () => {
  it("在 TTL 内复用结果，过期后重新加载", async () => {
    let now = 1_000;
    const loader = vi.fn(async () => `value-${now}`);
    const cache = new AsyncTtlCache(60_000, () => now);

    await expect(cache.getOrLoad("same", loader)).resolves.toBe("value-1000");
    now += 59_000;
    await expect(cache.getOrLoad("same", loader)).resolves.toBe("value-1000");
    now += 1_001;
    await expect(cache.getOrLoad("same", loader)).resolves.toBe("value-61001");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("合并同一 Key 的并发请求", async () => {
    let resolve!: (value: string) => void;
    const loader = vi.fn(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        })
    );
    const cache = new AsyncTtlCache(60_000);

    const first = cache.getOrLoad("same", loader);
    const second = cache.getOrLoad("same", loader);
    resolve("done");

    await expect(Promise.all([first, second])).resolves.toEqual([
      "done",
      "done"
    ]);
    expect(loader).toHaveBeenCalledOnce();
  });

  it("失败结果不进入缓存", async () => {
    const loader = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("first"))
      .mockResolvedValueOnce("second");
    const cache = new AsyncTtlCache(60_000);

    await expect(cache.getOrLoad("same", loader)).rejects.toThrow("first");
    await expect(cache.getOrLoad("same", loader)).resolves.toBe("second");
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
