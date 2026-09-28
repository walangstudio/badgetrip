import type { Clock } from './types.js';

const MS_PER_DAY = 86_400_000;

/**
 * Convenience clock backed by the system time. The engine never references this
 * itself - the caller must opt in by passing it to `createEngine`.
 */
export const systemClock: Clock = { now: () => Date.now() };

/** A clock frozen at a fixed instant. Useful for deterministic tests. */
export function fixedClock(t: number): Clock {
  return { now: () => t };
}

/** Start-of-day (UTC midnight) for a given epoch ms. The default day boundary. */
export function utcDayStart(ts: number): number {
  return ts - (((ts % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY);
}
