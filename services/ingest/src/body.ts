export const MAX_REQUEST_BYTES = 240 * 1024;

export type DecodedBody =
  | { ok: true; value: string }
  | {
      ok: false;
      statusCode: 400 | 413;
      code: "INVALID_BASE64" | "PAYLOAD_TOO_LARGE";
      message: string;
    };

export function decodeRequestBody(
  body: string,
  isBase64Encoded: boolean
): DecodedBody {
  if (!isBase64Encoded) {
    if (Buffer.byteLength(body, "utf8") > MAX_REQUEST_BYTES) {
      return payloadTooLarge();
    }
    return { ok: true, value: body };
  }

  const compact = body.replace(/\s/g, "");
  const maximumBase64Length = Math.ceil(MAX_REQUEST_BYTES / 3) * 4 + 4;
  if (compact.length > maximumBase64Length) {
    return payloadTooLarge();
  }
  if (
    compact.length === 0 ||
    compact.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)
  ) {
    return invalidBase64();
  }

  const bytes = Buffer.from(compact, "base64");
  const canonical = bytes.toString("base64").replace(/=+$/, "");
  if (canonical !== compact.replace(/=+$/, "")) {
    return invalidBase64();
  }
  if (bytes.byteLength > MAX_REQUEST_BYTES) {
    return payloadTooLarge();
  }
  return { ok: true, value: bytes.toString("utf8") };
}

function invalidBase64(): DecodedBody {
  return {
    ok: false,
    statusCode: 400,
    code: "INVALID_BASE64",
    message: "请求体不是有效的 Base64"
  };
}

function payloadTooLarge(): DecodedBody {
  return {
    ok: false,
    statusCode: 413,
    code: "PAYLOAD_TOO_LARGE",
    message: "请求体超过 240 KiB 限制"
  };
}
