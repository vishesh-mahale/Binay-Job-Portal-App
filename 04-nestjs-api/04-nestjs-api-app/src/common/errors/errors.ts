import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const knownCodes = new Set(['VALIDATION_ERROR', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'INTERNAL_ERROR', 'SCAN_PENDING', 'SCAN_FAILED', 'INFECTED_FILE', 'PARSING_NOT_READY', 'PARSING_FAILED', 'STALE_REVISION', 'CLAIM_INVALID', 'GUEST_SESSION_INVALID', 'UPLOAD_LIMIT_REACHED', 'STORAGE_NOT_CONFIGURED', 'GUEST_SESSION_NOT_CONFIGURED', 'GUEST_CLAIM_NOT_CONFIGURED', 'IDEMPOTENCY_CONFLICT', 'DEPENDENCY_UNAVAILABLE', 'RATE_LIMITED']);
    const exceptionMessage = exception instanceof HttpException ? exception.message : '';
    const domainCode = typeof exceptionMessage === 'string' && knownCodes.has(exceptionMessage) ? exceptionMessage : null;
    const code = domainCode ?? (status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR');
    const request = host.switchToHttp().getRequest<{ headers?: Record<string, string | undefined>; requestId?: string }>();
    const requestId = request?.requestId ?? request?.headers?.['x-request-id'] ?? null;
    const traceId = request?.headers?.['x-trace-id'] ?? requestId;
    response.status(status).json({ success: false, data: null, error: { code, message: status >= 500 ? 'Internal server error' : (exception instanceof HttpException ? exception.message : 'Request failed') }, request_id: requestId, trace_id: traceId, schema_version: 1 });
  }
}