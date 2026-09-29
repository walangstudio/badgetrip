# @walangstudio/badgetrip-testing

Test helpers for code that uses badgetrip, and the conformance suite for custom stores.

[Writing a store](../../docs/ADAPTERS.md) · [badgetrip](../../README.md)

## Install

```sh
npm install -D @walangstudio/badgetrip-testing
```

Peer dependency: vitest 2 or later.

## Usage

```ts
import { makeEvent, makeTestEngine, time } from '@walangstudio/badgetrip-testing';
import { expect, it } from 'vitest';
import { achievements } from './badges';

const streaks = [
  { code: 'daily', tickEvents: ['day.completed'], resetEvents: ['day.missed'], scoping: 'per-actor' as const },
];

it('unlocks the streak badge after a week', async () => {
  const { engine, clock } = makeTestEngine({ achievements, streaks });
  for (let day = 0; day < 7; day++) {
    await engine.emit(makeEvent({ id: `d${day}`, actor: 'ana', type: 'day.completed', ts: clock.now() }));
    clock.advance(time.DAY);
  }
  expect((await engine.achievements('ana')).map((a) => a.code)).toContain('on_a_roll');
});
```

## API

| | |
|---|---|
| `makeTestEngine(definitions, { clock?, dayBoundary? })` | An engine on in-memory stores. Returns `{ engine, clock }`; the clock is steppable unless you pass your own. |
| `steppableClock(start?)` | A clock that only moves when you call `advance(ms)` or `set(ms)`. |
| `makeEvent(partial)` | An event with defaults: `ts: 0`, `payload: {}`, and an id derived from type, actor and ts. Pass an `id` when two events share those. |
| `idFactory(prefix?)` | Ordered, deterministic ids: `evt_000000000000`, `evt_000000000001`, ... |
| `time` | `{ HOUR, DAY }` in milliseconds. |
| `runStoreContract(factory)` | Registers the store contract as vitest tests. `factory` returns fresh stores for each test. |

## Checking a custom store

```ts
// stores.contract.test.ts
import { runStoreContract } from '@walangstudio/badgetrip-testing';

runStoreContract(async () => {
  await truncateTables(db);
  return myStores(db);
});
```

When it passes, your stores behave like the built-in ones: idempotent appends, atomic ticks and awards, ordering, filters and windows. Optional capabilities your stores don't implement are skipped, not passed. Run it against a throwaway database, since it deletes data between tests.

## License

MIT
