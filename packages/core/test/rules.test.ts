import {
  createEngine,
  memoryAchievementStore,
  memoryEventStore,
  memoryScoreStore,
  memoryStreakStore,
  utcDayStart,
} from '@badgetrip/core';
import type { AchievementDef, Definitions, Event, StreakStore } from '@badgetrip/core';
import { makeTestEngine, steppableClock, time } from '@badgetrip/testing';
import { describe, expect, it } from 'vitest';

const ev = (p: Partial<Event> & Pick<Event, 'id' | 'actor' | 'type'>): Event => ({
  ts: 0,
  payload: {},
  ...p,
});

function withAchievements(achievements: AchievementDef[], extra: Partial<Definitions> = {}) {
  return makeTestEngine({ scores: ['honor', 'shame'], achievements, ...extra });
}

describe('rule: count', () => {
  it('unlocks when an event type reaches a threshold', async () => {
    const { engine } = withAchievements([
      {
        code: 'three',
        name: '',
        description: '',
        rarity: 1,
        rule: { kind: 'count', eventType: 'x', gte: 3 },
      },
    ]);
    let last: string[] = [];
    for (const id of ['a', 'b', 'c']) {
      last = (await engine.emit(ev({ id, actor: 'u1', type: 'x' }))).unlocked;
    }
    expect(last).toEqual(['three']);
    expect((await engine.achievements('u1')).map((a) => a.code)).toEqual(['three']);
  });

  it('honours a where filter', async () => {
    const { engine } = withAchievements([
      {
        code: 'bigs',
        name: '',
        description: '',
        rarity: 1,
        rule: {
          kind: 'count',
          eventType: 'x',
          gte: 2,
          where: { path: 'payload.big', op: '=', value: true },
        },
      },
    ]);
    await engine.emit(ev({ id: 'a', actor: 'u1', type: 'x', payload: { big: false } }));
    let r = await engine.emit(ev({ id: 'b', actor: 'u1', type: 'x', payload: { big: true } }));
    expect(r.unlocked).toEqual([]);
    r = await engine.emit(ev({ id: 'c', actor: 'u1', type: 'x', payload: { big: true } }));
    expect(r.unlocked).toEqual(['bigs']);
  });
});

describe('rule: unique', () => {
  it('counts distinct values of a path', async () => {
    const { engine } = withAchievements([
      {
        code: 'crowd',
        name: '',
        description: '',
        rarity: 1,
        rule: {
          kind: 'unique',
          eventType: 'reaction',
          by: 'payload.from',
          gte: 3,
        },
      },
    ]);
    await engine.emit(ev({ id: 'a', actor: 'u1', type: 'reaction', payload: { from: 'x' } }));
    await engine.emit(ev({ id: 'b', actor: 'u1', type: 'reaction', payload: { from: 'x' } }));
    let r = await engine.emit(
      ev({ id: 'c', actor: 'u1', type: 'reaction', payload: { from: 'y' } }),
    );
    expect(r.unlocked).toEqual([]);
    r = await engine.emit(ev({ id: 'd', actor: 'u1', type: 'reaction', payload: { from: 'z' } }));
    expect(r.unlocked).toEqual(['crowd']);
  });
});

describe('rule: score', () => {
  it('unlocks at a score threshold', async () => {
    const { engine } = withAchievements(
      [
        {
          code: 'rich',
          name: '',
          description: '',
          rarity: 1,
          rule: { kind: 'score', score: 'honor', gte: 10 },
        },
      ],
      { points: [{ on: 'win', score: 'honor', delta: 5 }] },
    );
    await engine.emit(ev({ id: 'a', actor: 'u1', type: 'win' }));
    const r = await engine.emit(ev({ id: 'b', actor: 'u1', type: 'win' }));
    expect(r.unlocked).toEqual(['rich']);
  });
});

describe('rule: streak', () => {
  it('unlocks at a streak length', async () => {
    const { engine } = withAchievements(
      [
        {
          code: 'hot',
          name: '',
          description: '',
          rarity: 1,
          rule: { kind: 'streak', streak: 'daily', gte: 3 },
        },
      ],
      {
        streaks: [
          {
            code: 'daily',
            tickEvents: ['day'],
            resetEvents: ['miss'],
            scoping: 'per-actor',
          },
        ],
      },
    );
    await engine.emit(ev({ id: 'a', actor: 'u1', type: 'day' }));
    await engine.emit(ev({ id: 'b', actor: 'u1', type: 'day' }));
    const r = await engine.emit(ev({ id: 'c', actor: 'u1', type: 'day' }));
    expect(r.unlocked).toEqual(['hot']);
  });
});

describe('rule: first-of-day', () => {
  const dayBoundary = (ts: number) => ts - (ts % time.DAY);
  const def: AchievementDef = {
    code: 'night_owl',
    name: '',
    description: '',
    rarity: 2,
    rule: {
      kind: 'first-of-day',
      eventType: 'confession',
      between: [0, 4 * time.HOUR],
    },
  };

  it('fires only on the first qualifying event of the day, within window', async () => {
    const { engine } = makeTestEngine({ achievements: [def] }, { dayBoundary });
    const r = await engine.emit(
      ev({ id: 'a', actor: 'u1', type: 'confession', ts: 2 * time.HOUR }),
    );
    expect(r.unlocked).toEqual(['night_owl']);
  });

  it('does not fire outside the time window', async () => {
    const { engine } = makeTestEngine({ achievements: [def] }, { dayBoundary });
    const r = await engine.emit(
      ev({ id: 'a', actor: 'u1', type: 'confession', ts: 9 * time.HOUR }),
    );
    expect(r.unlocked).toEqual([]);
  });

  it('handles a 25h DST fall-back day from a calendar-aware dayBoundary', async () => {
    // Day 1 is 25h long: [0, 25h). Day 2 starts at 25h.
    const dstBoundary = (ts: number) => (ts < 25 * time.HOUR ? 0 : 25 * time.HOUR);
    const fod: AchievementDef = {
      ...def,
      rule: { kind: 'first-of-day', eventType: 'confession' },
    };
    const { engine } = makeTestEngine({ achievements: [fod] }, { dayBoundary: dstBoundary });
    const r = await engine.emit(
      ev({
        id: 'late',
        actor: 'u1',
        type: 'confession',
        ts: 24 * time.HOUR + 30 * 60_000,
      }),
    );
    expect(r.unlocked).toEqual(['night_owl']);
  });

  it('does not fire on a later event the same day', async () => {
    const { engine } = makeTestEngine({ achievements: [def] }, { dayBoundary });
    await engine.emit(ev({ id: 'a', actor: 'u1', type: 'confession', ts: 9 * time.HOUR }));
    const r = await engine.emit(
      ev({
        id: 'b',
        actor: 'u1',
        type: 'confession',
        ts: 9 * time.HOUR + 60_000,
      }),
    );
    expect(r.unlocked).toEqual([]);
  });
});

describe('rule: all / any', () => {
  it('all requires every sub-rule', async () => {
    const { engine } = withAchievements([
      {
        code: 'combo',
        name: '',
        description: '',
        rarity: 1,
        rule: {
          kind: 'all',
          rules: [
            { kind: 'count', eventType: 'react', gte: 2 },
            { kind: 'unique', eventType: 'react', by: 'payload.from', gte: 2 },
          ],
        },
      },
    ]);
    let r = await engine.emit(ev({ id: 'a', actor: 'u1', type: 'react', payload: { from: 'x' } }));
    expect(r.unlocked).toEqual([]);
    r = await engine.emit(ev({ id: 'b', actor: 'u1', type: 'react', payload: { from: 'y' } }));
    expect(r.unlocked).toEqual(['combo']);
  });

  it('any requires at least one sub-rule', async () => {
    const { engine } = withAchievements([
      {
        code: 'either',
        name: '',
        description: '',
        rarity: 1,
        rule: {
          kind: 'any',
          rules: [
            { kind: 'count', eventType: 'p', gte: 5 },
            { kind: 'count', eventType: 'q', gte: 1 },
          ],
        },
      },
    ]);
    const r = await engine.emit(ev({ id: 'a', actor: 'u1', type: 'q' }));
    expect(r.unlocked).toEqual(['either']);
  });
});

describe('rule: count with todBetween', () => {
  const dayBoundary = (ts: number) => ts - (ts % time.DAY);
  const def: AchievementDef = {
    code: 'after_dark',
    name: '',
    description: '',
    rarity: 2,
    rule: {
      kind: 'count',
      eventType: 'confession',
      gte: 1,
      todBetween: [0, 4 * time.HOUR],
    },
  };

  it('fires for ANY event in the window, including a later one the same day', async () => {
    const { engine } = makeTestEngine({ achievements: [def] }, { dayBoundary });
    // first event of the day is outside the window
    let r = await engine.emit(ev({ id: 'a', actor: 'u1', type: 'confession', ts: 9 * time.HOUR }));
    expect(r.unlocked).toEqual([]);
    // a later event the same day, inside the window, still unlocks (unlike first-of-day)
    r = await engine.emit(ev({ id: 'b', actor: 'u1', type: 'confession', ts: 26 * time.HOUR }));
    expect(r.unlocked).toEqual(['after_dark']);
  });

  it('does not fire for events outside the window', async () => {
    const { engine } = makeTestEngine({ achievements: [def] }, { dayBoundary });
    const r = await engine.emit(
      ev({ id: 'a', actor: 'u1', type: 'confession', ts: 9 * time.HOUR }),
    );
    expect(r.unlocked).toEqual([]);
  });

  it('combines a where filter with the time window and needs gte in-window hits', async () => {
    const { engine } = makeTestEngine(
      {
        achievements: [
          {
            code: 'dark_severe',
            name: '',
            description: '',
            rarity: 3,
            rule: {
              kind: 'count',
              eventType: 'confession',
              gte: 2,
              where: { path: 'payload.severe', op: '=', value: true },
              todBetween: [0, 4 * time.HOUR],
            },
          },
        ],
      },
      { dayBoundary },
    );
    // in-window but not severe - ignored
    await engine.emit(
      ev({
        id: 'a',
        actor: 'u1',
        type: 'confession',
        ts: time.HOUR,
        payload: { severe: false },
      }),
    );
    // severe but out of window - ignored
    await engine.emit(
      ev({
        id: 'b',
        actor: 'u1',
        type: 'confession',
        ts: 9 * time.HOUR,
        payload: { severe: true },
      }),
    );
    let r = await engine.emit(
      ev({
        id: 'c',
        actor: 'u1',
        type: 'confession',
        ts: time.HOUR,
        payload: { severe: true },
      }),
    );
    expect(r.unlocked).toEqual([]);
    r = await engine.emit(
      ev({
        id: 'd',
        actor: 'u1',
        type: 'confession',
        ts: 2 * time.HOUR,
        payload: { severe: true },
      }),
    );
    expect(r.unlocked).toEqual(['dark_severe']);
  });
});

describe('rule: group-count', () => {
  const def: AchievementDef = {
    code: 'serial',
    name: '',
    description: '',
    rarity: 3,
    rule: {
      kind: 'group-count',
      eventType: 'confession',
      by: 'payload.todont',
      gte: 3,
    },
  };

  it('unlocks when one group reaches the threshold', async () => {
    const { engine } = makeTestEngine({ achievements: [def] });
    await engine.emit(
      ev({
        id: 'a',
        actor: 'u1',
        type: 'confession',
        payload: { todont: 'A' },
      }),
    );
    let r = await engine.emit(
      ev({
        id: 'b',
        actor: 'u1',
        type: 'confession',
        payload: { todont: 'A' },
      }),
    );
    expect(r.unlocked).toEqual([]);
    r = await engine.emit(
      ev({
        id: 'c',
        actor: 'u1',
        type: 'confession',
        payload: { todont: 'A' },
      }),
    );
    expect(r.unlocked).toEqual(['serial']);
  });

  it('does not unlock when events are spread across groups (differs from count)', async () => {
    const { engine } = makeTestEngine({ achievements: [def] });
    await engine.emit(
      ev({
        id: 'a',
        actor: 'u1',
        type: 'confession',
        payload: { todont: 'A' },
      }),
    );
    await engine.emit(
      ev({
        id: 'b',
        actor: 'u1',
        type: 'confession',
        payload: { todont: 'B' },
      }),
    );
    const r = await engine.emit(
      ev({
        id: 'c',
        actor: 'u1',
        type: 'confession',
        payload: { todont: 'C' },
      }),
    );
    expect(r.unlocked).toEqual([]);
  });

  it('diverges from unique: 3 same-key events satisfy group-count but not unique(3)', async () => {
    const { engine } = makeTestEngine({
      achievements: [
        def,
        {
          code: 'distinct3',
          name: '',
          description: '',
          rarity: 2,
          rule: {
            kind: 'unique',
            eventType: 'confession',
            by: 'payload.todont',
            gte: 3,
          },
        },
      ],
    });
    await engine.emit(
      ev({
        id: 'a',
        actor: 'u1',
        type: 'confession',
        payload: { todont: 'A' },
      }),
    );
    await engine.emit(
      ev({
        id: 'b',
        actor: 'u1',
        type: 'confession',
        payload: { todont: 'A' },
      }),
    );
    const r = await engine.emit(
      ev({
        id: 'c',
        actor: 'u1',
        type: 'confession',
        payload: { todont: 'A' },
      }),
    );
    expect(r.unlocked).toEqual(['serial']);
  });

  it('applies a where filter before grouping', async () => {
    const { engine } = makeTestEngine({
      achievements: [
        {
          code: 'serial_big',
          name: '',
          description: '',
          rarity: 3,
          rule: {
            kind: 'group-count',
            eventType: 'confession',
            by: 'payload.todont',
            gte: 2,
            where: { path: 'payload.big', op: '=', value: true },
          },
        },
      ],
    });
    await engine.emit(
      ev({
        id: 'a',
        actor: 'u1',
        type: 'confession',
        payload: { todont: 'A', big: false },
      }),
    );
    let r = await engine.emit(
      ev({
        id: 'b',
        actor: 'u1',
        type: 'confession',
        payload: { todont: 'A', big: true },
      }),
    );
    expect(r.unlocked).toEqual([]);
    r = await engine.emit(
      ev({
        id: 'c',
        actor: 'u1',
        type: 'confession',
        payload: { todont: 'A', big: true },
      }),
    );
    expect(r.unlocked).toEqual(['serial_big']);
  });
});

describe('rule: streak of best', () => {
  const streaks = [
    {
      code: 'daily',
      tickEvents: ['day'],
      resetEvents: ['miss'],
      scoping: 'per-actor' as const,
    },
  ];

  it("of:'best' is satisfied by lifetime best even after a reset to 0", async () => {
    const { engine } = makeTestEngine({
      streaks,
      achievements: [
        {
          code: 'veteran',
          name: '',
          description: '',
          rarity: 4,
          rule: { kind: 'streak', streak: 'daily', gte: 5, of: 'best' },
        },
      ],
    });
    await engine.seed({
      streaks: [{ actor: 'u1', code: 'daily', current: 0, best: 5, lastTick: 0 }],
    });
    const r = await engine.emit(ev({ id: 'p', actor: 'u1', type: 'ping' }));
    expect(r.unlocked).toEqual(['veteran']);
  });

  it("default (of:'current') does NOT unlock when current is 0 but best is high", async () => {
    const { engine } = makeTestEngine({
      streaks,
      achievements: [
        {
          code: 'streaker',
          name: '',
          description: '',
          rarity: 4,
          rule: { kind: 'streak', streak: 'daily', gte: 5 },
        },
      ],
    });
    await engine.seed({
      streaks: [{ actor: 'u1', code: 'daily', current: 0, best: 5, lastTick: 0 }],
    });
    const r = await engine.emit(ev({ id: 'p', actor: 'u1', type: 'ping' }));
    expect(r.unlocked).toEqual([]);
  });
});

describe('rule: streak anyKey (per-actor-per-key)', () => {
  const streaks = [
    {
      code: 'clean',
      tickEvents: ['day'],
      resetEvents: ['fail'],
      scoping: { type: 'per-actor-per-key' as const, key: 'payload.item' },
    },
  ];

  it('unlocks when ANY key reaches the threshold', async () => {
    const { engine } = makeTestEngine({
      streaks,
      achievements: [
        {
          code: 'week_strong',
          name: '',
          description: '',
          rarity: 2,
          rule: {
            kind: 'streak',
            streak: 'clean',
            gte: 3,
            of: 'best',
            anyKey: true,
          },
        },
      ],
    });
    await engine.emit(ev({ id: 'a', actor: 'u1', type: 'day', payload: { item: 'A' } }));
    await engine.emit(ev({ id: 'b', actor: 'u1', type: 'day', payload: { item: 'A' } }));
    const r = await engine.emit(ev({ id: 'c', actor: 'u1', type: 'day', payload: { item: 'A' } }));
    expect(r.unlocked).toEqual(['week_strong']);
  });

  it('without anyKey, a keyless streak rule never sees a per-key streak', async () => {
    const { engine } = makeTestEngine({
      streaks,
      achievements: [
        {
          code: 'week_strong',
          name: '',
          description: '',
          rarity: 2,
          rule: { kind: 'streak', streak: 'clean', gte: 3, of: 'best' },
        },
      ],
    });
    await engine.emit(ev({ id: 'a', actor: 'u1', type: 'day', payload: { item: 'A' } }));
    await engine.emit(ev({ id: 'b', actor: 'u1', type: 'day', payload: { item: 'A' } }));
    const r = await engine.emit(ev({ id: 'c', actor: 'u1', type: 'day', payload: { item: 'A' } }));
    expect(r.unlocked).toEqual([]);
  });

  it('rejects at construction when the StreakStore lacks statsAcrossKeys', () => {
    const streakStore: StreakStore = {
      async get() {
        return { current: 0, best: 0, lastTick: 0 };
      },
      async tick() {
        return { current: 1, best: 1 };
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
          streaks,
          achievements: [
            {
              code: 'week_strong',
              name: '',
              description: '',
              rarity: 2,
              rule: {
                kind: 'streak',
                streak: 'clean',
                gte: 1,
                of: 'best',
                anyKey: true,
              },
            },
          ],
        },
      }),
    ).toThrow(/statsAcrossKeys/);
  });
});

describe('default day boundary (UTC midnight)', () => {
  it('floors to UTC midnight, including before the epoch', () => {
    expect(utcDayStart(0)).toBe(0);
    expect(utcDayStart(time.DAY - 1)).toBe(0);
    expect(utcDayStart(time.DAY)).toBe(time.DAY);
    expect(utcDayStart(-1)).toBe(-time.DAY);
  });

  it('starts a new first-of-day at UTC midnight when no dayBoundary is given', async () => {
    const def: AchievementDef = {
      code: 'early',
      name: '',
      description: '',
      rarity: 1,
      rule: { kind: 'first-of-day', eventType: 'x', between: [0, 4 * time.HOUR] },
    };
    const { engine } = makeTestEngine({ achievements: [def] });
    await engine.emit(ev({ id: 'a', actor: 'u', type: 'x', ts: 23 * time.HOUR }));
    const r = await engine.emit(ev({ id: 'b', actor: 'u', type: 'x', ts: time.DAY + time.HOUR }));
    expect(r.unlocked).toEqual(['early']);
  });
});

describe('rule: group-count without store support', () => {
  it('scans events when maxGroupSize is missing', async () => {
    const def: AchievementDef = {
      code: 'serial',
      name: '',
      description: '',
      rarity: 1,
      rule: {
        kind: 'group-count',
        eventType: 'c',
        by: 'payload.g',
        gte: 2,
        where: { path: 'payload.ok', op: '=', value: true },
      },
    };
    const { maxGroupSize: _, ...events } = memoryEventStore();
    const engine = createEngine({
      events,
      scores: memoryScoreStore(),
      achievements: memoryAchievementStore(),
      streaks: memoryStreakStore(),
      clock: steppableClock(),
      definitions: { achievements: [def] },
    });
    const emit = (id: string, payload: Record<string, unknown>) =>
      engine.emit(ev({ id, actor: 'u', type: 'c', payload }));
    await emit('1', { g: 'A', ok: true });
    await emit('2', { ok: true });
    await emit('3', { g: 'A', ok: false });
    expect(
      (await engine.emit(ev({ id: '4', actor: 'u', type: 'c', payload: { g: 'B', ok: true } })))
        .unlocked,
    ).toEqual([]);
    expect(
      (await engine.emit(ev({ id: '5', actor: 'u', type: 'c', payload: { g: 'A', ok: true } })))
        .unlocked,
    ).toEqual(['serial']);
    expect(await engine.progress('u', 'serial')).toMatchObject({ current: 2, target: 2 });
  });
});
