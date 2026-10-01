// @vitest-environment jsdom
import { defineTheme, themes } from '@walangstudio/badgetrip-assets';
import {
  type AchievementView,
  defineAchievements,
  observe,
  rules,
} from '@walangstudio/badgetrip-core';
import { makeTestEngine } from '@walangstudio/badgetrip-testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type Notifier,
  applyTheme,
  createNotifier,
  defineBadgetripElements,
  renderBadge,
} from '../src/index.js';

const view = (over: Partial<AchievementView> = {}): AchievementView => ({
  code: 'a',
  name: 'Alpha',
  description: '',
  rarity: 1,
  points: 0,
  unlocked: false,
  concealed: false,
  progress: { current: 1, target: 3, percent: 33 },
  ...over,
});

const neon = defineTheme({
  name: 'neon',
  style: { accent: '#ff2bd6', bg: '#14002b', locked: { opacity: 0.2 } },
  icons: { overrides: { a: { src: '/neon-a.png' } } },
  celebrations: { default: { position: 'bottom-left' } },
});
const plain = defineTheme({ name: 'plain', style: { bg: '#fff' } });

const engine = () =>
  makeTestEngine({
    achievements: defineAchievements({
      a: { name: 'Alpha', description: '', when: rules.count('win', 1) },
      many: { name: 'Many', description: '', when: rules.count('item', 5) },
    }),
  }).engine;

let notifiers: Notifier[] = [];
const make = (...args: Parameters<typeof createNotifier>) => {
  const n = createNotifier(...args);
  notifiers.push(n);
  return n;
};
const host = () => document.querySelector('[data-badgetrip-notifier]') as HTMLElement;
const shadow = () => host().shadowRoot as ShadowRoot;
const settle = () => new Promise((r) => setTimeout(r, 10));

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  for (const n of notifiers) n.dispose();
  notifiers = [];
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('style');
  vi.restoreAllMocks();
});

describe('badges read theme variables', () => {
  it('draws locked badges and progress through --badgetrip-* with today as the fallback', () => {
    const html = renderBadge(view());
    expect(html).toContain(
      'filter:var(--badgetrip-locked-filter,grayscale(1));opacity:var(--badgetrip-locked-opacity,0.45)',
    );
    expect(html).toContain('accent-color:var(--badgetrip-accent,auto)');
  });

  it('takes its icons from a theme, while an explicit icons option wins', () => {
    expect(renderBadge(view(), { theme: neon })).toContain('src="/neon-a.png"');
    expect(renderBadge(view(), { theme: neon, icons: themes.classic.icons })).not.toContain(
      'neon-a.png',
    );
  });
});

describe('applyTheme', () => {
  it('sets the vars on the page and undoes to what was there', () => {
    const root = document.documentElement;
    root.style.setProperty('--badgetrip-bg', 'pink');
    const undo = applyTheme(neon);
    expect(root.style.getPropertyValue('--badgetrip-accent')).toBe('#ff2bd6');
    expect(root.style.getPropertyValue('--badgetrip-bg')).toBe('#14002b');
    undo();
    expect(root.style.getPropertyValue('--badgetrip-accent')).toBe('');
    expect(root.style.getPropertyValue('--badgetrip-bg')).toBe('pink');
  });

  it('clears the previous theme when switching, so nothing stale is left', () => {
    const el = document.createElement('div');
    applyTheme(neon, el);
    applyTheme(plain, el);
    expect(el.style.getPropertyValue('--badgetrip-accent')).toBe('');
    expect(el.style.getPropertyValue('--badgetrip-bg')).toBe('#fff');
    applyTheme(null, el);
    expect(el.getAttribute('style') ?? '').toBe('');
  });

  it('ignores a stale undo after a newer theme was applied', () => {
    const el = document.createElement('div');
    const undoNeon = applyTheme(neon, el);
    applyTheme(plain, el);
    undoNeon();
    expect(el.style.getPropertyValue('--badgetrip-bg')).toBe('#fff');
  });

  it('refuses anything that is not a theme', () => {
    expect(() => applyTheme({ name: 'x' } as never)).toThrow(/defineTheme/);
  });
});

describe('notifier themes', () => {
  it('styles its own overlay and uses the theme icons and celebrations', async () => {
    const observed = observe(engine());
    make(observed, { actor: 'u', theme: neon });
    expect(host().style.getPropertyValue('--badgetrip-accent')).toBe('#ff2bd6');
    await observed.engine.emit({ id: '1', actor: 'u', type: 'win', ts: 0, payload: {} });
    await vi.waitFor(() =>
      expect(shadow().querySelector('[data-position="bottom-left"] .toast img')).not.toBeNull(),
    );
    expect(shadow().querySelector('.toast img')?.getAttribute('src')).toBe('/neon-a.png');
  });

  it('lets explicit icons and celebrations win over the theme', () => {
    make(observe(engine()), { theme: neon, icons: themes.classic.icons });
    notifiers[0]?.show(view({ unlocked: true }));
    expect(shadow().querySelector('.toast img')?.getAttribute('src')).not.toBe('/neon-a.png');
    expect(shadow().querySelector('[data-position="bottom-left"] .toast')).not.toBeNull();
  });

  it('switches theme live without dropping popups already on screen', () => {
    const n = make(observe(engine()), { theme: neon, maxVisible: 5 });
    n.show(view({ unlocked: true, name: 'Before' }));
    n.update({ theme: plain });
    n.show(view({ unlocked: true, name: 'After' }));
    expect(host().style.getPropertyValue('--badgetrip-accent')).toBe('initial');
    expect(host().style.getPropertyValue('--badgetrip-bg')).toBe('#fff');
    const names = [...shadow().querySelectorAll('.toast .name')].map((x) => x.textContent);
    expect(names.sort()).toEqual(['After', 'Before']);
    expect(shadow().querySelector('[data-position="top-right"] .name')?.textContent).toBe('After');
  });

  it('starts watching progress when the new theme turns progress popups on', async () => {
    const observed = observe(engine());
    const n = make(observed, { actor: 'u' });
    await settle();
    n.update({
      theme: defineTheme({ name: 'p', celebrations: { default: { progress: { every: 1 } } } }),
    });
    await settle();
    await observed.engine.emit({ id: 'i1', actor: 'u', type: 'item', ts: 0, payload: {} });
    await vi.waitFor(() =>
      expect(shadow().querySelector('.toast[data-kind="progress"] .name')?.textContent).toBe(
        'Many',
      ),
    );
  });

  it('checks the theme option and update()', () => {
    expect(() => make(observe(engine()), { theme: {} as never })).toThrow(/defineTheme/);
    const n = make(observe(engine()));
    expect(() => n.update({ theme: 'neon' as never })).toThrow(/defineTheme/);
    expect(() => n.update({ icons: {} as never })).toThrow(/createIconResolver/);
  });
});

describe('custom elements', () => {
  it('render with the theme and switch with setTheme', async () => {
    const observed = observe(engine());
    const ui = defineBadgetripElements(observed, { tagPrefix: 'bt-theme', theme: neon });
    const el = document.createElement('bt-theme-badge');
    el.setAttribute('actor', 'u');
    el.setAttribute('code', 'a');
    document.body.append(el);
    await vi.waitFor(() =>
      expect(el.querySelector('img')?.getAttribute('src')).toBe('/neon-a.png'),
    );
    expect(el.style.getPropertyValue('--badgetrip-accent')).toBe('#ff2bd6');
    ui.setTheme(plain);
    await vi.waitFor(() =>
      expect(el.querySelector('img')?.getAttribute('src')).not.toBe('/neon-a.png'),
    );
    expect(el.style.getPropertyValue('--badgetrip-accent')).toBe('');
    expect(el.style.getPropertyValue('--badgetrip-bg')).toBe('#fff');
  });
});

describe('review fixes', () => {
  it("a notifier's own theme blocks colors it doesn't set from the page", () => {
    applyTheme(themes.arcade);
    make(observe(engine()), { theme: plain });
    expect(host().style.getPropertyValue('--badgetrip-bg')).toBe('#fff');
    expect(host().style.getPropertyValue('--badgetrip-font')).toBe('initial');
    expect(host().style.getPropertyValue('--badgetrip-accent')).toBe('initial');
  });

  it('without its own theme, a notifier keeps following the page colors', () => {
    applyTheme(themes.arcade);
    make(observe(engine()));
    expect(host().style.getPropertyValue('--badgetrip-font')).toBe('');
  });
});
