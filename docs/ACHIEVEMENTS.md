# Achievements

Define achievements as a keyed object. The key is the stable code, stored with every unlock, so rename the display `name` freely but never the key.

```ts
import { createEngine, defineAchievements, rules } from '@badgetrip/core';

const achievements = defineAchievements({
  first_win: {
    name: 'First Win',
    description: 'Win a match',
    icon: 'trophy',
    points: 10,
    when: rules.count('match.won', 1),
  },

  // One definition, three unlocks: fan.bronze, fan.silver, fan.gold.
  fan: {
    name: 'Fan ({tier})',
    description: 'Get {n} reactions',
    icon: 'heart',
    when: rules.count('reaction.received'),
    tiers: { bronze: 10, silver: 50, gold: { at: 100, points: 50, icon: 'crown' } },
  },

  night_owl: {
    name: 'Night Owl',
    description: 'Played between midnight and 4am',
    lockedDescription: 'Some things only happen at night',
    hidden: true,
    icon: 'moon',
    when: rules.count('match.played', 1, { todBetween: [0, 4 * 3_600_000] }),
  },
});

const engine = createEngine({ /* stores, clock */ definitions: { achievements } });
```

`defineAchievements` returns plain `AchievementDef[]`, so it mixes with hand-written defs and JSON config. The flat `AchievementDef` format still works unchanged.

## Fields

| Field | Default | Meaning |
|---|---|---|
| `name`, `description` | required | Display text. `{tier}` and `{n}` are filled per tier. |
| `when` | required | Unlock rule, built with `rules.*` or written as a `Rule` object. |
| `rarity` | 1 (tiers: 1, 2, 3, ... capped at 5) | 1-5, for sorting and styling. |
| `points` | 0 | Display value; sum unlocked `points` for an achievement score. |
| `hidden` | false | Conceal name, description, icon and progress until unlocked. |
| `lockedDescription` | `description` (`''` when `hidden`) | Spoiler-free text shown while locked. |
| `icon` | category, then `'trophy'` | Asset key. See [Assets](#assets). |
| `category` | - | Free-form group; also an icon fallback. |
| `celebration` | - | Unlock celebration preset, such as `'modal'` or `'epic'`. See [Celebrations](guide/celebrations.md). |
| `tiers` | - | `{ name: threshold }` or `{ name: { at, points?, rarity?, icon?, name?, description?, celebration? } }`, ascending. |
| `metadata` | - | Anything else; opaque to the engine. |

## Rule builders

| Builder | Unlocks when |
|---|---|
| `rules.count(type, n, { where?, todBetween? })` | the actor has `n` events of `type` |
| `rules.score(score, n)` | a score total reaches `n` |
| `rules.streak(streak, n, { key?, of?, anyKey? })` | a streak reaches `n` |
| `rules.unique(type, path, n)` | `n` distinct values at `path` |
| `rules.groupCount(type, path, n, where?)` | one value at `path` repeats `n` times |
| `rules.firstOfDay(type, between?)` | the first event of a day (optionally in a time window) |
| `rules.rank(leaderboard, position)` | the actor holds a leaderboard position |
| `rules.all(...)`, `rules.any(...)` | every / some sub-rule holds |

Leave `n` out only on a tiered achievement: each tier supplies it. See [RULES.md](RULES.md) for exact semantics.

## Progress and the catalog

```ts
await engine.progress('u1', 'fan.silver'); // { current: 12, target: 50, percent: 24 }
await engine.catalog('u1');                // every achievement, ready to render
```

Progress is computed from the event stream and stores; nothing extra is persisted. An unlocked achievement always reports 100%, even if its streak later resets. For `all`, `current`/`target` count satisfied sub-rules and `percent` is the mean of their percents. For `any`, it is `current: 0 or 1`, `target: 1`, and the max percent. `first-of-day` has no standing progress.

`catalog(actor)` returns `AchievementView[]` in definition order: code, name, description, icon, category, rarity, points, series, `unlocked`, `unlockedAt`, `concealed`, progress. A hidden, locked achievement arrives with `concealed: true`, the name `Hidden achievement`, its `lockedDescription`, icon `hidden`, zero progress, and no `series` or `category`, so it cannot leak through the UI.

## Retroactive unlocks

Achievements unlock during the actor's own `emit`. Two cases need a nudge: a definition added after the events already happened, and a rule other actors can satisfy for you (`rank`). `catalog` shows these at 100% but locked. Award them with:

```ts
await engine.refresh('u1'); // ['newly_added_badge'] - stamped clock.now()
```

Call it on login or after deploying new achievements. `first-of-day` only unlocks during `emit`.

## Assets

`@badgetrip/assets` ships 18 line icons (MIT, drawn for badgetrip), painted with `currentColor`:

`trophy star medal crown flame shield bolt heart chat sprout target clock moon check lock hidden sparkle sparkle-animated`

Achievements name an icon key; a resolver turns keys into renderable assets. Swap any asset without touching achievement definitions:

```ts
import { createIconResolver } from '@badgetrip/assets';

const icons = createIconResolver({
  // Replace or add registry entries. A string aliases another key.
  icons: { trophy: { src: '/art/trophy.png' }, lava: 'flame' },
  // Per achievement code, or per series code to cover every tier.
  overrides: {
    first_win: { src: '/art/first-win.gif', still: '/art/first-win.png', animated: true },
    fan: { src: '/art/fan.svg' },
  },
  categories: { social: 'chat' },   // icon for achievements with no `icon`
  fallback: 'star',                 // default 'trophy'
  color: '#1f2937',                 // paint color for the built-in SVGs
  tierColors: { bronze: '#b8733d' }, // merged over the default tints; false disables
});

icons.resolve(view);          // { src, still?, animated?, svg? }
icons.missing(achievements);  // unresolvable keys - check at startup to catch typos
```

Resolution order: `overrides[code]`, `overrides[series.code]`, `icon`, `categories[category]`, `fallback`. A concealed achievement always resolves to `hidden`, so overrides cannot spoil it. Unknown keys fall through to the next step instead of failing.

**Animated icons.** Any `src` an `<img>` accepts works: GIF, APNG, animated WebP or SVG. Mark it `animated: true` and give a `still` frame. Every adapter's badge shows `still` while the achievement is locked and whenever the user prefers reduced motion. The built-in `sparkle-animated` shows the pattern. Without a `still`, the animation plays in every state, reduced motion included, so always ship one.

**Tiers.** The built-in icons are tinted per tier name (`bronze`, `silver`, `gold`, `platinum`, `diamond`). Image assets are never tinted.

## Celebrations and secret mode

When an achievement unlocks, a notifier can celebrate it on top of the app: a toast in any corner or edge, a modal, or fullscreen with confetti and sound. Pick a preset per achievement with `celebration`, and configure the rest with `createCelebrationResolver`. For a Steam-style list, secret mode leaves hidden achievements out and shows "N hidden achievements remaining" instead: `renderCatalog(views, { secret: true })`, `<badgetrip-catalog secret>`, or `splitConcealed(views)` in your own UI. The [celebrations guide](guide/celebrations.md) covers both.

## Frameworks

Every adapter binds to `observe(engine)` (or an `@badgetrip/ipc` remote), renders the same badge markup, and uses `displayIcon` for locked and reduced-motion still frames. Each package README has the full API.

| Target | Package | Entry points |
|---|---|---|
| React | `@badgetrip/react` | `BadgetripProvider`, `useAchievementCatalog`, `AchievementBadge`, `IconProvider`, `UnlockNotifier`, `useUnlocks` |
| React Native / Expo | `@badgetrip/react-native` | same hooks (including `useUnlocks`), native `AchievementBadge` |
| Vue | `@badgetrip/vue` | `app.use(createBadgetrip(engine, { icons }))`, `useAchievementCatalog`, `AchievementBadge`, `UnlockNotifier`, `useUnlocks` |
| Angular | `@badgetrip/angular` | `provideBadgetrip(engine, { icons, notifier })`, `BadgetripService.catalog(actor)`, `.unlocks()`, `badgetrip-achievement-badge` |
| htmx, SSR, vanilla, any framework | `@badgetrip/html` | `renderCatalog(views)`, `defineBadgetripElements(observe(engine))`, `createNotifier(observed)` |
| Electron, Workers, Tauri webview | `@badgetrip/ipc` | `serveEngine(engine, transport)`, `connectEngine(transport)` |

## React

```tsx
import { createIconResolver } from '@badgetrip/assets';
import { AchievementBadge, IconProvider, useAchievementCatalog } from '@badgetrip/react';

function Trophies({ actor }: { actor: string }) {
  const list = useAchievementCatalog(actor);
  return list.map((a) => <AchievementBadge key={a.code} achievement={a} />);
}

<BadgetripProvider engine={engine}>
  <IconProvider icons={createIconResolver({ overrides })}>
    <Trophies actor="u1" />
  </IconProvider>
</BadgetripProvider>;
```

`AchievementBadge` renders the icon (greyscale while locked), name, description, and a `<progress>` bar while locked. It stretches to its grid cell so bars align. For a custom look, build your own with `useAchievementIcon(view)` (motion-aware asset) and `useAchievementProgress(actor, code)`. `IconProvider` is optional: without it the built-in pack is used.
