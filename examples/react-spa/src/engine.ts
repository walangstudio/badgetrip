import { createCelebrationResolver } from '@badgetrip/assets';
import {
  type Definitions,
  createEngine,
  defineAchievements,
  memoryAchievementStore,
  memoryEventStore,
  memoryScoreStore,
  memoryStreakStore,
  rules,
  systemClock,
} from '@badgetrip/core';

const definitions: Definitions = {
  scores: ['honor', 'shame'],
  points: [
    { on: 'todont.created', score: 'shame', delta: 1 },
    {
      on: 'confession.posted',
      score: 'shame',
      delta: { path: 'payload.severity' },
    },
    { on: 'reaction.received', score: 'honor', delta: 2 },
  ],
  streaks: [
    {
      code: 'daily_clean',
      tickEvents: ['day.clean'],
      resetEvents: ['day.dirty'],
      scoping: 'per-actor',
    },
  ],
  tiers: [
    {
      code: 'shame_tier',
      score: 'shame',
      thresholds: [
        { name: 'bronze', at: 1 },
        { name: 'silver', at: 5 },
        { name: 'gold', at: 15 },
      ],
    },
  ],
  leaderboards: [{ code: 'honor_board', score: 'honor', window: 'all-time', limit: 5 }],
  achievements: defineAchievements({
    first_confession: {
      name: 'First Confession',
      description: 'Posted your first confession',
      icon: 'chat',
      points: 5,
      when: rules.count('confession.posted', 1),
    },
    prolific: {
      name: 'Prolific ({tier})',
      description: 'Created {n} todonts',
      icon: 'medal',
      when: rules.count('todont.created'),
      tiers: {
        bronze: { at: 1, description: 'Created your first todont' },
        silver: 3,
        gold: { at: 10, points: 50, celebration: 'epic' },
      },
    },
    crowd_favorite: {
      name: 'Crowd Favorite',
      description: '5 reactions from 3 people',
      icon: 'heart',
      rarity: 4,
      points: 25,
      celebration: 'modal',
      when: rules.all(
        rules.count('reaction.received', 5),
        rules.unique('reaction.received', 'payload.from', 3),
      ),
    },
    on_fire: {
      name: 'On Fire',
      description: '3-day clean streak',
      icon: 'flame',
      rarity: 4,
      points: 25,
      celebration: 'epic',
      when: rules.streak('daily_clean', 3),
    },
    comeback: {
      name: 'Comeback',
      description: 'Slipped up, then went clean again',
      lockedDescription: 'Everyone falls. Not everyone gets up.',
      icon: 'sparkle-animated',
      hidden: true,
      points: 40,
      when: rules.all(rules.count('day.dirty', 1), rules.streak('daily_clean', 1)),
    },
  }),
};

export const engine = createEngine({
  events: memoryEventStore(),
  scores: memoryScoreStore(),
  achievements: memoryAchievementStore(),
  streaks: memoryStreakStore(),
  clock: systemClock,
  definitions,
});

export const ACTOR = 'demo_user';

// Toasts bottom-right by default; `celebration` on an achievement picks a preset.
export const celebrations = createCelebrationResolver({
  default: { position: 'bottom-right' },
});
