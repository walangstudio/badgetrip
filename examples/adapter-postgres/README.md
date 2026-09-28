# Example: a Postgres store for badgetrip

badgetrip ships no database adapters. The application supplies persistence by implementing the
four store interfaces (`EventStore`, `ScoreStore`, `AchievementStore`, `StreakStore`) against
whatever store it already uses. This is a complete, working reference for Postgres. Copy
`src/` into your app and adapt it - it is not a published package.

## What's here

- `src/event-store.ts`, `src/score-store.ts`, `src/achievement-store.ts`, `src/streak-store.ts` - one file per interface.
- `src/migrate.ts` + `migrations/0001_init.sql` - the tables badgetrip needs.
- `src/index.ts` - `pgStores(pool)` returns all four plus `migrate`.

## Wiring it up

```ts
import { Pool } from 'pg';
import { createEngine, systemClock } from '@badgetrip/core';
import { pgStores } from './src/index.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL }); // reuse your app's pool
const stores = pgStores(pool);
await stores.migrate();

const engine = createEngine({ ...stores, clock: systemClock, definitions });
```

The badgetrip tables live alongside your app's tables in the same database. badgetrip never reads
or writes your tables.

## Notes for other stores

- **Rolling leaderboards** need per-delta history. `ScoreStore.top(score, limit, { since })` sums
  only deltas at or after `since`, so this example keeps a `score_deltas` table in addition to
  `score_totals`. A KV store that tracks only running totals cannot satisfy windowed `top` without
  a similar secondary index.
- **`EventStore.read`** must yield events in ascending `ts`. This example sorts by `(ts, seq)`.
- **`count`** reuses badgetrip's exported `matchFilter` for the `where` filter, so filter semantics
  match the engine exactly.

## Verifying your adapter

Prove conformance with the shipped contract kit:

```ts
import { runStoreContract } from '@badgetrip/testing';
import { pgStores } from '../src/index.js';

runStoreContract(async () => {
  const stores = pgStores(pool);
  await stores.migrate();
  return stores; // return FRESH/empty stores each call (truncate for a DB)
});
```

Run it against a throwaway database:

```sh
BADGETRIP_PG_URL=postgres://user:pass@localhost:5432/scratch pnpm --filter @badgetrip-example/adapter-postgres test
```
