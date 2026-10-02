// @vitest-environment jsdom
import {
  type CelebrationResolverOptions,
  createCelebrationResolver,
} from '@walangstudio/badgetrip-assets';
import {
  type AchievementView,
  defineAchievements,
  observe,
  rules,
} from '@walangstudio/badgetrip-core';
import { makeTestEngine } from '@walangstudio/badgetrip-testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Notifier, createNotifier } from '../src/index.js';

const view = (code: string, over: Partial<AchievementView> = {}): AchievementView => ({
  code,
  name: code.toUpperCase(),
  description: '',
  rarity: 1,
  points: 0,
  unlocked: true,
  concealed: false,
  progress: { current: 1, target: 1, percent: 100 },
  ...over,
});

const engine = () =>
  makeTestEngine({
    achievements: defineAchievements({
      a: { name: 'A', description: '', when: rules.count('x', 1) },
    }),
  }).engine;

let notifiers: Notifier[] = [];
const make = (celebrations: CelebrationResolverOptions = {}, extra = {}) => {
  const n = createNotifier(observe(engine()), {
    celebrations: createCelebrationResolver(celebrations),
    maxVisible: 1,
    ...extra,
  });
  notifiers.push(n);
  return n;
};
const shadow = () =>
  (document.querySelector('[data-badgetrip-notifier]') as HTMLElement).shadowRoot as ShadowRoot;
const toasts = () => [...shadow().querySelectorAll('.toast')] as HTMLElement[];
const v = (el: Element | null | undefined, k: string) =>
  (el as HTMLElement | null)?.style.getPropertyValue(k);
const motion = (reduce: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: reduce && q.includes('reduce'),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
};

beforeEach(() => {
  motion(false);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.useFakeTimers();
});
afterEach(() => {
  for (const n of notifiers) n.dispose();
  notifiers = [];
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('entrance', () => {
  it('plays the default drop-in on toasts and the pop on dialogs, as before', () => {
    const n = make({ overrides: { m: 'modal' } });
    n.show(view('a'));
    const t = toasts()[0];
    expect(v(t, '--bt-animation')).toBe('badgetrip-move 250ms ease-out both');
    expect([v(t, '--bt-dx'), v(t, '--bt-dy'), v(t, '--bt-s')]).toEqual(['0px', '-8px', '1']);
    n.show(view('m'));
    const d = shadow().querySelector('.dialog');
    expect(v(d, '--bt-animation')).toBe('badgetrip-move 350ms cubic-bezier(.2,1.4,.4,1) both');
    expect(v(d, '--bt-s')).toBe('0.8');
  });

  it('slides in from the toast edge, by the configured distance', () => {
    const n = make({
      default: { position: 'bottom-left', animation: { enter: 'slide', distance: 20 } },
    });
    n.show(view('a'));
    expect([v(toasts()[0], '--bt-dx'), v(toasts()[0], '--bt-dy')]).toEqual(['0px', '20px']);
    n.dispose();
    const side = make({
      default: { position: 'left', animation: { enter: 'slide', distance: 20 } },
    });
    side.show(view('b'));
    const left = shadow().querySelector('[data-position="left"] .toast');
    expect(v(left, '--bt-dx')).toBe('-20px');
  });

  it('maps slide directions to where the toast starts, and scale, bounce and none', () => {
    const n = make(
      {
        overrides: {
          up: { animation: { enter: 'slide-up', distance: 10 } },
          right: { animation: { enter: 'slide-right', distance: 10 } },
          sc: { animation: { enter: 'scale' } },
          bo: { animation: { enter: 'bounce', duration: 500, easing: 'linear' } },
          no: { animation: { enter: 'none' } },
        },
      },
      { maxVisible: 5 },
    );
    for (const c of ['up', 'right', 'sc', 'bo', 'no']) n.show(view(c));
    const by = (c: string) =>
      toasts().find((t) => t.querySelector('.name')?.textContent === c.toUpperCase());
    expect(v(by('up'), '--bt-dy')).toBe('10px');
    expect(v(by('right'), '--bt-dx')).toBe('-10px');
    expect(v(by('sc'), '--bt-s')).toBe('0.85');
    expect(v(by('bo'), '--bt-animation')).toBe('badgetrip-bounce 500ms linear both');
    expect(v(by('no'), '--bt-animation')).toBe('none');
  });
});

describe('exit', () => {
  it('plays the exit before removing the toast, and only then shows the next one', () => {
    const n = make({ default: { animation: { exit: 'fade', duration: 200 } } });
    n.show(view('a'));
    n.show(view('b'));
    (toasts()[0]?.querySelector('.close') as HTMLButtonElement).click();
    const leaving = toasts()[0];
    expect(leaving?.dataset.leaving).toBe('');
    expect(v(leaving, '--bt-animation')).toBe('badgetrip-out 140ms ease-out both');
    expect(toasts().map((t) => t.querySelector('.name')?.textContent)).toEqual(['A']);
    vi.advanceTimersByTime(200);
    expect(toasts().map((t) => t.querySelector('.name')?.textContent)).toEqual(['B']);
  });

  it('removes at once with exit none, on dispose, and under reduced motion', () => {
    const plain = make();
    plain.show(view('a'));
    (toasts()[0]?.querySelector('.close') as HTMLButtonElement).click();
    expect(toasts()).toHaveLength(0);
    plain.dispose();

    const fading = make({ default: { animation: { exit: 'fade' } } });
    fading.show(view('b'));
    (toasts()[0]?.querySelector('.close') as HTMLButtonElement).click();
    expect(toasts()).toHaveLength(1);
    fading.dispose();
    expect(document.querySelectorAll('[data-badgetrip-notifier]')).toHaveLength(0);

    motion(true);
    const still = make({ default: { animation: { exit: 'fade' } } });
    still.show(view('c'));
    (toasts()[0]?.querySelector('.close') as HTMLButtonElement).click();
    expect(toasts()).toHaveLength(0);
  });

  it('dismissAll clears leaving toasts at once', () => {
    const n = make({ default: { animation: { exit: 'slide' } } });
    n.show(view('a'));
    (toasts()[0]?.querySelector('.close') as HTMLButtonElement).click();
    n.dismissAll();
    expect(toasts()).toHaveLength(0);
  });

  it('plays a dialog exit, then opens the next dialog', () => {
    const n = make({
      default: { layout: 'modal', duration: 0, animation: { exit: 'scale', duration: 300 } },
    });
    n.show(view('a'));
    n.show(view('b'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    const dialogs = () => [...shadow().querySelectorAll('.dialog .name')].map((x) => x.textContent);
    expect(dialogs()).toEqual(['A']);
    expect(v(shadow().querySelector('.dialog'), '--bt-animation')).toBe(
      'badgetrip-out 210ms cubic-bezier(.2,1.4,.4,1) both',
    );
    vi.advanceTimersByTime(300);
    expect(dialogs()).toEqual(['B']);
  });
});
