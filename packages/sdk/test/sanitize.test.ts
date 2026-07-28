import { describe, expect, it } from "vitest";

import {
  sanitizeText,
  sanitizeUrl,
  sanitizeUserAgent
} from "../src/sanitize.js";

describe("敏感信息清理", () => {
  it("移除 URL 凭据、查询参数和片段", () => {
    expect(
      sanitizeUrl(
        "https://user:pass@example.com/path?token=secret#account-details"
      )
    ).toBe("https://example.com/path");
  });

  it("遮盖错误文本中的常见敏感赋值", () => {
    expect(
      sanitizeText("token=abc password: hunter2 detail", 4_096)
    ).toBe("token=[REDACTED] password: [REDACTED] detail");
  });

  it("完整遮盖 Authorization Bearer 与 Basic 凭据", () => {
    expect(
      sanitizeText(
        "Authorization: Bearer header.payload.signature\nProxy-Authorization=Basic dXNlcjpwYXNz",
        4_096
      )
    ).toBe(
      "Authorization: [REDACTED]\nProxy-Authorization=[REDACTED]"
    );
  });

  it("完整遮盖 Cookie 与独立 Bearer 凭据", () => {
    expect(
      sanitizeText(
        "Cookie: session=secret; theme=dark\nrequest failed with Bearer abc.def-123",
        4_096
      )
    ).toBe(
      "Cookie: [REDACTED]\nrequest failed with Bearer [REDACTED]"
    );
  });

  it("拒绝非 http/https URL", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBeUndefined();
  });

  it("清理并限制 User-Agent", () => {
    expect(sanitizeUserAgent(" Agent/1.0\n")).toBe("Agent/1.0");
    expect(sanitizeUserAgent("x".repeat(600))).toHaveLength(512);
  });
});
