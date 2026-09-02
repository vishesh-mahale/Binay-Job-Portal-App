export const StandardErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  STALE_REVISION: 'STALE_REVISION',
  INFECTED_FILE: 'INFECTED_FILE',
  SCAN_PENDING: 'SCAN_PENDING',
  PARSING_PENDING: 'PARSING_PENDING',
  PARSING_FAILED: 'PARSING_FAILED',
} as const;

export type StandardErrorCode = (typeof StandardErrorCodes)[keyof typeof StandardErrorCodes] | string;

export class AppApiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: Record<string, unknown> | Array<unknown>;
  public readonly requestId?: string;
  public readonly traceId?: string;

  constructor(params: {
    code: string;
    message: string;
    status: number;
    details?: Record<string, unknown> | Array<unknown>;
    requestId?: string;
    traceId?: string;
  }) {
    super(params.message || params.code);
    this.name = 'AppApiError';
    this.code = params.code;
    this.status = params.status;
    this.details = params.details;
    this.requestId = params.requestId;
    this.traceId = params.traceId;
  }

  public isAuthError(): boolean {
    return this.code === StandardErrorCodes.UNAUTHORIZED || this.status === 401;
  }

  public isForbidden(): boolean {
    return this.code === StandardErrorCodes.FORBIDDEN || this.status === 403;
  }

  public isValidationError(): boolean {
    return this.code === StandardErrorCodes.VALIDATION_ERROR || this.status === 400;
  }
}

export function mapHttpErrorToAppError(status: number, payload?: any): AppApiError {
  const errorObj = payload?.error || payload || {};
  const code = errorObj.code || (status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : status === 429 ? 'RATE_LIMITED' : 'INTERNAL_ERROR');
  const message = errorObj.message || (status === 401 ? 'Authentication required. Please log in.' : status === 403 ? 'You do not have permission to access this resource.' : status === 404 ? 'The requested resource was not found.' : status === 429 ? 'Too many requests. Please try again shortly.' : 'An unexpected error occurred.');

  return new AppApiError({
    code,
    message,
    status,
    details: errorObj.details,
    requestId: payload?.request_id,
    traceId: payload?.trace_id,
  });
}
