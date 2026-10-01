# Vue

```sh
npm install @walangstudio/badgetrip-core @walangstudio/badgetrip-vue
```

This uses the `engine` from [Getting started](getting-started.md).

## Install the plugin

```ts
// main.ts
import { createBadgetrip } from '@walangstudio/badgetrip-vue';
import { createApp } from 'vue';
import App from './App.vue';
import { engine } from './badges';

createApp(App).use(createBadgetrip(engine)).mount('#app');
```

## Show the badges and record something

```vue
<!-- Trophies.vue -->
<script setup lang="ts">
import { AchievementBadge, useAchievementCatalog, useBadgetrip } from '@walangstudio/badgetrip-vue';

const props = defineProps<{ userId: string }>();
const { data: badges, error } = useAchievementCatalog(() => props.userId);
const engine = useBadgetrip();

async function log() {
  const { unlocked } = await engine.emit({
    id: crypto.randomUUID(),
    actor: props.userId,
    type: 'habit.done',
    ts: Date.now(),
    payload: {},
  });
  if (unlocked.length) console.log('Unlocked', unlocked);
}
</script>

<template>
  <button @click="log">Done for today</button>
  <p v-if="error">Couldn't load achievements.</p>
  <div class="grid">
    <AchievementBadge v-for="b in badges" :key="b.code" :achievement="b" />
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1rem;
}
</style>
```

Every composable returns `{ data, error }`. Pass arguments as a getter (`() => props.userId`) or a ref, and the query re-runs when they change. It also re-runs after every `emit` made through `useBadgetrip()`.

Emit through `useBadgetrip()`, not through the `engine` you imported, or the page won't update.

## Other composables

`useScore`, `useStreak`, `useLeaderboard`, `useTier`, `useEscalator` and `useAchievementProgress` all follow the same `{ data, error }` shape.

A failed query sets `error` and also goes to `app.config.errorHandler`, so you can report it in one place.

## Custom icons

```ts
import { createIconResolver } from '@walangstudio/badgetrip-assets';

app.use(createBadgetrip(engine, { icons: createIconResolver({ icons: { medal: { src: '/art/medal.png' } } }) }));
```

For a custom badge, `useAchievementIcon(() => badge)` gives you the right image for the badge's state.

## Celebrate unlocks

Put `<UnlockNotifier :actor="userId" />` in your root component, and every unlock pops up on top of the page. See [Unlock celebrations](celebrations.md) for per-achievement looks and sound. `useUnlocks()` gives you the queue for a custom UI.

## Themes

Pass a theme to the plugin. Badges, `<UnlockNotifier>` and `useUnlocks()` follow it, and assigning `useTheme().value` switches it live:

```ts
import { themes } from '@walangstudio/badgetrip-assets';
import { createBadgetrip, useTheme } from '@walangstudio/badgetrip-vue';

app.use(createBadgetrip(engine, { theme: themes.dark }));

// in any component's setup()
const theme = useTheme();
theme.value = themes.arcade;
```

The [themes guide](themes.md) covers making your own.
