# @walangstudio/badgetrip-react

React hooks and an `AchievementBadge` for badgetrip. Components re-render after every change to the engine.

[React guide](https://github.com/walangstudio/badgetrip/blob/main/docs/guide/react.md) · [Achievements](https://github.com/walangstudio/badgetrip/blob/main/docs/ACHIEVEMENTS.md) · [badgetrip](https://github.com/walangstudio/badgetrip#readme)

## Install

```sh
npm install @walangstudio/badgetrip-react @walangstudio/badgetrip-core
```

Peer dependency: React 18 or 19.

## Usage

```tsx
import {
  AchievementBadge,
  BadgetripProvider,
  useAchievementCatalog,
  useBadgetrip,
} from '@walangstudio/badgetrip-react';

function Trophies({ userId }: { userId: string }) {
  const badges = useAchievementCatalog(userId);
  return badges.map((a) => <AchievementBadge key={a.code} achievement={a} />);
}

function LogHabit({ userId }: { userId: string }) {
  const engine = useBadgetrip(); // emit through this so the hooks update
  const log = () =>
    engine.emit({ id: crypto.randomUUID(), actor: userId, type: 'habit.done', ts: Date.now(), payload: {} });
  return <button onClick={log}>Done</button>;
}

<BadgetripProvider engine={engine}>
  <LogHabit userId="ana" />
  <Trophies userId="ana" />
</BadgetripProvider>;
```

## API

| | |
|---|---|
| `BadgetripProvider` | Takes `engine`: a local engine or an [`@walangstudio/badgetrip-ipc`](https://github.com/walangstudio/badgetrip/tree/main/packages/ipc) remote. |
| `useBadgetrip()` | The engine to emit through. Calls on it notify every hook. |
| `useScore`, `useTier`, `useStreak`, `useEscalator`, `useLeaderboard` | Current state. Start at a neutral value (0, `null`, `[]`) until the first read resolves. |
| `useAchievements(actor)` | Unlocked codes with unlock times. |
| `useAchievementCatalog(actor)` | Every achievement, ready to draw. |
| `useAchievementProgress(actor, code)` | `{ current, target, percent }`. |
| `AchievementBadge` | Props: `achievement`, `size` (px, default 48), `showProgress` (default true), `showCount` ("3/5", default true), `formatCount`, `className`. Grayscale while locked, labeled progress bar, stretches to its grid cell. |
| `IconProvider` | Takes a `createIconResolver(...)` from [`@walangstudio/badgetrip-assets`](https://github.com/walangstudio/badgetrip/tree/main/packages/assets) to swap icons. |
| `<UnlockNotifier />` | Celebrates unlocks on top of the page. Takes the notifier options (`actor`, `celebrations`, `sound`, ...); see the [celebrations guide](https://github.com/walangstudio/badgetrip/blob/main/docs/guide/celebrations.md). |
| `useUnlocks({ actor?, celebrations? })` | `{ queue, dismiss, clear }` of new unlocks with their resolved celebration, for your own UI. |
| `useAchievementIcon(view)` | The icon to show right now, for building your own badge. Animated icons show their still frame while locked or when the user prefers reduced motion. |

Hooks re-query when their arguments change, and only the latest result applies. A failed query throws during render, so wrap the part of the page that uses it in an error boundary.

## License

MIT
