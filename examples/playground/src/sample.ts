/** The starting config. Plain JSON: rules are data, so the whole thing can be edited live. */
export const sample = {
  scores: ['xp'],
  points: [
    { on: 'level.complete', score: 'xp', delta: 50 },
    { on: 'boss.defeat', score: 'xp', delta: 500 },
  ],
  streaks: [
    {
      code: 'daily',
      tickEvents: ['login.daily'],
      resetEvents: ['login.missed'],
      scoping: 'per-actor',
    },
  ],
  achievements: {
    first_steps: {
      name: 'First steps',
      description: 'Complete your first level',
      icon: 'sprout',
      when: { kind: 'count', eventType: 'level.complete', gte: 1 },
    },
    collector: {
      name: 'Collector ({tier})',
      description: 'Collect {n} items',
      icon: 'star',
      when: { kind: 'count', eventType: 'item.collect' },
      tiers: { bronze: 5, silver: 20, gold: { at: 50, celebration: 'epic' } },
    },
    regular: {
      name: 'Regular',
      description: 'Log in 3 days in a row',
      icon: 'flame',
      celebration: 'modal',
      when: { kind: 'streak', streak: 'daily', gte: 3 },
    },
    boss_slayer: {
      name: 'Boss slayer',
      description: 'Defeat a boss',
      icon: 'crown',
      rarity: 5,
      when: { kind: 'count', eventType: 'boss.defeat', gte: 1 },
    },
    veteran: {
      name: 'Veteran',
      description: 'Earn 1000 xp',
      icon: 'medal',
      when: { kind: 'score', score: 'xp', gte: 1000 },
    },
    explorer: {
      name: 'Explorer',
      description: 'Found the secret room',
      lockedDescription: 'Some doors only open for the curious',
      icon: 'moon',
      hidden: true,
      when: { kind: 'count', eventType: 'secret.found', gte: 1 },
    },
  },
  celebrations: {
    default: { position: 'bottom-right' },
    rarity: { '5': 'epic' },
    overrides: {
      collector: { progress: { every: 1 } },
      veteran: { progress: { at: [25, 50, 75] } },
    },
  },
};
