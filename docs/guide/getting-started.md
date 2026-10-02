# Getting started

badgetrip turns things your users do into points, streaks and achievements. You emit an event for what happened ("Ana finished a habit"), and it calculates the rest: her new score, whether her streak grew, and which badges she just unlocked.

This guide builds the engine for a small habit tracker. Every framework guide uses this engine, so read this one first.

## Install

```sh
npm install @walangstudio/badgetrip-core
```

Add the package for your UI later. The core has no dependencies and runs anywhere JavaScript does.

## Describe your achievements

Put this in `badges.ts`:

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

export const achievements = defineAchievements({
  first_step: {
    name: 'First step',
    description: 'Log your first habit',
    icon: 'sprout',
    points: 5,
    when: rules.count('habit.done', 1),
  },

  // One entry, three badges: regular.bronze, regular.silver, regular.gold
  regular: {
    name: 'Regular ({tier})',
    description: 'Log {n} habits',
    icon: 'medal',
    when: rules.count('habit.done'),
    tiers: { bronze: 10, silver: 50, gold: 200 },
  },

  on_a_roll: {
    name: 'On a roll',
    description: 'Keep a 7-day streak',
    icon: 'flame',
    points: 20,
    when: rules.streak('daily', 7),
  },

  // Not shown until someone earns it
  night_owl: {
    name: 'Night owl',
    description: 'Log a habit between midnight and 4am',
    lockedDescription: 'Some habits happen after dark',
    icon: 'moon',
    hidden: true,
    when: rules.count('habit.done', 1, { todBetween: [0, 4 * 3_600_000] }),
  },
});

export const engine = createEngine({
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
    achievements,
  },
});
```

The object key (`first_step`) is the achievement's permanent id. The key is saved with every unlock. You can change `name` at any time, but never change the key.

`createEngine` checks the whole config up front. A typo like `rules.streak('dialy', 7)` throws right there instead of failing quietly later.

## Tell it what happened

```ts
const result = await engine.emit({
  id: crypto.randomUUID(),
  actor: 'ana',
  type: 'habit.done',
  ts: Date.now(),
  payload: {},
});

result.unlocked; // ['first_step'] the first time
result.scoreDeltas; // [{ actor: 'ana', score: 'xp', delta: 10, ... }]
```

The `id` prevents double counting. Emit the same event twice (a retry, a double click) and it counts once.

Streaks count ticks, not calendar days. Emit `day.completed` once a day for each user who was active that day, and `day.missed` for those who weren't. Usually a nightly job emits these events.

## Show it

```ts
const badges = await engine.catalog('ana');
```

You get every achievement, in the order you defined them, ready to draw: name, description, icon key, points, whether it's unlocked, and progress like `{ current: 12, target: 50, percent: 24 }`. Hidden ones come back as "Hidden achievement" until they're earned.

That's the whole loop: `emit` when something happens, `catalog` when you display badges. The framework guides connect these two calls to your UI:

- [React](react.md)
- [React Native and Expo](react-native.md)
- [Vue](vue.md)
- [Angular](angular.md)
- [Plain HTML and JavaScript](html.md)
- [htmx and server-rendered pages](htmx.md)
- [Electron](electron.md)
- [Tauri](tauri.md)

To pop up a toast, a modal or a fullscreen popup when something unlocks, see [Unlock celebrations](celebrations.md).

## Before production

The `memory*Store` functions keep everything in memory, which is good for testing, but all data is lost when the app restarts. For real data, implement the four store interfaces against your own database. [ADAPTERS.md](../ADAPTERS.md) explains the contract, and [examples/adapter-postgres](../../examples/adapter-postgres) is a complete Postgres version you can copy.

Added an achievement after launch? Call `engine.refresh(userId)` when a user signs in, and they'll get any badge they already qualify for.

## Your own icons

To change colors, icons and sounds together, use a [theme](themes.md). This section changes only icons.

Every icon key (`sprout`, `medal`, `flame`...) comes from a built-in pack of 18 SVGs. Swap any of them, or give one achievement its own art:

```ts
import { createIconResolver } from '@walangstudio/badgetrip-assets';

const icons = createIconResolver({
  icons: { medal: { src: '/art/medal.png' } },
  overrides: {
    on_a_roll: { src: '/art/fire.gif', still: '/art/fire.png', animated: true },
  },
});
```

Animated icons only play once the badge is unlocked, and fall back to the `still` frame for people who turn on reduced motion. [ACHIEVEMENTS.md](../ACHIEVEMENTS.md) has the full list of options.

Want something to try first? Three sample GIF badges, drawn for badgetrip (MIT license), ship in [`examples/playground/public/samples`](../../examples/playground/public/samples), each with a still PNG. For a whole set, the [animated sample theme](themes.md#sample-every-badge-animated) has a GIF for every built-in icon.

<p>
  <img src="https://raw.githubusercontent.com/walangstudio/badgetrip/main/examples/playground/public/samples/star.gif" width="64" height="64" alt="A gold star turning, with sparkles">
  <img src="https://raw.githubusercontent.com/walangstudio/badgetrip/main/examples/playground/public/samples/trophy.gif" width="64" height="64" alt="A gold trophy with a pulsing glow">
  <img src="https://raw.githubusercontent.com/walangstudio/badgetrip/main/examples/playground/public/samples/flame.gif" width="64" height="64" alt="A flickering flame">
</p>
