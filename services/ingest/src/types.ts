export interface HttpApiEvent {
  body?: string | null;
  headers?: Record<string, string | undefined>;
  isBase64Encoded?: boolean;
  requestContext?: {
    requestId?: string;
    http?: {
      method?: string;
    };
  };
}

export interface HttpApiResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface ApiSuccessBody {
  success: true;
  data: {
    batchId: string;
    acceptedEvents: number;
  };
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
  };
}
