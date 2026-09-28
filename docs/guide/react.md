# React

```sh
npm install @walangstudio/badgetrip-core @walangstudio/badgetrip-react
```

This uses the `engine` from [Getting started](getting-started.md).

## Wrap your app

```tsx
// main.tsx
import { BadgetripProvider } from '@walangstudio/badgetrip-react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { engine } from './badges';

createRoot(document.getElementById('root')!).render(
  <BadgetripProvider engine={engine}>
    <App />
  </BadgetripProvider>,
);
```

## Show the badges

```tsx
// Trophies.tsx
import { AchievementBadge, useAchievementCatalog } from '@walangstudio/badgetrip-react';

export function Trophies({ userId }: { userId: string }) {
  const badges = useAchievementCatalog(userId);
  const points = badges.reduce((sum, b) => sum + (b.unlocked ? b.points : 0), 0);

  return (
    <section>
      <h2>Achievements ({points} pts)</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 16 }}>
        {badges.map((b) => (
          <AchievementBadge key={b.code} achievement={b} />
        ))}
      </div>
    </section>
  );
}
```

Locked badges are greyed out with a progress bar under them. Hidden ones show a question mark until earned.

## Record something

Get the engine from `useBadgetrip()`, not from your import. Events sent through the hook re-render every component that reads badges; events sent through the raw import don't.

```tsx
// LogHabit.tsx
import { useBadgetrip } from '@walangstudio/badgetrip-react';

export function LogHabit({ userId }: { userId: string }) {
  const engine = useBadgetrip();

  async function log() {
    const { unlocked } = await engine.emit({
      id: crypto.randomUUID(),
      actor: userId,
      type: 'habit.done',
      ts: Date.now(),
      payload: {},
    });
    if (unlocked.length) alert(`Unlocked: ${unlocked.join(', ')}`);
  }

  return <button onClick={log}>Done for today</button>;
}
```

Swap the `alert` for your toast library of choice.

## Other hooks

`useScore(userId, 'xp')`, `useStreak(userId, 'daily')`, `useLeaderboard(code)`, `useTier(userId, code)` and `useAchievementProgress(userId, code)` all work the same way: they return the current value and update after every `emit`.

A query that fails (say, a leaderboard code that doesn't exist) throws during render, so put an error boundary around the part of the page that uses it.

## Your own look

`AchievementBadge` is deliberately plain. To build your own, use `useAchievementIcon(badge)` for the image (it already handles locked and reduced-motion states) and render the rest however you want:

```tsx
import { type AchievementView } from '@walangstudio/badgetrip-core';
import { useAchievementIcon } from '@walangstudio/badgetrip-react';

function Pill({ badge }: { badge: AchievementView }) {
  const icon = useAchievementIcon(badge);
  return (
    <span className={badge.unlocked ? 'pill' : 'pill locked'}>
      <img src={icon.src} alt="" width={20} height={20} /> {badge.name}
    </span>
  );
}
```

To change the icons themselves, wrap the tree in `<IconProvider icons={createIconResolver({ ... })}>`. See [Getting started](getting-started.md#your-own-icons).
