import { describe, expect, it } from "vitest";

import { parseUserAgent } from "../src/user-agent.js";

describe("parseUserAgent", () => {
  it("解析浏览器、操作系统和平台类型", () => {
    expect(
      parseUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) " +
          "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
          "Version/17.5 Mobile/15E148 Safari/604.1"
      )
    ).toMatchObject({
      browserName: "Safari",
      osName: "iOS",
      platformType: "mobile"
    });
  });

  it("缺少或无法识别 UA 时安全降级", () => {
    expect(parseUserAgent(undefined)).toEqual({});
    expect(parseUserAgent("unknown-agent")).toEqual({});
  });
});
