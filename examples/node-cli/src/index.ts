import {
  type Event,
  createEngine,
  fixedClock,
  memoryAchievementStore,
  memoryEventStore,
  memoryScoreStore,
  memoryStreakStore,
} from '@walangstudio/badgetrip-core';

const engine = createEngine({
  events: memoryEventStore(),
  scores: memoryScoreStore(),
  achievements: memoryAchievementStore(),
  streaks: memoryStreakStore(),
  clock: fixedClock(0),
  definitions: {
    scores: ['honor'],
    points: [{ on: 'win', score: 'honor', delta: { path: 'payload.points' } }],
    tiers: [
      {
        code: 'rank',
        score: 'honor',
        thresholds: [
          { name: 'novice', at: 0 },
          { name: 'pro', at: 10 },
          { name: 'legend', at: 25 },
        ],
      },
    ],
    leaderboards: [{ code: 'top', score: 'honor', window: 'all-time', limit: 3 }],
    achievements: [
      {
        code: 'first_win',
        name: 'First Win',
        description: '',
        rarity: 1,
        rule: { kind: 'count', eventType: 'win', gte: 1 },
      },
      {
        code: 'champion',
        name: 'Champion',
        description: '',
        rarity: 5,
        rule: { kind: 'rank', leaderboard: 'top', eq: 1 },
      },
    ],
  },
});

const log: Event[] = [
  { id: 'e1', actor: 'alice', type: 'win', ts: 1, payload: { points: 5 } },
  { id: 'e2', actor: 'bob', type: 'win', ts: 2, payload: { points: 8 } },
  { id: 'e3', actor: 'alice', type: 'win', ts: 3, payload: { points: 9 } },
];

for (const e of log) {
  const r = await engine.emit(e);
  if (r.unlocked.length) console.log(`${e.actor} unlocked: ${r.unlocked.join(', ')}`);
}

console.log('\nscores:');
for (const actor of ['alice', 'bob']) {
  console.log(
    `  ${actor}: ${await engine.score(actor, 'honor')} honor - tier ${(await engine.tier(actor, 'rank')).current}`,
  );
}

console.log('\nleaderboard (top):');
for (const [i, row] of (await engine.leaderboard('top')).entries()) {
  console.log(`  ${i + 1}. ${row.actor} (${row.value})`);
}
