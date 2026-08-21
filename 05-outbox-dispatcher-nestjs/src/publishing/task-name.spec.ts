import { createHash } from 'node:crypto';
import { deterministicTaskName } from './task-name';
import {
  BACKOFF_BASE_MS,
  BACKOFF_CAP_MS,
  BACKOFF_FLOOR_MS,
  backoffDelayMs,
  nextAvailableAt,
} from '../dispatcher/backoff.policy';

describe('deterministicTaskName', () => {
  it('follows the approved shape task-{sha256hex(event_id + ":" + route_key)}', () => {
    const eventId = '11111111-1111-4111-8111-111111111111';
    const routeKey = '/internal/tasks/resume/parse';
    const expected = createHash('sha256').update(`${eventId}:${routeKey}`).digest('hex');
    expect(deterministicTaskName(eventId, routeKey)).toBe(`task-${expected}`);
  });

  it('is deterministic — same input always yields the same name (ALREADY_EXISTS dedupe)', () => {
    const a = deterministicTaskName('id-1', '/path/a');
    const b = deterministicTaskName('id-1', '/path/a');
    expect(a).toBe(b);
  });

  it('differs per event id and per route key', () => {
    const sameRoute = [
      deterministicTaskName('id-1', '/path/a'),
      deterministicTaskName('id-2', '/path/a'),
    ];
    const sameEvent = [
      deterministicTaskName('id-1', '/path/a'),
      deterministicTaskName('id-1', '/path/b'),
    ];
    expect(new Set(sameRoute).size).toBe(2);
    expect(new Set(sameEvent).size).toBe(2);
  });

  it('rejects empty inputs', () => {
    expect(() => deterministicTaskName('', '/path')).toThrow();
    expect(() => deterministicTaskName('id', '')).toThrow();
  });
});

describe('backoff policy (30s base, 15min cap, full jitter)', () => {
  it('jitters within [floor, base] for retry 0', () => {
    for (const r of [0, 0.25, 0.5, 0.999]) {
      const delay = backoffDelayMs(0, { random: () => r });
      expect(delay).toBeGreaterThanOrEqual(BACKOFF_FLOOR_MS);
      expect(delay).toBeLessThanOrEqual(BACKOFF_BASE_MS + BACKOFF_FLOOR_MS);
    }
  });

  it('doubles the cap per retry until the 15min ceiling', () => {
    const maxAt = (retry: number, r = 0.9999) => backoffDelayMs(retry, { random: () => r });
    expect(maxAt(1)).toBeGreaterThan(maxAt(0));
    expect(maxAt(2)).toBeGreaterThan(maxAt(1));
    // 30s * 2^5 = 960s > 900s cap → saturated at 5 retries.
    expect(maxAt(5)).toBeLessThanOrEqual(BACKOFF_CAP_MS + BACKOFF_FLOOR_MS);
    expect(maxAt(50)).toBeLessThanOrEqual(BACKOFF_CAP_MS + BACKOFF_FLOOR_MS);
  });

  it('never exceeds cap + floor even for absurd retry counts (overflow guard)', () => {
    const delay = backoffDelayMs(1000, { random: () => 1 });
    expect(delay).toBeLessThanOrEqual(BACKOFF_CAP_MS + BACKOFF_FLOOR_MS);
  });

  it('keeps delay strictly positive so available_at >= NOW() holds in SQL', () => {
    const delay = backoffDelayMs(0, { random: () => 0 });
    expect(delay).toBe(BACKOFF_FLOOR_MS);
    expect(delay).toBeGreaterThan(0);
  });

  it('rejects negative retry counts', () => {
    expect(() => backoffDelayMs(-1)).toThrow();
  });

  it('nextAvailableAt = now + jittered delay', () => {
    const now = 1_000_000;
    const at = nextAvailableAt(0, { random: () => 0, now: () => now });
    expect(at.getTime()).toBe(now + BACKOFF_FLOOR_MS);
  });
});
