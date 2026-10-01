# Playground

A sandbox for trying badgetrip in the browser. Edit the config on the left, press **Apply**, fire events on the right, and watch achievements unlock with the real celebration overlay. Everything runs in memory: nothing is saved, and **Start over** resets it.

```sh
pnpm install
pnpm --filter @badgetrip-example/playground dev
```

The sample config is a small game (levels, collectibles, daily logins, a boss, one secret). It covers the main features:

- **Unlock celebrations.** The default is a toast in the bottom-right corner. `regular` uses the `modal` preset, and rarity 5 gets the fullscreen `epic`.
- **Tiers.** `collector` has bronze, silver and gold tiers, with progress popups on every item.
- **Progress popups.** `veteran` reports progress at 25, 50 and 75%.
- **Hidden achievements.** `explorer` stays hidden until `secret.found` fires. Tick **Secret mode** to leave it out of the list.
- **Previews.** **Preview** shows any achievement's celebration without unlocking it.
- **Themes.** The **Theme** picker switches between the built-in themes live.

The config is plain JSON with the same shape as `createEngine` definitions:

- `achievements` is the object you would pass to `defineAchievements`, with rules written as data (`{ "kind": "count", "eventType": "item.collect", "gte": 5 }`).
- `celebrations` is the object for `createCelebrationResolver`.
- `theme` tweaks the picked theme, like `{ "style": { "accent": "#e11d48" } }`. It takes everything `defineTheme` does, gradients included: `{ "icons": { "color": { "colors": ["#22c55e", "#0ea5e9"], "to": "right" } } }`.

Config errors appear under the editor, all of them at once. `pnpm --filter @badgetrip-example/playground build` produces a static site in `dist/` that can be hosted anywhere.
