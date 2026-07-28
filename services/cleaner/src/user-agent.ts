import Bowser from "bowser";

export interface ParsedUserAgent {
  browserName?: string;
  browserVersion?: string;
  osName?: string;
  osVersion?: string;
  platformType?: string;
}

export function parseUserAgent(
  userAgent: string | undefined
): ParsedUserAgent {
  if (!userAgent) {
    return {};
  }
  try {
    const result = Bowser.parse(userAgent);
    const browserName = normalize(result.browser.name, 64);
    const browserVersion = normalize(result.browser.version, 64);
    const osName = normalize(result.os.name, 64);
    const osVersion = normalize(result.os.version, 64);
    const platformType = normalize(result.platform.type, 32);
    return {
      ...(browserName ? { browserName } : {}),
      ...(browserVersion ? { browserVersion } : {}),
      ...(osName ? { osName } : {}),
      ...(osVersion ? { osVersion } : {}),
      ...(platformType ? { platformType } : {})
    };
  } catch {
    return {};
  }
}

function normalize(
  value: string | undefined,
  maximumLength: number
): string | undefined {
  const normalized = value?.replace(/[\0\r\n]/g, "").trim();
  return normalized ? normalized.slice(0, maximumLength) : undefined;
}
