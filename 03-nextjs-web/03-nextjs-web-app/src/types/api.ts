export interface ApiSuccessEnvelope<T = unknown> {
  schema_version: number;
  request_id: string;
  trace_id: string;
  data: T;
}

export interface ApiErrorEnvelope {
  schema_version: number;
  request_id: string;
  trace_id: string;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown> | Array<unknown>;
  };
}

export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown> | Array<unknown>;
  };
  requestId?: string;
  traceId?: string;
}
