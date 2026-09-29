import {
  type AchievementView,
  type Engine,
  type Event,
  type Observable,
  type Unlock,
  defineAchievements,
  observe,
  rules,
  splitConcealed,
  watchUnlocks,
} from '@badgetrip/core';
import { makeTestEngine } from '@badgetrip/testing';
import { describe, expect, it, vi } from 'vitest';

const ev = (id: string, actor = 'u', type = 'win'): Event => ({
  id,
  actor,
  type,
  ts: 0,
  payload: {},
});

const defs = () => ({
  scores: ['xp'],
  points: [{ on: 'win', score: 'xp', delta: 10 }],
  achievements: defineAchievements({
    first: { name: 'First', description: 'Win once', when: rules.count('win', 1) },
    rich: {
      name: 'Rich ({tier})',
      description: '{n} xp',
      when: rules.score('xp'),
      tiers: { bronze: 10, silver: 20, gold: { at: 30, celebration: 'epic' } },
    },
    secret: {
      name: 'Secret',
      description: 'Found it',
      hidden: true,
      celebration: 'modal',
      when: rules.count('find', 1),
    },
  }),
});

function setup(d = defs()) {
  const { engine } = makeTestEngine(d);
  const observed = observe(engine);
  const batches: Unlock[][] = [];
  observed.onUnlock?.((u) => batches.push([...u]));
  return { engine, observed, batches };
}

describe('onUnlock', () => {
  it('fires one batch per emit that unlocks, after change listeners see the new version', async () => {
    const { observed } = setup();
    const order: string[] = [];
    observed.subscribe(() => order.push(`change v${observed.getVersion()}`));
    observed.onUnlock?.((u) =>
      order.push(`unlock ${u.map((x) => x.code).join(',')} v${observed.getVersion()}`),
    );
    await observed.engine.emit(ev('a'));
    expect(order).toEqual(['change v1', 'unlock first,rich.bronze v1']);
  });

  it('reports a tier jump as one batch in definition order', async () => {
    const { observed, batches } = setup({
      ...defs(),
      points: [{ on: 'win', score: 'xp', delta: 30 }],
    });
    await observed.engine.emit(ev('a'));
    expect(batches).toEqual([
      [
        { actor: 'u', code: 'first' },
        { actor: 'u', code: 'rich.bronze' },
        { actor: 'u', code: 'rich.silver' },
        { actor: 'u', code: 'rich.gold' },
      ],
    ]);
  });

  it('stays silent for a re-emitted id, an emit that unlocks nothing, and a failed emit', async () => {
    const { observed, batches } = setup();
    await observed.engine.emit(ev('a'));
    await observed.engine.emit(ev('a'));
    await observed.engine.emit(ev('b', 'u', 'noop'));
    await expect(observed.engine.emit({ ...ev('c'), actor: '' })).rejects.toThrow();
    expect(batches).toHaveLength(1);
  });

  it('fires for refresh but never for replay, seed, or calls on the raw engine', async () => {
    const d = defs();
    const { engine, observed, batches } = setup(d);
    await engine.emit(ev('raw'));
    await observed.engine.replay([ev('r1', 'v'), ev('r2', 'v')]);
    await observed.engine.seed({ achievements: [{ actor: 'w', code: 'first', at: 0 }] });
    expect(batches).toEqual([]);
    const { engine: other } = makeTestEngine(d);
    await other.seed({ scores: [{ actor: 'z', score: 'xp', value: 10 }] });
    const o2 = observe(other);
    const got: Unlock[][] = [];
    o2.onUnlock?.((u) => got.push([...u]));
    expect(await o2.engine.refresh('z')).toEqual(['rich.bronze']);
    expect(got).toEqual([[{ actor: 'z', code: 'rich.bronze' }]]);
  });

  it('isolates a throwing listener, shares one stream per engine, and unsubscribes', async () => {
    const { engine } = makeTestEngine(defs());
    const a = observe(engine);
    const b = observe(engine);
    expect(a).toBe(b);
    const thrown = vi.fn();
    const onError = (e: PromiseRejectionEvent | Error) => thrown(e);
    process.on('uncaughtException', onError);
    const seen = vi.fn();
    const off = a.onUnlock?.(() => {
      throw new Error('boom');
    });
    b.onUnlock?.(seen);
    await a.engine.emit(ev('a'));
    await new Promise((r) => setTimeout(r));
    process.off('uncaughtException', onError);
    expect(seen).toHaveBeenCalledOnce();
    off?.();
    await a.engine.emit(ev('b', 'u2'));
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('keeps each actor batch intact under concurrent emits', async () => {
    const { observed, batches } = setup();
    await Promise.all([observed.engine.emit(ev('a', 'x')), observed.engine.emit(ev('b', 'y'))]);
    expect(batches.map((b) => b.map((u) => `${u.actor}:${u.code}`)).sort()).toEqual([
      ['x:first', 'x:rich.bronze'],
      ['y:first', 'y:rich.bronze'],
    ]);
  });
});

describe('celebration key', () => {
  it('passes through defineAchievements, with a tier value winning', () => {
    const d = defs().achievements;
    expect(d.find((a) => a.code === 'rich.silver')?.celebration).toBeUndefined();
    expect(d.find((a) => a.code === 'rich.gold')?.celebration).toBe('epic');
    expect(d.find((a) => a.code === 'secret')?.celebration).toBe('modal');
    const spec = defineAchievements({
      t: {
        name: '',
        description: '',
        celebration: 'toast',
        when: rules.count('x'),
        tiers: { a: 1, b: { at: 2, celebration: 'epic' } },
      },
    });
    expect(spec.map((a) => a.celebration)).toEqual(['toast', 'epic']);
  });

  it('is rejected by createEngine unless a non-empty string', () => {
    const bad = (celebration: unknown) =>
      makeTestEngine({
        achievements: [
          {
            code: 'a',
            name: '',
            description: '',
            rarity: 1,
            rule: { kind: 'count', eventType: 'x', gte: 1 },
            celebration: celebration as string,
          },
        ],
      });
    expect(() => bad('')).toThrow(/celebration/);
    expect(() => bad(3)).toThrow(/celebration/);
    expect(() => bad('epic')).not.toThrow();
  });

  it('is withheld from a concealed view and shown, with hidden: true, once unlocked', async () => {
    const { observed } = setup();
    const before = (await observed.engine.catalog('u')).find((a) => a.code === 'secret');
    expect(before?.concealed).toBe(true);
    expect(before).not.toHaveProperty('celebration');
    expect(before).not.toHaveProperty('hidden');
    await observed.engine.emit(ev('f', 'u', 'find'));
    const after = (await observed.engine.catalog('u')).find((a) => a.code === 'secret');
    expect(after).toMatchObject({
      name: 'Secret',
      celebration: 'modal',
      hidden: true,
      concealed: false,
    });
    const gold = (await observed.engine.catalog('u')).find((a) => a.code === 'rich.gold');
    expect(gold?.celebration).toBe('epic');
    expect(gold).not.toHaveProperty('hidden');
  });
});

describe('watchUnlocks', () => {
  it('resolves each batch to views in definition order, filtered by actor', async () => {
    const { observed } = setup({ ...defs(), points: [{ on: 'win', score: 'xp', delta: 20 }] });
    const got: string[][] = [];
    watchUnlocks(observed, { actor: 'u' }, (items) =>
      got.push(items.map((i) => `${i.actor}:${i.view.code}:${i.view.unlocked}`)),
    );
    await observed.engine.emit(ev('a', 'other'));
    await observed.engine.emit(ev('b', 'u'));
    await vi.waitFor(() => expect(got).toHaveLength(1));
    expect(got[0]).toEqual(['u:first:true', 'u:rich.bronze:true', 'u:rich.silver:true']);
  });

  it('takes a predicate for actor, and queries the catalog once per actor per batch', async () => {
    const { observed } = setup();
    const catalog = vi.spyOn(observed.engine, 'catalog');
    const got: string[] = [];
    watchUnlocks(observed, { actor: (a) => a.startsWith('p') }, (items) =>
      got.push(...items.map((i) => `${i.actor}:${i.view.code}`)),
    );
    await observed.engine.emit(ev('a', 'p1'));
    await observed.engine.emit(ev('b', 'q1'));
    await vi.waitFor(() => expect(got).toEqual(['p1:first', 'p1:rich.bronze']));
    expect(catalog).toHaveBeenCalledTimes(1);
  });

  it('delivers batches in arrival order even when catalog calls resolve out of order', async () => {
    const listeners = new Set<(u: readonly Unlock[]) => void>();
    const gates: ((v: AchievementView[]) => void)[] = [];
    const view = (code: string): AchievementView => ({
      code,
      name: code,
      description: '',
      rarity: 1,
      points: 0,
      unlocked: true,
      concealed: false,
      progress: { current: 1, target: 1, percent: 100 },
    });
    const source = {
      engine: { catalog: () => new Promise<AchievementView[]>((r) => gates.push(r)) },
      subscribe: () => () => {},
      getVersion: () => 0,
      onUnlock: (cb: (u: readonly Unlock[]) => void) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
    } as unknown as Observable;
    const got: string[] = [];
    watchUnlocks(source, {}, (items) => got.push(...items.map((i) => i.view.code)));
    for (const l of listeners) l([{ actor: 'u', code: 'one' }]);
    for (const l of listeners)
      l([
        { actor: 'u', code: 'two' },
        { actor: 'u', code: 'ghost' },
      ]);
    await vi.waitFor(() => expect(gates).toHaveLength(1));
    gates[0]?.([view('one'), view('two')]);
    await vi.waitFor(() => expect(gates).toHaveLength(2));
    gates[1]?.([view('one'), view('two')]);
    await vi.waitFor(() => expect(got).toEqual(['one', 'two']));
  });

  it('stops after dispose, even mid-query, and reports catalog errors to onError', async () => {
    const { observed } = setup();
    const cb = vi.fn();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const catalog = observed.engine.catalog;
    const spy = vi.spyOn(observed.engine, 'catalog').mockImplementation(async (a) => {
      await gate;
      return catalog(a);
    });
    const stop = watchUnlocks(observed, {}, cb);
    await observed.engine.emit(ev('a'));
    await vi.waitFor(() => expect(spy).toHaveBeenCalled());
    stop();
    release();
    await new Promise((r) => setTimeout(r, 10));
    expect(cb).not.toHaveBeenCalled();
    spy.mockRestore();

    const onError = vi.fn();
    vi.spyOn(observed.engine, 'catalog').mockRejectedValueOnce(new Error('db down'));
    watchUnlocks(observed, { onError }, cb);
    await observed.engine.emit(ev('b', 'u2'));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(new Error('db down')));
    expect(cb).not.toHaveBeenCalled();
  });

  it('rejects a source without onUnlock and a bad actor option', () => {
    const plain = {
      engine: {} as Engine,
      subscribe: () => () => {},
      getVersion: () => 0,
    } as unknown as Observable;
    expect(() => watchUnlocks(plain, {}, () => {})).toThrow(/onUnlock/);
    const { observed } = setup();
    expect(() => watchUnlocks(observed, { actor: 3 as never }, () => {})).toThrow(/actor/);
  });
});

describe('splitConcealed', () => {
  it('drops concealed views and counts them, keeping order', async () => {
    const { observed } = setup();
    const views = await observed.engine.catalog('u');
    const { views: shown, hiddenRemaining } = splitConcealed(views);
    expect(hiddenRemaining).toBe(1);
    expect(shown.map((v) => v.code)).toEqual(['first', 'rich.bronze', 'rich.silver', 'rich.gold']);
    expect(splitConcealed([])).toEqual({ views: [], hiddenRemaining: 0 });
  });
});

describe('watchUnlocks default error handling', () => {
  it('rethrows asynchronously when no onError is given', async () => {
    const { observed } = setup();
    let later: (() => void) | undefined;
    const spy = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((cb) => {
      later = cb;
    });
    vi.spyOn(observed.engine, 'catalog').mockRejectedValueOnce(new Error('db down'));
    watchUnlocks(observed, {}, () => {});
    await observed.engine.emit(ev('a'));
    await vi.waitFor(() => expect(later).toBeDefined());
    spy.mockRestore();
    expect(() => later?.()).toThrow('db down');
  });
});

describe('watchUnlocks with a throwing onError', () => {
  it('keeps delivering later batches', async () => {
    const { observed } = setup();
    let later: (() => void) | undefined;
    const micro = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((cb) => {
      later = cb;
    });
    vi.spyOn(observed.engine, 'catalog').mockRejectedValueOnce(new Error('db down'));
    const got: string[] = [];
    watchUnlocks(
      observed,
      {
        onError: () => {
          throw new Error('handler broke');
        },
      },
      (items) => got.push(...items.map((i) => i.view.code)),
    );
    await observed.engine.emit(ev('a', 'x'));
    await vi.waitFor(() => expect(later).toBeDefined());
    micro.mockRestore();
    expect(() => later?.()).toThrow('handler broke');
    await observed.engine.emit(ev('b', 'y'));
    await vi.waitFor(() => expect(got).toEqual(['first', 'rich.bronze']));
  });
});
