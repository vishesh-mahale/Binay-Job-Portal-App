/**
 * Dispatch-side retry backoff (plan Section 7) — pure, injectable, testable.
 *
 *   capped  = min(30s * 2^retry_count, 15min)
 *   delay   = full jitter over [0, capped]  (AWS "Full Jitter" shape)
 *
 * The DB enforces `p_available_at >= NOW()` in mark_outbox_event_failed(),
 * so we always add a small positive floor before returning. Dead-letter
 * authority stays with the SQL (`retry_count` vs `max_retries`) — this
 * function only computes the next availability time.
 */

export const BACKOFF_BASE_MS = 30_000; // 30s
export const BACKOFF_CAP_MS = 15 * 60_000; // 15 min
export const BACKOFF_FLOOR_MS = 250; // keep available_at strictly >= NOW()

export interface BackoffOptions {
  /** Injectable RNG for deterministic tests. Defaults to Math.random. */
  random?: () => number;
  /** Injectable clock for deterministic tests. Defaults to Date.now. */
  now?: () => number;
}

export function backoffDelayMs(retryCount: number, options: BackoffOptions = {}): number {
  const random = options.random ?? Math.random;
  if (!Number.isFinite(retryCount) || retryCount < 0) {
    throw new Error('backoffDelayMs requires a non-negative retry_count');
  }
  // Guard the exponent against overflow for very large retry counts.
  const exponent = Math.min(retryCount, 20);
  const capped = Math.min(BACKOFF_BASE_MS * 2 ** exponent, BACKOFF_CAP_MS);
  // Full jitter: uniform over [0, capped], plus a floor for DB NOW() safety.
  const jittered = random() * capped;
  return Math.floor(jittered) + BACKOFF_FLOOR_MS;
}

/** Next `available_at` for mark_outbox_event_failed(). */
export function nextAvailableAt(retryCount: number, options: BackoffOptions = {}): Date {
  const now = options.now ?? Date.now;
  return new Date(now() + backoffDelayMs(retryCount, options));
}
