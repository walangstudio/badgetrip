# Saving data

badgetrip keeps its state in four stores that you give to `createEngine`: events, scores, unlocked achievements and streaks. There's no database package to install. The stores are small objects you write against the database you already have, so badgetrip's tables sit next to yours and use your connection.

| Store | Holds |
|---|---|
| `events` | every event you emit, once per `id` |
| `scores` | score totals, plus per-change history for rolling leaderboards |
| `achievements` | which user unlocked what, and when |
| `streaks` | current and best streak per user |

## Pick a path

### Trying things out: memory

The `memory*Store` functions from [Getting started](getting-started.md) keep everything in memory. Use them for demos and tests. Everything is lost when the app restarts.

### Postgres, Supabase, Neon

Copy [`examples/adapter-postgres`](../../examples/adapter-postgres) into your app. It's a complete, tested store set with its own migration:

```ts
import { Pool } from 'pg';
import { createEngine, systemClock } from '@walangstudio/badgetrip-core';
import { pgStores } from './badgetrip-store';

const pool = new Pool({ connectionString: process.env.DATABASE_URL }); // reuse yours
const stores = pgStores(pool);
await stores.migrate(); // creates badgetrip's tables, never touches yours

export const engine = createEngine({ ...stores, clock: systemClock, definitions });
```

### Anything else

SQLite, MySQL, Redis, IndexedDB, Durable Objects: write the four stores yourself. Each is a plain object with three methods, so a SQL version is a few hundred lines. Start from the Postgres example and keep its shape.

Four rules matter more than the rest:

- **`events.append` must insert only if the `id` is new**, and return `true` or `false`. This is what makes a retried event count once. In SQL: a unique key and `INSERT ... ON CONFLICT DO NOTHING`.
- **Writes must be atomic.** Two servers can emit for the same user at the same moment. `scores.apply`, `achievements.award`, `streaks.tick` and `streaks.reset` should each be one statement, not a read followed by a write.
- **`events.read` returns events oldest first.**
- **Rolling leaderboards need history.** A weekly leaderboard sums score changes since a date, so `scores` must keep each change with its time, not only the total. Skip this if you only use all-time leaderboards.

One more: a store method must never call `engine.emit`. The engine handles one emit per user at a time, so a store waiting on a nested emit for the same user waits forever.

[Writing a store](../ADAPTERS.md) is the full reference: every method, its arguments, and what it returns.

## Check your stores

`runStoreContract` from `@walangstudio/badgetrip-testing` runs the same tests the built-in stores pass, including concurrent writes. Give it a function that returns fresh, empty stores:

```ts
import { runStoreContract } from '@walangstudio/badgetrip-testing';
import { myStores } from '../src/badgetrip-store';

runStoreContract(async () => {
  const stores = myStores(db);
  await resetTables(db); // empty on every call
  return stores;
});
```

Run it against a scratch database, never a shared one, since your factory empties the tables before each test.

## Why there's no database package

A package per database means a second client in your app, a badgetrip release every time a driver changes, and a library tied to one vendor. Your app already has a database layer. Four small stores in your own code fit it better, and you can read every query badgetrip runs.
