import { DiwangPerformanceSDK } from "./sdk.js";
import type { SDKOptions } from "./types.js";

export { DiwangPerformanceSDK } from "./sdk.js";
export type {
  MetricRating,
  MetricSample,
  SDKOptions
} from "./types.js";

/** 创建并立即启动一个 SDK 实例。 */
export function init(options: SDKOptions): DiwangPerformanceSDK {
  return new DiwangPerformanceSDK(options).start();
}
