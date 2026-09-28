import {
  type Clock,
  type Definitions,
  type EngineConfig,
  type Event,
  createEngine,
  memoryAchievementStore,
  memoryEventStore,
  memoryScoreStore,
  memoryStreakStore,
} from '@badgetrip/core';

/** A clock you can advance by hand. Deterministic - never reads the system time. */
export function steppableClock(start = 0): Clock & {
  advance(ms: number): void;
  set(ms: number): void;
} {
  let t = start;
  return {
    now: () => t,
    advance: (ms) => {
      t += ms;
    },
    set: (ms) => {
      t = ms;
    },
  };
}

/** Monotonic, sortable, deterministic id generator (not a real ULID, but ordered). */
export function idFactory(prefix = 'evt'): () => string {
  let n = 0;
  return () => `${prefix}_${(n++).toString().padStart(12, '0')}`;
}

/** Build an Event with sensible defaults; fill what you care about. */
export function makeEvent(partial: Partial<Event> & Pick<Event, 'actor' | 'type'>): Event {
  return {
    id: partial.id ?? `${partial.type}:${partial.actor}:${partial.ts ?? 0}`,
    actor: partial.actor,
    type: partial.type,
    ts: partial.ts ?? 0,
    payload: partial.payload ?? {},
  };
}

/**
 * Spin up an engine backed entirely by in-memory stores plus a steppable clock.
 * The one-liner most tests want.
 */
export function makeTestEngine<C extends Clock = ReturnType<typeof steppableClock>>(
  definitions: Definitions,
  opts?: {
    clock?: C;
    dayBoundary?: EngineConfig['dayBoundary'];
  },
) {
  const clock = (opts?.clock ?? steppableClock()) as C;
  const engine = createEngine({
    events: memoryEventStore(),
    scores: memoryScoreStore(),
    achievements: memoryAchievementStore(),
    streaks: memoryStreakStore(),
    clock,
    definitions,
    ...(opts?.dayBoundary ? { dayBoundary: opts.dayBoundary } : {}),
  });
  return { engine, clock };
}

const HOUR = 3_600_000;
const DAY = 86_400_000;

export const time = { HOUR, DAY };

export { runStoreContract } from './contract.js';
