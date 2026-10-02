# Playground

A sandbox for trying badgetrip in the browser. Edit the config tabs on the left, press **Apply**, fire events on the right, and watch achievements unlock with the real celebration overlay. Everything runs in memory: nothing is saved, and **Start over** resets it.

The hosted copy is at [walangstudio.github.io/badgetrip/playground](https://walangstudio.github.io/badgetrip/playground/). To run it from a clone of the repo:

```sh
pnpm install
pnpm --filter @badgetrip-example/playground dev
```

Then open the URL it prints (usually http://localhost:5173). To try your own GIFs or sounds, put them in `examples/playground/public/` and point at them as `'my-badge.gif'`. `pnpm --filter @badgetrip-example/playground build` produces a static site in `dist/` that can be hosted anywhere.

## Tabs

The config is split by topic. Each tab holds one object, has its own **Sample** menu, and explains what goes in it under the editor. Picking a sample applies it straight away; if you've edited that tab, it asks first.

| Tab | Takes | Samples |
|---|---|---|
| Achievements | What `createEngine` takes: `scores`, `points`, `streaks`, `achievements` | A small game, the Getting started habit tracker |
| Theme | What `defineTheme` takes, layered on the **Theme** picker | Start here, sunset gradients, neon, GIF badges (files), images from a URL |
| Animations | What `createCelebrationResolver` takes, for `animation` | Start here, one per achievement, calm fades, lively bounces |
| Sounds | What `createCelebrationResolver` takes, for `sound` and `sounds` | Start here, a mix of sounds, quiet except big ones, sound files (MP3, WAV), sounds from a URL |
| Popups | What `createCelebrationResolver` takes: layouts, positions, presets, progress | Game defaults, corners and a boss screen, every unlock a modal |

The celebration tabs stack in the order Sounds, Popups, Animations, the same way a theme's `extends` merges, so each one only needs the fields it changes. The samples are written for the small game's achievement codes; the source is [`src/tabs.ts`](src/tabs.ts).

## Writing in a tab

Write it like the examples in the docs: a JavaScript object, with `rules` ready to use. Keys need no quotes, and comments and trailing commas are fine.

```js
{
  first_steps: {
    name: 'First steps',
    description: 'Complete your first level',
    when: rules.count('level.complete', 1), // copied straight from the docs
  },
}
```

A `defineTheme({ ... })` call from the docs can be pasted into the Theme tab as it is, and a `createCelebrationResolver({ ... })` call into any of the three celebration tabs. In the Achievements tab, `achievements: defineAchievements({ ... })` works too. Plain JSON works everywhere.

**Apply** checks every tab before it runs anything:

- A syntax mistake is reported with its tab, line and column, and the cursor jumps to it.
- Unknown keys are errors everywhere, so a typo like `icno` doesn't silently do nothing; the cursor lands on it.
- Tabs with a mistake get a red dot. Every mistake is listed at once, and the last good config keeps running until the new one is valid.

The code runs in your own browser tab, like code typed into its console, and is never sent or saved.

## On the right

- **Events.** Each event type the achievements use gets a button. Any other type, with a JSON payload, goes in the form below them.
- **Previews.** **Preview** shows any achievement's celebration without unlocking it.
- **Secret mode** leaves hidden achievements out of the list.
- **Theme** switches between the built-in themes live, plus `animated`, a sample theme where every badge is a GIF ([`src/animated.ts`](src/animated.ts)).
- **Entrance** and **Exit** try every popup motion on top of the Animations tab; **as configured** keeps the tab's own.

`public/samples/` holds the media, all made for badgetrip (MIT license):

- GIFs for every built-in icon key in `animated/`, plus a star, a trophy and a flame. Each has a still PNG, shown while the badge is locked or when the user prefers reduced motion.
- Sounds in `sounds/`: `coin.wav`, `powerup.wav`, `levelup.mp3` and a short tune, `victory.mp3`.

Images and sounds can also come from any URL. The **Images from a URL** and **Sounds from a URL** samples load them from the hosted playground.
