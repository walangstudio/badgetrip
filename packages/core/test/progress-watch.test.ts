import {
  type Event,
  defineAchievements,
  observe,
  rules,
  watchProgress,
} from '@walangstudio/badgetrip-core';
import { makeTestEngine } from '@walangstudio/badgetrip-testing';
import { describe, expect, it, vi } from 'vitest';

const ev = (id: string, actor = 'u', type = 'todo'): Event => ({
  id,
  actor,
  type,
  ts: 0,
  payload: {},
});

const setup = () => {
  const { engine } = makeTestEngine({
    achievements: defineAchievements({
      todo_5: { name: 'Five todos', description: '', when: rules.count('todo', 5) },
      one: { name: 'One', description: '', when: rules.count('todo', 1) },
      secret: { name: 'S', description: '', hidden: true, when: rules.count('todo', 3) },
    }),
  });
  return observe(engine);
};

describe('watchProgress', () => {
  it('reports locked achievements that moved, with where they came from', async () => {
    const observed = setup();
    const got: string[] = [];
    watchProgress(observed, { actor: 'u' }, (items) =>
      got.push(...items.map((i) => `${i.view.code}:${i.from}->${i.view.progress.current}`)),
    );
    await new Promise((r) => setTimeout(r));
    await observed.engine.emit(ev('1'));
    await vi.waitFor(() => expect(got).toEqual(['todo_5:0->1']));
    await observed.engine.emit(ev('2'));
    await vi.waitFor(() => expect(got).toEqual(['todo_5:0->1', 'todo_5:1->2']));
  });

  it('ignores other actors, unlocked and concealed achievements, and changes before it started', async () => {
    const observed = setup();
    await observed.engine.emit(ev('0'));
    const cb = vi.fn();
    watchProgress(observed, { actor: 'u' }, cb);
    await new Promise((r) => setTimeout(r));
    await observed.engine.emit(ev('x', 'someone-else'));
    await new Promise((r) => setTimeout(r, 10));
    expect(cb).not.toHaveBeenCalled();
    await observed.engine.emit(ev('1'));
    await vi.waitFor(() => expect(cb).toHaveBeenCalledOnce());
    expect(cb.mock.calls[0]?.[0].map((i: { view: { code: string } }) => i.view.code)).toEqual([
      'todo_5',
    ]);
  });

  it('folds changes that land while a query runs into one diff', async () => {
    const observed = setup();
    const got: string[] = [];
    watchProgress(observed, { actor: 'u' }, (items) =>
      got.push(...items.map((i) => `${i.from}->${i.view.progress.current}`)),
    );
    await new Promise((r) => setTimeout(r));
    await Promise.all([
      observed.engine.emit(ev('1')),
      observed.engine.emit(ev('2')),
      observed.engine.emit(ev('3')),
    ]);
    await vi.waitFor(() => expect(got.at(-1)).toMatch(/->3$/));
    const ranges = got.map((g) => g.split('->').map(Number));
    expect(ranges[0]?.[0]).toBe(0);
    for (let i = 1; i < ranges.length; i++) expect(ranges[i]?.[0]).toBe(ranges[i - 1]?.[1]);
  });

  it('stops after dispose and reports query errors to onError', async () => {
    const observed = setup();
    const cb = vi.fn();
    const onError = vi.fn();
    const stop = watchProgress(observed, { actor: 'u', onError }, cb);
    await new Promise((r) => setTimeout(r));
    vi.spyOn(observed.engine, 'catalog').mockRejectedValueOnce(new Error('db down'));
    await observed.engine.emit(ev('1'));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(new Error('db down')));
    stop();
    await observed.engine.emit(ev('2'));
    await new Promise((r) => setTimeout(r, 10));
    expect(cb).not.toHaveBeenCalled();
  });

  it('needs a non-empty actor', () => {
    const observed = setup();
    expect(() => watchProgress(observed, { actor: '' }, () => {})).toThrow(/actor/);
  });
});
