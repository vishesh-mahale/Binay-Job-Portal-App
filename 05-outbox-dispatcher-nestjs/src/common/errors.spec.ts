import { classifyError, sanitizeErrorMessage, unknownRouteError } from './errors';

describe('classifyError', () => {
  it('maps timeout → transient_deadline', () => {
    const c = classifyError({ isTimeout: true, message: 'deadline exceeded' });
    expect(c.errorClass).toBe('transient_deadline');
    expect(c.transient).toBe(true);
  });

  it('maps network failure → transient_network', () => {
    const c = classifyError({ isNetworkError: true, message: 'ECONNREFUSED' });
    expect(c.errorClass).toBe('transient_network');
    expect(c.transient).toBe(true);
  });

  it('maps 429 and RESOURCE_EXHAUSTED → transient_rate_limited', () => {
    expect(classifyError({ statusCode: 429 }).errorClass).toBe('transient_rate_limited');
    expect(classifyError({ code: 'RESOURCE_EXHAUSTED' }).errorClass).toBe('transient_rate_limited');
  });

  it('maps 5xx → transient_server', () => {
    expect(classifyError({ statusCode: 500 }).errorClass).toBe('transient_server');
    expect(classifyError({ statusCode: 503 }).transient).toBe(true);
  });

  it('maps 403/PERMISSION_DENIED → permanent_permission (non-transient)', () => {
    const c = classifyError({ statusCode: 403 });
    expect(c.errorClass).toBe('permanent_permission');
    expect(c.transient).toBe(false);
  });

  it('maps 400/INVALID_ARGUMENT → permanent_invalid_argument', () => {
    const c = classifyError({ code: 'INVALID_ARGUMENT' });
    expect(c.errorClass).toBe('permanent_invalid_argument');
    expect(c.transient).toBe(false);
  });

  it('maps 404/NOT_FOUND → permanent_not_found', () => {
    const c = classifyError({ statusCode: 404 });
    expect(c.errorClass).toBe('permanent_not_found');
    expect(c.transient).toBe(false);
  });

  it('falls back to unknown (still DB-budget driven)', () => {
    expect(classifyError({}).errorClass).toBe('unknown');
  });
});

describe('sanitizeErrorMessage', () => {
  it('collapses whitespace and truncates to 500 chars', () => {
    const msg = sanitizeErrorMessage(`line1\n\nline2 ${'x'.repeat(1000)}`);
    expect(msg).not.toContain('\n');
    expect(msg.length).toBeLessThanOrEqual(500);
  });

  it('scrubs postgres connection strings', () => {
    const msg = sanitizeErrorMessage('failed connect postgres://user:s3cret@host:5432/db now');
    expect(msg).not.toContain('s3cret');
    expect(msg).toContain('postgres://[REDACTED]');
  });

  it('scrubs bearer tokens and signed URL params', () => {
    expect(sanitizeErrorMessage('auth failed bearer abc.def.ghi')).not.toContain('abc.def.ghi');
    expect(sanitizeErrorMessage('https://x/y?token=abc123&z=1')).not.toContain('abc123');
  });

  it('returns a placeholder for missing detail', () => {
    expect(sanitizeErrorMessage(undefined)).toBe('no error detail');
  });
});

describe('unknownRouteError', () => {
  it('formats the fail-closed last_error value', () => {
    expect(unknownRouteError('match.analyze.requested')).toBe('unknown_route:match.analyze.requested');
  });

  it('strips characters outside the event_type alphabet', () => {
    expect(unknownRouteError('bad type! $%')).toBe('unknown_route:badtype');
  });
});
