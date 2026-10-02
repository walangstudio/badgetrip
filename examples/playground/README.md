# Playground

A sandbox for trying badgetrip in the browser. Edit the config on the left, press **Apply**, fire events on the right, and watch achievements unlock with the real celebration overlay. Everything runs in memory: nothing is saved, and **Start over** resets it.

The hosted copy is at [walangstudio.github.io/badgetrip/playground](https://walangstudio.github.io/badgetrip/playground/). To run it from a clone of the repo:

```sh
pnpm install
pnpm --filter @badgetrip-example/playground dev
```

Then open the URL it prints (usually http://localhost:5173). To try your own GIFs or sounds, put them in `examples/playground/public/` and point at them as `"my-badge.gif"`.

## Samples

**Start from** loads a sample config, and each one shows one topic. They all use the same small game (levels, collectibles, daily logins, a boss, one secret):

| Sample | Shows |
|---|---|
| Basics | Toasts, a modal, fullscreen `epic` for rarity 5, tiers, progress popups |
| Animations | A different `animation` per achievement: slide, pop, bounce, a long spring slide, none |
| Your own images | GIF badges from `samples/`, for one icon key (`icons`) and for single achievements (`overrides`) |
| Sounds | Built-in sounds, two of your own written as notes (`tones`), and one silent unlock |
| Theme and gradients | A `theme` block: gradient popups and icons, a font, a radial fullscreen background, confetti colors |
| Layouts and positions | Toasts in different corners, a modal, a custom fullscreen preset, a quiet unlock |

Loading a sample resets the Theme, Entrance and Exit pickers, so it shows as written. The source is [`src/sample.ts`](src/sample.ts).

## What the Basics sample and the pickers show



- **Unlock celebrations.** The default is a toast in the bottom-right corner. `regular` uses the `modal` preset, and rarity 5 gets the fullscreen `epic`.
- **Tiers.** `collector` has bronze, silver and gold tiers, with progress popups on every item.
- **Progress popups.** `veteran` reports progress at 25, 50 and 75%.
- **Hidden achievements.** `explorer` stays hidden until `secret.found` fires. Tick **Secret mode** to leave it out of the list.
- **Previews.** **Preview** shows any achievement's celebration without unlocking it.
- **Themes.** The **Theme** picker switches between the built-in themes live, plus `animated`, a sample theme where every badge is a GIF.
- **Animations.** The **Entrance** and **Exit** pickers try every popup motion on top of the theme. **theme default** keeps the theme's own.
- **GIF badges.** The `animated` theme ([`src/animated.ts`](src/animated.ts)) points every built-in icon key at a GIF in `public/samples/animated/`, so any achievement gets an animated badge. `public/samples/` also holds three standalone GIFs (a star, a trophy and a flame). All were drawn for badgetrip (MIT license), and each has a still PNG shown while the badge is locked or when the user prefers reduced motion.

## Writing the config

The guides write JavaScript; the playground takes the same objects as strict JSON. Quote every key, and leave out comments, trailing commas, imports and functions. **How to write the config**, under the editor, has the same summary.

| Key | Takes |
|---|---|
| `achievements`, `scores`, `points`, `streaks`, `tiers`, `leaderboards`, `escalators` | What `createEngine` takes, with `achievements` as the object for `defineAchievements` |
| `celebrations` | What `createCelebrationResolver` takes |
| `theme` | What `defineTheme` takes, without `name`. It's layered on the Theme picker, so it can hold a whole theme of your own |

Rules are data. The builders in the guides turn into plain objects:

| Guides | Playground |
|---|---|
| `rules.count('item.collect', 5)` | `{ "kind": "count", "eventType": "item.collect", "gte": 5 }` |
| `rules.streak('daily', 3)` | `{ "kind": "streak", "streak": "daily", "gte": 3 }` |
| `rules.score('xp', 100)` | `{ "kind": "score", "score": "xp", "gte": 100 }` |
| `rules.all(a, b)` | `{ "kind": "all", "rules": [a, b] }` |

Images are URLs, like `"samples/star.gif"`. A sound is a built-in name (`chime`, `fanfare`, `sparkle`, `pop`), a URL, or notes: `{ "tones": [{ "freq": 880, "at": 0, "dur": 0.3 }] }`.

**Apply** checks everything before it runs anything:

- Broken JSON is reported with its line and column, and the cursor jumps to it.
- Unknown keys are errors, at the top level and in achievements, tiers, celebrations and themes, so a typo like `"icno"` doesn't silently do nothing.
- Every mistake is listed at once, and the last good config keeps running until the new one is valid. `pnpm --filter @badgetrip-example/playground build` produces a static site in `dist/` that can be hosted anywhere.
