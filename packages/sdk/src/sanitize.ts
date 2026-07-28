const SENSITIVE_ASSIGNMENT =
  /\b(password|passwd|token|secret|api[_-]?key)\b(\s*[:=]\s*)(?:"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|[^\s,;]+)/gi;
const AUTHORIZATION_HEADER =
  /\b(authorization|proxy-authorization)\b(\s*[:=]\s*)(?:(?:bearer|basic)\s+)?(?:"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|[^\s,;]+)/gi;
const COOKIE_HEADER =
  /\b(cookie|set-cookie)\b(\s*[:=]\s*)[^\r\n]*/gi;
const BEARER_CREDENTIAL =
  /\bbearer\s+(?:"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|[a-z0-9._~+/=-]+)/gi;

export function sanitizeUrl(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

export function sanitizeText(
  value: string | null | undefined,
  maximumLength: number
): string | undefined {
  if (!value) {
    return undefined;
  }

  const redacted = value
    .replace(/\0/g, "")
    .replace(
      AUTHORIZATION_HEADER,
      (_match, key: string, separator: string) =>
        `${key}${separator}[REDACTED]`
    )
    .replace(
      COOKIE_HEADER,
      (_match, key: string, separator: string) =>
        `${key}${separator}[REDACTED]`
    )
    .replace(
      SENSITIVE_ASSIGNMENT,
      (_match, key: string, separator: string) =>
        `${key}${separator}[REDACTED]`
    )
    .replace(BEARER_CREDENTIAL, "Bearer [REDACTED]");
  return redacted.slice(0, maximumLength);
}

export function sanitizeUserAgent(
  value: string | undefined
): string | undefined {
  const normalized = value?.replace(/[\0\r\n]/g, "").trim().slice(0, 512);
  return normalized || undefined;
}
