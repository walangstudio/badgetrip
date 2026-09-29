// Deno / Supabase-edge smoke: badgetrip core is zero-dep pure ESM, so it runs on Deno
// with no shims. Run from the repo root:  deno run examples/deno-smoke.ts
// (Build first: pnpm -C packages/core build.)
//
// In a Supabase Edge Function you'd instead import the published package:
//   import { createEngine } from 'npm:@walangstudio/badgetrip-core';

import {
  createEngine,
  fixedClock,
  memoryAchievementStore,
  memoryEventStore,
  memoryScoreStore,
  memoryStreakStore,
} from '../packages/core/dist/index.js';

const engine = createEngine({
  events: memoryEventStore(),
  scores: memoryScoreStore(),
  achievements: memoryAchievementStore(),
  streaks: memoryStreakStore(),
  clock: fixedClock(0),
  definitions: {
    scores: ['p'],
    points: [{ on: 'x', score: 'p', delta: 2 }],
    achievements: [
      {
        code: 'two',
        name: '',
        description: '',
        rarity: 1,
        rule: { kind: 'score', score: 'p', gte: 2 },
      },
    ],
  },
});

const r = await engine.emit({
  id: 'a',
  actor: 'u',
  type: 'x',
  ts: 0,
  payload: {},
});
console.log('deno dist OK →', r.scoreDeltas, 'unlocked', r.unlocked);
if (r.unlocked[0] !== 'two') {
  console.error('FAIL');
  // @ts-ignore Deno global
  Deno.exit(1);
}
