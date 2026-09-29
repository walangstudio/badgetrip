# @walangstudio/badgetrip-react-native

React Native / Expo bindings for badgetrip: the `@walangstudio/badgetrip-react` hooks plus a native `AchievementBadge`.

[React Native guide](../../docs/guide/react-native.md) · [Achievements](../../docs/ACHIEVEMENTS.md) · [badgetrip](../../README.md)

## Install

```sh
npm install @walangstudio/badgetrip-react-native @walangstudio/badgetrip-core
npx expo install react-native-svg   # bare RN: npm install react-native-svg && npx pod-install
```

Peer dependencies: React 18 or 19, React Native 0.74+, react-native-svg 13+.

## Usage

```tsx
import { AchievementBadge, BadgetripProvider, useAchievementCatalog } from '@walangstudio/badgetrip-react-native';

function Badges({ actor }: { actor: string }) {
  return useAchievementCatalog(actor).map((a) => <AchievementBadge key={a.code} achievement={a} />);
}

<BadgetripProvider engine={engine}>
  <Badges actor="u1" />
</BadgetripProvider>;
```

Hooks (`useScore`, `useAchievements`, `useAchievementCatalog`, `useAchievementProgress`, `useLeaderboard`, `useStreak`, `useTier`, `useEscalator`, `useBadgetrip`, `useUnlocks`) are re-exported from `@walangstudio/badgetrip-react` unchanged. `useUnlocks` gives you the queue of new unlocks to draw a native celebration; the built-in overlay is web-only for now.

## Badge

`AchievementBadge` props: `achievement`, `size` (dp, default 48), `showProgress` (default true), `style`.

- Built-in SVG icons render through `SvgXml`. RN `Image` cannot show SVG data URLs.
- Other assets (PNG, WebP, GIF, remote URLs) render through `Image`. Remote `.svg` files are not supported; register their markup as a data URL instead.
- Locked: RN has no CSS `filter`, so there is no true greyscale. Tintable SVGs repaint in grey; images become a grey silhouette (`tintColor`). Both dim to 45% opacity. Want real desaturation? Supply a greyscale `still` frame.
- The progress bar is a `View` with `accessibilityRole="progressbar"`, `accessibilityValue` `{min: 0, max: 100, now}` and label `"Name: N%"`. Hidden when unlocked or concealed.

## Icons and motion

`IconProvider` takes a `createIconResolver(...)` from `@walangstudio/badgetrip-assets`, as on the web. It is the same provider as `@walangstudio/badgetrip-react`'s, re-exported, so either import works.

`useAchievementIcon(view)` returns the asset to show. Animated icons play only once unlocked and fall back to `still` while the OS reduce-motion setting is on (`AccessibilityInfo`, live). Until the setting is read, the still frame shows.

Animated GIF/WebP on Android needs Fresco's animated modules. In Expo, add `expo-build-properties` or a config plugin that adds `com.facebook.fresco:animated-gif` (and `animated-webp`); iOS plays them out of the box. Animated SVG (SMIL) does not animate in react-native-svg.

## License

MIT
