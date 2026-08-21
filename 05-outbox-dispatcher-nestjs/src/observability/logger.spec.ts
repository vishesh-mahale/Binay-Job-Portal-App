import { createLogger, redact, containsSensitiveValue, StructuredLogger } from './logger';

describe('redact()', () => {
  it('redacts sensitive keys regardless of value', () => {
    const out = redact({
      WEBHOOK_SECRET: 'abc',
      authorization: 'Bearer xyz',
      database_url: 'postgres://u:p@h/db',
      apiKey: 'k',
      safe_key: 'visible',
    }) as Record<string, unknown>;
    expect(out.WEBHOOK_SECRET).toBe('[REDACTED]');
    expect(out.authorization).toBe('[REDACTED]');
    expect(out.database_url).toBe('[REDACTED]');
    expect(out.apiKey).toBe('[REDACTED]');
    expect(out.safe_key).toBe('visible');
  });

  it('redacts sensitive values regardless of key (defense in depth)', () => {
    const out = redact({ message: 'conn failed: postgres://user:pw@host/db' }) as Record<string, unknown>;
    expect(out.message).toBe('[REDACTED]');
  });

  it('recurses into nested objects and arrays', () => {
    const out = redact({
      nested: { deep: { token: 'secret-token' }, list: [{ password: 'p' }, 'ok'] },
    }) as { nested: { deep: Record<string, unknown>; list: unknown[] } };
    expect(out.nested.deep.token).toBe('[REDACTED]');
    expect((out.nested.list[0] as Record<string, unknown>).password).toBe('[REDACTED]');
    expect(out.nested.list[1]).toBe('ok');
  });

  it('passes primitives through untouched', () => {
    expect(redact(42)).toBe(42);
    expect(redact('plain')).toBe('plain');
    expect(redact(null)).toBe(null);
  });
});

describe('containsSensitiveValue', () => {
  it('detects connection strings, bearer tokens, signed URL params', () => {
    expect(containsSensitiveValue('postgres://u:p@h')).toBe(true);
    expect(containsSensitiveValue('Bearer eyJhbGciOi')).toBe(true);
    expect(containsSensitiveValue('https://cdn/x?signature=abc')).toBe(true);
    expect(containsSensitiveValue('resume parsed ok')).toBe(false);
  });
});

describe('StructuredLogger', () => {
  it('emits single-line JSON with severity/scope/timestamp', () => {
    const lines: string[] = [];
    const logger = createLogger('unit', 'INFO', (line) => lines.push(line));
    logger.info('hello', { event_id: 'e-1' });
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry).toMatchObject({
      severity: 'INFO',
      message: 'hello',
      scope: 'unit',
      event_id: 'e-1',
    });
    expect(typeof entry.timestamp).toBe('string');
  });

  it('filters below the minimum level', () => {
    const lines: string[] = [];
    const logger = new StructuredLogger('unit', 'WARNING', (line) => lines.push(line));
    logger.debug('nope');
    logger.info('nope');
    logger.warn('yes');
    logger.error('yes');
    expect(lines).toHaveLength(2);
  });

  it('never writes secret values into log lines', () => {
    const lines: string[] = [];
    const logger = createLogger('unit', 'DEBUG', (line) => lines.push(line));
    logger.info('boot', {
      WEBHOOK_SECRET: 'super-secret-value',
      dsn: 'postgres://user:pw@host:5432/db',
      worker_id: 'w-1',
    });
    const joined = lines.join('\n');
    expect(joined).not.toContain('super-secret-value');
    expect(joined).not.toContain('pw@host');
    expect(joined).toContain('w-1');
  });
});
