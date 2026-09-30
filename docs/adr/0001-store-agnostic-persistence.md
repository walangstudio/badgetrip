# ADR-0001 - Store-Agnostic Persistence via Ports & Adapters

**Status:** Accepted
**Date:** 2026-06-06

---

## Context

badgetrip is a framework-agnostic gamification library. Its original design anticipated shipping first-party adapters for Postgres, Supabase, and SQLite as published packages (`@walangstudio/badgetrip-postgres`, `@walangstudio/badgetrip-supabase`, `@walangstudio/badgetrip-sqlite`). That is the "adapter explosion" the design doc warns about. Each adapter is something to maintain, pulls third-party runtime dependencies into badgetrip, and ties a generic library to one vendor's client.

The decision: badgetrip is store-agnostic. The library owns the rules and projections; the application owns persistence. badgetrip publishes the port interfaces and nothing that locks an application to a specific storage backend.

Forces:
- Consuming apps already have a storage layer (Supabase, PlanetScale, SQLite, Redis, IndexedDB, Durable Objects). They should not be forced to add a second DB client.
- The four interfaces (`EventStore`, `ScoreStore`, `AchievementStore`, `StreakStore`) are narrow (three core methods each) and already present in `packages/core/src/types.ts`. They are the right seam.
- An in-memory reference exists in `packages/core/src/stores/memory.ts`. It serves as prototype default, test double, and canonical behavioral spec. It is not a DB brand - it is a teaching and testing artifact.
- Nothing in `@walangstudio/badgetrip-testing` currently gives adapter authors a way to verify behavioral conformance against the spec. The existing `engine-parity.test.ts` files in the adapter packages prove the pattern works but are not exportable to third-party adapters.
- Three relational assumptions are embedded in the interface contracts that affect non-SQL implementors: `EventStore.read` requires ordered async iteration (cursor semantics), `ScoreStore.top` requires windowed aggregation, and the `seq`/timestamp ordering contract inside `read` is implicit. These are load-bearing; removing them would break the rules engine.

---

## Decision

Put persistence behind ports (ports and adapters). For persistence, badgetrip ships exactly two artifacts:

1. **`@walangstudio/badgetrip-core`** - engine, declarative rule types, the four port interfaces, the in-memory reference stores, and the `matchFilter`/`getPath` utilities adapter authors need for filter evaluation. This is unchanged.
2. **`@walangstudio/badgetrip-testing`** - deterministic clock, id factory, `makeTestEngine`, and a new **store conformance test kit** (`runStoreContract`). This gives any adapter author a single function call that exercises the full behavioral spec.

`@walangstudio/badgetrip-postgres`, `@walangstudio/badgetrip-supabase`, and `@walangstudio/badgetrip-sqlite` are removed as published packages. The Postgres adapter is moved to `examples/adapter-postgres/` as a non-published teaching reference (see Alternatives for why one is kept). `@walangstudio/badgetrip-memory` (`packages/adapter-memory`) is dissolved: it is a pure re-export shim of `@walangstudio/badgetrip-core` with no additional value; its consumers already import from `@walangstudio/badgetrip-core` directly.

The four port interfaces are kept exactly as-is with one clarification added to the docs: `ScoreStore.top` with a `window` argument requires the implementor to store per-delta timestamps (`ScoreDelta.ts`). This is a KV-store friction point (a KV store that only tracks totals cannot satisfy rolling leaderboards without a separate index). This friction is accepted - rolling leaderboards are a genuinely aggregate query and no interface change removes that requirement without eliminating the feature.

`EventStore.read` returning `AsyncIterable<Event>` is kept. A KV adapter can satisfy it by reading all matching keys and yielding in sorted order; the cost is a full-scan, which is acceptable for the target scale (per-actor event counts in the hundreds, not millions).

---

## Store Conformance Test Kit

`@walangstudio/badgetrip-testing` gains a `runStoreContract` export:

```ts
export function runStoreContract(
  factory: () => Promise<{
    events: EventStore;
    scores: ScoreStore;
    achievements: AchievementStore;
    streaks: StreakStore;
  }>,
): void
```

It registers a self-contained vitest/jest `describe` block covering:

- `EventStore`: idempotent append by id, `(ts, insertion-order)` read ordering, `since` inclusive filter, `limit` cap, `count` with and without `where` filter.
- `ScoreStore`: `get` returns 0 for unknown actor, `apply` returns new total, `top` all-time ranking with tie-break, `top` with rolling window (`since`) using `ScoreDelta.ts`.
- `AchievementStore`: `award` idempotency (second call returns `false`), `list` returns all owned, `has` returns correct boolean.
- `StreakStore`: `get` returns zero struct for unknown triple, `tick` increments and tracks `best`, `reset` zeroes `current` but preserves `best`, `key` scoping isolation.

Usage in an adapter's test file:

```ts
import { runStoreContract } from '@walangstudio/badgetrip-testing';
import { myStores } from '../src/index.js';

runStoreContract(() => Promise.resolve(myStores()));
```

---

## Interface Review

The four interfaces are the correct seam. No structural changes are required. Two notes for the docs:

1. **`ScoreStore.top` windowing** - a KV store must maintain a secondary time-ordered index of deltas to satisfy the rolling-window case. Document this explicitly in ADAPTERS.md so implementors know upfront. The interface cannot be simplified without removing the rolling leaderboard feature.
2. **`EventStore.read` ordering** - the `(ts, seq)` sort contract is implicit. ADAPTERS.md should state it explicitly: events must be yielded in ascending `ts` order; ties broken by insertion order. A KV adapter that cannot guarantee insertion-order tie-breaking may emit tie-broken events in arbitrary order - this is acceptable as long as the adapter documents it.

No interface changes.

---

## Alternatives Considered

**Keep all three adapters as published packages.** Maintains the adapter-explosion path the design doc explicitly warns against. Every new storage backend becomes a badgetrip maintenance burden. Rejected.

**Delete all three adapter packages without preserving any example.** Clean, but leaves adapter authors with only ADAPTERS.md and the in-memory reference. The Postgres adapter is the most complete behavioral model for a real DB-backed implementation (transaction handling in `apply`, `score_deltas` table for rolling windows, idempotency via unique index). Deleting it without replacement removes the most useful teaching artifact. Rejected.

**Move all three to `examples/`.** SQLite and Supabase are partial implementations that add noise. Supabase is a thin wrapper over Postgres - its pattern is trivially derived from the Postgres example. SQLite uses `better-sqlite3`'s synchronous API wrapped in async, which adds a misleading pattern for the majority of async-native adapters. Keep only Postgres. Accepted for Postgres only; SQLite and Supabase are deleted.

**Keep `@walangstudio/badgetrip-memory` as a published package.** It is a one-line re-export of `@walangstudio/badgetrip-core` factories. It exists only because the original layout listed it as a separate package. It adds a package.json, a tsconfig, a vitest alias entry, and a root tsconfig reference with zero net functionality. Dissolving it removes four maintenance touch-points and zero user value. Rejected.

**Add conformance tests to `@walangstudio/badgetrip-core` instead of `@walangstudio/badgetrip-testing`.** Core has zero runtime deps. A conformance kit imports vitest/jest describe/it/expect, which are devDependencies - acceptable in `@walangstudio/badgetrip-testing` which already exists as a test-support package. Rejected for core.

---

## Consequences

**Positive**
- Persistence needs only two packages: `@walangstudio/badgetrip-core` and `@walangstudio/badgetrip-testing`. There are no database packages to keep in sync.
- No published badgetrip package carries a third-party runtime dependency except `@walangstudio/badgetrip-react` (React peer dep).
- Adapter authors have a single, portable conformance test they can run against any store backend.
- The `engine-parity.test.ts` pattern is replaced by `runStoreContract`, which is more precise (it tests the interface contract directly, not engine-level output equality).
- The "adapter explosion" risk is structurally eliminated - badgetrip cannot ship half-finished adapters because it does not ship adapters.

**Negative (accepted)**
- Rolling leaderboards require implementors to store per-delta timestamps. KV-only stores hit this the first time they implement a windowed `ScoreStore.top`. Mitigated by explicit documentation in ADAPTERS.md.
- The todont migration path in the original design (step 1: `install @walangstudio/badgetrip-supabase`) is invalidated. The migration path changes to: implement the four interfaces against your existing Supabase Postgres connection (the `examples/adapter-postgres/` reference shows exactly how), then pass those stores to `createEngine`. The net code is the same ~300 lines; it lives in the app, not in a badgetrip package.
- `examples/adapter-postgres/` is not a published package, so it has no semver guarantee. If the port interfaces change, the example must be updated manually.

**Follow-ups**
All done in 0.0.1:
- ADAPTERS.md states the `(ts, insertion-order)` sort contract and the rolling-window timestamp requirement.
- The README packages table lists what actually ships.
- `runStoreContract` ships in `@walangstudio/badgetrip-testing`.
- `examples/adapter-postgres/README.md` explains the `score_deltas` table.
