import {
  createEngine,
  memoryAchievementStore,
  memoryEventStore,
  memoryScoreStore,
} from '@badgetrip/core';
import type { Event, StreakStore } from '@badgetrip/core';
import { makeTestEngine, steppableClock, time } from '@badgetrip/testing';
import { describe, expect, it } from 'vitest';

const ev = (p: Partial<Event> & Pick<Event, 'id' | 'actor' | 'type'>): Event => ({
  ts: 0,
  payload: {},
  ...p,
});

describe('leaderboards', () => {
  it('ranks top-N all-time, descending, deterministic ties', async () => {
    const { engine } = makeTestEngine({
      scores: ['honor'],
      points: [{ on: 'win', score: 'honor', delta: { path: 'payload.n' } }],
      leaderboards: [{ code: 'top', score: 'honor', window: 'all-time', limit: 2 }],
    });
    await engine.emit(ev({ id: 'a', actor: 'alice', type: 'win', payload: { n: 5 } }));
    await engine.emit(ev({ id: 'b', actor: 'bob', type: 'win', payload: { n: 9 } }));
    await engine.emit(ev({ id: 'c', actor: 'carol', type: 'win', payload: { n: 9 } }));
    const board = await engine.leaderboard('top');
    expect(board).toEqual([
      { actor: 'bob', value: 9 },
      { actor: 'carol', value: 9 },
    ]);
  });

  it('a rank rule on a rolling board is deterministic regardless of the wall clock', async () => {
    const defs = {
      scores: ['honor'],
      points: [{ on: 'win', score: 'honor', delta: 1 }],
      leaderboards: [
        {
          code: 'wk',
          score: 'honor',
          window: { type: 'rolling' as const, ms: 7 * time.DAY },
          limit: 3,
        },
      ],
      achievements: [
        {
          code: 'champ',
          name: '',
          description: '',
          rarity: 5 as const,
          rule: { kind: 'rank' as const, leaderboard: 'wk', eq: 1 },
        },
      ],
    };
    const log = [ev({ id: 'a', actor: 'u1', type: 'win', ts: 2 * time.DAY })];
    const early = makeTestEngine(defs, { clock: steppableClock(3 * time.DAY) });
    const late = makeTestEngine(defs, { clock: steppableClock(30 * time.DAY) });
    const [r1] = await early.engine.replay(log);
    const [r2] = await late.engine.replay(log);
    expect(r1?.unlocked).toEqual(['champ']);
    expect(r2?.unlocked).toEqual(['champ']);
  });

  it('rolling window only counts deltas inside the window', async () => {
    const clock = steppableClock(0);
    const { engine } = makeTestEngine(
      {
        scores: ['honor'],
        points: [{ on: 'win', score: 'honor', delta: 10 }],
        leaderboards: [
          {
            code: 'weekly',
            score: 'honor',
            window: { type: 'rolling', ms: 7 * time.DAY },
            limit: 5,
          },
        ],
      },
      { clock },
    );
    await engine.emit(ev({ id: 'old', actor: 'u1', type: 'win', ts: 0 }));
    await engine.emit(ev({ id: 'new', actor: 'u1', type: 'win', ts: 10 * time.DAY }));
    clock.set(10 * time.DAY);
    const board = await engine.leaderboard('weekly');
    expect(board).toEqual([{ actor: 'u1', value: 10 }]);
  });

  it('rank rule unlocks for the #1 actor', async () => {
    const { engine } = makeTestEngine({
      scores: ['honor'],
      points: [{ on: 'win', score: 'honor', delta: { path: 'payload.n' } }],
      leaderboards: [{ code: 'top', score: 'honor', window: 'all-time', limit: 10 }],
      achievements: [
        {
          code: 'champ',
          name: '',
          description: '',
          rarity: 5,
          rule: { kind: 'rank', leaderboard: 'top', eq: 1 },
        },
      ],
    });
    await engine.emit(ev({ id: 'a', actor: 'alice', type: 'win', payload: { n: 5 } }));
    const r = await engine.emit(ev({ id: 'b', actor: 'bob', type: 'win', payload: { n: 9 } }));
    expect(r.unlocked).toEqual(['champ']);
  });

  it('explicit source:{kind:score} ranks like the legacy score field', async () => {
    const { engine } = makeTestEngine({
      scores: ['honor'],
      points: [{ on: 'win', score: 'honor', delta: { path: 'payload.n' } }],
      leaderboards: [
        {
          code: 'top',
          source: { kind: 'score', score: 'honor' },
          window: 'all-time',
          limit: 2,
        },
      ],
    });
    await engine.emit(ev({ id: 'a', actor: 'alice', type: 'win', payload: { n: 5 } }));
    await engine.emit(ev({ id: 'b', actor: 'bob', type: 'win', payload: { n: 9 } }));
    expect(await engine.leaderboard('top')).toEqual([
      { actor: 'bob', value: 9 },
      { actor: 'alice', value: 5 },
    ]);
  });
});

describe('streak-sum leaderboards', () => {
  const streaks = [
    {
      code: 'clean',
      tickEvents: ['day'],
      resetEvents: ['fail'],
      scoping: { type: 'per-actor-per-key' as const, key: 'payload.item' },
    },
  ];

  it('ranks actors by the sum of their current streak counters across keys', async () => {
    const { engine } = makeTestEngine({
      streaks,
      leaderboards: [
        {
          code: 'cleanest',
          source: { kind: 'streak-sum', streak: 'clean' },
          window: 'all-time',
          limit: 10,
        },
      ],
    });
    // alice: item A=2, item B=1 -> 3
    await engine.emit(ev({ id: '1', actor: 'alice', type: 'day', payload: { item: 'A' } }));
    await engine.emit(ev({ id: '2', actor: 'alice', type: 'day', payload: { item: 'A' } }));
    await engine.emit(ev({ id: '3', actor: 'alice', type: 'day', payload: { item: 'B' } }));
    // bob: item X=1 -> 1
    await engine.emit(ev({ id: '4', actor: 'bob', type: 'day', payload: { item: 'X' } }));
    expect(await engine.leaderboard('cleanest')).toEqual([
      { actor: 'alice', value: 3 },
      { actor: 'bob', value: 1 },
    ]);
  });

  it('ignores the window: streak sums are always current', async () => {
    const board = (window: 'all-time' | { type: 'rolling'; ms: number }) => ({
      code: 'b',
      source: { kind: 'streak-sum' as const, streak: 'clean' },
      window,
      limit: 10,
    });
    const run = async (window: 'all-time' | { type: 'rolling'; ms: number }) => {
      const { engine, clock } = makeTestEngine({ streaks, leaderboards: [board(window)] });
      await engine.emit(
        ev({ id: '1', actor: 'alice', type: 'day', ts: 0, payload: { item: 'A' } }),
      );
      clock.set(10 * 86_400_000);
      return engine.leaderboard('b');
    };
    expect(await run({ type: 'rolling', ms: 1 })).toEqual(await run('all-time'));
    expect(await run({ type: 'rolling', ms: 1 })).toEqual([{ actor: 'alice', value: 1 }]);
  });

  it('a reset drops an actor down the streak-sum board', async () => {
    const { engine } = makeTestEngine({
      streaks,
      leaderboards: [
        {
          code: 'cleanest',
          source: { kind: 'streak-sum', streak: 'clean' },
          window: 'all-time',
          limit: 10,
        },
      ],
    });
    await engine.emit(ev({ id: '1', actor: 'alice', type: 'day', payload: { item: 'A' } }));
    await engine.emit(ev({ id: '2', actor: 'alice', type: 'day', payload: { item: 'A' } }));
    await engine.emit(ev({ id: '3', actor: 'bob', type: 'day', payload: { item: 'X' } }));
    await engine.emit(ev({ id: '4', actor: 'alice', type: 'fail', payload: { item: 'A' } }));
    expect(await engine.leaderboard('cleanest')).toEqual([{ actor: 'bob', value: 1 }]);
  });

  it('a rank rule works against a streak-sum board', async () => {
    const { engine } = makeTestEngine({
      streaks,
      leaderboards: [
        {
          code: 'cleanest',
          source: { kind: 'streak-sum', streak: 'clean' },
          window: 'all-time',
          limit: 10,
        },
      ],
      achievements: [
        {
          code: 'tidiest',
          name: '',
          description: '',
          rarity: 5,
          rule: { kind: 'rank', leaderboard: 'cleanest', eq: 1 },
        },
      ],
    });
    const r = await engine.emit(
      ev({ id: '1', actor: 'alice', type: 'day', payload: { item: 'A' } }),
    );
    expect(r.unlocked).toEqual(['tidiest']);
  });

  it('rejects at construction when the StreakStore lacks topByCurrentSum', () => {
    const streakStore: StreakStore = {
      async get() {
        return { current: 0, best: 0, lastTick: 0 };
      },
      async tick() {
        return { current: 0, best: 0 };
      },
      async reset() {
        return 0;
      },
    };
    expect(() =>
      createEngine({
        events: memoryEventStore(),
        scores: memoryScoreStore(),
        achievements: memoryAchievementStore(),
        streaks: streakStore,
        clock: steppableClock(0),
        definitions: {
          leaderboards: [
            {
              code: 'cleanest',
              source: { kind: 'streak-sum', streak: 'clean' },
              window: 'all-time',
              limit: 5,
            },
          ],
        },
      }),
    ).toThrow(/topByCurrentSum/);
  });
});
