import { describe, expect, it } from 'vitest';
import { idFactory, makeEvent, makeTestEngine, steppableClock, time } from '../src/index.js';

describe('testing helpers', () => {
  it('steppableClock only moves when told to', () => {
    const clock = steppableClock(5);
    expect(clock.now()).toBe(5);
    clock.advance(time.HOUR);
    expect(clock.now()).toBe(5 + time.HOUR);
    clock.set(0);
    expect(clock.now()).toBe(0);
  });

  it('idFactory returns ordered ids per prefix', () => {
    const next = idFactory('x');
    const ids = [next(), next(), next()];
    expect(ids[0]).toBe('x_000000000000');
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(3);
  });

  it('makeEvent fills defaults and keeps what you pass', () => {
    expect(makeEvent({ actor: 'u', type: 't' })).toEqual({
      id: 't:u:0',
      actor: 'u',
      type: 't',
      ts: 0,
      payload: {},
    });
    expect(makeEvent({ id: 'e', actor: 'u', type: 't', ts: 9, payload: { a: 1 } })).toEqual({
      id: 'e',
      actor: 'u',
      type: 't',
      ts: 9,
      payload: { a: 1 },
    });
  });

  it('makeTestEngine wires a working engine to the clock it returns', async () => {
    const { engine, clock } = makeTestEngine({
      scores: ['xp'],
      points: [{ on: 't', score: 'xp', delta: 3 }],
    });
    await engine.emit(makeEvent({ actor: 'u', type: 't', ts: clock.now() }));
    expect(await engine.score('u', 'xp')).toBe(3);
  });
});
