# Unlock celebrations

When someone unlocks an achievement, badgetrip can celebrate it on top of your app: a toast in any corner or edge, a centered modal, or a fullscreen moment with confetti, with an optional sound. You set it up once and override it per achievement.

This guide uses the `engine` from [Getting started](getting-started.md).

## Turn it on

Mount one notifier near the root of your app. Every unlock from `emit` or `refresh` shows up as a toast in the top-right corner.

React:

```tsx
import { BadgetripProvider, UnlockNotifier } from '@walangstudio/badgetrip-react';

<BadgetripProvider engine={engine}>
  <UnlockNotifier actor={currentUser.id} />
  <App />
</BadgetripProvider>;
```

Vue:

```vue
<template>
  <UnlockNotifier :actor="user.id" />
  <RouterView />
</template>
```

Angular:

```ts
// A function runs in the injection context, so it can read your auth service.
provideBadgetrip(engine, { notifier: () => ({ actor: inject(Auth).userId }) });
```

Plain HTML, or anything else in a browser:

```ts
import { observe } from '@walangstudio/badgetrip-core';
import { createNotifier } from '@walangstudio/badgetrip-html';

const observed = observe(engine);
createNotifier(observed, { actor: currentUserId });
// Emit through observed.engine so the notifier sees the unlocks.
```

Pass `actor` so a user only sees their own unlocks. Leave it out and every unlock the engine reports is celebrated.

`replay` and `seed` never celebrate. They rebuild or import history, and nobody wants 40 toasts after a data migration.

## Pick a look per achievement

Give an achievement a `celebration` preset:

```ts
defineAchievements({
  first_step: { ..., when: rules.count('habit.done', 1) },                  // default toast
  century:    { ..., celebration: 'epic', when: rules.count('habit.done', 100) },
  regular: {
    ...,
    tiers: { bronze: 10, silver: 50, gold: { at: 200, celebration: 'modal' } },
  },
});
```

Built-in presets:

| Preset | What it does |
|---|---|
| `toast` | A small card in a corner. The default. |
| `modal` | A centered card over a dimmed page. Stays until closed. |
| `epic` | Fullscreen, with confetti and a fanfare. Closes after 7 seconds. |
| `quiet` | Unlocks silently: no popup, no sound. |
| `secret` | Applied automatically to hidden achievements: "Secret achievement unlocked" and a sparkle sound. |

## Configure it

Everything else lives in one resolver:

```ts
import { createCelebrationResolver } from '@walangstudio/badgetrip-assets';

export const celebrations = createCelebrationResolver({
  default: { position: 'bottom-right', duration: 4000 },
  presets: {
    epic: { sound: 'victory' },                     // tweak a built-in preset
    boss: { layout: 'fullscreen', confetti: { particles: 300 }, duration: 0 },
  },
  overrides: {
    night_owl: { layout: 'modal', sound: 'sparkle' }, // one achievement
    regular: { position: 'top' },                     // every tier of a series
  },
  categories: { social: { position: 'left' } },
  rarity: { 5: 'epic' },
  sounds: { victory: '/sounds/victory.mp3' },
});
```

Then pass it along: `<UnlockNotifier celebrations={celebrations} />`, `{ notifier: { celebrations } }` in Angular, or `createNotifier(observed, { celebrations })`. Create it once, outside any component.

Layers merge field by field, with later ones winning:

1. the built-in default, then your `default`
2. `rarity`
3. `categories`
4. `secret`, for hidden achievements
5. the achievement's own `celebration` preset
6. `overrides` for its tier series
7. `overrides` for its code

So a rare hidden achievement can pick up the fullscreen layout from `rarity` and the secret title from `secret` at the same time.

The fields:

| Field | Values | Default |
|---|---|---|
| `layout` | `toast`, `modal`, `fullscreen` | `toast` |
| `position` | `top-left`, `top`, `top-right`, `right`, `bottom-right`, `bottom`, `bottom-left`, `left` (toasts only) | `top-right` |
| `duration` | milliseconds, `0` stays until closed | `5000` |
| `sound` | a sound key, or `false` | `chime` |
| `confetti` | `true`, `false`, or `{ particles, colors, duration }` | `false` |
| `title` | the heading above the name | "Achievement unlocked" |
| `quiet` | `true` to skip the popup and sound | `false` |

The resolver checks the whole config when you create it and throws one error listing every problem, so a typo like `positon` fails at startup instead of silently doing nothing. `celebrations.missing(achievements)` returns the preset keys your achievements name that no preset defines.

## Sound

Sound is off until you turn it on:

```tsx
<UnlockNotifier celebrations={celebrations} sound={settings.sound} volume={0.4} />
```

- **Built-in sounds:** `chime`, `fanfare`, `sparkle` and `pop`. They're synthesized with Web Audio, so no audio files ship with badgetrip.
- **Your own files:** add them under `sounds`, as a URL or `{ src }`. Any format the browser plays works.
- **Changing settings:** changing `sound`, `volume` or `muted` updates the notifier in place, so a settings toggle is cheap.
- **Autoplay:** browsers block audio until the user has interacted with the page. Unlocks usually follow a click, so this rarely matters. If an unlock arrives before any interaction, it's shown silently.
- **One sound per batch:** a single emit that unlocks bronze, silver and gold plays one sound, the one from the biggest celebration.

## Secret achievements

Hidden achievements already show as "Hidden achievement" until they're earned. For the console-style list that leaves them out entirely and says how many remain, use secret mode:

```ts
renderCatalog(views, { secret: true });
// ...badges... "2 hidden achievements remaining"
```

```html
<badgetrip-catalog actor="ana" secret></badgetrip-catalog>
```

In your own UI, `splitConcealed(views)` from `@walangstudio/badgetrip-core` returns `{ views, hiddenRemaining }`.

When a hidden achievement unlocks, its celebration uses the `secret` preset. Override `presets.secret` to give every secret unlock a modal, a different sound, or its own title.

## Your own celebration UI

To draw it yourself (a game HUD, React Native, a canvas), take the queue instead of the built-in overlay:

```tsx
const { queue, dismiss } = useUnlocks({ actor: currentUser.id });
const next = queue[0]; // { view, celebration }
```

`celebration` is the resolved config: layout, position, sound, confetti, title. Vue has the same `useUnlocks` composable. Angular has `inject(BadgetripService).unlocks()`. React Native re-exports the React hook.

## Styling

The overlay lives in a shadow root, so your CSS can't break it and its CSS can't leak into your page. Theme it with custom properties on the page:

```css
[data-badgetrip-notifier] {
  --badgetrip-bg: #fff;
  --badgetrip-fg: #111;
  --badgetrip-accent: #7c3aed;
  --badgetrip-radius: 8px;
  --badgetrip-font: 15px/1.4 Inter, sans-serif;
}
```

The others are `--badgetrip-backdrop`, `--badgetrip-fullscreen-bg` and `--badgetrip-icon-bg`. For anything more, style the parts: `[data-badgetrip-notifier]::part(toast)`, `::part(dialog)`, `::part(title)`, `::part(name)`, `::part(description)`, `::part(icon)` and `::part(close)`.

## Accessibility

- **Screen readers:** each unlock is announced through a polite live region.
- **Focus:** toasts never take focus. A modal or fullscreen dialog moves focus to its close button, keeps Tab inside, closes on Escape, and puts focus back where it was.
- **Reduced motion:** when the user prefers it, there's no confetti and no animation. Sound isn't motion, so it still follows your `sound` setting.
- **Pausing:** a toast pauses its timer while hovered or while it has focus. A modal or fullscreen celebration pauses while hovered; with `duration: 0` it stays until closed.

## Other options

| Option | Default | |
|---|---|---|
| `maxVisible` | 3 | Toasts shown at once per position. The rest wait. |
| `maxQueue` | 10 | Waiting toasts before the rest fold into one "+N more" toast. |
| `root` | `document.body` | Where the overlay is attached. |
| `zIndex` | 2147483000 | Stacking order, above almost everything. |
| `labels` | English | `{ close, more(n) }` for translations. |
| `onError` | rethrow | Called when a catalog query fails. |

On the server, `createNotifier` returns a no-op, so it's safe in SSR code. With `@walangstudio/badgetrip-ipc`, unlocks cross the process boundary too. When `serveEngine` has an `authorize` hook they are off unless you pass `unlocks`, usually a filter for the peer's own user; see the [Electron guide](electron.md#what-the-window-can-and-cant-do).
