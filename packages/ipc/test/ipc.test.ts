import {
  type Engine,
  type Event,
  createEngine,
  fixedClock,
  memoryAchievementStore,
  memoryEventStore,
  memoryScoreStore,
  memoryStreakStore,
  observe,
} from '@walangstudio/badgetrip-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type RemoteEngine,
  type ServeOptions,
  type Transport,
  connectEngine,
  electronMainTransport,
  electronRendererTransport,
  messagePortTransport,
  serveEngine,
} from '../src/index.js';

const makeEngine = (): Engine =>
  createEngine({
    events: memoryEventStore(),
    scores: memoryScoreStore(),
    achievements: memoryAchievementStore(),
    streaks: memoryStreakStore(),
    clock: fixedClock(1000),
    definitions: {
      scores: ['xp'],
      points: [{ on: 'task.done', score: 'xp', delta: 10 }],
      achievements: [
        {
          code: 'first',
          name: 'First',
          description: 'Do a task',
          rarity: 1,
          rule: { kind: 'count', eventType: 'task.done', gte: 1 },
        },
        {
          code: 'rich',
          name: 'Rich',
          description: '20 xp',
          rarity: 2,
          rule: { kind: 'score', score: 'xp', gte: 20 },
        },
      ],
      streaks: [
        {
          code: 'daily',
          tickEvents: ['task.done'],
          resetEvents: ['task.miss'],
          scoping: 'per-actor',
        },
      ],
      tiers: [{ code: 'rank', score: 'xp', thresholds: [{ name: 'bronze', at: 10 }] }],
      leaderboards: [
        {
          code: 'top',
          source: { kind: 'score', score: 'xp' },
          window: 'all-time',
          limit: 5,
        },
      ],
      escalators: [
        {
          code: 'nag',
          triggerEvents: ['task.miss'],
          resetEvents: ['task.done'],
          min: 0,
          max: 3,
          step: 1,
        },
      ],
    },
  });

const ev = (id: string, actor = 'u1', type = 'task.done'): Event => ({
  id,
  actor,
  type,
  ts: 500,
  payload: {},
});

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

function pair(engine: Engine = makeEngine(), serve: ServeOptions = {}, timeoutMs?: number) {
  const { port1, port2 } = new MessageChannel();
  const stop = serveEngine(engine, messagePortTransport(port1), serve);
  const remote = connectEngine(messagePortTransport(port2), {
    timeoutMs: timeoutMs ?? 2000,
  });
  cleanups.push(() => {
    remote.dispose();
    stop();
    port1.close();
    port2.close();
  });
  return { engine, remote, port1, port2 };
}

const tick = () => new Promise((r) => setTimeout(r, 20));

describe('round trip over MessageChannel', () => {
  it('answers every default method like the local engine', async () => {
    const local = makeEngine();
    const { remote } = pair();
    for (const e of [ev('a'), ev('b'), ev('c', 'u1', 'task.miss')]) {
      expect(await remote.emit(e)).toEqual(await local.emit(e));
    }
    expect(await remote.refresh('u1')).toEqual(await local.refresh('u1'));
    expect(await remote.score('u1', 'xp')).toBe(20);
    expect(await remote.tier('u1', 'rank')).toEqual(await local.tier('u1', 'rank'));
    expect(await remote.leaderboard('top')).toEqual([{ actor: 'u1', value: 20 }]);
    expect(await remote.leaderboard('top', 2000)).toEqual(await local.leaderboard('top', 2000));
    expect(await remote.achievements('u1')).toEqual(await local.achievements('u1'));
    expect(await remote.streak('u1', 'daily')).toEqual(await local.streak('u1', 'daily'));
    expect(await remote.escalator('u1', 'nag')).toBe(1);
    expect(await remote.progress('u1', 'rich')).toEqual(await local.progress('u1', 'rich'));
    expect(await remote.catalog('u1')).toEqual(await local.catalog('u1'));
    expect(remote.engine.score).toBe(remote.score);
  });

  it('serves replay and seed only when allowlisted', async () => {
    const { remote } = pair(makeEngine(), {
      methods: ['replay', 'seed', 'score'],
    }) as unknown as {
      remote: RemoteEngine<'replay' | 'seed' | 'score'>;
    };
    expect(await remote.replay([ev('b'), ev('a')])).toHaveLength(2);
    await remote.seed({ scores: [{ actor: 'u2', score: 'xp', value: 7 }] });
    expect(await remote.score('u2', 'xp')).toBe(7);
  });
});

describe('security', () => {
  it('rejects seed and replay by default', async () => {
    const { remote } = pair() as unknown as {
      remote: RemoteEngine<'seed' | 'replay'>;
    };
    await expect(remote.seed({})).rejects.toMatchObject({
      name: 'MethodNotAllowed',
    });
    await expect(remote.replay([ev('a')])).rejects.toMatchObject({
      name: 'MethodNotAllowed',
    });
  });

  it('rejects methods outside the allowlist and never exposes definitions', async () => {
    const { port2 } = pair(makeEngine(), { methods: ['score'] });
    const replies: unknown[] = [];
    port2.addEventListener('message', (e) => replies.push(e.data));
    for (const method of ['emit', 'definitions', '__proto__', 'constructor', 'toString']) {
      port2.postMessage({ id: method, method, args: [] });
    }
    await tick();
    expect(replies).toHaveLength(5);
    for (const r of replies)
      expect(r).toMatchObject({
        ok: false,
        error: { name: 'MethodNotAllowed' },
      });
  });

  it('refuses an unknown method in the allowlist config', () => {
    const { port1 } = new MessageChannel();
    expect(() =>
      serveEngine(makeEngine(), messagePortTransport(port1), {
        methods: ['definitions' as never],
      }),
    ).toThrow(/unknown method/);
    port1.close();
  });

  it('ignores malformed messages and keeps serving', async () => {
    const { remote, port2 } = pair();
    const replies: unknown[] = [];
    port2.addEventListener('message', (e) => replies.push(e.data));
    for (const m of [
      null,
      'emit',
      42,
      [],
      {},
      { id: 1 },
      { id: 1, method: 'score' },
      { id: 1, method: 'score', args: 'u1' },
      { id: {}, method: 'score', args: [] },
      { method: 'score', args: ['u1', 'xp'] },
    ]) {
      port2.postMessage(m);
    }
    await tick();
    expect(replies).toEqual([]);
    expect(await remote.score('u1', 'xp')).toBe(0);
  });

  it('rejects wrong argument shapes before they reach the engine', async () => {
    const { remote } = pair();
    const r = remote as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
    await expect(r.score?.({ $ne: 1 }, 'xp')).rejects.toMatchObject({
      name: 'InvalidArguments',
    });
    await expect(r.score?.('u1', 'xp', 'extra')).rejects.toMatchObject({
      name: 'InvalidArguments',
    });
    await expect(r.emit?.('not-an-event')).rejects.toMatchObject({
      name: 'InvalidArguments',
    });
  });

  it('caps payload size', async () => {
    const { remote } = pair(makeEngine(), { maxPayloadSize: 200 });
    const big = { ...ev('big'), payload: { blob: 'x'.repeat(500) } };
    await expect(remote.emit(big)).rejects.toMatchObject({
      name: 'PayloadTooLarge',
    });
    expect(await remote.score('u1', 'xp')).toBe(0);
  });

  it('denies through the authorize hook', async () => {
    const seen: string[] = [];
    const { remote } = pair(makeEngine(), {
      authorize: (method, args) => {
        seen.push(method);
        return method !== 'emit' || (args[0] as Event).actor === 'u1';
      },
    });
    await expect(remote.emit(ev('x', 'u2'))).rejects.toMatchObject({
      name: 'Forbidden',
      message: 'not authorized: emit',
    });
    expect((await remote.emit(ev('y'))).unlocked).toEqual(['first']);
    expect(await remote.score('u2', 'xp')).toBe(0);
    expect(seen).toEqual(['emit', 'emit', 'score']);
  });
});

describe('errors', () => {
  it('reconstructs engine errors with name and message, no stack', async () => {
    const { remote } = pair();
    const err = await remote.tier('u1', 'nope').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({ name: 'Error', message: 'unknown tier: nope' });
    const bad = await remote.emit({ ...ev('z'), ts: Number.NaN }).catch((e: unknown) => e);
    expect(bad).toBeInstanceOf(Error);
    expect((bad as Error).name).toMatch(/Error/);
  });
});

describe('change notifications', () => {
  it('bumps the version before emit and refresh resolve, not on reads', async () => {
    const { remote } = pair();
    let calls = 0;
    const off = remote.subscribe(() => calls++);
    await remote.emit(ev('a'));
    expect(remote.getVersion()).toBe(1);
    await remote.refresh('u1');
    expect(remote.getVersion()).toBe(2);
    await remote.score('u1', 'xp');
    await tick();
    expect(remote.getVersion()).toBe(2);
    expect(calls).toBe(2);
    off();
    await remote.emit(ev('b'));
    expect(calls).toBe(2);
  });

  it('forwards changes made locally through a shared ObservedEngine', async () => {
    const observed = observe(makeEngine());
    const { port1, port2 } = new MessageChannel();
    const stop = serveEngine(observed, messagePortTransport(port1));
    const remote = connectEngine(messagePortTransport(port2));
    cleanups.push(() => {
      remote.dispose();
      stop();
      port1.close();
      port2.close();
    });
    await observed.engine.emit(ev('local'));
    await tick();
    expect(remote.getVersion()).toBe(1);
    expect(await remote.score('u1', 'xp')).toBe(10);
  });
});

describe('lifecycle', () => {
  const silent = (): Transport => ({
    send: () => {},
    onMessage: () => () => {},
  });

  it('times out with a clear error', async () => {
    const remote = connectEngine(silent(), { timeoutMs: 30 });
    await expect(remote.score('u1', 'xp')).rejects.toMatchObject({
      name: 'TimeoutError',
      message: 'badgetrip ipc: score timed out after 30ms',
    });
  });

  it('dispose rejects pending calls and later calls', async () => {
    const remote = connectEngine(silent(), { timeoutMs: 60000 });
    const p = remote.catalog('u1');
    remote.dispose();
    await expect(p).rejects.toMatchObject({ name: 'DisposedError' });
    await expect(remote.score('u1', 'xp')).rejects.toMatchObject({
      name: 'DisposedError',
    });
  });

  it('server dispose stops answering', async () => {
    const { port1, port2 } = new MessageChannel();
    const stop = serveEngine(makeEngine(), messagePortTransport(port1));
    const remote = connectEngine(messagePortTransport(port2), {
      timeoutMs: 50,
    });
    cleanups.push(() => {
      remote.dispose();
      port1.close();
      port2.close();
    });
    stop();
    await expect(remote.score('u1', 'xp')).rejects.toMatchObject({
      name: 'TimeoutError',
    });
  });

  it('rejects a call whose args cannot be sent', async () => {
    const { remote } = pair();
    const r = remote as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
    await expect(r.score?.(() => {}, 'xp')).rejects.toBeInstanceOf(Error);
  });
});

describe('electron transports', () => {
  it('round-trips through fake ipcMain/ipcRenderer and filters other senders', async () => {
    type L = (event: unknown, msg: unknown) => void;
    const main = new Map<string, Set<L>>();
    const renderer = new Map<string, Set<L>>();
    const on = (m: Map<string, Set<L>>) => (ch: string, l: L) => {
      if (!m.has(ch)) m.set(ch, new Set());
      m.get(ch)?.add(l);
    };
    const off = (m: Map<string, Set<L>>) => (ch: string, l: L) => m.get(ch)?.delete(l);
    const fire = (m: Map<string, Set<L>>, ch: string, event: unknown, msg: unknown) =>
      queueMicrotask(() => {
        for (const l of m.get(ch) ?? []) l(event, msg);
      });

    const webContents = {
      send: (ch: string, msg: unknown) => fire(renderer, ch, { sender: 'ipcRenderer' }, msg),
    };
    const ipcMain = { on: on(main), removeListener: off(main) };
    const ipcRenderer = {
      send: (ch: string, msg: unknown) => fire(main, ch, { sender: webContents }, msg),
      on: on(renderer),
      removeListener: off(renderer),
    };

    const stop = serveEngine(
      makeEngine(),
      electronMainTransport(ipcMain as Parameters<typeof electronMainTransport>[0], webContents),
    );
    const remote = connectEngine(electronRendererTransport(ipcRenderer), {
      timeoutMs: 200,
    });
    cleanups.push(() => {
      remote.dispose();
      stop();
    });

    const seen: unknown[] = [];
    remote.subscribe(() => seen.push('changed'));
    expect((await remote.emit(ev('a'))).unlocked).toEqual(['first']);
    expect(await remote.score('u1', 'xp')).toBe(10);
    expect(seen).toEqual(['changed']);

    fire(main, 'badgetrip', { sender: {} }, { id: 999, method: 'score', args: ['u1', 'xp'] });
    const stray: unknown[] = [];
    renderer.get('badgetrip')?.add((_e, m) => stray.push(m));
    await tick();
    expect(stray).toEqual([]);

    stop();
    remote.dispose();
    expect(main.get('badgetrip')?.size).toBe(0);
    expect(renderer.get('badgetrip')?.size).toBe(1);
  });
});

describe('ipc review fixes', () => {
  // A broadcast channel: every message reaches every other endpoint, like ipcRenderer.
  function bus() {
    const ends: ((m: unknown) => void)[][] = [];
    const endpoint = (): Transport => {
      const mine: ((m: unknown) => void)[] = [];
      ends.push(mine);
      return {
        send: (m) => {
          const copy = JSON.parse(JSON.stringify(m));
          for (const e of ends) if (e !== mine) for (const cb of e) queueMicrotask(() => cb(copy));
        },
        onMessage: (cb) => {
          mine.push(cb);
          return () => mine.splice(mine.indexOf(cb), 1);
        },
      };
    };
    return endpoint;
  }

  it('two clients on one shared channel never resolve each other’s calls', async () => {
    const endpoint = bus();
    const engine = makeEngine();
    await engine.emit({
      id: 'e',
      actor: 'u1',
      type: 'task.done',
      ts: 1,
      payload: {},
    });
    const stop = serveEngine(engine, endpoint());
    const a = connectEngine(endpoint());
    const b = connectEngine(endpoint());
    // Both clients' first calls race, so without per-client ids they would collide.
    const [score, list] = await Promise.all([a.score('u1', 'xp'), b.achievements('u1')]);
    expect(score).toBe(10);
    expect(list).toEqual([{ code: 'first', at: 1 }]);
    a.dispose();
    b.dispose();
    stop();
  });

  it('servers on the same engine share change notifications', async () => {
    const engine = makeEngine();
    const c1 = new MessageChannel();
    const c2 = new MessageChannel();
    const stop1 = serveEngine(engine, messagePortTransport(c1.port1));
    const stop2 = serveEngine(engine, messagePortTransport(c2.port1));
    const r1 = connectEngine(messagePortTransport(c1.port2));
    const r2 = connectEngine(messagePortTransport(c2.port2));
    let seen = 0;
    r2.subscribe(() => seen++);
    await r1.emit({
      id: 'e',
      actor: 'u1',
      type: 'task.done',
      ts: 1,
      payload: {},
    });
    await new Promise((res) => setTimeout(res, 20));
    expect(seen).toBe(1);
    for (const d of [() => r1.dispose(), () => r2.dispose(), stop1, stop2]) d();
    for (const p of [c1.port1, c1.port2, c2.port1, c2.port2]) p.close();
  });

  it('accepts a repeated version after a server restart', async () => {
    let deliver: (m: unknown) => void = () => {};
    const client = connectEngine({
      send: () => {},
      onMessage: (cb) => {
        deliver = cb;
        return () => {};
      },
    });
    let seen = 0;
    client.subscribe(() => seen++);
    deliver({ type: 'changed', version: 1 });
    deliver({ type: 'changed', version: 1 });
    expect(seen).toBe(2);
    client.dispose();
  });
});

describe('serveEngine error paths', () => {
  function fakeTransport(sendImpl: (msg: unknown) => void = () => {}) {
    let listener: ((m: unknown) => void) | undefined;
    const sent: unknown[] = [];
    const transport: Transport = {
      send: (m) => {
        sendImpl(m);
        sent.push(m);
      },
      onMessage: (l) => {
        listener = l;
        return () => {
          listener = undefined;
        };
      },
    };
    return { transport, sent, deliver: (m: unknown) => listener?.(m) };
  }

  it('treats args that cannot be serialized as too large', async () => {
    const t = fakeTransport();
    cleanups.push(serveEngine(makeEngine(), t.transport));
    t.deliver({ id: 1, method: 'emit', args: [{ ...ev('a'), payload: { n: 1n } }] });
    await tick();
    expect(t.sent).toContainEqual({
      id: 1,
      ok: false,
      error: { name: 'PayloadTooLarge', message: 'payload for emit exceeds 65536' },
    });
  });

  it('turns an unsendable result into an error reply', async () => {
    const t = fakeTransport((m) => {
      if ((m as { ok?: boolean }).ok === true) throw new Error('could not be cloned');
    });
    cleanups.push(serveEngine(makeEngine(), t.transport));
    t.deliver({ id: 2, method: 'score', args: ['u1', 'xp'] });
    await tick();
    expect(t.sent).toEqual([
      { id: 2, ok: false, error: { name: 'Error', message: 'could not be cloned' } },
    ]);
  });

  it('sends a non-Error rejection as a plain message', async () => {
    const t = fakeTransport();
    cleanups.push(
      serveEngine(makeEngine(), t.transport, {
        authorize: () => {
          throw 'nope';
        },
      }),
    );
    t.deliver({ id: 3, method: 'score', args: ['u1', 'xp'] });
    await tick();
    expect(t.sent).toEqual([{ id: 3, ok: false, error: { name: 'Error', message: 'nope' } }]);
  });
});

describe('connectEngine edge cases', () => {
  function capture() {
    let listener: ((m: unknown) => void) | undefined;
    const sent: { id: string }[] = [];
    const transport: Transport = {
      send: (m) => sent.push(m as { id: string }),
      onMessage: (l) => {
        listener = l;
        return () => {
          listener = undefined;
        };
      },
    };
    return { transport, sent, deliver: (m: unknown) => listener?.(m) };
  }

  it('still gives each client unique ids without crypto.randomUUID (older Hermes)', () => {
    vi.stubGlobal('crypto', undefined);
    try {
      const a = capture();
      const b = capture();
      const ra = connectEngine(a.transport, { timeoutMs: Number.POSITIVE_INFINITY });
      const rb = connectEngine(b.transport, { timeoutMs: Number.POSITIVE_INFINITY });
      cleanups.push(ra.dispose, rb.dispose);
      void ra.score('u', 'xp').catch(() => {});
      void rb.score('u', 'xp').catch(() => {});
      expect(a.sent[0]?.id).not.toBe(b.sent[0]?.id);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('times out after 10 seconds by default', async () => {
    vi.useFakeTimers();
    try {
      const remote = connectEngine(capture().transport);
      cleanups.push(remote.dispose);
      const p = remote.score('u', 'xp');
      const settled = vi.fn();
      p.catch(settled);
      await vi.advanceTimersByTimeAsync(9_999);
      expect(settled).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await expect(p).rejects.toMatchObject({ name: 'TimeoutError' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects with a generic error when the error reply is malformed', async () => {
    const c = capture();
    const remote = connectEngine(c.transport);
    cleanups.push(remote.dispose);
    const p = remote.score('u', 'xp');
    c.deliver({ id: c.sent[0]?.id, ok: false, error: 'boom' });
    await expect(p).rejects.toMatchObject({ name: 'Error', message: 'remote call failed' });
  });
});
