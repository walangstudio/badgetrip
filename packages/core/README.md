# @walangstudio/badgetrip-core

The badgetrip engine. Tell it what your users did, and it keeps score: points, streaks, tiers, leaderboards, escalators and achievements. No dependencies, runs anywhere JavaScript does.

[Getting started](https://github.com/walangstudio/badgetrip/blob/main/docs/guide/getting-started.md) · [Rules](https://github.com/walangstudio/badgetrip/blob/main/docs/RULES.md) · [Achievements](https://github.com/walangstudio/badgetrip/blob/main/docs/ACHIEVEMENTS.md) · [Writing a store](https://github.com/walangstudio/badgetrip/blob/main/docs/ADAPTERS.md)

## Install

```sh
npm install @walangstudio/badgetrip-core
```

## Usage

```ts
import {
  createEngine,
  defineAchievements,
  memoryAchievementStore,
  memoryEventStore,
  memoryScoreStore,
  memoryStreakStore,
  rules,
  systemClock,
} from '@walangstudio/badgetrip-core';

const engine = createEngine({
  events: memoryEventStore(),
  scores: memoryScoreStore(),
  achievements: memoryAchievementStore(),
  streaks: memoryStreakStore(),
  clock: systemClock,
  definitions: {
    scores: ['xp'],
    points: [{ on: 'habit.done', score: 'xp', delta: 10 }],
    achievements: defineAchievements({
      first_step: { name: 'First step', description: 'Log a habit', when: rules.count('habit.done', 1) },
    }),
  },
});

const { unlocked } = await engine.emit({
  id: crypto.randomUUID(),
  actor: 'ana',
  type: 'habit.done',
  ts: Date.now(),
  payload: {},
});
```

## API

**Engine**

| | |
|---|---|
| `createEngine(config)` | Validates `definitions` and returns an engine. Throws on unknown refs or keys, bad thresholds or missing store capabilities. |
| `emit(event)` | Records one event and returns `{ event, scoreDeltas, streakChanges, escalations, unlocked }`. A repeated `id` is a no-op. |
| `replay(log)` | Emits a log in `ts` order (ties by `id`). Same log, same state. |
| `seed(snapshot)` | Loads existing scores, achievements and streaks. Not idempotent. |
| `refresh(actor)` | Awards anything the actor now qualifies for, for example after you add an achievement. |
| `score`, `tier`, `leaderboard`, `streak`, `escalator` | Read current state. |
| `achievements(actor)` | Unlocked achievements with their unlock time. |
| `progress(actor, code)` | `{ current, target, percent }` for one achievement. |
| `catalog(actor)` | Every achievement, ready to draw, with progress. Hidden ones stay concealed until earned. |

**Definitions**

| | |
|---|---|
| `defineAchievements({ key: spec })` | Keyed achievement config. The key is the permanent code. `tiers` expand one entry into several. Unknown fields on an achievement or a tier throw. |
| `rules.*` | `count`, `score`, `streak`, `unique`, `groupCount`, `firstOfDay`, `rank`, `all`, `any`. |

**Everything else**

| | |
|---|---|
| `memoryEventStore`, `memoryScoreStore`, `memoryAchievementStore`, `memoryStreakStore` | In-memory reference stores for demos and tests. |
| `observe(engine)` | Wraps an engine so UI adapters re-render after every change. One wrapper per engine. Its `onUnlock` reports each batch of new unlocks from `emit` and `refresh`. |
| `watchUnlocks(observed, { actor }, cb)` | New unlocks resolved to catalog views, in order. The celebration notifiers are built on it. |
| `watchProgress(observed, { actor }, cb)` | Locked achievements of one actor that moved forward, with the step they came from. Progress popups are built on it. |
| `splitConcealed(views)` | Secret mode: `{ views, hiddenRemaining }` without the hidden, locked ones. |
| `systemClock`, `fixedClock(t)`, `utcDayStart` | Clocks and the default day boundary. The engine only reads the clock for queries, never during `emit`. |
| `evaluateRule`, `ruleProgress`, `evalTier`, `evalEscalator`, `getPath`, `matchFilter` | The building blocks, for stores that evaluate rules natively. |

For real persistence, implement `EventStore`, `ScoreStore`, `AchievementStore` and `StreakStore` against your database. [ADAPTERS.md](https://github.com/walangstudio/badgetrip/blob/main/docs/ADAPTERS.md) has the contract, and `runStoreContract` in [`@walangstudio/badgetrip-testing`](https://github.com/walangstudio/badgetrip/tree/main/packages/testing) checks it.

## License

MIT
