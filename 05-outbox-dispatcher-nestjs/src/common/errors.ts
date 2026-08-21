/**
 * Error classification + sanitization (plan Section 7).
 *
 * `last_error` stored via mark_outbox_event_failed() must contain ONLY an
 * error class + truncated message — never payload content, PII or secrets.
 * The DB additionally truncates to 4000 chars (LEFT in SQL).
 */

export type ErrorClass =
  | 'transient_network'
  | 'transient_server'
  | 'transient_rate_limited'
  | 'transient_deadline'
  | 'permanent_permission'
  | 'permanent_invalid_argument'
  | 'permanent_not_found'
  | 'unknown_route'
  | 'unknown';

export interface ClassifiedError {
  errorClass: ErrorClass;
  /** True → retry with backoff. False → still DB-budget driven, but alert now. */
  transient: boolean;
  /** Sanitized, truncated summary safe for `last_error`. */
  sanitizedMessage: string;
}

const MAX_SANITIZED_MESSAGE = 500;

/**
 * Classifies a publish failure. Accepts HTTP status + optional gRPC-style code
 * text so direct mode (HTTP) and future cloud_tasks mode share one classifier.
 */
export function classifyError(input: {
  statusCode?: number;
  code?: string;
  message?: string;
  isNetworkError?: boolean;
  isTimeout?: boolean;
}): ClassifiedError {
  const { statusCode, code, message, isNetworkError, isTimeout } = input;

  let errorClass: ErrorClass = 'unknown';
  let transient = true;

  if (isTimeout) {
    errorClass = 'transient_deadline';
  } else if (isNetworkError) {
    errorClass = 'transient_network';
  } else if (statusCode === 429 || code === 'RESOURCE_EXHAUSTED') {
    errorClass = 'transient_rate_limited';
  } else if (statusCode !== undefined && statusCode >= 500) {
    errorClass = 'transient_server';
  } else if (statusCode === 403 || code === 'PERMISSION_DENIED') {
    errorClass = 'permanent_permission';
    transient = false;
  } else if (statusCode === 400 || code === 'INVALID_ARGUMENT') {
    errorClass = 'permanent_invalid_argument';
    transient = false;
  } else if (statusCode === 404 || code === 'NOT_FOUND') {
    errorClass = 'permanent_not_found';
    transient = false;
  }

  const sanitizedMessage = sanitizeErrorMessage(message);
  return { errorClass, transient, sanitizedMessage };
}

/** Keeps only a truncated, single-line, scrubbed summary. */
export function sanitizeErrorMessage(message?: string): string {
  if (!message) return 'no error detail';
  const singleLine = message.replace(/\s+/g, ' ').trim();
  // Scrub anything that still looks like a credential or signed URL fragment.
  const scrubbed = singleLine
    .replace(/postgres(ql)?:\/\/[^\s]+/gi, 'postgres://[REDACTED]')
    .replace(/(bearer|authorization)[:=\s]+[a-z0-9\-_.~+/]+=*/gi, '$1=[REDACTED]')
    .replace(/[?&](token|signature|api[_-]?key)=[^&\s]+/gi, '$1=[REDACTED]');
  return scrubbed.slice(0, MAX_SANITIZED_MESSAGE);
}

/** Formats the `last_error` value for the unknown-route fail-closed path. */
export function unknownRouteError(eventType: string): string {
  const safeType = eventType.replace(/[^a-z0-9._-]/gi, '').slice(0, 150);
  return `unknown_route:${safeType}`;
}
