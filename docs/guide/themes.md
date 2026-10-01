# Themes

A theme is one object that sets how badgetrip looks and sounds: colors, icons, and how unlocks are celebrated. Pass it in one place, swap it at runtime, and share it like any other module.

```ts
import { defineTheme } from '@walangstudio/badgetrip-assets';

export const neon = defineTheme({
  name: 'neon',
  style: { accent: '#ff2bd6', bg: '#14002b', fg: '#fff', radius: '4px' },
  icons: { color: '#c084fc', overrides: { first_win: { src: '/art/neon-trophy.png' } } },
  celebrations: {
    default: { confetti: { colors: ['#ff2bd6', '#00f0ff'] } },
    sounds: { chime: '/sounds/neon-ding.mp3' },
  },
});
```

Every field is optional except `name`. `defineTheme` checks the whole thing up front and throws one error listing every problem, so a typo like `acent` fails when the app starts, not when someone unlocks a badge.

## Built-in themes

| Theme | Look |
|---|---|
| `classic` | The look without a theme. Picking it changes nothing. |
| `dark` | Light icons and text for dark pages. |
| `arcade` | Neon colors, monospace text, confetti on every unlock, chiptune sounds. |
| `minimal` | White popups, no confetti, no sound. Epic unlocks become a modal. |
| `aurora` | Violet-to-pink gradient popups and white-to-gold gradient icons, pastel confetti. The gradient sample. |

```ts
import { themes } from '@walangstudio/badgetrip-assets';

themes.arcade;
```

Try them all in the [playground](../../examples/playground).

## Use a theme

Give it to the provider. Badges, popups and unlock queues under it all follow, and the colors go on the page.

React:

```tsx
<BadgetripProvider engine={engine} theme={themes.dark}>
  <UnlockNotifier actor={user.id} />
  <App />
</BadgetripProvider>
```

Vue:

```ts
app.use(createBadgetrip(engine, { theme: themes.dark }));
```

Angular:

```ts
provideBadgetrip(engine, { theme: themes.dark, notifier: true });
```

Plain HTML:

```ts
import { applyTheme, createNotifier, defineBadgetripElements } from '@walangstudio/badgetrip-html';

// engine is the one from Getting started
applyTheme(themes.dark); // colors for the whole page
const elements = defineBadgetripElements(engine, { theme: themes.dark });
const notifier = createNotifier(engine, { actor: 'ana', theme: themes.dark });
```

React Native has no CSS variables, so a theme there brings its icons and celebrations but not its colors.

A provider nested inside another uses the outer theme unless it has its own. Page colors always come from the outermost provider; a nested theme changes icons and celebrations below it, and a notifier with its own theme keeps its own colors.

## Switch at runtime

Pass another theme and everything restyles in place. Popups on screen recolor at once but keep their icon, layout and position; popups still waiting use the new icons.

| Stack | Switch with |
|---|---|
| React | a new `theme` prop on `BadgetripProvider` |
| Vue | `useTheme().value = themes.arcade` |
| Angular | `inject(BadgetripService).setTheme(themes.arcade)` |
| HTML | `applyTheme(t)`, `elements.setTheme(t)` and `notifier.update({ theme: t })` |

A user setting is a few lines:

```tsx
const [theme, setTheme] = useState(themes.classic);

<select onChange={(e) => setTheme(themes[e.target.value as keyof typeof themes])}>
  {Object.keys(themes).map((name) => <option key={name}>{name}</option>)}
</select>
```

## Gradients

Popup backgrounds and icons can be gradients as well as flat colors. A gradient is plain data, so it works in JSON themes too:

```ts
export const sunset = defineTheme({
  name: 'sunset',
  style: {
    accent: '#fde68a',
    fg: '#ffffff',
    bg: { colors: ['#f97316', '#db2777'], angle: 135 },              // popup background
    iconBg: { colors: ['rgba(255,255,255,.3)', 'rgba(255,255,255,.1)'], to: 'bottom' },
    fullscreenBg: {
      type: 'radial',
      position: 'top',
      colors: [
        { color: '#fb923c', at: 0 },
        { color: '#9d174d', at: 60 },
        { color: '#1c1917', at: 100 },
      ],
    },
  },
  icons: {
    color: { colors: ['#ffffff', '#fde68a'], to: 'bottom right' },  // the icons themselves
    tierColors: {
      gold: { colors: ['#fef3c7', '#d97706'], angle: 180 },
      silver: { colors: ['#f8fafc', '#94a3b8'], angle: 180 },
    },
  },
});
```

| Field | Values |
|---|---|
| `colors` | 2 to 8 colors. Add a stop with `{ color: '#fff', at: 40 }` (percent); plain colors spread evenly. |
| `type` | `linear` (default) or `radial`. |
| `angle` | Linear only. Degrees, `0` points up and turns clockwise, so `90` runs left to right. |
| `to` | Linear only, instead of `angle`: `top`, `top right`, `right`, `bottom right`, `bottom`, `bottom left`, `left` or `top left`. |
| `shape` | Radial only: `circle` (default) or `ellipse`. |
| `position` | Radial only: where it starts, `center` (default) or any of the `to` directions. |

Gradients work in `bg`, `fullscreenBg`, `backdrop` and `iconBg`, and in `icons.color` and `icons.tierColors`. The accent and text stay flat colors, since they color text. A gradient icon is one sweep across the whole drawing, so a crown goes white at one corner to gold at the other. Locked badges still turn gray. Your own image icons keep their own colors.

`gradient(spec)` returns the same thing as a CSS string, for anywhere else on the page:

```ts
import { gradient } from '@walangstudio/badgetrip-assets';

banner.style.background = gradient({ colors: ['#4c1d95', '#db2777'], to: 'right' });
```

## Sample: every badge animated

Mixing a few GIFs into flat icons looks out of place, so the animated look is its own theme. The [playground](../../examples/playground) has it as `animated`: every built-in icon key points at a GIF, so any achievement gets an animated badge, with no per-achievement setup.

```ts
import { defineTheme, svgs } from '@walangstudio/badgetrip-assets';

export const animatedTheme = defineTheme({
  name: 'animated',
  icons: {
    icons: Object.fromEntries(
      Object.keys(svgs).map((key) => [
        key,
        { src: `/badges/${key}.gif`, still: `/badges/${key}.png`, animated: true },
      ]),
    ),
  },
});
```

The 18 GIFs and their still frames are in [`examples/playground/public/samples/animated`](../../examples/playground/public/samples/animated), drawn for badgetrip (MIT). Copy the folder into your app's public files. The still frame shows while a badge is locked and for people who prefer reduced motion.

<p>
  <img src="https://raw.githubusercontent.com/walangstudio/badgetrip/main/examples/playground/public/samples/animated/trophy.gif" width="56" height="56" alt="Animated trophy badge">
  <img src="https://raw.githubusercontent.com/walangstudio/badgetrip/main/examples/playground/public/samples/animated/star.gif" width="56" height="56" alt="Animated star badge">
  <img src="https://raw.githubusercontent.com/walangstudio/badgetrip/main/examples/playground/public/samples/animated/heart.gif" width="56" height="56" alt="Animated heart badge">
  <img src="https://raw.githubusercontent.com/walangstudio/badgetrip/main/examples/playground/public/samples/animated/flame.gif" width="56" height="56" alt="Animated flame badge">
  <img src="https://raw.githubusercontent.com/walangstudio/badgetrip/main/examples/playground/public/samples/animated/clock.gif" width="56" height="56" alt="Animated clock badge">
  <img src="https://raw.githubusercontent.com/walangstudio/badgetrip/main/examples/playground/public/samples/animated/crown.gif" width="56" height="56" alt="Animated crown badge">
</p>

Tier tints only apply to SVG icons, so bronze, silver and gold share one GIF. To tell tiers apart, give each tier its own image with `overrides`: `{ 'collector.gold': { src: '/badges/star-gold.gif', ... } }`.

## Start from another theme

`extends` takes a theme or a built-in name. Nested settings merge key by key, and yours win, so you only write what changes. A gradient, an icon asset, a sound or a progress setting is replaced whole, not merged:

```ts
const brand = defineTheme({
  name: 'brand',
  extends: 'dark',
  style: { accent: '#e11d48' },
});
```

## What a theme can set

`style` becomes `--badgetrip-*` CSS custom properties:

| Field | Property | Used for |
|---|---|---|
| `accent` | `--badgetrip-accent` | popup titles, progress bars, focus rings |
| `fg` | `--badgetrip-fg` | popup text |
| `bg` | `--badgetrip-bg` | popup background; a color or a [gradient](#gradients) |
| `radius` | `--badgetrip-radius` | popup corners |
| `font` | `--badgetrip-font` | popup text, as a CSS `font` shorthand |
| `backdrop` | `--badgetrip-backdrop` | behind a modal |
| `fullscreenBg` | `--badgetrip-fullscreen-bg` | behind a fullscreen celebration; `url(...)` images work |
| `iconBg` | `--badgetrip-icon-bg` | the circle behind a popup icon |
| `locked.filter` | `--badgetrip-locked-filter` | locked badges, default `grayscale(1)` |
| `locked.opacity` | `--badgetrip-locked-opacity` | locked badges, default `0.45` |

Values can't contain `;`, `{`, `}`, `<`, `>` or `\`, and every `url()` is checked like any other image URL, so a theme from a package can't break out of its CSS.

`icons` takes the same options as [`createIconResolver`](../ACHIEVEMENTS.md#assets): `color`, `tierColors`, `icons`, `overrides`, `categories` and `fallback`. `color` and `tierColors` take a color or a [gradient](#gradients). Images are URLs or bundler imports.

`celebrations` takes the same options as [`createCelebrationResolver`](celebrations.md#configure-it): `default`, `presets`, `overrides`, `categories`, `rarity` and `sounds`. Reuse a built-in sound name to replace it everywhere.

Explicit settings beat the theme. An `IconProvider`, an `icons` option or a `celebrations` option you pass yourself wins over what the theme says.

## Share a theme

A theme is a plain object, so sharing one is exporting it:

```ts
// badgetrip-theme-neon/index.ts
import { defineTheme } from '@walangstudio/badgetrip-assets';

export default defineTheme({ name: 'neon', /* ... */ });
```

Ship images and sounds with the package and import them, so the app's bundler hashes and serves them. A theme can also live in JSON: `defineTheme(JSON.parse(text))` works, with `extends` as a built-in name.

## Server rendering

`themeCss(theme)` returns the variables as one CSS rule. Put it in a `<style>` in the server-rendered page, and the first paint already has the theme's colors:

```ts
import { themeCss, themes } from '@walangstudio/badgetrip-assets';

const head = `<style>${themeCss(themes.dark)}</style>`;
```
