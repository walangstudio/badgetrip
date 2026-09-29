import { type Event, defineAchievements, rules } from '@badgetrip/core';
import { makeTestEngine } from '@badgetrip/testing';
import { describe, expect, it } from 'vitest';

const ev = (p: Partial<Event> & Pick<Event, 'id' | 'actor' | 'type'>): Event => ({
  ts: 0,
  payload: {},
  ...p,
});

describe('defineAchievements', () => {
  it('uses the object key as the code and defaults rarity to 1', () => {
    const defs = defineAchievements({
      first_win: {
        name: 'First Win',
        description: 'Win once',
        when: rules.count('win', 1),
      },
    });
    expect(defs).toEqual([
      {
        code: 'first_win',
        name: 'First Win',
        description: 'Win once',
        rarity: 1,
        rule: { kind: 'count', eventType: 'win', gte: 1 },
      },
    ]);
  });

  it('expands tiers into one ascending unlock each, filling {tier} and {n}', () => {
    const defs = defineAchievements({
      fan: {
        name: 'Fan ({tier})',
        description: 'Get {n} reactions',
        icon: 'heart',
        when: rules.count('reaction'),
        tiers: {
          bronze: 10,
          silver: { at: 50, points: 20 },
          gold: { at: 100, icon: 'crown' },
        },
      },
    });
    expect(defs.map((d) => [d.code, d.name, d.description, d.rarity, d.icon, d.points])).toEqual([
      ['fan.bronze', 'Fan (bronze)', 'Get 10 reactions', 1, 'heart', undefined],
      ['fan.silver', 'Fan (silver)', 'Get 50 reactions', 2, 'heart', 20],
      ['fan.gold', 'Fan (gold)', 'Get 100 reactions', 3, 'crown', undefined],
    ]);
    expect(defs[2]?.rule).toEqual({
      kind: 'count',
      eventType: 'reaction',
      gte: 100,
    });
    expect(defs[1]?.series).toEqual({
      code: 'fan',
      tier: 'silver',
      index: 1,
      of: 3,
    });
  });

  it('rejects a non-tiered threshold rule without gte', () => {
    expect(() =>
      defineAchievements({
        x: { name: '', description: '', when: rules.count('win') },
      }),
    ).toThrow(/threshold/);
  });

  it('rejects a missing threshold nested inside all/any', () => {
    expect(() =>
      defineAchievements({
        x: {
          name: '',
          description: '',
          when: rules.all(rules.count('a', 1), rules.score('s')),
        },
      }),
    ).toThrow(/threshold/);
  });

  it('rejects tiers that do not ascend, or tiers on a rule that already has gte', () => {
    expect(() =>
      defineAchievements({
        x: {
          name: '',
          description: '',
          when: rules.count('a'),
          tiers: { a: 10, b: 5 },
        },
      }),
    ).toThrow(/above/);
    expect(() =>
      defineAchievements({
        x: {
          name: '',
          description: '',
          when: rules.count('a', 3),
          tiers: { a: 10 },
        },
      }),
    ).toThrow(/without gte/);
    expect(() =>
      defineAchievements({
        x: {
          name: '',
          description: '',
          when: rules.firstOfDay('a'),
          tiers: { a: 1 },
        },
      }),
    ).toThrow(/tiers need/);
  });

  it('compiles to definitions the engine unlocks tier by tier', async () => {
    const { engine } = makeTestEngine({
      achievements: defineAchievements({
        fan: {
          name: 'Fan',
          description: '',
          when: rules.count('reaction'),
          tiers: { bronze: 1, silver: 2 },
        },
      }),
    });
    const r1 = await engine.emit(ev({ id: 'a', actor: 'u', type: 'reaction' }));
    const r2 = await engine.emit(ev({ id: 'b', actor: 'u', type: 'reaction' }));
    expect(r1.unlocked).toEqual(['fan.bronze']);
    expect(r2.unlocked).toEqual(['fan.silver']);
  });

  it('points must be a non-negative number', () => {
    expect(() =>
      makeTestEngine({
        achievements: defineAchievements({
          x: {
            name: '',
            description: '',
            points: -5,
            when: rules.count('a', 1),
          },
        }),
      }),
    ).toThrow(/points/);
  });
});

describe('engine.progress', () => {
  const defs = {
    scores: ['honor'],
    points: [{ on: 'win', score: 'honor', delta: 3 }],
    streaks: [
      {
        code: 'd',
        tickEvents: ['day'],
        resetEvents: [],
        scoping: 'per-actor' as const,
      },
    ],
    achievements: defineAchievements({
      wins: { name: '', description: '', when: rules.count('win', 4) },
      rich: { name: '', description: '', when: rules.score('honor', 10) },
      loyal: { name: '', description: '', when: rules.streak('d', 3) },
      both: {
        name: '',
        description: '',
        when: rules.all(rules.count('win', 2), rules.streak('d', 4)),
      },
      either: {
        name: '',
        description: '',
        when: rules.any(rules.count('win', 8), rules.streak('d', 2)),
      },
      explorer: {
        name: '',
        description: '',
        when: rules.unique('visit', 'payload.place', 3),
      },
    }),
  };

  it('reports current, target and floored percent per rule kind', async () => {
    const { engine } = makeTestEngine(defs);
    await engine.emit(ev({ id: 'w1', actor: 'u', type: 'win' }));
    await engine.emit(ev({ id: 'd1', actor: 'u', type: 'day' }));
    await engine.emit(ev({ id: 'v1', actor: 'u', type: 'visit', payload: { place: 'a' } }));
    await engine.emit(ev({ id: 'v2', actor: 'u', type: 'visit', payload: { place: 'a' } }));
    expect(await engine.progress('u', 'wins')).toEqual({
      current: 1,
      target: 4,
      percent: 25,
    });
    expect(await engine.progress('u', 'rich')).toEqual({
      current: 3,
      target: 10,
      percent: 30,
    });
    expect(await engine.progress('u', 'loyal')).toEqual({
      current: 1,
      target: 3,
      percent: 33,
    });
    expect(await engine.progress('u', 'both')).toEqual({
      current: 0,
      target: 2,
      percent: 37,
      countable: false,
    });
    expect(await engine.progress('u', 'either')).toEqual({
      current: 0,
      target: 1,
      percent: 50,
      countable: false,
    });
    expect(await engine.progress('u', 'explorer')).toEqual({
      current: 1,
      target: 3,
      percent: 33,
    });
  });

  it('an unlocked achievement stays at 100% even after its streak resets', async () => {
    const { engine } = makeTestEngine({
      streaks: [
        {
          code: 'd',
          tickEvents: ['day'],
          resetEvents: ['miss'],
          scoping: 'per-actor',
        },
      ],
      achievements: defineAchievements({
        two: { name: '', description: '', when: rules.streak('d', 2) },
      }),
    });
    await engine.emit(ev({ id: '1', actor: 'u', type: 'day', ts: 1 }));
    await engine.emit(ev({ id: '2', actor: 'u', type: 'day', ts: 2 }));
    await engine.emit(ev({ id: '3', actor: 'u', type: 'miss', ts: 3 }));
    expect(await engine.progress('u', 'two')).toEqual({
      current: 2,
      target: 2,
      percent: 100,
    });
  });

  it('throws for an unknown achievement', async () => {
    const { engine } = makeTestEngine(defs);
    await expect(engine.progress('u', 'nope')).rejects.toThrow(/unknown achievement/);
  });
});

describe('engine.catalog', () => {
  const achievements = defineAchievements({
    first: {
      name: 'First',
      description: 'Win once',
      lockedDescription: 'Win a round',
      icon: 'trophy',
      category: 'wins',
      points: 10,
      when: rules.count('win', 1),
    },
    secret: {
      name: 'Night Owl',
      description: 'Played at 3am',
      lockedDescription: 'Some things happen at night',
      icon: 'moon',
      hidden: true,
      points: 50,
      when: rules.count('late', 1),
    },
  });

  it('renders locked, hidden and unlocked states for one actor', async () => {
    const { engine } = makeTestEngine({ achievements });
    expect(await engine.catalog('u')).toEqual([
      {
        code: 'first',
        name: 'First',
        description: 'Win a round',
        icon: 'trophy',
        category: 'wins',
        rarity: 1,
        points: 10,
        unlocked: false,
        concealed: false,
        progress: { current: 0, target: 1, percent: 0 },
      },
      {
        code: 'secret',
        name: 'Hidden achievement',
        description: 'Some things happen at night',
        icon: 'hidden',
        rarity: 1,
        points: 50,
        unlocked: false,
        concealed: true,
        progress: { current: 0, target: 1, percent: 0 },
      },
    ]);
    await engine.emit(ev({ id: 'a', actor: 'u', type: 'late', ts: 7 }));
    const [, secret] = await engine.catalog('u');
    expect(secret).toMatchObject({
      name: 'Night Owl',
      description: 'Played at 3am',
      icon: 'moon',
      unlocked: true,
      unlockedAt: 7,
      concealed: false,
      progress: { percent: 100 },
    });
  });
});

describe('achievement review fixes', () => {
  it('percent does not lose a point to float error (29 of 100 is 29%)', async () => {
    const { engine } = makeTestEngine({
      achievements: defineAchievements({
        x: { name: '', description: '', when: rules.count('e', 100) },
      }),
    });
    for (let i = 0; i < 29; i++)
      await engine.emit(ev({ id: `e${i}`, actor: 'u', type: 'e', ts: i }));
    expect((await engine.progress('u', 'x')).percent).toBe(29);
  });

  it('a concealed tiered achievement leaks neither series nor category', async () => {
    const { engine } = makeTestEngine({
      achievements: defineAchievements({
        secret: {
          name: '',
          description: '',
          hidden: true,
          category: 'spoilers',
          when: rules.count('e'),
          tiers: { bronze: 1, gold: 5 },
        },
      }),
    });
    for (const v of await engine.catalog('u')) {
      expect(v.concealed).toBe(true);
      expect(v).not.toHaveProperty('series');
      expect(v).not.toHaveProperty('category');
    }
  });

  it('empty tiers are rejected instead of silently dropping the achievement', () => {
    expect(() =>
      defineAchievements({
        x: { name: '', description: '', when: rules.count('e'), tiers: {} },
      }),
    ).toThrow(/empty/);
  });

  it('refresh awards achievements added after the events happened', async () => {
    const events = [
      ev({ id: 'a', actor: 'u', type: 'win' }),
      ev({ id: 'b', actor: 'u', type: 'win' }),
    ];
    const {
      memoryAchievementStore,
      memoryEventStore,
      memoryScoreStore,
      memoryStreakStore,
      createEngine,
    } = await import('@badgetrip/core');
    const stores = {
      events: memoryEventStore(),
      scores: memoryScoreStore(),
      achievements: memoryAchievementStore(),
      streaks: memoryStreakStore(),
    };
    for (const e of events) await stores.events.append(e);
    const engine = createEngine({
      ...stores,
      clock: { now: () => 42 },
      definitions: {
        achievements: defineAchievements({
          two: { name: '', description: '', when: rules.count('win', 2) },
          five: { name: '', description: '', when: rules.count('win', 5) },
          daily: { name: '', description: '', when: rules.firstOfDay('win') },
        }),
      },
    });
    expect(await engine.refresh('u')).toEqual(['two']);
    expect(await engine.achievements('u')).toEqual([{ code: 'two', at: 42 }]);
    expect(await engine.refresh('u')).toEqual([]);
  });

  it('refresh awards a rank gained through another actor falling', async () => {
    const { engine } = makeTestEngine({
      scores: ['p'],
      points: [{ on: 'gain', score: 'p', delta: { path: 'payload.n' } }],
      leaderboards: [{ code: 'lb', score: 'p', window: 'all-time', limit: 3 }],
      achievements: defineAchievements({
        top: { name: '', description: '', when: rules.rank('lb', 1) },
      }),
    });
    await engine.emit(ev({ id: '1', actor: 'amy', type: 'gain', payload: { n: 10 } }));
    await engine.emit(ev({ id: '2', actor: 'bob', type: 'gain', payload: { n: 5 } }));
    await engine.emit(ev({ id: '3', actor: 'amy', type: 'gain', payload: { n: -9 } }));
    expect((await engine.catalog('bob'))[0]).toMatchObject({
      unlocked: false,
      progress: { percent: 100 },
    });
    expect(await engine.refresh('bob')).toEqual(['top']);
  });

  it('catalog reads each series once and skips has() per achievement', async () => {
    const {
      memoryAchievementStore,
      memoryEventStore,
      memoryScoreStore,
      memoryStreakStore,
      createEngine,
    } = await import('@badgetrip/core');
    const events = memoryEventStore();
    const achievements = memoryAchievementStore();
    let reads = 0;
    let has = 0;
    const engine = createEngine({
      events: {
        ...events,
        read: (o) => {
          reads++;
          return events.read(o);
        },
      },
      achievements: {
        ...achievements,
        has: (a, c) => {
          has++;
          return achievements.has(a, c);
        },
      },
      scores: memoryScoreStore(),
      streaks: memoryStreakStore(),
      clock: { now: () => 0 },
      definitions: {
        achievements: defineAchievements({
          explorer: {
            name: '',
            description: '',
            when: rules.unique('visit', 'payload.place'),
            tiers: { a: 1, b: 5, c: 10, d: 20 },
          },
        }),
      },
    });
    await events.append(ev({ id: 'v', actor: 'u', type: 'visit', payload: { place: 'x' } }));
    reads = 0;
    has = 0;
    const list = await engine.catalog('u');
    expect(list.map((v) => v.progress.current)).toEqual([1, 1, 1, 1]);
    expect(reads).toBe(1);
    expect(has).toBe(0);
  });
});

describe('rules.groupCount and tiered lockedDescription', () => {
  it('builds a group-count rule, filtered by where, and unlocks on the biggest group', async () => {
    const achievements = defineAchievements({
      regular: {
        name: 'Regular',
        description: 'Same habit {n} times',
        lockedDescription: 'Keep one habit going to {n} ({tier})',
        when: rules.groupCount('habit.done', 'payload.habit', undefined, {
          path: 'payload.ok',
          op: '=',
          value: true,
        }),
        tiers: { bronze: 2, silver: 3 },
      },
    });
    expect(achievements[0]?.lockedDescription).toBe('Keep one habit going to 2 (bronze)');
    expect(achievements[1]?.rule).toEqual({
      kind: 'group-count',
      eventType: 'habit.done',
      by: 'payload.habit',
      gte: 3,
      where: { path: 'payload.ok', op: '=', value: true },
    });

    const { engine } = makeTestEngine({ achievements });
    const done = (id: string, habit: string, ok = true) =>
      engine.emit(ev({ id, actor: 'u', type: 'habit.done', payload: { habit, ok } }));
    await done('1', 'run');
    await done('2', 'read');
    await done('3', 'run', false);
    expect((await engine.achievements('u')).map((a) => a.code)).toEqual([]);
    await done('4', 'run');
    expect((await engine.achievements('u')).map((a) => a.code)).toEqual(['regular.bronze']);
  });
});

describe('tier overrides', () => {
  it('lets each tier override name, description and rarity, and caps default rarity at 5', () => {
    const defs = defineAchievements({
      runner: {
        name: 'Runner {tier}',
        description: '{n} runs',
        when: rules.count('run'),
        tiers: {
          t1: 1,
          t2: { at: 2, name: 'Second wind', description: 'Two whole runs', rarity: 5 },
          t3: 3,
          t4: 4,
          t5: 5,
          t6: 6,
        },
      },
      sprinter: {
        name: 'Sprinter',
        description: '',
        rarity: 4,
        when: rules.count('sprint'),
        tiers: { a: 1, b: { at: 2, rarity: 2 } },
      },
    });
    expect(defs.map((d) => [d.code, d.name, d.description, d.rarity])).toEqual([
      ['runner.t1', 'Runner t1', '1 runs', 1],
      ['runner.t2', 'Second wind', 'Two whole runs', 5],
      ['runner.t3', 'Runner t3', '3 runs', 3],
      ['runner.t4', 'Runner t4', '4 runs', 4],
      ['runner.t5', 'Runner t5', '5 runs', 5],
      ['runner.t6', 'Runner t6', '6 runs', 5],
      ['sprinter.a', 'Sprinter', '', 4],
      ['sprinter.b', 'Sprinter', '', 2],
    ]);
  });
});

describe('hidden achievements without lockedDescription', () => {
  it('show an empty description while locked, and first-of-day has no standing progress', async () => {
    const { engine } = makeTestEngine({
      achievements: defineAchievements({
        secret: {
          name: 'Secret',
          description: 'The real text',
          hidden: true,
          when: rules.count('x', 1),
        },
        early: { name: 'Early', description: '', when: rules.firstOfDay('y') },
      }),
    });
    const [secret] = await engine.catalog('u');
    expect([secret?.name, secret?.description, secret?.concealed]).toEqual([
      'Hidden achievement',
      '',
      true,
    ]);
    expect(await engine.progress('u', 'early')).toEqual({ current: 0, target: 1, percent: 0 });
  });
});
