# Animations

Everything in badgetrip that moves: how unlock popups come in and go out, animated badge icons, and confetti. All of it turns off for people who ask their system for less motion. Colors, icons and sounds are in [Themes](themes.md); popup layouts and positions in [Unlock celebrations](celebrations.md).

Popups use the built-in motions below, tuned with speed, easing and distance. Your own CSS keyframes aren't supported. For full control, draw the popup yourself with `useUnlocks` ([Your own celebration UI](celebrations.md#your-own-celebration-ui)); each item's `celebration.animation` still tells you which motion was configured.

## Popup motion in one line

Add `animation` to a celebration. This makes every popup bounce in and fade out:

```ts
import { createCelebrationResolver } from '@walangstudio/badgetrip-assets';

const celebrations = createCelebrationResolver({
  default: { animation: { enter: 'bounce', exit: 'fade' } },
});
```

Pass `celebrations` to your notifier as usual (`<UnlockNotifier celebrations={celebrations} />`). In a [theme](themes.md), the same object goes under `celebrations`:

```ts
defineTheme({
  name: 'lively',
  celebrations: { default: { animation: { enter: 'bounce', exit: 'fade' } } },
});
```

To try one, paste a `createCelebrationResolver({ ... })` call from this page into the [playground](../../examples/playground)'s **Animations** tab, or use its **Entrance** and **Exit** pickers.

## Entrances and exits

`enter` is how a popup arrives, `exit` how it leaves. Both take the same names:

| Name | Entering | Leaving |
|---|---|---|
| `fade` | fades in | fades out |
| `slide` | slides in from the edge of the screen it sits on | slides back toward that edge |
| `slide-up` | moves up into place (starts lower) | moves up and away |
| `slide-down` | moves down into place (starts higher) | moves down and away |
| `slide-left` | moves left into place (starts further right) | moves left and away |
| `slide-right` | moves right into place (starts further left) | moves right and away |
| `scale` | grows from slightly smaller | shrinks a little as it fades |
| `pop` | grows from smaller; with `spring` easing it overshoots a little | shrinks as it fades |
| `bounce` | springs in, swells, settles | swells, then shrinks away |
| `none` | appears immediately | disappears immediately |

For `slide`, a toast at the top comes down from above, one at the bottom comes up from below, and one on the left or right side comes in from that side. Modals and fullscreen popups come up from below.

## Speed, easing and distance

```ts
createCelebrationResolver({
  default: {
    animation: {
      enter: 'slide-up',
      exit: 'fade',
      duration: 400,       // milliseconds for the entrance, 0-2000; the exit takes 70% of it
      easing: 'ease-out',  // how the speed changes over the motion
      distance: 24,        // pixels a slide travels, 0-200
    },
  },
});
```

`easing` takes `ease`, `ease-in`, `ease-out`, `ease-in-out`, `linear`, or `spring`, which overshoots and settles. It also takes any `cubic-bezier(x1, y1, x2, y2)` curve, with `x1` and `x2` from 0 to 1; [cubic-bezier.com](https://cubic-bezier.com) helps you find one.

## Defaults

Without `animation`, popups use these defaults:

| Popup | enter | exit | duration | easing | distance |
|---|---|---|---|---|---|
| Toast | `slide-down` | `none` | 250 | `ease-out` | 8 |
| Modal and fullscreen | `pop` | `none` | 350 | `spring` | 24 |

The built-in themes each have their own motion:

| Theme | enter | exit | Feel |
|---|---|---|---|
| `classic`, `dark` | the defaults | | quiet |
| `arcade` | `bounce` | `slide` | lively, 300 ms |
| `minimal` | `fade` | `fade` | calm, 200 ms |
| `aurora` | `scale` | `fade` | soft spring, 320 ms |

## Different motion per achievement

`animation` works on every layer of the [celebration config](celebrations.md#configure-it): `default`, `rarity`, `categories`, `presets`, and `overrides` for one achievement or a whole tier series. Unlike other settings, it merges field by field, so each layer can change just one part:

```ts
createCelebrationResolver({
  default: { animation: { enter: 'fade', exit: 'fade' } },  // everything fades
  presets: { epic: { animation: { enter: 'bounce' } } },     // epic unlocks bounce in, still fade out
  overrides: { night_owl: { animation: { duration: 900 } } }, // one achievement, slower
});
```

A mistake such as `enter: 'zoom'` or `duration: 5000` throws when the resolver is created, with one message listing every problem.

## Animated badge icons

Badges can move too:

- **GIF, APNG or animated WebP:** give an icon `animated: true` and a `still` frame. The still shows while the badge is locked and for people who prefer reduced motion.

  ```ts
  import { createIconResolver } from '@walangstudio/badgetrip-assets';

  createIconResolver({
    overrides: { boss: { src: '/badges/boss.gif', still: '/badges/boss.png', animated: true } },
  });
  ```

- **A whole animated set:** the [animated sample theme](themes.md#sample-every-badge-animated) has a GIF for every built-in icon.
- **Animated SVG:** the built-in `sparkle-animated` icon twinkles. Use it like any other key: `icon: 'sparkle-animated'`.

React Native plays GIFs on iOS by default; Android needs Fresco's animated-image support, as the [React Native guide](react-native.md) explains.

## Confetti

Confetti is part of a celebration: `confetti: true`, or `{ particles, colors, duration }` to tune it. The built-in `epic` preset turns it on. See [Unlock celebrations](celebrations.md#configure-it).

## Reduced motion

When someone turns on "reduce motion" in their system settings (the `prefers-reduced-motion` media query), badgetrip:

- shows and hides popups immediately, with no entrance or exit;
- skips confetti;
- shows the still frame of animated badges.

Popups still appear, stay for their duration, and are announced to screen readers as usual.

Some people feel sick from motion but never turn the setting on. `bounce`, `pop` and long slides are the strongest motions; `fade` is the gentlest. Sound is not motion, so it still follows your `sound` setting. You don't need to do anything to get this.
