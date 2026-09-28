# @badgetrip/vue

Vue 3 composables and an `AchievementBadge` for badgetrip. No SFC build step needed.

[Vue guide](../../docs/guide/vue.md) · [Achievements](../../docs/ACHIEVEMENTS.md) · [badgetrip](../../README.md)

## Install

```sh
npm install @badgetrip/vue @badgetrip/core
```

Peer dependency: Vue 3.4 or later.

## Usage

```ts
import { createIconResolver } from '@badgetrip/assets';
import { createBadgetrip } from '@badgetrip/vue';

app.use(createBadgetrip(engine, { icons: createIconResolver({ overrides }) }));
```

```ts
import { AchievementBadge, useAchievementCatalog, useBadgetrip, useScore } from '@badgetrip/vue';

const props = defineProps<{ actor: string }>();
const engine = useBadgetrip(); // emit through this so composables re-query
const { data: score, error } = useScore(() => props.actor, 'honor');
const { data: badges } = useAchievementCatalog(() => props.actor);
```

## API

- `useScore`, `useAchievements`, `useAchievementCatalog`, `useAchievementProgress`, `useLeaderboard`, `useStreak`, `useTier`, `useEscalator` take refs, getters or plain values and return `{ data, error }` readonly refs.
- They re-query after every `emit`/`replay`/`seed`/`refresh` and on arg change. Only the latest request applies.
- A rejected query sets `error` and goes to `onErrorCaptured` / `app.config.errorHandler`.
- `provideBadgetrip(engine, opts)` scopes an engine to a component subtree.
- `AchievementBadge` (`achievement`, `size`, `showProgress`) matches the React badge. `useAchievementIcon(view)` gives the motion-aware icon for custom badges.

## License

MIT
