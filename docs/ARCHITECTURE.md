# badgetrip - Architecture

## Domain model

```ts
type Event = {
  id: string;                        // caller-supplied ULID/UUID; used for idempotency
  actor: string;                     // user id
  type: string;                      // dotted type, e.g. 'confession.posted'
  ts: number;                        // epoch ms - always caller-supplied
  payload: Record<string, unknown>;
};

type ScoreDelta = {
  actor: string;
  score: string;                     // named score: 'shame', 'honor', 'xp', …
  delta: number;
  reason: string;                    // event id or rule id
  ts: number;                        // epoch ms of the originating event
};

type EmitResult = {
  event: Event;
  scoreDeltas: ScoreDelta[];         // point rules that fired
  unlocked: string[];                // achievement codes newly awarded
  streakChanges: StreakChange[];     // streaks that moved
  escalations: Escalation[];        // escalators that changed level
};
```

`Definitions`, the config passed to `createEngine`, holds every rule set: `scores`, `points` (PointRules), `achievements`, `streaks`, `tiers`, `leaderboards`, `escalators`. All fields are optional and default to empty arrays.

## The emit pipeline

`createEngine` validates `definitions` once (unknown references, duplicate codes, non-positive thresholds, missing optional store capabilities) and throws before any event is accepted.

`emit(event)` validates the event (non-empty `id`/`actor`/`type`, finite `ts`, object `payload`), then runs these steps in order. Emits for the same actor are serialized in-process, so every step sees the state written by the steps before it and no concurrent emit interleaves. Across processes, correctness relies on the stores' atomic writes. A store method must never await `engine.emit` for the same actor: it would wait on its own queue forever.

1. **Append + duplicate guard** - `events.append(event)` inserts if the id is new and returns `true`, or returns `false` for a known id, in which case `emit` returns an empty result. The store's atomic insert-if-absent is the idempotency guard.
2. **Points** - applies matching `PointRule` entries, calling `scores.apply` for each. `scoreDeltas` accumulates the results.
3. **Streaks** - ticks or resets each `StreakDef` whose `tickEvents`/`resetEvents` include the event type. `StreakChange.from` comes from the store's atomic result (`tick` returns the new `current`, `reset` the previous one), never from a read before the write. Streak counters are updated before achievement evaluation.
4. **Escalators** - folds each matching `EscalatorDef` before and after this event and reports changes.
5. **Achievements** - evaluates every `AchievementDef` rule in order. Skips achievements the actor already holds. Awards and records newly unlocked codes.

Live emits must arrive in `ts` order for live state to match `replay`. Out-of-order ingest applies in arrival order (a late reset still resets). If a store call throws mid-emit, the event is already appended; make the adapter transactional if partial projections matter.

Achievements run last, so they see everything the current event changed. A rule like `{ kind: 'streak', streak: 'daily_clean', gte: 7 }` sees the streak this event just advanced, and `{ kind: 'score', score: 'honor', gte: 100 }` sees the points it just awarded.

`replay(events)` sorts the log by `(ts, id)` and calls `emit` on each event. Because `emit` is idempotent, replaying an already-seen log is safe.

## The change and unlock streams

UI adapters bind to `observe(engine)`, which wraps the state-changing methods. After each one it bumps a version and calls `subscribe` listeners. After `emit` and `refresh` it also calls `onUnlock` listeners with the batch of `{ actor, code }` pairs that were just unlocked, in definition order. `replay` and `seed` never report unlocks: they rebuild or import history rather than record something new. `watchUnlocks` turns batches into catalog views (one `catalog` query per actor per batch, batches kept in order), and the celebration notifiers and `useUnlocks` hooks are built on it. `@walangstudio/badgetrip-ipc` carries both streams across a transport.

## Determinism

The engine never calls `Date.now()`. All timestamps come from two sources:

- **`event.ts`** - epoch ms set by the caller before emitting.
- **`clock.now()`** - injected `Clock`; used only outside `emit`: `leaderboard()` rolling windows, `escalator()` decay as of "now", `seed` score timestamps, and `refresh()` (award time and `rank` windows). During `emit`, a `rank` rule on a rolling board anchors the window at `event.ts` instead.

Given the same event log and the same `Clock`, the engine produces identical state. Tests use `fixedClock(t)` from `@walangstudio/badgetrip-core` to freeze time.

**Day boundary** - `first-of-day` and `count.todBetween` rules resolve a timestamp to a day start via `dayBoundary(ts: number): number`. Days may be 23h or 25h (DST): two timestamps share a day when `dayBoundary` returns the same value. Streaks have no time semantics - they advance on each tick event, so emit one tick per period yourself. The default is `utcDayStart` (UTC midnight). Pass a custom function to `createEngine` to use a different boundary (e.g. a user's local midnight).

```ts
createEngine({
  // …stores…
  clock: { now: () => Date.now() },
  dayBoundary: (ts) => myLocalMidnight(ts, 'America/New_York'),
  definitions: { /* … */ },
});
```

## Adapter interfaces

Four interfaces cover all persistence. No base classes, no inheritance. Each method does one thing.

### `EventStore`

```ts
interface EventStore {
  append(event: Event): Promise<boolean>;
  read(opts: {
    actor?: string;
    type?: string;
    since?: number;   // epoch ms lower bound (inclusive)
    limit?: number;
  }): AsyncIterable<Event>;
  count(opts: { actor: string; type: string; where?: Filter }): Promise<number>;
}
```

- `append` must be an atomic insert-if-absent by `id`: `true` when inserted, `false` (and no change) for a known id.
- `read` yields in `(ts, insertion-order)` ascending order so folds and `first-of-day` comparisons are stable.
- `count` must apply the `where` filter if present. The filter targets the event (see path convention below).

### `ScoreStore`

```ts
interface ScoreStore {
  get(actor: string, score: string): Promise<number>;
  apply(delta: ScoreDelta): Promise<number>;   // returns new total
  top(
    score: string,
    limit: number,
    window?: { since: number },               // epoch ms lower bound for rolling windows
  ): Promise<{ actor: string; value: number }[]>;
}
```

- `apply` atomically adds `delta.delta` to the running total and returns it.
- `top` without `window` returns all-time totals; with `window`, it sums only deltas whose `ts >= window.since`.

### `AchievementStore`

```ts
interface AchievementStore {
  award(actor: string, code: string, at: number): Promise<boolean>;  // false = already owned
  list(actor: string): Promise<{ code: string; at: number }[]>;
  has(actor: string, code: string): Promise<boolean>;
}
```

- `award` returns `false` without throwing if the actor already owns the achievement. The engine relies on this to skip double-recording.

### `StreakStore`

```ts
interface StreakStore {
  get(
    actor: string,
    code: string,
    key?: string,
  ): Promise<{ current: number; best: number; lastTick: number }>;
  tick(actor: string, code: string, key: string | undefined, at: number): Promise<{ current: number; best: number }>;
  reset(actor: string, code: string, key: string | undefined, at: number): Promise<number>;
}
```

- `get` returns `{ current: 0, best: 0, lastTick: 0 }` for an unknown (actor, code, key) triple - never rejects.
- `tick` increments `current`, updates `best` if `current > best`, records `lastTick = at`.
- `reset` sets `current = 0` and `lastTick = at` and returns the previous `current`; `best` is preserved.
- The `key` parameter supports per-actor-per-key scoping (e.g. per-todont streak).

### `Clock`

```ts
interface Clock { now(): number; }
```

Supplies the current epoch ms for rolling leaderboard windows and escalator decay queries. Never called during `emit` - event timestamps come from `event.ts`, so replay is clock-independent.

## Escalators - event-sourced fold

Escalator severity is not stored. `evalEscalator` replays the full history of trigger and reset events for `(actor, keyValue)`, applies `step` increments and `min` resets, and applies inactivity decay: each full `decay.every` ms since the previous trigger/reset lowers severity by `decay.by`. A new event restarts that interval. This makes escalators fully replayable at the cost of a linear scan per query.

The `key` field on `EscalatorDef` is a dotted path into the event payload (event-relative). When set, each distinct key value gets an independent severity counter. Example: `key: 'payload.todont_id'` gives each todont its own escalator.

The `engine.escalator(actor, code, key?)` query folds up to `clock.now()`, applying final decay as of the current instant.

## Tiers and leaderboards - derived queries

Neither tiers nor leaderboards have their own stores. Both are computed on demand:

- **`engine.tier(actor, code)`** reads `scores.get(actor, def.score)` and runs `evalTier` - a linear scan over the sorted thresholds array. Returns `{ current, next, remaining, value }`.
- **`engine.leaderboard(code)`** calls `scores.top(def.score, def.limit, window)` where `window` is computed from `clock.now() - def.window.ms` for rolling windows, or `undefined` for all-time.

The cost is one `ScoreStore` read each. No additional tables or materialized views are required unless the application needs them for performance.
