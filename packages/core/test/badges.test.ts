import type { AchievementDef, Definitions, Event } from '@badgetrip/core';
import { makeTestEngine, time } from '@badgetrip/testing';
import { describe, expect, it } from 'vitest';

const H = time.HOUR;

/** 12 todont-style badges spanning every rule kind: count, score, streak, unique, first-of-day, rank, all, any. */
const badges: AchievementDef[] = [
  {
    code: 'first_confession',
    name: 'First Confession',
    description: '',
    rarity: 1,
    rule: { kind: 'count', eventType: 'confession.posted', gte: 1 },
  },
  {
    code: 'prolific',
    name: 'Prolific',
    description: '',
    rarity: 2,
    rule: { kind: 'count', eventType: 'todont.created', gte: 3 },
  },
  {
    code: 'completionist',
    name: 'Completionist',
    description: '',
    rarity: 3,
    rule: {
      kind: 'count',
      eventType: 'todont.created',
      gte: 2,
      where: { path: 'payload.done', op: '=', value: true },
    },
  },
  {
    code: 'shameless',
    name: 'Shameless',
    description: '',
    rarity: 2,
    rule: { kind: 'score', score: 'shame', gte: 5 },
  },
  {
    code: 'honorable',
    name: 'Honorable',
    description: '',
    rarity: 3,
    rule: { kind: 'score', score: 'honor', gte: 10 },
  },
  {
    code: 'popular',
    name: 'Popular',
    description: '',
    rarity: 3,
    rule: {
      kind: 'unique',
      eventType: 'reaction.received',
      by: 'payload.from',
      gte: 3,
    },
  },
  {
    code: 'crowd_favorite',
    name: 'Crowd Favorite',
    description: '',
    rarity: 4,
    rule: {
      kind: 'all',
      rules: [
        { kind: 'count', eventType: 'reaction.received', gte: 4 },
        {
          kind: 'unique',
          eventType: 'reaction.received',
          by: 'payload.from',
          gte: 2,
        },
      ],
    },
  },
  {
    code: 'night_owl',
    name: 'Night Owl',
    description: '',
    rarity: 2,
    rule: {
      kind: 'first-of-day',
      eventType: 'confession.posted',
      between: [0, 4 * H],
    },
  },
  {
    code: 'early_bird',
    name: 'Early Bird',
    description: '',
    rarity: 2,
    rule: {
      kind: 'first-of-day',
      eventType: 'todont.created',
      between: [5 * H, 9 * H],
    },
  },
  {
    code: 'on_fire',
    name: 'On Fire',
    description: '',
    rarity: 4,
    rule: { kind: 'streak', streak: 'daily_clean', gte: 3 },
  },
  {
    code: 'resilient',
    name: 'Resilient',
    description: '',
    rarity: 3,
    rule: {
      kind: 'any',
      rules: [
        { kind: 'streak', streak: 'daily_clean', gte: 10 },
        { kind: 'count', eventType: 'confession.posted', gte: 2 },
      ],
    },
  },
  {
    code: 'champion',
    name: 'Champion',
    description: '',
    rarity: 5,
    rule: { kind: 'rank', leaderboard: 'weekly_honor', eq: 1 },
  },
];

const defs: Definitions = {
  scores: ['shame', 'honor'],
  points: [
    {
      on: 'confession.posted',
      score: 'shame',
      delta: { path: 'payload.severity' },
    },
    { on: 'todont.created', score: 'shame', delta: 1 },
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
  leaderboards: [{ code: 'weekly_honor', score: 'honor', window: 'all-time', limit: 10 }],
  achievements: badges,
};

const ev = (p: Partial<Event> & Pick<Event, 'id' | 'actor' | 'type'>): Event => ({
  ts: 0,
  payload: {},
  ...p,
});

describe('todont badge parity (M2)', () => {
  it('all 12 badges are expressible and unlock from a scripted event stream', async () => {
    const { engine } = makeTestEngine(defs, {
      dayBoundary: (ts) => ts - (ts % time.DAY),
    });
    const stream: Event[] = [
      ev({
        id: '01',
        actor: 'u1',
        type: 'confession.posted',
        ts: 2 * H,
        payload: { severity: 6 },
      }),
      ev({
        id: '02',
        actor: 'u1',
        type: 'todont.created',
        ts: 5.5 * H,
        payload: { done: true },
      }),
      ev({
        id: '03',
        actor: 'u1',
        type: 'todont.created',
        ts: 6 * H,
        payload: { done: true },
      }),
      ev({
        id: '04',
        actor: 'u1',
        type: 'todont.created',
        ts: 7 * H,
        payload: { done: false },
      }),
      ev({
        id: '05',
        actor: 'u1',
        type: 'confession.posted',
        ts: 8 * H,
        payload: { severity: 0 },
      }),
      ev({
        id: '06',
        actor: 'u1',
        type: 'reaction.received',
        ts: 8.1 * H,
        payload: { from: 'a' },
      }),
      ev({
        id: '07',
        actor: 'u1',
        type: 'reaction.received',
        ts: 8.2 * H,
        payload: { from: 'b' },
      }),
      ev({
        id: '08',
        actor: 'u1',
        type: 'reaction.received',
        ts: 8.3 * H,
        payload: { from: 'c' },
      }),
      ev({
        id: '09',
        actor: 'u1',
        type: 'reaction.received',
        ts: 8.4 * H,
        payload: { from: 'd' },
      }),
      ev({
        id: '10',
        actor: 'u1',
        type: 'reaction.received',
        ts: 8.5 * H,
        payload: { from: 'e' },
      }),
      ev({ id: '11', actor: 'u1', type: 'day.clean', ts: 9 * H }),
      ev({ id: '12', actor: 'u1', type: 'day.clean', ts: 9.1 * H }),
      ev({ id: '13', actor: 'u1', type: 'day.clean', ts: 9.2 * H }),
    ];

    const unlocked = new Set<string>();
    for (const e of stream) {
      for (const code of (await engine.emit(e)).unlocked) unlocked.add(code);
    }

    expect([...unlocked].sort()).toEqual(badges.map((b) => b.code).sort());
  });

  it('badges are awarded exactly once', async () => {
    const { engine } = makeTestEngine(defs, {
      dayBoundary: (ts) => ts - (ts % time.DAY),
    });
    await engine.emit(
      ev({
        id: 'a',
        actor: 'u1',
        type: 'confession.posted',
        ts: 1 * H,
        payload: { severity: 9 },
      }),
    );
    const second = await engine.emit(
      ev({
        id: 'b',
        actor: 'u1',
        type: 'confession.posted',
        ts: 2 * H,
        payload: { severity: 9 },
      }),
    );
    expect(second.unlocked).not.toContain('first_confession');
    const owned = (await engine.achievements('u1')).map((a) => a.code);
    expect(owned.filter((c) => c === 'first_confession')).toHaveLength(1);
  });
});
