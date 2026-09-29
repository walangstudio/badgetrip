// @vitest-environment jsdom
import { createIconResolver } from '@walangstudio/badgetrip-assets';
import {
  createEngine,
  defineAchievements,
  memoryAchievementStore,
  memoryEventStore,
  memoryScoreStore,
  memoryStreakStore,
  observe,
  rules,
} from '@walangstudio/badgetrip-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineBadgetripElements } from '../src/index.js';

const makeObserved = () =>
  observe(
    createEngine({
      events: memoryEventStore(),
      scores: memoryScoreStore(),
      achievements: memoryAchievementStore(),
      streaks: memoryStreakStore(),
      clock: { now: () => 0 },
      definitions: {
        achievements: defineAchievements({
          first: {
            name: 'First',
            description: 'Win once',
            when: rules.count('win', 1),
          },
          spark: {
            name: 'Spark',
            description: 'Find it',
            icon: 'sparkle-animated',
            when: rules.count('find', 1),
          },
        }),
      },
    }),
  );

const win = (id: string, actor = 'u1') => ({
  id,
  actor,
  type: 'win',
  ts: 0,
  payload: {},
});

let n = 0;
const prefix = () => `gk${++n}`;

const mount = (html: string) => {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  return host.firstElementChild as HTMLElement;
};

const unlocked = (el: HTMLElement) =>
  [...el.querySelectorAll('figure')].map((f) => (f as HTMLElement).dataset.unlocked);

const setReducedMotion = (reduce: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: reduce && q.includes('reduce'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
};

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('defineBadgetripElements', () => {
  it('<catalog> renders the actor catalog and updates after emit', async () => {
    const observed = makeObserved();
    const p = prefix();
    defineBadgetripElements(observed, { tagPrefix: p });
    const el = mount(`<${p}-catalog actor="u1"></${p}-catalog>`);
    await vi.waitFor(() => expect(unlocked(el)).toEqual(['false', 'false']));
    expect(el.querySelector('div')?.style.display).toBe('grid');
    await observed.engine.emit(win('a'));
    await vi.waitFor(() => expect(unlocked(el)).toEqual(['true', 'false']));
  });

  it('<badge> renders one achievement and re-renders on attribute change', async () => {
    const observed = makeObserved();
    await observed.engine.emit(win('a', 'u2'));
    const p = prefix();
    defineBadgetripElements(observed, { tagPrefix: p });
    const el = mount(`<${p}-badge actor="u1" code="first"></${p}-badge>`);
    await vi.waitFor(() => expect(unlocked(el)).toEqual(['false']));
    expect(el.querySelector('strong')?.textContent).toBe('First');
    el.setAttribute('actor', 'u2');
    await vi.waitFor(() => expect(unlocked(el)).toEqual(['true']));
    el.setAttribute('code', 'spark');
    await vi.waitFor(() => expect(el.querySelector('strong')?.textContent).toBe('Spark'));
  });

  it('dispatches badgetrip-error for an unknown code', async () => {
    const observed = makeObserved();
    const p = prefix();
    defineBadgetripElements(observed, { tagPrefix: p });
    const onError = vi.fn();
    document.body.addEventListener('badgetrip-error', onError);
    mount(`<${p}-badge actor="u1" code="nope"></${p}-badge>`);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect((onError.mock.calls[0]?.[0] as CustomEvent).detail.message).toMatch(/nope/);
    document.body.removeEventListener('badgetrip-error', onError);
  });

  it('unsubscribes on disconnect', async () => {
    const observed = makeObserved();
    const real = observed.subscribe;
    const unsubscribe = vi.fn();
    const subscribe = vi.fn((cb: () => void) => {
      const off = real(cb);
      return () => {
        unsubscribe();
        off();
      };
    });
    observed.subscribe = subscribe;
    const p = prefix();
    defineBadgetripElements(observed, { tagPrefix: p });
    const el = mount(`<${p}-catalog actor="u1"></${p}-catalog>`);
    expect(subscribe).toHaveBeenCalledOnce();
    el.remove();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('stops re-rendering once disconnected', async () => {
    const observed = makeObserved();
    const p = prefix();
    defineBadgetripElements(observed, { tagPrefix: p });
    const el = mount(`<${p}-catalog actor="u1"></${p}-catalog>`);
    await vi.waitFor(() => expect(unlocked(el)).toEqual(['false', 'false']));
    el.remove();
    await observed.engine.emit(win('a'));
    await new Promise((r) => setTimeout(r, 10));
    expect(unlocked(el)).toEqual(['false', 'false']);
  });

  it('follows prefers-reduced-motion and custom icons', async () => {
    const observed = makeObserved();
    await observed.engine.emit({
      id: 'f',
      actor: 'u1',
      type: 'find',
      ts: 0,
      payload: {},
    });
    const icons = createIconResolver({
      overrides: { spark: { src: '/s.gif', still: '/s.png', animated: true } },
    });
    const p = prefix();
    defineBadgetripElements(observed, { tagPrefix: p, icons });
    const src = async () => {
      const el = mount(`<${p}-badge actor="u1" code="spark"></${p}-badge>`);
      await vi.waitFor(() => expect(el.querySelector('img')).not.toBeNull());
      const out = el.querySelector('img')?.getAttribute('src');
      el.remove();
      return out;
    };
    setReducedMotion(false);
    expect(await src()).toBe('/s.gif');
    setReducedMotion(true);
    expect(await src()).toBe('/s.png');
  });

  it('is safe to call twice', async () => {
    const observed = makeObserved();
    const p = prefix();
    defineBadgetripElements(observed, { tagPrefix: p });
    expect(() => defineBadgetripElements(makeObserved(), { tagPrefix: p })).not.toThrow();
    const el = mount(`<${p}-catalog actor="u1"></${p}-catalog>`);
    await observed.engine.emit(win('a'));
    await vi.waitFor(() => expect(unlocked(el)).toEqual(['true', 'false']));
  });

  it('uses the badgetrip prefix by default', () => {
    defineBadgetripElements(makeObserved());
    expect(customElements.get('badgetrip-catalog')).toBeDefined();
    expect(customElements.get('badgetrip-badge')).toBeDefined();
  });
});

describe('element review fixes', () => {
  it('accepts a plain engine, not only an Observable', async () => {
    const p = prefix();
    defineBadgetripElements(makeObserved().engine as never, { tagPrefix: p });
    const el = mount(`<${p}-catalog actor="u1"></${p}-catalog>`);
    await vi.waitFor(() => expect(unlocked(el)).toHaveLength(2));
  });

  it('badges for one actor share one catalog query per version', async () => {
    const observed = makeObserved();
    const spy = vi.spyOn(observed.engine, 'catalog');
    const p = prefix();
    defineBadgetripElements(observed, { tagPrefix: p });
    const host = document.createElement('div');
    host.innerHTML = [1, 2, 3]
      .map(() => `<${p}-badge actor="u1" code="first"></${p}-badge>`)
      .join('');
    document.body.append(host);
    await vi.waitFor(() => expect(host.querySelectorAll('figure')).toHaveLength(3));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('<catalog secret>', () => {
  it('leaves hidden achievements out and says how many remain', async () => {
    const observed = observe(
      createEngine({
        events: memoryEventStore(),
        scores: memoryScoreStore(),
        achievements: memoryAchievementStore(),
        streaks: memoryStreakStore(),
        clock: { now: () => 0 },
        definitions: {
          achievements: defineAchievements({
            first: { name: 'First', description: '', when: rules.count('win', 1) },
            shh: { name: 'Shh', description: '', hidden: true, when: rules.count('hush', 1) },
          }),
        },
      }),
    );
    const p = prefix();
    defineBadgetripElements(observed, { tagPrefix: p });
    const el = mount(`<${p}-catalog actor="u1" secret></${p}-catalog>`);
    await vi.waitFor(() =>
      expect(el.querySelector('[data-hidden-remaining]')?.textContent).toBe(
        '1 hidden achievement remaining',
      ),
    );
    expect(el.querySelectorAll('figure')).toHaveLength(1);
    el.removeAttribute('secret');
    await vi.waitFor(() => expect(el.querySelectorAll('figure')).toHaveLength(2));
    await observed.engine.emit({ id: 'h', actor: 'u1', type: 'hush', ts: 0, payload: {} });
    el.setAttribute('secret', '');
    await vi.waitFor(() => expect(el.querySelectorAll('figure')).toHaveLength(2));
    expect(el.querySelector('[data-hidden-remaining]')).toBeNull();
  });
});
