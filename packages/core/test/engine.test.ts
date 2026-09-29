import {
  type Definitions,
  type Engine,
  type Event,
  type StreakStore,
  createEngine,
  memoryAchievementStore,
  memoryEventStore,
  memoryScoreStore,
  memoryStreakStore,
} from '@walangstudio/badgetrip-core';
import { makeTestEngine } from '@walangstudio/badgetrip-testing';
import { describe, expect, it } from 'vitest';

const defs: Definitions = {
  scores: ['shame', 'honor'],
  points: [
    { on: 'todont.created', score: 'shame', delta: 1 },
    {
      on: 'confession.posted',
      score: 'shame',
      delta: { path: 'payload.severity' },
    },
    { on: 'reaction.received', score: 'honor', delta: 2 },
    {
      on: 'confession.posted',
      score: 'honor',
      delta: 5,
      where: { path: 'payload.public', op: '=', value: true },
    },
  ],
};

const ev = (partial: Partial<Event> & Pick<Event, 'id' | 'actor' | 'type'>): Event => ({
  ts: 0,
  payload: {},
  ...partial,
});

describe('engine.emit - points projection', () => {
  it('applies a constant delta', async () => {
    const { engine } = makeTestEngine(defs);
    const r = await engine.emit(ev({ id: 'e1', actor: 'u1', type: 'todont.created' }));
    expect(r.scoreDeltas).toEqual([{ actor: 'u1', score: 'shame', delta: 1, reason: 'e1', ts: 0 }]);
    expect(await engine.score('u1', 'shame')).toBe(1);
  });

  it('pulls a delta from a payload path', async () => {
    const { engine } = makeTestEngine(defs);
    await engine.emit(
      ev({
        id: 'e1',
        actor: 'u1',
        type: 'confession.posted',
        payload: { severity: 3 },
      }),
    );
    expect(await engine.score('u1', 'shame')).toBe(3);
  });

  it('respects a where filter', async () => {
    const { engine } = makeTestEngine(defs);
    await engine.emit(
      ev({
        id: 'e1',
        actor: 'u1',
        type: 'confession.posted',
        payload: { severity: 1, public: false },
      }),
    );
    expect(await engine.score('u1', 'honor')).toBe(0);
    await engine.emit(
      ev({
        id: 'e2',
        actor: 'u1',
        type: 'confession.posted',
        payload: { severity: 1, public: true },
      }),
    );
    expect(await engine.score('u1', 'honor')).toBe(5);
  });

  it('accumulates across events and actors independently', async () => {
    const { engine } = makeTestEngine(defs);
    await engine.emit(ev({ id: 'a', actor: 'u1', type: 'reaction.received' }));
    await engine.emit(ev({ id: 'b', actor: 'u1', type: 'reaction.received' }));
    await engine.emit(ev({ id: 'c', actor: 'u2', type: 'reaction.received' }));
    expect(await engine.score('u1', 'honor')).toBe(4);
    expect(await engine.score('u2', 'honor')).toBe(2);
  });
});

describe('idempotency', () => {
  it('a duplicate event id is a no-op (no double counting)', async () => {
    const { engine } = makeTestEngine(defs);
    const e = ev({ id: 'dup', actor: 'u1', type: 'todont.created' });
    const first = await engine.emit(e);
    const second = await engine.emit(e);
    expect(first.scoreDeltas).toHaveLength(1);
    expect(second.scoreDeltas).toHaveLength(0);
    expect(await engine.score('u1', 'shame')).toBe(1);
  });
});

describe('replay', () => {
  it('rebuilds deterministic state from an event log regardless of input order', async () => {
    const log: Event[] = [
      ev({ id: 'e3', actor: 'u1', type: 'todont.created', ts: 300 }),
      ev({ id: 'e1', actor: 'u1', type: 'todont.created', ts: 100 }),
      ev({ id: 'e2', actor: 'u1', type: 'reaction.received', ts: 200 }),
    ];
    const a = makeTestEngine(defs);
    await a.engine.replay(log);
    const b = makeTestEngine(defs);
    await b.engine.replay([...log].reverse());
    expect(await a.engine.score('u1', 'shame')).toBe(2);
    expect(await a.engine.score('u1', 'honor')).toBe(2);
    expect(await b.engine.score('u1', 'shame')).toBe(2);
    expect(await b.engine.score('u1', 'honor')).toBe(2);
  });
});

describe('seed (snapshot-and-go)', () => {
  it('imports scores, achievements, and streaks', async () => {
    const { engine } = makeTestEngine({
      ...defs,
      achievements: [
        {
          code: 'old',
          name: 'Old',
          description: '',
          rarity: 1,
          rule: { kind: 'score', score: 'shame', gte: 9999 },
        },
      ],
      streaks: [
        {
          code: 'daily',
          resetEvents: [],
          tickEvents: ['tick'],
          scoping: 'per-actor',
        },
      ],
    });
    await engine.seed({
      scores: [{ actor: 'u1', score: 'shame', value: 42 }],
      achievements: [{ actor: 'u1', code: 'old', at: 123 }],
      streaks: [{ actor: 'u1', code: 'daily', current: 5, best: 9, lastTick: 999 }],
    });
    expect(await engine.score('u1', 'shame')).toBe(42);
    expect(await engine.achievements('u1')).toEqual([{ code: 'old', at: 123 }]);
    expect(await engine.streak('u1', 'daily')).toEqual({
      current: 5,
      best: 9,
      lastTick: 999,
    });
  });

  it('seeded scores count toward rolling windows as of seed time', async () => {
    const { engine, clock } = makeTestEngine({
      scores: ['shame'],
      leaderboards: [
        {
          code: 'wk',
          score: 'shame',
          window: { type: 'rolling', ms: 7 * DAY },
          limit: 5,
        },
      ],
    });
    clock.set(100 * DAY);
    await engine.seed({ scores: [{ actor: 'u1', score: 'shame', value: 7 }] });
    expect(await engine.leaderboard('wk')).toEqual([{ actor: 'u1', value: 7 }]);
  });
});

const DAY = 86_400_000;

const memoryStores = () => ({
  events: memoryEventStore(),
  scores: memoryScoreStore(),
  achievements: memoryAchievementStore(),
  streaks: memoryStreakStore(),
  clock: { now: () => 0 },
});

describe('concurrency and idempotency', () => {
  it('concurrent emits of the same id count once', async () => {
    const { engine } = makeTestEngine(defs);
    const e = ev({ id: 'dup', actor: 'u1', type: 'todont.created' });
    await Promise.all([engine.emit(e), engine.emit(e), engine.emit(e)]);
    expect(await engine.score('u1', 'shame')).toBe(1);
  });

  it('an id reused with a different type is still a duplicate', async () => {
    const { engine } = makeTestEngine(defs);
    await engine.emit(ev({ id: 'x', actor: 'u1', type: 'todont.created' }));
    const r = await engine.emit(ev({ id: 'x', actor: 'u1', type: 'reaction.received' }));
    expect(r.scoreDeltas).toEqual([]);
    expect(await engine.score('u1', 'honor')).toBe(0);
  });

  it('concurrent ticks for one actor report consistent streak changes', async () => {
    const { engine } = makeTestEngine({
      streaks: [
        {
          code: 'd',
          resetEvents: [],
          tickEvents: ['tick'],
          scoping: 'per-actor',
        },
      ],
    });
    const rs = await Promise.all(
      [1, 2, 3, 4].map((n) => engine.emit(ev({ id: `t${n}`, actor: 'u1', type: 'tick', ts: n }))),
    );
    const changes = rs.flatMap((r) => r.streakChanges.map((c) => [c.from, c.to]));
    expect(changes).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ]);
  });

  it('a failed emit does not block the next emit for that actor', async () => {
    const { engine } = makeTestEngine(defs);
    await expect(
      engine.emit({ id: '', actor: 'u1', type: 'x', ts: 0, payload: {} }),
    ).rejects.toThrow();
    await engine.emit(ev({ id: 'ok', actor: 'u1', type: 'todont.created' }));
    expect(await engine.score('u1', 'shame')).toBe(1);
  });

  it('concurrent same-ts escalator triggers report each step once', async () => {
    const { engine } = makeTestEngine({
      escalators: [
        {
          code: 'heat',
          triggerEvents: ['miss'],
          resetEvents: [],
          min: 0,
          max: 5,
          step: 1,
        },
      ],
    });
    const rs = await Promise.all(
      ['m1', 'm2'].map((id) => engine.emit(ev({ id, actor: 'u1', type: 'miss', ts: 5 }))),
    );
    expect(rs.flatMap((r) => r.escalations.map((e) => [e.from, e.to]))).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });

  it('a concurrent reset cannot hide a streak achievement the tick earned', async () => {
    const { engine } = makeTestEngine({
      streaks: [
        {
          code: 'd',
          resetEvents: ['fail'],
          tickEvents: ['tick'],
          scoping: 'per-actor',
        },
      ],
      achievements: [
        {
          code: 'three',
          name: '',
          description: '',
          rarity: 1,
          rule: { kind: 'streak', streak: 'd', gte: 3 },
        },
      ],
    });
    await engine.emit(ev({ id: 't1', actor: 'u1', type: 'tick', ts: 1 }));
    await engine.emit(ev({ id: 't2', actor: 'u1', type: 'tick', ts: 2 }));
    const [tick] = await Promise.all([
      engine.emit(ev({ id: 't3', actor: 'u1', type: 'tick', ts: 3 })),
      engine.emit(ev({ id: 'f', actor: 'u1', type: 'fail', ts: 4 })),
    ]);
    expect(tick.unlocked).toEqual(['three']);
  });

  it('rejects an EventStore whose append does not report insertion', async () => {
    const s = memoryStores();
    const inner = s.events;
    const engine = createEngine({
      ...s,
      events: {
        ...inner,
        append: async (e: Event) => {
          await inner.append(e);
        },
      } as never,
      definitions: defs,
    });
    await expect(engine.emit(ev({ id: 'a', actor: 'u1', type: 'todont.created' }))).rejects.toThrow(
      /append must return a boolean/,
    );
  });
});

describe('emit input validation', () => {
  const bad: [string, unknown][] = [
    ['missing id', { actor: 'u1', type: 't', ts: 0, payload: {} }],
    ['empty id', { id: '', actor: 'u1', type: 't', ts: 0, payload: {} }],
    ['empty actor', { id: 'a', actor: '', type: 't', ts: 0, payload: {} }],
    ['missing type', { id: 'a', actor: 'u1', ts: 0, payload: {} }],
    ['NaN ts', { id: 'a', actor: 'u1', type: 't', ts: Number.NaN, payload: {} }],
    ['string ts', { id: 'a', actor: 'u1', type: 't', ts: '5', payload: {} }],
    ['array payload', { id: 'a', actor: 'u1', type: 't', ts: 0, payload: [] }],
  ];
  for (const [name, e] of bad) {
    it(`rejects ${name} without persisting it`, async () => {
      const { engine } = makeTestEngine(defs);
      await expect(engine.emit(e as Event)).rejects.toThrow(TypeError);
      const r = await engine.emit(ev({ id: 'ok', actor: 'u1', type: 'todont.created' }));
      expect(r.scoreDeltas).toHaveLength(1);
    });
  }

  it('accepts a missing payload', async () => {
    const { engine } = makeTestEngine(defs);
    const r = await engine.emit({
      id: 'a',
      actor: 'u1',
      type: 'todont.created',
      ts: 0,
    } as Event);
    expect(r.scoreDeltas).toHaveLength(1);
  });
});

describe('points: path deltas only take real numbers', () => {
  for (const v of ['3', true, '1e3', null, [], {}]) {
    it(`skips a ${JSON.stringify(v)} payload value`, async () => {
      const { engine } = makeTestEngine(defs);
      await engine.emit(
        ev({
          id: 'a',
          actor: 'u1',
          type: 'confession.posted',
          payload: { severity: v },
        }),
      );
      expect(await engine.score('u1', 'shame')).toBe(0);
    });
  }
});

describe('definition validation at createEngine', () => {
  const ach = (rule: unknown): Definitions => ({
    achievements: [{ code: 'a', name: '', description: '', rarity: 1, rule: rule as never }],
  });
  const count = (code: string) => ({
    code,
    name: '',
    description: '',
    rarity: 1 as const,
    rule: { kind: 'count' as const, eventType: 'x', gte: 1 },
  });
  const esc = {
    code: 'e',
    triggerEvents: ['x'],
    resetEvents: [],
    min: 0,
    max: 5,
    step: 1,
  };
  const cases: [string, Definitions, RegExp][] = [
    ['rank on unknown leaderboard', ach({ kind: 'rank', leaderboard: 'nope', eq: 1 }), /nope/],
    ['count gte 0', ach({ kind: 'count', eventType: 'x', gte: 0 }), /gte/],
    ['score gte negative', ach({ kind: 'score', score: 'shame', gte: -1 }), /gte/],
    ['streak rule on unknown streak', ach({ kind: 'streak', streak: 'ghost', gte: 1 }), /ghost/],
    ['empty all', ach({ kind: 'all', rules: [] }), /empty/],
    [
      'nested bad rule',
      ach({
        kind: 'any',
        rules: [{ kind: 'unique', eventType: 'x', by: 'p', gte: 0 }],
      }),
      /gte/,
    ],
    ['duplicate achievement codes', { achievements: [count('a'), count('a')] }, /duplicate/],
    [
      'points on an undeclared score',
      { scores: ['shame'], points: [{ on: 'x', score: 'typo', delta: 1 }] },
      /typo/,
    ],
    [
      'leaderboard without source or score',
      { leaderboards: [{ code: 'lb', window: 'all-time', limit: 5 }] },
      /source/,
    ],
    [
      'leaderboard limit 0',
      {
        leaderboards: [{ code: 'lb', score: 's', window: 'all-time', limit: 0 }],
      },
      /limit/,
    ],
    [
      'leaderboard NaN window',
      {
        leaderboards: [
          {
            code: 'lb',
            score: 's',
            window: { type: 'rolling', ms: Number.NaN },
            limit: 5,
          },
        ],
      },
      /window/,
    ],
    [
      'rank eq beyond the board limit',
      {
        leaderboards: [{ code: 'lb', score: 's', window: 'all-time', limit: 3 }],
        ...ach({ kind: 'rank', leaderboard: 'lb', eq: 4 }),
      },
      /eq/,
    ],
    [
      'tier on an undeclared score',
      { scores: ['s'], tiers: [{ code: 't', score: 'typo', thresholds: [{ name: 'x', at: 1 }] }] },
      /typo/,
    ],
    [
      'leaderboard on an undeclared score',
      {
        scores: ['s'],
        leaderboards: [{ code: 'lb', score: 'typo', window: 'all-time', limit: 5 }],
      },
      /typo/,
    ],
    [
      'streak-sum board on an unknown streak',
      {
        leaderboards: [
          {
            code: 'lb',
            source: { kind: 'streak-sum', streak: 'ghost' },
            window: 'all-time',
            limit: 5,
          },
        ],
      },
      /ghost/,
    ],
    [
      'rank eq 0',
      {
        leaderboards: [{ code: 'lb', score: 's', window: 'all-time', limit: 3 }],
        ...ach({ kind: 'rank', leaderboard: 'lb', eq: 0 }),
      },
      /eq/,
    ],
    [
      'rank eq not an integer',
      {
        leaderboards: [{ code: 'lb', score: 's', window: 'all-time', limit: 3 }],
        ...ach({ kind: 'rank', leaderboard: 'lb', eq: 1.5 }),
      },
      /eq/,
    ],
    ['escalator max < min', { escalators: [{ ...esc, min: 5, max: 2 }] }, /max/],
    ['escalator decay every 0', { escalators: [{ ...esc, decay: { every: 0, by: 1 } }] }, /every/],
    [
      'tier with a non-finite threshold',
      {
        tiers: [
          {
            code: 't',
            score: 's',
            thresholds: [{ name: 'x', at: Number.NaN }],
          },
        ],
      },
      /threshold/,
    ],
  ];
  for (const [name, d, msg] of cases) {
    it(`rejects ${name}`, () => {
      expect(() => makeTestEngine(d)).toThrow(msg);
    });
  }

  const bareStreaks: StreakStore = {
    get: async () => ({ current: 0, best: 0, lastTick: 0 }),
    tick: async () => ({ current: 0, best: 0 }),
    reset: async () => 0,
  };

  it('rejects a streak-sum board when the StreakStore lacks topByCurrentSum', () => {
    expect(() =>
      createEngine({
        ...memoryStores(),
        streaks: bareStreaks,
        definitions: {
          streaks: [
            {
              code: 'clean',
              resetEvents: [],
              tickEvents: ['d'],
              scoping: 'per-actor',
            },
          ],
          leaderboards: [
            {
              code: 'lb',
              source: { kind: 'streak-sum', streak: 'clean' },
              window: 'all-time',
              limit: 5,
            },
          ],
        },
      }),
    ).toThrow(/topByCurrentSum/);
  });

  it('rejects an anyKey streak rule when the StreakStore lacks statsAcrossKeys', () => {
    expect(() =>
      createEngine({
        ...memoryStores(),
        streaks: bareStreaks,
        definitions: {
          streaks: [
            {
              code: 'c',
              resetEvents: [],
              tickEvents: ['d'],
              scoping: { type: 'per-actor-per-key', key: 'payload.k' },
            },
          ],
          ...ach({ kind: 'streak', streak: 'c', gte: 1, anyKey: true }),
        },
      }),
    ).toThrow(/statsAcrossKeys/);
  });

  it('accepts every valid definition used elsewhere in this file', () => {
    expect(() => makeTestEngine(defs)).not.toThrow();
  });
});

describe('ordering contract', () => {
  it('pins: out-of-order live ingest diverges from replay (live emits must be ts-ordered)', async () => {
    const d: Definitions = {
      streaks: [
        {
          code: 'd',
          resetEvents: ['fail'],
          tickEvents: ['tick'],
          scoping: 'per-actor',
        },
      ],
    };
    const log = [
      ev({ id: 'a', actor: 'u1', type: 'tick', ts: 2 }),
      ev({ id: 'b', actor: 'u1', type: 'fail', ts: 1 }),
    ];
    const live = makeTestEngine(d);
    for (const e of log) await live.engine.emit(e);
    const replayed = makeTestEngine(d);
    await replayed.engine.replay(log);
    expect((await live.engine.streak('u1', 'd')).current).toBe(0);
    expect((await replayed.engine.streak('u1', 'd')).current).toBe(1);
  });
});

describe('observe', () => {
  it('notifies after emit, replay, seed and refresh, even when they throw', async () => {
    const { observe } = await import('@walangstudio/badgetrip-core');
    const { engine } = makeTestEngine(defs);
    const o = observe(engine);
    let calls = 0;
    const off = o.subscribe(() => calls++);
    await o.engine.emit(ev({ id: 'a', actor: 'u1', type: 'todont.created' }));
    await o.engine.replay([ev({ id: 'b', actor: 'u1', type: 'todont.created' })]);
    await o.engine.seed({});
    await o.engine.refresh('u1');
    await expect(
      o.engine.emit({ id: '', actor: 'u1', type: 'x', ts: 0, payload: {} }),
    ).rejects.toThrow();
    expect([calls, o.getVersion()]).toEqual([5, 5]);
    off();
    await o.engine.emit(ev({ id: 'c', actor: 'u1', type: 'todont.created' }));
    expect(calls).toBe(5);
    expect(await o.engine.score('u1', 'shame')).toBe(3);
  });
});

describe('observe sharing and listener isolation', () => {
  it('one wrapper per engine, so every observer sees every change', async () => {
    const { observe } = await import('@walangstudio/badgetrip-core');
    const { engine } = makeTestEngine(defs);
    expect(observe(engine)).toBe(observe(engine));
  });

  it('a throwing subscriber neither rejects the emit nor starves other subscribers', async () => {
    const { observe } = await import('@walangstudio/badgetrip-core');
    const { engine } = makeTestEngine(defs);
    const o = observe(engine);
    const errors: unknown[] = [];
    const onErr = (e: unknown) => errors.push(e);
    process.on('uncaughtException', onErr);
    let later = 0;
    const offA = o.subscribe(() => {
      throw new Error('boom');
    });
    const offB = o.subscribe(() => later++);
    const r = await o.engine.emit(ev({ id: 'a', actor: 'u1', type: 'todont.created' }));
    await new Promise((res) => setTimeout(res, 0));
    process.off('uncaughtException', onErr);
    offA();
    offB();
    expect(r.scoreDeltas).toHaveLength(1);
    expect(later).toBe(1);
    expect(errors).toHaveLength(1);
  });
});

describe('streak store contract enforcement', () => {
  const streaks = [
    { code: 'daily', tickEvents: ['tick'], resetEvents: ['miss'], scoping: 'per-actor' as const },
  ];
  const withStore = (store: StreakStore) =>
    createEngine({ ...memoryStores(), streaks: store, definitions: { streaks } });
  const ev = (id: string, type: string): Event => ({ id, actor: 'u', type, ts: 1, payload: {} });

  it('rejects a tick that does not return the new current', async () => {
    const store = { ...memoryStreakStore(), tick: async () => ({}) } as unknown as StreakStore;
    await expect(withStore(store).emit(ev('a', 'tick'))).rejects.toThrow(/tick must return/);
  });

  it('rejects a reset that does not return the previous current', async () => {
    const store = {
      ...memoryStreakStore(),
      reset: async () => undefined,
    } as unknown as StreakStore;
    await expect(withStore(store).emit(ev('a', 'miss'))).rejects.toThrow(/reset must return/);
  });
});

describe('replay ordering', () => {
  it('breaks equal-ts ties by id, whatever order the log is in', async () => {
    const { engine } = makeTestEngine({
      scores: ['xp'],
      points: [{ on: 'x', score: 'xp', delta: 1 }],
      achievements: [
        {
          code: 'first',
          name: '',
          description: '',
          rarity: 1,
          rule: { kind: 'first-of-day', eventType: 'x' },
        },
      ],
    });
    const results = await engine.replay([
      { id: 'b', actor: 'u', type: 'x', ts: 5, payload: {} },
      { id: 'a', actor: 'u', type: 'x', ts: 5, payload: {} },
    ]);
    expect(results.map((r) => [r.scoreDeltas[0]?.reason, r.unlocked])).toEqual([
      ['a', ['first']],
      ['b', []],
    ]);
  });
});

describe('escalator query', () => {
  it('throws on an unknown escalator', async () => {
    const { engine } = makeTestEngine({});
    await expect(engine.escalator('u', 'nope')).rejects.toThrow(/unknown escalator: nope/);
  });
});
