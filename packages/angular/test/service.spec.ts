import { ErrorHandler, Injector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BadgetripService, provideBadgetrip } from '@badgetrip/angular';
import {
  type Engine,
  createEngine,
  memoryAchievementStore,
  memoryEventStore,
  memoryScoreStore,
  memoryStreakStore,
} from '@badgetrip/core';
import { connectEngine, messagePortTransport, serveEngine } from '@badgetrip/ipc';
import { describe, expect, it, vi } from 'vitest';

function makeEngine(): Engine {
  return createEngine({
    events: memoryEventStore(),
    scores: memoryScoreStore(),
    achievements: memoryAchievementStore(),
    streaks: memoryStreakStore(),
    clock: { now: () => 0 },
    definitions: {
      scores: ['honor'],
      points: [{ on: 'win', score: 'honor', delta: 2 }],
      tiers: [
        {
          code: 'rank',
          score: 'honor',
          thresholds: [{ name: 'bronze', at: 2 }],
        },
      ],
      leaderboards: [{ code: 'top', score: 'honor', window: 'all-time', limit: 5 }],
      streaks: [
        {
          code: 'daily',
          resetEvents: ['miss'],
          tickEvents: ['win'],
          scoping: 'per-actor',
        },
      ],
      escalators: [
        {
          code: 'heat',
          triggerEvents: ['win'],
          resetEvents: ['miss'],
          min: 0,
          max: 3,
          step: 1,
        },
      ],
      achievements: [
        {
          code: 'first_win',
          name: 'First Win',
          description: '',
          rarity: 1,
          rule: { kind: 'count', eventType: 'win', gte: 1 },
        },
      ],
    },
  });
}

const win = (id: string, actor = 'u1') => ({
  id,
  actor,
  type: 'win',
  ts: 0,
  payload: {},
});

function setup(engine: Parameters<typeof provideBadgetrip>[0] = makeEngine()) {
  const handleError = vi.fn();
  TestBed.configureTestingModule({
    providers: [provideBadgetrip(engine), { provide: ErrorHandler, useValue: { handleError } }],
  });
  const gk = TestBed.inject(BadgetripService);
  const inCtx = <T>(fn: () => T) => TestBed.runInInjectionContext(fn);
  return { gk, handleError, inCtx };
}

const settled = (check: () => void) =>
  vi.waitFor(() => {
    TestBed.tick();
    check();
  });

describe('BadgetripService', () => {
  it('query signals update after an emit through service.engine', async () => {
    const { gk, inCtx } = setup();
    const q = inCtx(() => ({
      score: gk.score('u1', 'honor'),
      achievements: gk.achievements('u1'),
      catalog: gk.catalog('u1'),
      progress: gk.progress('u1', 'first_win'),
      board: gk.leaderboard('top'),
      streak: gk.streak('u1', 'daily'),
      tier: gk.tier('u1', 'rank'),
      heat: gk.escalator('u1', 'heat'),
    }));
    expect(q.score()).toBe(0);
    expect(q.tier()).toBeNull();
    await settled(() => expect(q.catalog()).toHaveLength(1));

    await gk.engine.emit(win('a'));
    await settled(() => {
      expect(q.score()).toBe(2);
      expect(q.achievements().map((a) => a.code)).toEqual(['first_win']);
      expect(q.catalog()[0]?.unlocked).toBe(true);
      expect(q.progress().percent).toBe(100);
      expect(q.board()).toEqual([{ actor: 'u1', value: 2 }]);
      expect(q.streak().current).toBe(1);
      expect(q.tier()?.current).toBe('bronze');
      expect(q.heat()).toBe(1);
    });
  });

  it('re-queries when a signal argument changes', async () => {
    const engine = makeEngine();
    await engine.emit(win('b', 'u2'));
    const { gk, inCtx } = setup(engine);
    const actor = signal('u1');
    const score = inCtx(() => gk.score(actor, 'honor'));
    await settled(() => expect(score()).toBe(0));
    actor.set('u2');
    await settled(() => expect(score()).toBe(2));
  });

  it('drops a stale result when the argument changes mid-flight', async () => {
    const engine = makeEngine();
    await engine.emit(win('b', 'u2'));
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const score = engine.score;
    engine.score = async (actor, code) => {
      if (actor === 'u1') await gate;
      return score(actor, code);
    };
    const { gk, inCtx } = setup(engine);
    const actor = signal('u1');
    const q = inCtx(() => gk.score(actor, 'honor'));
    TestBed.tick();
    actor.set('u2');
    await settled(() => expect(q()).toBe(2));
    release();
    await gate;
    await new Promise((r) => setTimeout(r));
    expect(q()).toBe(2);
  });

  it('exposes a rejected query on .error and reports it to ErrorHandler', async () => {
    const { gk, handleError, inCtx } = setup();
    const board = inCtx(() => gk.leaderboard('missing'));
    await settled(() => expect(handleError).toHaveBeenCalledTimes(1));
    expect(String(board.error())).toMatch(/unknown leaderboard: missing/);
    expect(board()).toEqual([]);
  });

  it('keeps the last good value when a later query fails', async () => {
    const engine = makeEngine();
    const score = engine.score;
    let fail = false;
    engine.score = async (actor, code) => {
      if (fail) throw new Error('db down');
      return score(actor, code);
    };
    const { gk, handleError, inCtx } = setup(engine);
    const q = inCtx(() => gk.score('u1', 'honor'));
    await gk.engine.emit(win('a'));
    await settled(() => expect(q()).toBe(2));
    fail = true;
    await gk.engine.emit(win('b'));
    await settled(() => expect(handleError).toHaveBeenCalledTimes(1));
    expect(q()).toBe(2);
    expect(String(q.error())).toMatch(/db down/);
  });

  it('works with an @badgetrip/ipc remote engine', async () => {
    const { port1, port2 } = new MessageChannel();
    const stop = serveEngine(makeEngine(), messagePortTransport(port1));
    const remote = connectEngine(messagePortTransport(port2));
    try {
      const { gk, inCtx } = setup(remote);
      const q = inCtx(() => gk.score('u1', 'honor'));
      await settled(() => expect(q()).toBe(0));
      await remote.engine.emit(win('a'));
      await settled(() => expect(q()).toBe(2));
    } finally {
      remote.dispose();
      stop();
      port1.close();
      port2.close();
    }
  });

  it('needs an injection context unless an injector is passed', () => {
    const { gk } = setup();
    expect(() => gk.score('u1', 'honor')).toThrow(/injection context/);
    expect(gk.score('u1', 'honor', { injector: TestBed.inject(Injector) })()).toBe(0);
  });

  it('stops listening to the engine once its injector is destroyed', async () => {
    const { gk, inCtx } = setup();
    const score = inCtx(() => gk.score('u1', 'honor'));
    TestBed.resetTestingModule();
    await gk.engine.emit(win('a'));
    await new Promise((r) => setTimeout(r));
    expect(score()).toBe(0);
  });

  it('throws a clear error without provideBadgetrip', () => {
    expect(() => TestBed.inject(BadgetripService)).toThrow(/provideBadgetrip/);
  });
});
