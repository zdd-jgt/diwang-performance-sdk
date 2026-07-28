import type {
  ApiErrorBody,
  ApiSuccessBody,
  HttpApiResponse
} from "./types.js";

const JSON_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8"
} as const;

export function successResponse(
  batchId: string,
  acceptedEvents: number
): HttpApiResponse {
  const body: ApiSuccessBody = {
    success: true,
    data: { batchId, acceptedEvents }
  };
  return {
    statusCode: 202,
    headers: { ...JSON_HEADERS },
    body: JSON.stringify(body)
  };
}

export function errorResponse(
  statusCode: number,
  code: string,
  message: string,
  extraHeaders: Record<string, string> = {}
): HttpApiResponse {
  const body: ApiErrorBody = {
    success: false,
    error: { code, message }
  };
  return {
    statusCode,
    headers: { ...JSON_HEADERS, ...extraHeaders },
    body: JSON.stringify(body)
  };
}
