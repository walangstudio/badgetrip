# badgetrip - Adapters

An adapter is a set of plain objects/classes that implement the four store interfaces. No base class, no registration. Pass them directly to `createEngine`.

```ts
import { createEngine } from '@badgetrip/core';
import { myEventStore, myScoreStore, myAchievementStore, myStreakStore } from './my-adapter';

const engine = createEngine({
  events: myEventStore(),
  scores: myScoreStore(),
  achievements: myAchievementStore(),
  streaks: myStreakStore(),
  clock: { now: () => Date.now() },
  definitions: { /* … */ },
});
```

## Interface contracts

### `EventStore`

```ts
interface EventStore {
  append(event: Event): Promise<boolean>;
  read(opts: {
    actor?: string;
    type?: string;
    since?: number;
    limit?: number;
  }): AsyncIterable<Event>;
  count(opts: { actor: string; type: string; where?: Filter }): Promise<number>;
}
```

**`append`** - atomic insert-if-absent by `event.id`. Return `true` when the row was inserted, `false` when the id already existed (no error, no change). This is the engine's only idempotency guard, so it must hold under concurrent writers: use a unique key and `INSERT … ON CONFLICT (id) DO NOTHING`, then return `rowCount > 0`. The engine throws if `append` returns a non-boolean.

**Atomicity** - the engine serializes emits per actor within one process; emits from several processes still hit the store concurrently. `ScoreStore.apply`, `StreakStore.tick`, `StreakStore.reset` and `AchievementStore.award` must each be atomic (single upsert statements, as in the Postgres reference); the engine reports `StreakChange.from` from what `tick`/`reset` return. The contract suite checks concurrent calls for each.

**Never call `engine.emit` from inside a store method.** Emits for one actor run one at a time, so a store that awaits a nested same-actor emit waits on itself forever. Emit follow-up events after the outer `emit` resolves.

**`read`** - must yield events in ascending `ts`, ties broken by insertion order. `actor` and `type` filter by equality. `since` is inclusive (yield events where `ts >= since`). `limit` caps the number of yielded events. All opts are optional; omitting a field means no constraint on that dimension. A KV store that cannot guarantee insertion-order tie-breaking among equal `ts` may break ties arbitrarily - document it. Only `first-of-day` depends on tie order (it awards the first equal-`ts` event read); everything else depends only on `ts` order.

**`count`** - `actor` and `type` are required. Applies `opts.where` if present. The engine calls this for `count` rules without `todBetween`; `unique`, `todBetween`, `first-of-day`, escalators, and `group-count` on a store without `maxGroupSize` use `read`.

For `count` rules with a `where` filter, the store must evaluate the filter against each event. You can reuse the core-exported `matchFilter` / `getPath` utilities to stay in sync with the engine's own evaluation:

```ts
import { matchFilter, getPath } from '@badgetrip/core';

// inside your count() implementation:
if (opts.where && !matchFilter(event, opts.where)) continue;
```

---

### `ScoreStore`

```ts
interface ScoreStore {
  get(actor: string, score: string): Promise<number>;
  apply(delta: ScoreDelta): Promise<number>;
  top(
    score: string,
    limit: number,
    window?: { since: number },
  ): Promise<{ actor: string; value: number }[]>;
}
```

**`get`** - returns 0 for an unknown (actor, score) pair.

**`apply`** - atomically adds `delta.delta` to the running total and returns the new value. The `delta.ts` field is the event timestamp; persist it if your store needs to support rolling leaderboards.

**`top`** - returns up to `limit` entries sorted descending by value, ties broken by `actor` ascending. Without `window`, use all-time totals. With `window`, sum only deltas where `delta.ts >= window.since`. The engine computes `window.since` as `clock.now() - leaderboardDef.window.ms`.

> Rolling-window requirement: a store that tracks only running totals **cannot** satisfy windowed `top`. You must persist per-delta history (timestamp + delta) - a secondary index keyed by `(score, ts)`. The Postgres reference keeps a `score_deltas` table for exactly this. If you never use rolling leaderboards, totals alone are enough.

---

### `AchievementStore`

```ts
interface AchievementStore {
  award(actor: string, code: string, at: number): Promise<boolean>;
  list(actor: string): Promise<{ code: string; at: number }[]>;
  has(actor: string, code: string): Promise<boolean>;
}
```

**`award`** - inserts the achievement and returns `true`. If the actor already owns `code`, returns `false` without error and without modifying the record. The engine uses this return value to populate `EmitResult.unlocked`.

**`list`** - returns all achievements the actor owns, in any order.

**`has`** - returns `true` if the actor owns `code`. The engine calls this before evaluating every achievement rule to skip already-owned achievements.

---

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

**`get`** - returns `{ current: 0, best: 0, lastTick: 0 }` for an unknown triple. Never rejects.

**`tick`** - increments `current` by 1, updates `best = max(best, current)`, sets `lastTick = at`. Returns `{ current, best }`.

**`reset`** - atomically sets `current = 0` and `lastTick = at` (`best` unchanged) and returns the `current` it replaced, 0 for an unknown triple. The value must come from the same atomic write, not a prior `get`: in SQL, `UPDATE ... FROM (SELECT ... FOR UPDATE) prev ... RETURNING prev.current` after an `INSERT ... ON CONFLICT DO NOTHING`, as in the Postgres reference.

The `key` parameter scopes the counter to a specific value (e.g. a todont id when `StreakDef.scoping` is `{ type: 'per-actor-per-key', key: 'payload.todont_id' }`). When `scoping` is `'per-actor'`, the engine passes `key = undefined`.

## Optional capabilities

These methods are **optional** on the store interfaces. The engine feature-detects them: it
uses them when present, falls back or throws a precise error only when a definition actually
needs one. Existing adapters that don't implement them stay valid - and `runStoreContract`
reports the corresponding checks as skipped.

| Method | On | Needed by | Fallback when absent |
|---|---|---|---|
| `maxGroupSize({actor,type,by,where?})` | `EventStore` | `group-count` rule | engine folds the stream via `read` |
| `topByCurrentSum(code, limit)` | `StreakStore` | `streak-sum` leaderboard | `createEngine` throws (no fallback) |
| `statsAcrossKeys(actor, code)` | `StreakStore` | `streak` rule with `anyKey: true` | `createEngine` throws (no fallback) |

- **`maxGroupSize`** - return the largest group size when the actor's `type` events (after
  `where`) are grouped by the dotted path `by`. SQL: `GROUP BY (payload->>'…') ORDER BY count DESC LIMIT 1`.
- **`topByCurrentSum`** - top actors by `SUM(current)` across all keys for `code`, descending,
  ties by actor ascending. Omit actors whose sum is 0. SQL: `SELECT actor, SUM(current) … GROUP BY actor HAVING SUM(current) > 0 ORDER BY 2 DESC, actor LIMIT n`.
- **`statsAcrossKeys`** - `{ maxCurrent, maxBest }` across all of one actor's keys for `code`
  (both 0 when none). SQL: `SELECT max(current), max(best) … WHERE actor=? AND code=?`.

## Leaderboard sources

`LeaderboardDef` ranks by a `source`:

```ts
type LeaderboardSource =
  | { kind: 'score'; score: string }       // running total of a named score (supports windows)
  | { kind: 'streak-sum'; streak: string }; // SUM(current) across keys - needs topByCurrentSum
```

The legacy `{ code, score, window, limit }` shape still works - a bare `score` field resolves
to `{ kind: 'score', score }`. `streak-sum` is a point-in-time aggregate, so `window` is ignored.

## Minimal example

A synchronous in-memory implementation in under 30 lines:

```ts
import type { Event, EventStore } from '@badgetrip/core';
import { matchFilter } from '@badgetrip/core';

export function myEventStore(): EventStore {
  const log: Event[] = [];
  const ids = new Set<string>();

  return {
    async append(e) {
      if (ids.has(e.id)) return false;
      ids.add(e.id);
      log.push(e);
      return true;
    },
    async *read(opts) {
      const sorted = [...log].sort((a, b) => a.ts - b.ts);
      let n = 0;
      for (const e of sorted) {
        if (opts.actor && e.actor !== opts.actor) continue;
        if (opts.type && e.type !== opts.type) continue;
        if (opts.since !== undefined && e.ts < opts.since) continue;
        yield e;
        if (opts.limit && ++n >= opts.limit) break;
      }
    },
    async count(opts) {
      let n = 0;
      for (const e of log) {
        if (e.actor !== opts.actor || e.type !== opts.type) continue;
        if (opts.where && !matchFilter(e, opts.where)) continue;
        n++;
      }
      return n;
    },
  };
}
```

## Reference implementation

`packages/core/src/stores/memory.ts` is the canonical reference. All four stores are implemented there, including the rolling-window logic in `memoryScoreStore.top` and the `(ts, seq)` sort order in `memoryEventStore.read`.

The four factory functions are exported directly from `@badgetrip/core`:

```ts
import {
  memoryEventStore,
  memoryScoreStore,
  memoryAchievementStore,
  memoryStreakStore,
} from '@badgetrip/core';
```

## badgetrip ships no adapters

Persistence is the application's responsibility (see [ADR-0001](adr/0001-store-agnostic-persistence.md)). badgetrip publishes the interfaces above and the in-memory reference; you implement them against your own store. A complete Postgres reference - one file per interface, schema migration, and rolling-window `score_deltas` table - lives in [`examples/adapter-postgres`](../examples/adapter-postgres). Copy it and adapt it to your database or KV store.

## Verifying your adapter

`@badgetrip/testing` exports `runStoreContract`, the full behavioral spec as a runnable suite. Pass a factory that returns **fresh, empty** stores each call (a DB factory should migrate + truncate). If it passes, your stores are a drop-in replacement for the reference.

```ts
import { runStoreContract } from '@badgetrip/testing';
import { myStores } from '../src/index.js';

runStoreContract(async () => {
  const stores = myStores(db);
  await stores.migrate?.();
  await resetTables(db); // start empty every test
  return stores;
});
```

It covers: append insert-if-absent (including concurrent appends), read ordering + filters + `since`/`limit`, `count` with a `where` filter, missing-payload tolerance, score get/apply/all-time and windowed `top` (inclusive cutoff, ties, limits), award idempotency, streak tick/reset/key-scoping (reset returns the previous current), concurrent `apply`/`award`/`tick`/`reset`, and the optional capabilities (skipped when absent).

To freeze time in your own engine-level tests, use `fixedClock` (or `steppableClock` from `@badgetrip/testing`).
