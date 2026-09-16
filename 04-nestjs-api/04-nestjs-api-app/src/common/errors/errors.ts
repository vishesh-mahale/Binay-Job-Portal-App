import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    let status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    let customMessage: string | null = null;
    const errObj = exception as any;
    if (errObj && typeof errObj === 'object') {
      if (errObj.failureReason === 'user_already_exists') {
        status = HttpStatus.BAD_REQUEST;
        customMessage = 'User already registered. Please sign in instead.';
      } else if (typeof errObj.httpStatus === 'number' && status >= 500 && errObj.httpStatus < 500) {
        status = errObj.httpStatus;
      }
    }

    if (!customMessage && exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        customMessage = res;
      } else if (res && typeof res === 'object') {
        const rawMsg = (res as any).message;
        if (Array.isArray(rawMsg)) {
          customMessage = rawMsg.join('; ');
        } else if (typeof rawMsg === 'string' && rawMsg !== 'Bad Request Exception' && rawMsg !== 'Bad Request') {
          customMessage = rawMsg;
        }
      }
    }

    const knownCodes = new Set(['VALIDATION_ERROR', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'INTERNAL_ERROR', 'SCAN_PENDING', 'SCAN_FAILED', 'INFECTED_FILE', 'PARSING_NOT_READY', 'PARSING_FAILED', 'STALE_REVISION', 'CLAIM_INVALID', 'GUEST_SESSION_INVALID', 'UPLOAD_LIMIT_REACHED', 'STORAGE_NOT_CONFIGURED', 'GUEST_SESSION_NOT_CONFIGURED', 'GUEST_CLAIM_NOT_CONFIGURED', 'IDEMPOTENCY_CONFLICT', 'DEPENDENCY_UNAVAILABLE', 'RATE_LIMITED', 'ROLE_PROVISIONING_FAILED', 'TOO_MANY_REQUESTS']);
    const rawExceptionMsg = exception instanceof HttpException ? exception.message : '';
    const domainCode = typeof rawExceptionMsg === 'string' && knownCodes.has(rawExceptionMsg) ? rawExceptionMsg : null;
    const code = domainCode ?? (status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR');
    const request = host.switchToHttp().getRequest<{ headers?: Record<string, string | undefined>; requestId?: string }>();
    const requestId = request?.requestId ?? request?.headers?.['x-request-id'] ?? null;
    const traceId = request?.headers?.['x-trace-id'] ?? requestId;
    if (status >= 500) console.error('[ApiExceptionFilter Error]:', exception);
    const finalMessage = status >= 500 ? 'Internal server error' : (customMessage || (exception instanceof HttpException ? exception.message : 'Request failed'));
    response.status(status).json({ success: false, data: null, error: { code, message: finalMessage }, request_id: requestId, trace_id: traceId, schema_version: 1 });
  }
}