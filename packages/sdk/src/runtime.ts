export interface IdleDeadlineLike {
  readonly didTimeout: boolean;
  timeRemaining(): number;
}

export interface SDKDocument {
  readonly referrer: string;
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions
  ): void;
  removeEventListener(
    type: string,
    listener: EventListener,
    options?: boolean | EventListenerOptions
  ): void;
  dispatchEvent(event: Event): boolean;
}

export interface SDKPerformanceObserver {
  observe(options: PerformanceObserverInit): void;
  disconnect(): void;
}

export type SDKFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Pick<Response, "ok">>;

export interface SDKRuntime {
  readonly document: SDKDocument;
  readonly location: Pick<Location, "href">;
  readonly performance: Pick<Performance, "getEntriesByType">;
  readonly userAgent?: string;
  readonly supportedPerformanceEntryTypes?: readonly string[];
  readonly createPerformanceObserver?: (
    onEntries: (entries: PerformanceEntry[]) => void
  ) => SDKPerformanceObserver;
  readonly random: () => number;
  readonly randomUUID: () => string;
  readonly sendBeacon?: (url: string, data: Blob) => boolean;
  readonly fetch?: SDKFetch;
  readonly requestIdleCallback?: (
    callback: (deadline: IdleDeadlineLike) => void,
    options?: { timeout: number }
  ) => number;
  readonly cancelIdleCallback?: (handle: number) => void;
  readonly setTimeout: typeof globalThis.setTimeout;
  readonly clearTimeout: typeof globalThis.clearTimeout;
  addEventListener(
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions
  ): void;
  removeEventListener(
    type: string,
    listener: EventListener,
    options?: boolean | EventListenerOptions
  ): void;
}

export function createBrowserRuntime(): SDKRuntime | undefined {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    typeof location === "undefined" ||
    typeof performance === "undefined"
  ) {
    return undefined;
  }

  const browserCrypto = globalThis.crypto;
  const randomUUID = (): string =>
    browserCrypto?.randomUUID?.() ?? createFallbackUUID();

  return {
    document,
    location,
    performance,
    ...(navigator.userAgent ? { userAgent: navigator.userAgent } : {}),
    ...(typeof PerformanceObserver !== "undefined"
      ? {
          supportedPerformanceEntryTypes:
            PerformanceObserver.supportedEntryTypes,
          createPerformanceObserver: (
            onEntries: (entries: PerformanceEntry[]) => void
          ) =>
            new PerformanceObserver((list) => {
              onEntries(list.getEntries());
            })
        }
      : {}),
    random: Math.random,
    randomUUID,
    ...(typeof navigator.sendBeacon === "function"
      ? { sendBeacon: navigator.sendBeacon.bind(navigator) }
      : {}),
    ...(typeof window.fetch === "function"
      ? { fetch: window.fetch.bind(window) }
      : {}),
    ...("requestIdleCallback" in window &&
    typeof window.requestIdleCallback === "function"
      ? { requestIdleCallback: window.requestIdleCallback.bind(window) }
      : {}),
    ...("cancelIdleCallback" in window &&
    typeof window.cancelIdleCallback === "function"
      ? { cancelIdleCallback: window.cancelIdleCallback.bind(window) }
      : {}),
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window)
  };
}

function createFallbackUUID(): string {
  const bytes = new Uint8Array(16);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] ?? 0) & 0x0f | 0x40;
  bytes[8] = (bytes[8] ?? 0) & 0x3f | 0x80;

  const hex = Array.from(bytes, (value) =>
    value.toString(16).padStart(2, "0")
  );
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join("")
  ].join("-");
}
