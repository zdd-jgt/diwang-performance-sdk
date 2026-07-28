import { describe, expect, it } from "vitest";

import { sanitizeText } from "../src/sanitize.js";

describe("Cleaner 敏感文本清理", () => {
  it("完整遮盖认证头、Cookie 与常见敏感赋值", () => {
    expect(
      sanitizeText(
        "Authorization: Bearer header.payload.signature\nCookie: sid=secret; theme=dark\ntoken=abc detail",
        4_096
      )
    ).toBe(
      "Authorization: [REDACTED]\nCookie: [REDACTED]\ntoken=[REDACTED] detail"
    );
  });

  it("遮盖独立 Bearer 凭据并移除空字符", () => {
    expect(
      sanitizeText("request\0 failed: Bearer abc.def-123", 4_096)
    ).toBe("request failed: Bearer [REDACTED]");
  });
});
