import type { Event } from '@walangstudio/badgetrip-core';
import { makeTestEngine } from '@walangstudio/badgetrip-testing';
import { describe, expect, it } from 'vitest';

const ev = (p: Partial<Event> & Pick<Event, 'id' | 'actor' | 'type'>): Event => ({
  ts: 0,
  payload: {},
  ...p,
});

describe('streaks', () => {
  it('ticks up and reports from/to changes', async () => {
    const { engine } = makeTestEngine({
      streaks: [
        {
          code: 'daily',
          tickEvents: ['day'],
          resetEvents: ['miss'],
          scoping: 'per-actor',
        },
      ],
    });
    const r1 = await engine.emit(ev({ id: 'a', actor: 'u1', type: 'day' }));
    expect(r1.streakChanges).toEqual([
      { code: 'daily', actor: 'u1', key: undefined, from: 0, to: 1 },
    ]);
    const r2 = await engine.emit(ev({ id: 'b', actor: 'u1', type: 'day' }));
    expect(r2.streakChanges[0]).toMatchObject({ from: 1, to: 2 });
    expect(await engine.streak('u1', 'daily')).toMatchObject({
      current: 2,
      best: 2,
    });
  });

  it('resets to zero and preserves best', async () => {
    const { engine } = makeTestEngine({
      streaks: [
        {
          code: 'daily',
          tickEvents: ['day'],
          resetEvents: ['miss'],
          scoping: 'per-actor',
        },
      ],
    });
    await engine.emit(ev({ id: 'a', actor: 'u1', type: 'day' }));
    await engine.emit(ev({ id: 'b', actor: 'u1', type: 'day' }));
    const r = await engine.emit(ev({ id: 'c', actor: 'u1', type: 'miss' }));
    expect(r.streakChanges).toEqual([
      { code: 'daily', actor: 'u1', key: undefined, from: 2, to: 0 },
    ]);
    expect(await engine.streak('u1', 'daily')).toMatchObject({
      current: 0,
      best: 2,
    });
  });

  it('a reset on a zero streak produces no change', async () => {
    const { engine } = makeTestEngine({
      streaks: [
        {
          code: 'daily',
          tickEvents: ['day'],
          resetEvents: ['miss'],
          scoping: 'per-actor',
        },
      ],
    });
    const r = await engine.emit(ev({ id: 'a', actor: 'u1', type: 'miss' }));
    expect(r.streakChanges).toEqual([]);
  });

  it('scopes per-actor-per-key independently', async () => {
    const { engine } = makeTestEngine({
      streaks: [
        {
          code: 'habit',
          tickEvents: ['done'],
          resetEvents: [],
          scoping: { type: 'per-actor-per-key', key: 'payload.habit' },
        },
      ],
    });
    await engine.emit(ev({ id: 'a', actor: 'u1', type: 'done', payload: { habit: 'run' } }));
    await engine.emit(ev({ id: 'b', actor: 'u1', type: 'done', payload: { habit: 'run' } }));
    await engine.emit(ev({ id: 'c', actor: 'u1', type: 'done', payload: { habit: 'read' } }));
    expect(await engine.streak('u1', 'habit', 'run')).toMatchObject({
      current: 2,
    });
    expect(await engine.streak('u1', 'habit', 'read')).toMatchObject({
      current: 1,
    });
  });
});

describe('streak edge cases', () => {
  it('an event type in both tick and reset lists resets', async () => {
    const { engine } = makeTestEngine({
      streaks: [
        {
          code: 'd',
          tickEvents: ['day'],
          resetEvents: ['day'],
          scoping: 'per-actor',
        },
      ],
    });
    await engine.emit(ev({ id: 'a', actor: 'u1', type: 'day' }));
    expect((await engine.streak('u1', 'd')).current).toBe(0);
  });

  it('a per-key streak with the key path missing uses the empty key', async () => {
    const { engine } = makeTestEngine({
      streaks: [
        {
          code: 'item',
          tickEvents: ['day'],
          resetEvents: [],
          scoping: { type: 'per-actor-per-key', key: 'payload.item' },
        },
      ],
    });
    await engine.emit(ev({ id: 'a', actor: 'u1', type: 'day' }));
    expect((await engine.streak('u1', 'item', '')).current).toBe(1);
  });

  it('streaks count ticks, not days: several ticks on one day all count', async () => {
    const { engine } = makeTestEngine({
      streaks: [
        {
          code: 'd',
          tickEvents: ['day'],
          resetEvents: [],
          scoping: 'per-actor',
        },
      ],
    });
    for (const n of [1, 2, 3])
      await engine.emit(ev({ id: `t${n}`, actor: 'u1', type: 'day', ts: n }));
    expect((await engine.streak('u1', 'd')).current).toBe(3);
  });
});
