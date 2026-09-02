import { AppApiError, mapHttpErrorToAppError, StandardErrorCodes } from './errors';

describe('Errors & Exception Mapping', () => {
  it('correctly maps 401 Unauthorized status', () => {
    const err = mapHttpErrorToAppError(401);
    expect(err.code).toBe(StandardErrorCodes.UNAUTHORIZED);
    expect(err.status).toBe(401);
    expect(err.isAuthError()).toBe(true);
    expect(err.isForbidden()).toBe(false);
  });

  it('correctly maps 403 Forbidden status', () => {
    const err = mapHttpErrorToAppError(403);
    expect(err.code).toBe(StandardErrorCodes.FORBIDDEN);
    expect(err.status).toBe(403);
    expect(err.isForbidden()).toBe(true);
  });

  it('correctly maps 400 Validation Error status', () => {
    const err = mapHttpErrorToAppError(400, { error: { code: 'VALIDATION_ERROR', message: 'Invalid field' } });
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('Invalid field');
    expect(err.isValidationError()).toBe(true);
  });

  it('preserves correlation IDs from backend error payload', () => {
    const payload = {
      schema_version: 1,
      request_id: 'req_123',
      trace_id: 'trc_456',
      error: { code: 'NOT_FOUND', message: 'User not found' },
    };
    const err = mapHttpErrorToAppError(404, payload);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.requestId).toBe('req_123');
    expect(err.traceId).toBe('trc_456');
  });
});
