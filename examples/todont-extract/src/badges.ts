import type { AchievementDef, Definitions } from '@badgetrip/core';

const H = 3_600_000;
const DAY = 86_400_000;
const WEEK = 7 * DAY;

/**
 * todont's 12 production achievements, re-expressed as declarative AchievementDef[].
 * This replaces ~600 lines of SQL triggers/functions. Eleven are pure rules; the
 * twelfth (early_adopter) is a one-off backfill, awarded out-of-engine via seed().
 *
 * Three of these need primitives badgetrip gained for todont, all still generic:
 *   - serial_offender → `group-count` (N events sharing a key)
 *   - night_owl       → `count` + `todBetween` (any event in a time-of-day window)
 *   - clean_*         → `streak` + `of:'best'` (threshold lifetime best, not current)
 */
export const badges: AchievementDef[] = [
  {
    code: 'first_todont',
    name: 'First Step',
    description: 'Created your first TODONT',
    rarity: 1,
    metadata: { emoji: '🌱' },
    rule: { kind: 'count', eventType: 'todont.created', gte: 1 },
  },
  {
    code: 'first_confession',
    name: 'Honest Mistake',
    description: 'Posted your first confession',
    rarity: 1,
    metadata: { emoji: '🎤' },
    rule: { kind: 'count', eventType: 'confession.posted', gte: 1 },
  },
  {
    code: 'serial_offender',
    name: 'Serial Offender',
    description: 'Confessed 10 times on the same TODONT',
    rarity: 3,
    metadata: { emoji: '🔁' },
    rule: {
      kind: 'group-count',
      eventType: 'confession.posted',
      by: 'payload.todont_id',
      gte: 10,
    },
  },
  {
    code: 'clean_week',
    name: 'Week Strong',
    description: 'Hit a 7-day clean streak on any TODONT',
    rarity: 2,
    metadata: { emoji: '⚡' },
    rule: { kind: 'streak', streak: 'clean', gte: 7, of: 'best', anyKey: true },
  },
  {
    code: 'clean_month',
    name: 'Iron Will',
    description: 'Hit a 30-day clean streak on any TODONT',
    rarity: 4,
    metadata: { emoji: '🛡️' },
    rule: {
      kind: 'streak',
      streak: 'clean',
      gte: 30,
      of: 'best',
      anyKey: true,
    },
  },
  {
    code: 'clean_quarter',
    name: 'Untouchable',
    description: 'Hit a 90-day clean streak on any TODONT',
    rarity: 5,
    metadata: { emoji: '👑' },
    rule: {
      kind: 'streak',
      streak: 'clean',
      gte: 90,
      of: 'best',
      anyKey: true,
    },
  },
  {
    code: 'crowd_favorite',
    name: 'Crowd Favorite',
    description: '50 reactions on your confessions',
    rarity: 3,
    metadata: { emoji: '💖' },
    rule: { kind: 'count', eventType: 'reaction.received', gte: 50 },
  },
  {
    code: 'chatterbox',
    name: 'Chatterbox',
    description: 'Posted 25 comments',
    rarity: 2,
    metadata: { emoji: '💬' },
    rule: { kind: 'count', eventType: 'comment.posted', gte: 25 },
  },
  {
    code: 'dare_taker',
    name: 'Dare Taker',
    description: 'Confessed at max (severity 5) penalty',
    rarity: 3,
    metadata: { emoji: '🔥' },
    rule: {
      kind: 'count',
      eventType: 'confession.posted',
      gte: 1,
      where: { path: 'payload.severity', op: '=', value: 5 },
    },
  },
  {
    code: 'night_owl',
    name: 'After Dark',
    description: 'Confessed between midnight and 4am',
    rarity: 2,
    metadata: { emoji: '🌙' },
    rule: {
      kind: 'count',
      eventType: 'confession.posted',
      gte: 1,
      todBetween: [0, 4 * H],
    },
  },
  {
    code: 'top_of_week',
    name: 'Top of the Week',
    description: '#1 on the weekly honest leaderboard',
    rarity: 5,
    metadata: { emoji: '🏆' },
    rule: { kind: 'rank', leaderboard: 'honest', eq: 1 },
  },
  // early_adopter (⭐, rarity 5): first-1000-users backfill - not derivable from the
  // event stream, so the app awards it directly via engine.seed({ achievements: [...] }).
];

/**
 * todont's full gamification, as one declarative Definitions object.
 * Replaces: lib/tiers.ts, the leaderboard queries, and every SQL trigger/function/cron
 * (shame/honor scoring, streak ticks, penalty escalation, achievement awards).
 *
 * Logic badgetrip deliberately does NOT own stays in the app's event emitter:
 *   - shame delta = the TODONT's current severity → emitter stamps `payload.severity`
 *     (read from engine.escalator before emit); the same event then escalates it.
 *   - honor is the nightly tick → the cron emits one `day.clean` per active TODONT whose
 *     streak wasn't reset in 24h, with `payload.weight` = 3/2/1 by visibility.
 *   - reactions never award honor (the old example did - todont only awards honor nightly).
 */
export const definitions: Definitions = {
  scores: ['shame', 'honor', 'confessions'],
  points: [
    {
      on: 'confession.posted',
      score: 'shame',
      delta: { path: 'payload.severity' },
    },
    { on: 'confession.posted', score: 'confessions', delta: 1 },
    { on: 'day.clean', score: 'honor', delta: { path: 'payload.weight' } },
  ],
  streaks: [
    {
      code: 'clean',
      tickEvents: ['day.clean'],
      resetEvents: ['confession.posted'],
      scoping: { type: 'per-actor-per-key', key: 'payload.todont_id' },
    },
  ],
  escalators: [
    {
      code: 'severity',
      key: 'payload.todont_id',
      triggerEvents: ['confession.posted'],
      resetEvents: [],
      min: 1,
      max: 5,
      step: 1,
    },
  ],
  tiers: [
    {
      code: 'shame_tier',
      score: 'shame',
      thresholds: [
        { name: 'bronze', at: 1 },
        { name: 'silver', at: 20 },
        { name: 'gold', at: 100 },
      ],
    },
    {
      code: 'honor_tier',
      score: 'honor',
      thresholds: [
        { name: 'bronze', at: 1 },
        { name: 'silver', at: 100 },
        { name: 'gold', at: 500 },
      ],
    },
  ],
  leaderboards: [
    {
      code: 'honest',
      source: { kind: 'score', score: 'confessions' },
      window: { type: 'rolling', ms: WEEK },
      limit: 50,
    },
    {
      code: 'cleanest',
      source: { kind: 'streak-sum', streak: 'clean' },
      window: 'all-time',
      limit: 50,
    },
  ],
  achievements: badges,
};
