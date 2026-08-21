/**
 * Structured JSON logging + PII/secret redaction foundation.
 *
 * Approved allow-list fields (plan Section 15):
 *   severity, message, event_id, event_type, aggregate_id, trace_id, queue,
 *   task_name, worker_id, duration_ms, outcome, error_class
 *
 * Never logged: outbox payload content, resume text, names/emails/phones,
 * signed URLs, Bearer/OIDC tokens, connection strings, secrets.
 */

type Severity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';

/** Keys that must never carry their value into logs, case-insensitive. */
const SENSITIVE_KEY_PATTERN =
  /(secret|password|passwd|token|authorization|credential|api[_-]?key|signed[_-]?url|connection[_-]?string|database[_-]?url|bearer)/i;

/** Value-level patterns redacted regardless of key (defense in depth). */
const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  // Postgres connection strings with embedded credentials.
  /postgres(ql)?:\/\/[^:\s]+:[^@\s]+@/i,
  // Bearer/OIDC/ID tokens.
  /\b(bearer|jwt)\s+[a-z0-9\-_.~+/]+=*/i,
  // Signed URL query credentials.
  /[?&](signature|x-goog-signature|token|api[_-]?key)=[^&\s]+/i,
];

const REDACTED = '[REDACTED]';

/** Redacts sensitive keys/values inside a flat or nested log context. */
export function redact(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map((item) => redact(item));
  }
  if (input !== null && typeof input === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        output[key] = REDACTED;
        continue;
      }
      if (typeof value === 'string' && containsSensitiveValue(value)) {
        output[key] = REDACTED;
        continue;
      }
      output[key] = redact(value);
    }
    return output;
  }
  if (typeof input === 'string' && containsSensitiveValue(input)) {
    return REDACTED;
  }
  return input;
}

export function containsSensitiveValue(value: string): boolean {
  return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

export interface LogContext {
  [key: string]: unknown;
}

export class StructuredLogger {
  constructor(
    private readonly scope: string,
    private readonly minLevel: Severity = 'INFO',
    private readonly sink: (line: string) => void = (line) => process.stdout.write(line + '\n'),
  ) {}

  private readonly order: Severity[] = ['DEBUG', 'INFO', 'WARNING', 'ERROR'];

  private enabled(severity: Severity): boolean {
    return this.order.indexOf(severity) >= this.order.indexOf(this.minLevel);
  }

  private write(severity: Severity, message: string, context?: LogContext): void {
    if (!this.enabled(severity)) return;
    const entry: Record<string, unknown> = {
      severity,
      message,
      scope: this.scope,
      timestamp: new Date().toISOString(),
    };
    if (context) {
      Object.assign(entry, redact(context));
    }
    this.sink(JSON.stringify(entry));
  }

  debug(message: string, context?: LogContext): void {
    this.write('DEBUG', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.write('INFO', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.write('WARNING', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.write('ERROR', message, context);
  }
}

export function createLogger(scope: string, minLevel?: Severity, sink?: (line: string) => void): StructuredLogger {
  return new StructuredLogger(scope, minLevel, sink);
}
