# @walangstudio/badgetrip-vue

Vue 3 composables and an `AchievementBadge` for badgetrip. Written with render functions, so your app needs no extra build setup for it.

[Vue guide](https://github.com/walangstudio/badgetrip/blob/main/docs/guide/vue.md) · [Achievements](https://github.com/walangstudio/badgetrip/blob/main/docs/ACHIEVEMENTS.md) · [badgetrip](https://github.com/walangstudio/badgetrip#readme)

## Install

```sh
npm install @walangstudio/badgetrip-vue @walangstudio/badgetrip-core
```

Peer dependency: Vue 3.4 or later.

## Usage

```ts
import { createIconResolver } from '@walangstudio/badgetrip-assets';
import { createBadgetrip } from '@walangstudio/badgetrip-vue';

app.use(createBadgetrip(engine, { icons: createIconResolver({ overrides }) }));
```

```ts
import { AchievementBadge, useAchievementCatalog, useBadgetrip, useScore } from '@walangstudio/badgetrip-vue';

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
- `createBadgetrip(engine, { theme })` and `provideBadgetrip(engine, { theme })` take a theme; `useTheme()` returns it as a ref, and assigning `useTheme().value` switches it. See the [themes guide](https://github.com/walangstudio/badgetrip/blob/main/docs/guide/themes.md).
- `<UnlockNotifier :actor="id" :sound="on" />` celebrates unlocks on top of the page; `useUnlocks()` returns `{ queue, dismiss, clear }` for a custom UI. See the [celebrations guide](https://github.com/walangstudio/badgetrip/blob/main/docs/guide/celebrations.md).
- `AchievementBadge` (`achievement`, `size`, `showProgress`, `showCount`, `formatCount`) matches the React badge. `useAchievementIcon(view)` gives the motion-aware icon for custom badges.

## License

MIT
