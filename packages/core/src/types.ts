/**
 * Core domain types for badgetrip.
 *
 * Everything here is plain data. Rules, definitions, and events are JSON-friendly
 * so they can be stored, configured, or sent over the wire.
 */

/** An immutable fact that happened. State is a projection of the event stream. */
export type Event = {
  /** Caller-provided id (ULID/UUID) used for idempotency. */
  id: string;
  /** User id the event belongs to. */
  actor: string;
  /** Dotted event type, e.g. 'confession.posted'. */
  type: string;
  /** Epoch ms. Caller-supplied - the engine never reads the system clock. */
  ts: number;
  payload: Record<string, unknown>;
};

/** A single change to one named score for one actor. */
export type ScoreDelta = {
  actor: string;
  score: string;
  delta: number;
  /** Event id or rule id that caused this delta. */
  reason: string;
  /** When the delta happened (epoch ms). Needed for rolling-window leaderboards. */
  ts: number;
};

/** A predicate over a dotted path of an event. */
export type Filter = {
  path: string;
  op: '=' | '!=' | '>' | '<' | 'in';
  value: unknown;
};

/** Declarative achievement-unlock predicate. Pure over the event stream + projections. */
export type Rule =
  | {
      kind: 'count';
      eventType: string;
      gte: number;
      where?: Filter;
      /**
       * Optional time-of-day window [startMs, endMs), measured from the start of
       * the event's day via the engine's `dayBoundary`. Counts ANY matching event
       * inside the window - unlike `first-of-day`, which fires once per day.
       */
      todBetween?: [number, number];
    }
  | { kind: 'score'; score: string; gte: number }
  | {
      kind: 'streak';
      streak: string;
      gte: number;
      key?: string;
      /** Which counter to threshold. Defaults to 'current'. 'best' = lifetime best. */
      of?: 'current' | 'best';
      /**
       * For per-actor-per-key streaks: true = satisfied when ANY key meets the threshold
       * (max across keys), instead of one specific `key`. Requires a StreakStore that
       * implements the optional `statsAcrossKeys`.
       */
      anyKey?: boolean;
    }
  | { kind: 'unique'; eventType: string; by: string; gte: number }
  /** True when some single group, keyed by dotted path `by`, has >= `gte` matching events. */
  | {
      kind: 'group-count';
      eventType: string;
      by: string;
      gte: number;
      where?: Filter;
    }
  | { kind: 'first-of-day'; eventType: string; between?: [number, number] }
  | { kind: 'rank'; leaderboard: string; eq: number }
  | { kind: 'all'; rules: Rule[] }
  | { kind: 'any'; rules: Rule[] };

export type AchievementDef = {
  code: string;
  name: string;
  description: string;
  rarity: 1 | 2 | 3 | 4 | 5;
  rule: Rule;
  /** Opaque to the engine - emoji, icon url, etc. */
  metadata?: Record<string, unknown>;
  /** Display value summed into an actor's achievement points. Not a ScoreStore entry. */
  points?: number;
  /** Conceal name, description, icon and progress in `catalog()` until unlocked. */
  hidden?: boolean;
  /** Spoiler-free text shown instead of `description` while locked. */
  lockedDescription?: string;
  /** Asset key, resolved by `@walangstudio/badgetrip-assets` or your own resolver. */
  icon?: string;
  /** Free-form grouping, also a fallback key for icon resolution. */
  category?: string;
  /** Set on achievements expanded from a tiered spec by `defineAchievements`. */
  series?: { code: string; tier: string; index: number; of: number };
  /** Celebration preset key, resolved by `createCelebrationResolver` in `@walangstudio/badgetrip-assets`. */
  celebration?: string;
};

/** How close an actor is to an achievement. `percent` is 0-100, floored. */
export type Progress = { current: number; target: number; percent: number };

/** One achievement as a UI should render it for one actor. Hidden ones arrive concealed. */
export type AchievementView = {
  code: string;
  name: string;
  description: string;
  icon?: string;
  category?: string;
  rarity: 1 | 2 | 3 | 4 | 5;
  points: number;
  series?: AchievementDef['series'];
  unlocked: boolean;
  unlockedAt?: number;
  /** True while a hidden achievement is still locked, so its details are withheld. */
  concealed: boolean;
  /** Set on a hidden achievement once it is unlocked (a secret achievement). */
  hidden?: true;
  celebration?: string;
  progress: Progress;
};

/**
 * Maps an event to a score change. `delta` is a constant, or a number pulled
 * from a dotted path of the event (e.g. { path: 'payload.severity' }).
 * Non-number values at the path are skipped, never coerced.
 */
export type PointRule = {
  on: string;
  score: string;
  delta: number | { path: string };
  where?: Filter;
};

export type StreakScoping = 'per-actor' | { type: 'per-actor-per-key'; key: string };

export type StreakDef = {
  code: string;
  /** Event types that reset the streak to 0. */
  resetEvents: string[];
  /** Event types that advance the streak (use a caller-emitted 'time:day' for time-based). */
  tickEvents: string[];
  scoping: StreakScoping;
};

export type TierDef = {
  code: string;
  /** Which score to threshold. */
  score: string;
  /** Ascending thresholds, e.g. [{name:'bronze',at:1},{name:'silver',at:20}]. */
  thresholds: { name: string; at: number }[];
};

export type LeaderboardWindow = 'all-time' | { type: 'rolling'; ms: number };

/**
 * What a leaderboard ranks by.
 * - `score`: running total of a named score (supports rolling windows).
 * - `streak-sum`: sum of each actor's current streak counters across all keys
 *   (point-in-time aggregate - `window` is ignored). Requires a StreakStore that
 *   implements the optional `topByCurrentSum`.
 */
export type LeaderboardSource =
  | { kind: 'score'; score: string }
  | { kind: 'streak-sum'; streak: string };

export type LeaderboardDef = {
  code: string;
  /** @deprecated Legacy shorthand; equivalent to `source: { kind: 'score', score }`. */
  score?: string;
  /** Aggregate to rank by. Defaults to `{ kind: 'score', score }` from the legacy `score`. */
  source?: LeaderboardSource;
  window: LeaderboardWindow;
  limit: number;
};

export type EscalatorDef = {
  code: string;
  /** Dotted event path to scope severity by (e.g. 'payload.todont_id'). Omit = per-actor. */
  key?: string;
  /** Events that bump severity by `step`. */
  triggerEvents: string[];
  /** Events that reset severity to `min`. */
  resetEvents: string[];
  min: number;
  max: number;
  step: number;
  /**
   * Optional inactivity decay: for every full `every` ms since the last trigger/reset
   * event, reduce severity by `by` (floored at `min`). Each new event restarts the clock.
   */
  decay?: { every: number; by: number };
};

export type Definitions = {
  scores?: string[];
  points?: PointRule[];
  achievements?: AchievementDef[];
  streaks?: StreakDef[];
  tiers?: TierDef[];
  leaderboards?: LeaderboardDef[];
  escalators?: EscalatorDef[];
};

export type Clock = { now(): number };

/** Append-only event log. */
export interface EventStore {
  /**
   * Insert-if-absent by `event.id`. Returns true if inserted, false if the id already
   * existed. MUST be atomic (e.g. a unique key + `ON CONFLICT DO NOTHING`): the engine
   * uses it as the idempotency guard.
   */
  append(event: Event): Promise<boolean>;
  read(opts: {
    actor?: string;
    type?: string;
    since?: number;
    limit?: number;
  }): AsyncIterable<Event>;
  count(opts: { actor: string; type: string; where?: Filter }): Promise<number>;
  /**
   * OPTIONAL. Largest group size when events of `type` for `actor` are grouped by
   * the dotted path `by` (after applying `where`). Backs the `group-count` rule.
   * If absent, the engine folds the stream via `read` instead - implement this only
   * as a push-down optimisation (e.g. SQL `GROUP BY ... ORDER BY count DESC LIMIT 1`).
   */
  maxGroupSize?(opts: {
    actor: string;
    type: string;
    by: string;
    where?: Filter;
  }): Promise<number>;
}

/** Aggregated named scores per actor. */
export interface ScoreStore {
  get(actor: string, score: string): Promise<number>;
  /** Apply a delta; returns the new total. */
  apply(delta: ScoreDelta): Promise<number>;
  top(
    score: string,
    limit: number,
    window?: { since: number },
  ): Promise<{ actor: string; value: number }[]>;
}

/** Awarded achievements per actor. */
export interface AchievementStore {
  /** Award; returns false if the actor already had it. */
  award(actor: string, code: string, at: number): Promise<boolean>;
  list(actor: string): Promise<{ code: string; at: number }[]>;
  has(actor: string, code: string): Promise<boolean>;
}

/** Streak counters per actor (optionally per key). */
export interface StreakStore {
  get(
    actor: string,
    code: string,
    key?: string,
  ): Promise<{ current: number; best: number; lastTick: number }>;
  /** Atomically increments `current` by 1 (best = max(best, current), lastTick = at). */
  tick(
    actor: string,
    code: string,
    key: string | undefined,
    at: number,
  ): Promise<{ current: number; best: number }>;
  /**
   * Atomically sets `current = 0` and `lastTick = at` (best unchanged) and returns the
   * `current` it replaced (0 for an unknown triple). The engine reports `StreakChange.from`
   * from this value, so it MUST come from the same atomic write, not a prior read.
   */
  reset(actor: string, code: string, key: string | undefined, at: number): Promise<number>;
  /**
   * OPTIONAL. Top actors by the SUM of their `current` counters across all keys for
   * `code`, descending, ties broken by actor ascending. Backs `streak-sum`
   * leaderboards. Required only when a `streak-sum` leaderboard is defined.
   */
  topByCurrentSum?(code: string, limit: number): Promise<{ actor: string; value: number }[]>;
  /**
   * OPTIONAL. Max `current` and `best` across ALL of an actor's keys for `code`
   * (both 0 if the actor has no rows). Backs `streak` rules with `anyKey: true`.
   */
  statsAcrossKeys?(actor: string, code: string): Promise<{ maxCurrent: number; maxBest: number }>;
}

/**
 * The persistence the application supplies. badgetrip defines these ports; the app
 * implements them against whatever store it already uses (SQL, KV, in-memory, ...).
 * badgetrip ships no brand-specific persistence - see docs/adr/0001.
 */
export type Stores = {
  events: EventStore;
  scores: ScoreStore;
  achievements: AchievementStore;
  streaks: StreakStore;
};

export type EngineConfig = Stores & {
  clock: Clock;
  definitions: Definitions;
  /** Returns the start-of-day epoch ms for a given ts. Defaults to UTC midnight. */
  dayBoundary?: (ts: number) => number;
};

export type StreakChange = {
  code: string;
  actor: string;
  key?: string;
  from: number;
  to: number;
};

export type Escalation = {
  code: string;
  actor: string;
  key?: string;
  from: number;
  to: number;
};

/** The deterministic outcome of emitting one event. */
export type EmitResult = {
  event: Event;
  scoreDeltas: ScoreDelta[];
  unlocked: string[];
  streakChanges: StreakChange[];
  escalations: Escalation[];
};

export type TierStatus = {
  current: string | null;
  next: string | null;
  /** Points still needed to reach `next`; 0 when maxed out. */
  remaining: number;
  value: number;
};

export type Snapshot = {
  scores?: { actor: string; score: string; value: number }[];
  achievements?: { actor: string; code: string; at: number }[];
  streaks?: {
    actor: string;
    code: string;
    key?: string;
    current: number;
    best: number;
    lastTick: number;
  }[];
};
