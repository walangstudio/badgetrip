# @walangstudio/badgetrip-assets

The built-in achievement icons for badgetrip, and `createIconResolver` for swapping in your own art. No dependencies, no DOM: icons are plain SVG data URLs, so it works on the server, in React Native and in any framework.

[Your own icons](https://github.com/walangstudio/badgetrip/blob/main/docs/guide/getting-started.md#your-own-icons) · [Assets reference](https://github.com/walangstudio/badgetrip/blob/main/docs/ACHIEVEMENTS.md#assets) · [badgetrip](https://github.com/walangstudio/badgetrip#readme)

## Install

```sh
npm install @walangstudio/badgetrip-assets
```

The UI packages already depend on it. Install it directly to configure a resolver.

## Usage

```ts
import { createIconResolver } from '@walangstudio/badgetrip-assets';

const icons = createIconResolver({
  overrides: {
    night_owl: { src: '/owl.gif', still: '/owl.png', animated: true }, // one achievement
    regular: { src: '/medal.png' },                                     // every tier of a series
    first_step: 'star',                                                 // another icon key
  },
  categories: { social: 'chat' },
  fallback: 'star',
});

icons.missing(achievements); // [] - unresolvable icon keys, worth checking at startup
```

Pass `icons` to your UI package: `IconProvider` in React, `createBadgetrip(engine, { icons })` in Vue, `provideBadgetrip(engine, { icons })` in Angular, or the `icons` option in `@walangstudio/badgetrip-html`.

## Icons

`trophy` `star` `medal` `crown` `flame` `shield` `bolt` `heart` `chat` `sprout` `target` `clock` `moon` `check` `lock` `hidden` `sparkle` `sparkle-animated`

All are 24x24, drawn in `currentColor`, and tinted per tier (`bronze`, `silver`, `gold`, `platinum`, `diamond`). `sparkle-animated` ships with a still frame.

## API

| | |
|---|---|
| `createIconResolver(opts)` | Options: `icons` (add or replace registry entries), `overrides` (by achievement or series code), `categories`, `fallback` (default `'trophy'`), `color`, `tierColors` (merged over the defaults; `false` disables tinting). |
| `resolver.resolve(subject)` | Resolution order: `overrides[code]`, `overrides[series.code]`, `icon`, `categories[category]`, `fallback`. Concealed achievements always get `hidden`. |
| `resolver.missing(subjects)` | Icon keys the registry can't resolve. |
| `displayIcon(asset, { unlocked, reducedMotion })` | The frame to show now: animated only when unlocked and motion is allowed. |
| `svgs`, `svgToDataUrl`, `tierColors` | Raw markup, the encoder and the default tints. |
| `defineTheme(input)` | One validated theme: `style` colors, `icons` and `celebrations`, optionally `extends` another. See the [themes guide](https://github.com/walangstudio/badgetrip/blob/main/docs/guide/themes.md). |
| `themes` | Built-in themes: `classic`, `dark`, `arcade`, `minimal`, `aurora`. |
| `gradient(spec)` | A CSS gradient from data (`{ colors, angle }`, `{ colors, to }` or radial). Themes and `createIconResolver({ color })` take the same object; on icons it paints the drawing itself. |
| `themeCss(theme, selector?)` | The theme's custom properties as one CSS rule, for server-rendered pages. |
| `createCelebrationResolver(opts)` | How each unlock is celebrated: layout, position, sound, confetti. See the [celebrations guide](https://github.com/walangstudio/badgetrip/blob/main/docs/guide/celebrations.md). |
| `progressCount(view, format?)`, `crossesMilestone(rule, from, to, target)` | The "3/5" badge label and the progress popup rule. |
| `builtinSounds` | `chime`, `fanfare`, `sparkle`, `pop`, synthesized with Web Audio. |
| `safeSrc(src, kind)` | Blanks script URLs and mismatched `data:` URLs for images and audio. |

An override is either an icon key (a string) or an asset `{ src, still?, animated? }`. A bare URL string is treated as a key, so wrap URLs in `{ src }`. Any format an `<img>` takes works: GIF, APNG, WebP, PNG, SVG. Give animated icons a `still` frame, or they play in every state.

## License

MIT
