import type { EscalatorDef, Event } from '@walangstudio/badgetrip-core';
import { makeTestEngine, steppableClock, time } from '@walangstudio/badgetrip-testing';
import { describe, expect, it } from 'vitest';

const ev = (p: Partial<Event> & Pick<Event, 'id' | 'actor' | 'type'>): Event => ({
  ts: 0,
  payload: {},
  ...p,
});

const sev: EscalatorDef = {
  code: 'sev',
  key: 'payload.todont_id',
  triggerEvents: ['penalty'],
  resetEvents: ['cleared'],
  min: 0,
  max: 5,
  step: 1,
};

describe('escalators', () => {
  it('bumps severity per key and reports from/to', async () => {
    const { engine } = makeTestEngine({ escalators: [sev] });
    const r1 = await engine.emit(
      ev({
        id: 'a',
        actor: 'u1',
        type: 'penalty',
        ts: 1,
        payload: { todont_id: 't1' },
      }),
    );
    expect(r1.escalations).toEqual([{ code: 'sev_t1', actor: 'u1', key: 't1', from: 0, to: 1 }]);
    const r2 = await engine.emit(
      ev({
        id: 'b',
        actor: 'u1',
        type: 'penalty',
        ts: 2,
        payload: { todont_id: 't1' },
      }),
    );
    expect(r2.escalations).toEqual([{ code: 'sev_t1', actor: 'u1', key: 't1', from: 1, to: 2 }]);
  });

  it('isolates severity by key', async () => {
    const { engine, clock } = makeTestEngine({ escalators: [sev] });
    await engine.emit(
      ev({
        id: 'a',
        actor: 'u1',
        type: 'penalty',
        ts: 1,
        payload: { todont_id: 't1' },
      }),
    );
    await engine.emit(
      ev({
        id: 'b',
        actor: 'u1',
        type: 'penalty',
        ts: 2,
        payload: { todont_id: 't2' },
      }),
    );
    clock.set(10);
    expect(await engine.escalator('u1', 'sev', 't1')).toBe(1);
    expect(await engine.escalator('u1', 'sev', 't2')).toBe(1);
  });

  it('clamps at max', async () => {
    const { engine, clock } = makeTestEngine({ escalators: [sev] });
    for (let i = 0; i < 8; i++) {
      await engine.emit(
        ev({
          id: `p${i}`,
          actor: 'u1',
          type: 'penalty',
          ts: i + 1,
          payload: { todont_id: 't1' },
        }),
      );
    }
    clock.set(100);
    expect(await engine.escalator('u1', 'sev', 't1')).toBe(5);
  });

  it('reset events drop severity to min', async () => {
    const { engine } = makeTestEngine({ escalators: [sev] });
    await engine.emit(
      ev({
        id: 'a',
        actor: 'u1',
        type: 'penalty',
        ts: 1,
        payload: { todont_id: 't1' },
      }),
    );
    await engine.emit(
      ev({
        id: 'b',
        actor: 'u1',
        type: 'penalty',
        ts: 2,
        payload: { todont_id: 't1' },
      }),
    );
    const r = await engine.emit(
      ev({
        id: 'c',
        actor: 'u1',
        type: 'cleared',
        ts: 3,
        payload: { todont_id: 't1' },
      }),
    );
    expect(r.escalations).toEqual([{ code: 'sev_t1', actor: 'u1', key: 't1', from: 2, to: 0 }]);
    expect(await engine.escalator('u1', 'sev', 't1')).toBe(0);
  });

  it('decays severity over time', async () => {
    const clock = steppableClock(0);
    const decaying = { ...sev, decay: { every: time.DAY, by: 1 } };
    const { engine } = makeTestEngine({ escalators: [decaying] }, { clock });
    for (const id of ['a', 'b', 'c']) {
      await engine.emit(
        ev({
          id,
          actor: 'u1',
          type: 'penalty',
          ts: 0,
          payload: { todont_id: 't1' },
        }),
      );
    }
    expect(await engine.escalator('u1', 'sev', 't1')).toBe(3);
    clock.set(2 * time.DAY);
    expect(await engine.escalator('u1', 'sev', 't1')).toBe(1);
    const r = await engine.emit(
      ev({
        id: 'd',
        actor: 'u1',
        type: 'penalty',
        ts: 2 * time.DAY,
        payload: { todont_id: 't1' },
      }),
    );
    expect(r.escalations).toEqual([{ code: 'sev_t1', actor: 'u1', key: 't1', from: 1, to: 2 }]);
  });
});

describe('escalators ignore unrelated events', () => {
  it('leaves the level alone and reports nothing for other event types', async () => {
    const { engine, clock } = makeTestEngine({ escalators: [sev] });
    const penalty = ev({
      id: 'a',
      actor: 'u1',
      type: 'penalty',
      ts: 1,
      payload: { todont_id: 't1' },
    });
    await engine.emit(penalty);
    const r = await engine.emit(
      ev({ id: 'b', actor: 'u1', type: 'chat', ts: 2, payload: { todont_id: 't1' } }),
    );
    expect(r.escalations).toEqual([]);
    clock.set(2);
    expect(await engine.escalator('u1', 'sev', 't1')).toBe(1);
  });
});
