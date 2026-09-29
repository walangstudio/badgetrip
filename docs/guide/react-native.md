# React Native and Expo

```sh
npx expo install react-native-svg
npm install @walangstudio/badgetrip-core @walangstudio/badgetrip-react-native
```

`react-native-svg` draws the built-in icons, since React Native's `<Image>` can't show SVG. This uses the `engine` from [Getting started](getting-started.md).

The hooks are the same ones as the [React guide](react.md), so you can read that for the details. What changes is the badge component, which is built from native views.

```tsx
// App.tsx
import { AchievementBadge, BadgetripProvider, useAchievementCatalog, useBadgetrip } from '@walangstudio/badgetrip-react-native';
import { Button, FlatList, View } from 'react-native';
import { engine } from './badges';

function Trophies({ userId }: { userId: string }) {
  const badges = useAchievementCatalog(userId);
  const live = useBadgetrip();

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Button
        title="Done for today"
        onPress={() =>
          live.emit({ id: String(Date.now()), actor: userId, type: 'habit.done', ts: Date.now(), payload: {} })
        }
      />
      <FlatList
        data={badges}
        numColumns={3}
        keyExtractor={(b) => b.code}
        renderItem={({ item }) => (
          <View style={{ flex: 1 / 3, padding: 8 }}>
            <AchievementBadge achievement={item} size={56} />
          </View>
        )}
      />
    </View>
  );
}

export default function App() {
  return (
    <BadgetripProvider engine={engine}>
      <Trophies userId="ana" />
    </BadgetripProvider>
  );
}
```

`crypto.randomUUID()` isn't available in every React Native runtime, which is why this uses a timestamp for the id. In a real app, use `expo-crypto` or your backend's ids so retries stay deduplicated.

## Things that behave differently

- **Locked badges** are drawn grey rather than true greyscale. React Native has no CSS filters, so built-in icons are repainted grey and your own images become grey silhouettes.
- **Reduced motion** follows the phone's accessibility setting. Animated icons stay on their still frame until that setting has been read.
- **Animated GIFs** work on iOS out of the box. On Android, Expo needs its animated-image support switched on in your app config.
- **Animated SVGs** (like the built-in `sparkle-animated`) don't move, because `react-native-svg` doesn't run SVG animations. Use a GIF or WebP for motion.

Screen readers get each progress bar as a real progress bar, labelled like "On a roll: 43%".

## Celebrate unlocks

The built-in overlay is web-only for now. `useUnlocks()` gives you the queue of new unlocks, each with its resolved celebration (layout, sound, confetti), so you can draw your own with `Modal` and `Animated`. See [Unlock celebrations](celebrations.md#your-own-celebration-ui).
