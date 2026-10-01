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

applyTheme(themes.dark); // colors for the whole page
const elements = defineBadgetripElements(observed, { theme: themes.dark });
const notifier = createNotifier(observed, { actor: user.id, theme: themes.dark });
```

React Native has no CSS variables, so a theme there brings its icons and celebrations but not its colors.

A provider nested inside another uses the outer theme unless it has its own. Page colors always come from the outermost provider; a nested theme changes icons and celebrations below it, and a notifier with its own theme keeps its own colors.

## Switch at runtime

Pass another theme and everything restyles in place. Popups already on screen stay where they are.

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

## Start from another theme

`extends` takes a theme or a built-in name. Nested settings merge key by key, and yours win, so you only write what changes:

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
| `bg` | `--badgetrip-bg` | popup background |
| `radius` | `--badgetrip-radius` | popup corners |
| `font` | `--badgetrip-font` | popup text, as a CSS `font` shorthand |
| `backdrop` | `--badgetrip-backdrop` | behind a modal |
| `fullscreenBg` | `--badgetrip-fullscreen-bg` | behind a fullscreen celebration; `url(...)` images work |
| `iconBg` | `--badgetrip-icon-bg` | the circle behind a popup icon |
| `locked.filter` | `--badgetrip-locked-filter` | locked badges, default `grayscale(1)` |
| `locked.opacity` | `--badgetrip-locked-opacity` | locked badges, default `0.45` |

Values can't contain `;`, `{`, `}`, `<`, `>` or `\`, and every `url()` is checked like any other image URL, so a theme from a package can't break out of its CSS.

`icons` takes the same options as [`createIconResolver`](../ACHIEVEMENTS.md#assets): `color`, `tierColors`, `icons`, `overrides`, `categories` and `fallback`. Images are URLs or bundler imports.

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
import { themeCss } from '@walangstudio/badgetrip-assets';

const head = `<style>${themeCss(themes.dark)}</style>`;
```
