# badgetrip

[![release](https://img.shields.io/github/v/release/walangstudio/badgetrip?include_prereleases&sort=semver)](https://github.com/walangstudio/badgetrip/releases)
[![license](https://img.shields.io/github/license/walangstudio/badgetrip)](LICENSE)
![typescript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
[![CI](https://github.com/walangstudio/badgetrip/actions/workflows/ci.yml/badge.svg)](https://github.com/walangstudio/badgetrip/actions/workflows/ci.yml)
![core deps](https://img.shields.io/badge/core%20deps-0-brightgreen)

Points, streaks, tiers, leaderboards and achievements for any JavaScript app. You tell the engine what your users did. It works out their score, their streaks, and which badges they just unlocked.

```ts
const result = await engine.emit({ id, actor: 'ana', type: 'habit.done', ts: Date.now(), payload: {} });
result.unlocked; // ['first_step']
```

> **Status:** early (0.0.x). APIs may change before 1.0. Changes are listed in the [CHANGELOG](CHANGELOG.md).

## Why

Every app with a streak or a badge ends up rebuilding the same things: a points counter, a handful of unlock rules, a streak that resets, a leaderboard. The logic usually ends up spread across database triggers, API handlers and UI hooks.

badgetrip keeps the rules in one place and stays out of everything else:

- **Your database.** The engine talks to four small store interfaces. Implement them on Postgres, SQLite, KV or anything else, and badgetrip keeps its state next to your tables.
- **Your framework.** The core is plain TypeScript with no dependencies. Thin adapters cover React, React Native, Vue, Angular, plain HTML, htmx, Electron and Tauri.
- **Your clock.** The engine never reads the system time on its own. Same events in, same state out, so replays and tests are deterministic.

## Features

- **Achievements as config.** A keyed object with rule builders: `rules.count('habit.done', 10)`, `rules.streak('daily', 7)`, `rules.all(...)`. Tiers expand one entry into bronze/silver/gold. Hidden achievements stay concealed until earned.
- **Progress for free.** `engine.catalog(actor)` returns every badge, ready to draw, with `{ current, target, percent }`.
- **Points, streaks, tiers, leaderboards, escalators.** All-time and rolling leaderboards, per-key streaks, and capped severity escalators with decay.
- **Idempotent.** Events carry an id. A retry or a double click counts once.
- **Validated up front.** `createEngine` rejects typos and impossible rules before the first event.
- **Swappable icons.** 18 built-in SVG icons, including an animated one. Override any icon per achievement, per tier series or per category, with GIFs, PNGs or your own SVGs.
- **Accessible badges.** Every adapter shows a still frame while locked or when the user prefers reduced motion, and labels its progress bar.
- **Unlock celebrations.** Toasts in any corner or edge, a modal, or fullscreen with confetti, with optional sound. Configure once, override per achievement. Secret mode hides hidden achievements the way consoles do.
- **Progress you can see.** Badges show "3/5" under locked achievements, and optional popups report progress along the way, every step or at milestones.
- **Cross-process.** `@walangstudio/badgetrip-ipc` runs the engine in Electron's main process or a worker, behind a method allowlist and an `authorize` hook.

## Try it

The [playground](examples/playground) is a sandbox: edit a config, fire events, and watch achievements unlock with the real celebrations. Nothing is saved.

```sh
pnpm install
pnpm --filter @badgetrip-example/playground dev
```

## Install

```sh
npm install @walangstudio/badgetrip-core
npm install @walangstudio/badgetrip-react   # or vue, angular, react-native, html
```

## Quick start

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

const achievements = defineAchievements({
  first_step: {
    name: 'First step',
    description: 'Log your first habit',
    icon: 'sprout',
    when: rules.count('habit.done', 1),
  },
  regular: {
    name: 'Regular ({tier})',
    description: 'Log {n} habits',
    when: rules.count('habit.done'),
    tiers: { bronze: 10, silver: 50, gold: 200 },
  },
});

const engine = createEngine({
  events: memoryEventStore(),
  scores: memoryScoreStore(),
  achievements: memoryAchievementStore(),
  streaks: memoryStreakStore(),
  clock: systemClock,
  definitions: {
    scores: ['xp'],
    points: [{ on: 'habit.done', score: 'xp', delta: 10 }],
    achievements,
  },
});

const result = await engine.emit({
  id: crypto.randomUUID(),
  actor: 'ana',
  type: 'habit.done',
  ts: Date.now(),
  payload: {},
});

result.unlocked;                // ['first_step']
await engine.score('ana', 'xp'); // 10
await engine.catalog('ana');     // every badge with its progress
```

The memory stores are for demos and tests. For data that survives a restart, see [Bring your own store](#bring-your-own-store).

## Usage

The examples below build on one engine for a habit tracker. The outputs are real.

### Define the rules

```ts
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const engine = createEngine({
  events: memoryEventStore(),
  scores: memoryScoreStore(),
  achievements: memoryAchievementStore(),
  streaks: memoryStreakStore(),
  clock: systemClock,
  definitions: {
    scores: ['xp'],
    points: [{ on: 'habit.done', score: 'xp', delta: 10 }],
    streaks: [
      { code: 'daily', tickEvents: ['day.completed'], resetEvents: ['day.missed'], scoping: 'per-actor' },
    ],
    tiers: [
      {
        code: 'level',
        score: 'xp',
        thresholds: [
          { name: 'novice', at: 0 },
          { name: 'adept', at: 100 },
          { name: 'master', at: 500 },
        ],
      },
    ],
    leaderboards: [
      { code: 'weekly', score: 'xp', window: { type: 'rolling', ms: 7 * DAY }, limit: 10 },
    ],
    achievements: defineAchievements({
      first_step: {
        name: 'First step',
        description: 'Log your first habit',
        icon: 'sprout',
        points: 5,
        when: rules.count('habit.done', 1),
      },
      regular: {
        name: 'Regular ({tier})',
        description: 'Log {n} habits',
        icon: 'medal',
        when: rules.count('habit.done'),
        tiers: { bronze: 10, silver: 50, gold: 200 },
      },
      on_a_roll: {
        name: 'On a roll',
        description: 'Keep a 3-day streak',
        icon: 'flame',
        when: rules.streak('daily', 3),
      },
      night_owl: {
        name: 'Night owl',
        description: 'Log a habit between midnight and 4am',
        lockedDescription: 'Some habits happen after dark',
        icon: 'moon',
        hidden: true,
        when: rules.count('habit.done', 1, { todBetween: [0, 4 * HOUR] }),
      },
    }),
  },
});
```

`createEngine` checks all of it up front. A typo like `rules.streak('dialy', 3)` throws here, not on the first event.

### Record what happened

```ts
const result = await engine.emit({
  id: 'evt_1',
  actor: 'ana',
  type: 'habit.done',
  ts: Date.now(),
  payload: {},
});

result.scoreDeltas; // [{ actor: 'ana', score: 'xp', delta: 10, reason: 'evt_1', ts }]
result.unlocked;    // ['first_step']
```

The `id` makes it safe to retry. Emitting `evt_1` again returns empty changes and counts nothing.

### Streaks

Streaks count ticks, not calendar days. Emit `day.completed` once a day for each user who showed up, and `day.missed` for those who didn't; a nightly job is the usual place.

```ts
// Ana's third day in a row
await engine.emit({ id: 'day_3', actor: 'ana', type: 'day.completed', ts: Date.now(), payload: {} });
// streakChanges: [{ code: 'daily', actor: 'ana', from: 2, to: 3 }], unlocked: ['on_a_roll']

await engine.streak('ana', 'daily'); // { current: 3, best: 3, lastTick }
```

### Scores, tiers and leaderboards

```ts
await engine.score('ana', 'xp');      // 10
await engine.tier('ana', 'level');    // { current: 'novice', next: 'adept', remaining: 90, value: 10 }
await engine.leaderboard('weekly');   // after Ben logs two habits: [{ actor: 'ben', value: 20 }, { actor: 'ana', value: 10 }]
```

### Achievements and progress

```ts
await engine.achievements('ana');               // [{ code: 'first_step', at }, { code: 'on_a_roll', at }]
await engine.progress('ana', 'regular.bronze'); // { current: 1, target: 10, percent: 10 }

const badges = await engine.catalog('ana');
```

`catalog` returns every achievement in definition order, ready to draw: code, name, description, icon, points, `unlocked`, and progress. `regular` shows up as three badges, `regular.bronze` to `regular.gold`. `night_owl` comes back as "Hidden achievement" with its `lockedDescription` until Ana earns it.

### Changing the rules later

- `engine.refresh(actor)` awards anything the actor already qualifies for. Run it after adding an achievement.
- `engine.replay(log)` rebuilds state from a stored event log, in `ts` order.
- `engine.seed(snapshot)` loads existing scores, achievements and streaks when moving from another system.

### Celebrate unlocks

```tsx
<UnlockNotifier actor="ana" sound={soundOn} celebrations={celebrations} />
```

Each unlock pops up on top of the page. Give an achievement `celebration: 'epic'` for fullscreen confetti, or `'modal'`, `'quiet'`, or your own preset. The [celebrations guide](docs/guide/celebrations.md) covers positions, sounds, secret mode and styling.

### Show it in your UI

Wrap the engine once with the package for your stack, and every badge updates after each `emit`. See [Frameworks](#frameworks).

## Frameworks

Start with [Getting started](docs/guide/getting-started.md), then pick your stack:

| Stack | Package | Guide |
|---|---|---|
| React | `@walangstudio/badgetrip-react` | [React](docs/guide/react.md) |
| React Native / Expo | `@walangstudio/badgetrip-react-native` | [React Native](docs/guide/react-native.md) |
| Vue 3 | `@walangstudio/badgetrip-vue` | [Vue](docs/guide/vue.md) |
| Angular 17.1+ | `@walangstudio/badgetrip-angular` | [Angular](docs/guide/angular.md) |
| Plain HTML, web components | `@walangstudio/badgetrip-html` | [HTML](docs/guide/html.md) |
| htmx, server-rendered | `@walangstudio/badgetrip-html` | [htmx](docs/guide/htmx.md) |
| Electron | `@walangstudio/badgetrip-ipc` + a UI package | [Electron](docs/guide/electron.md) |
| Tauri | a UI package, optionally `@walangstudio/badgetrip-ipc` | [Tauri](docs/guide/tauri.md) |

In React:

```tsx
import { AchievementBadge, BadgetripProvider, useAchievementCatalog } from '@walangstudio/badgetrip-react';

function Trophies({ userId }: { userId: string }) {
  return useAchievementCatalog(userId).map((a) => <AchievementBadge key={a.code} achievement={a} />);
}

<BadgetripProvider engine={engine}>
  <Trophies userId="ana" />
</BadgetripProvider>;
```

## Packages

| Package | What it is |
|---|---|
| [`@walangstudio/badgetrip-core`](packages/core) | The engine, rule builders, store interfaces and in-memory stores. No dependencies. |
| [`@walangstudio/badgetrip-assets`](packages/assets) | 18 SVG icons and `createIconResolver` for overrides. No dependencies. |
| [`@walangstudio/badgetrip-react`](packages/react) | Hooks, `BadgetripProvider`, `AchievementBadge`, `IconProvider`. |
| [`@walangstudio/badgetrip-react-native`](packages/react-native) | The React hooks plus a native `AchievementBadge` on react-native-svg. |
| [`@walangstudio/badgetrip-vue`](packages/vue) | Plugin, composables returning `{ data, error }`, `AchievementBadge`. |
| [`@walangstudio/badgetrip-angular`](packages/angular) | `provideBadgetrip`, a signal-based `BadgetripService`, a standalone badge component. |
| [`@walangstudio/badgetrip-html`](packages/html) | `renderBadge` / `renderCatalog` HTML strings and `<badgetrip-catalog>` / `<badgetrip-badge>` custom elements. |
| [`@walangstudio/badgetrip-ipc`](packages/ipc) | Serve an engine in one process and use it from another, over MessagePort or Electron IPC. |
| [`@walangstudio/badgetrip-testing`](packages/testing) | A steppable clock, event helpers, `makeTestEngine`, and `runStoreContract` for custom stores. |

## Bring your own store

badgetrip ships no database adapters. Implement `EventStore`, `ScoreStore`, `AchievementStore` and `StreakStore` against the database you already use, and pass them to `createEngine`:

```ts
const engine = createEngine({
  events: myEventStore(db),
  scores: myScoreStore(db),
  achievements: myAchievementStore(db),
  streaks: myStreakStore(db),
  clock: systemClock,
  definitions,
});
```

Then prove it behaves like the reference stores:

```ts
import { runStoreContract } from '@walangstudio/badgetrip-testing';

runStoreContract(() => makeFreshStores());
```

[docs/ADAPTERS.md](docs/ADAPTERS.md) spells out what each method must do, and [`examples/adapter-postgres`](examples/adapter-postgres) is a complete Postgres implementation to copy. The reasoning is in [ADR-0001](docs/adr/0001-store-agnostic-persistence.md).

## How it works

Everything flows from events. For each `emit`, the engine:

1. validates the event and queues it behind any in-flight event for the same actor,
2. appends it to the event store, stopping if its id was already seen,
3. applies point rules, then streak ticks and resets, then escalators,
4. evaluates the achievements the user doesn't have yet and awards the ones that pass.

It returns what changed: score deltas, streak changes, escalations and newly unlocked codes. `engine.replay(log)` rebuilds the same state from a stored log. Details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Documentation

| Doc | Covers |
|---|---|
| [Guides](docs/guide/getting-started.md) | Getting started, then one guide per framework |
| [Celebrations](docs/guide/celebrations.md) | Unlock popups, sound, confetti, secret mode |
| [ACHIEVEMENTS.md](docs/ACHIEVEMENTS.md) | Achievement config, tiers, hidden badges, progress, icons |
| [RULES.md](docs/RULES.md) | Every rule kind, filters and the path convention |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Interfaces, data model, the emit pipeline, determinism |
| [ADAPTERS.md](docs/ADAPTERS.md) | Writing a store for your database |
| [CROSS_PLATFORM.md](docs/CROSS_PLATFORM.md) | Where each package runs and how that was verified |
| [CHANGELOG.md](CHANGELOG.md) | Release notes |

## Examples

| Example | Shows |
|---|---|
| [`examples/playground`](examples/playground) | A browser sandbox: edit a config, fire events, see the celebrations |
| [`examples/node-cli`](examples/node-cli) | The engine in a plain Node script |
| [`examples/react-spa`](examples/react-spa) | A Vite app on `@walangstudio/badgetrip-react` |
| [`examples/todont-extract`](examples/todont-extract) | A production ruleset (12 badges) moved onto badgetrip |
| [`examples/adapter-postgres`](examples/adapter-postgres) | A Postgres store that passes the contract suite |

## Development

Requires Node 22 and pnpm 11.

```sh
pnpm install
pnpm build          # tsc -b, then ng-packagr for Angular
pnpm test           # vitest, then the Angular suite
pnpm typecheck      # sources, tests and Angular specs
pnpm lint           # biome
pnpm test:coverage  # line and branch coverage
```

Run the store contract against Postgres with a throwaway database:

```sh
BADGETRIP_PG_URL=postgres://... pnpm --filter @badgetrip-example/adapter-postgres test
```

### Releasing

All packages share one version. Bump it in every `package.json`, add a dated `## [x.y.z]` entry to the [CHANGELOG](CHANGELOG.md), merge to `main`, then tag:

```sh
git tag -a v0.0.1 -m v0.0.1
git push origin v0.0.1
```

The [release workflow](.github/workflows/release.yml) checks the tag against every package version and the changelog, runs the full gate, publishes to npm with provenance, and creates the GitHub release from the changelog entry. It needs an `NPM_TOKEN` repository secret.

## License

[MIT](LICENSE)
