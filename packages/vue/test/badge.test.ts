import { mount } from '@vue/test-utils';
// @vitest-environment jsdom
import { createIconResolver, svgToDataUrl, svgs } from '@walangstudio/badgetrip-assets';
import {
  type AchievementView,
  createEngine,
  memoryAchievementStore,
  memoryEventStore,
  memoryScoreStore,
  memoryStreakStore,
} from '@walangstudio/badgetrip-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AchievementBadge, createBadgetrip } from '../src/index.js';

const view = (over: Partial<AchievementView> = {}): AchievementView => ({
  code: 'a',
  name: 'Alpha',
  description: 'Do the thing',
  rarity: 1,
  points: 0,
  unlocked: false,
  concealed: false,
  progress: { current: 1, target: 4, percent: 25 },
  ...over,
});

const setReducedMotion = (reduce: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: reduce && q.includes('reduce'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
};

const badge = (achievement: AchievementView, plugins: ReturnType<typeof createBadgetrip>[] = []) =>
  mount(AchievementBadge, { props: { achievement }, global: { plugins } });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AchievementBadge', () => {
  it('shows a locked badge greyscale with accessible progress', () => {
    setReducedMotion(false);
    const w = badge(view());
    const fig = w.get('figure');
    expect([fig.attributes('data-unlocked'), fig.attributes('data-concealed')]).toEqual([
      'false',
      'false',
    ]);
    expect(fig.element.style.height).toBe('100%');
    const img = w.get('img').element as HTMLImageElement;
    expect(img.getAttribute('alt')).toBe('');
    expect(img.style.filter).toBe('grayscale(1)');
    expect(img.src).toBe(svgToDataUrl(svgs.trophy));
    expect(w.get('figcaption').text()).toBe('AlphaDo the thing');
    const bar = w.get('progress').element as HTMLProgressElement;
    expect([bar.value, bar.max, bar.getAttribute('aria-label')]).toEqual([25, 100, 'Alpha: 25%']);
  });

  it('shows an unlocked badge in colour without progress', () => {
    setReducedMotion(false);
    const w = badge(view({ unlocked: true }));
    expect(w.get('figure').attributes('data-unlocked')).toBe('true');
    expect((w.get('img').element as HTMLImageElement).style.filter).toBe('');
    expect(w.find('progress').exists()).toBe(false);
  });

  it('a concealed badge shows no progress and the hidden icon', () => {
    setReducedMotion(false);
    const w = badge(view({ concealed: true, icon: 'moon' }));
    expect(w.get('figure').attributes('data-concealed')).toBe('true');
    expect(w.find('progress').exists()).toBe(false);
    expect((w.get('img').element as HTMLImageElement).src).toBe(svgToDataUrl(svgs.hidden));
  });

  it('uses plugin icon overrides, animating only when unlocked and motion is allowed', () => {
    const engine = createEngine({
      events: memoryEventStore(),
      scores: memoryScoreStore(),
      achievements: memoryAchievementStore(),
      streaks: memoryStreakStore(),
      clock: { now: () => 0 },
      definitions: {},
    });
    const icons = createIconResolver({
      overrides: { a: { src: '/a.gif', still: '/a.png', animated: true } },
    });
    const src = (a: AchievementView) => {
      const w = badge(a, [createBadgetrip(engine, { icons })]);
      const out = w.get('img').attributes('src');
      w.unmount();
      return out;
    };
    setReducedMotion(false);
    expect(src(view({ unlocked: true }))).toBe('/a.gif');
    expect(src(view())).toBe('/a.png');
    setReducedMotion(true);
    expect(src(view({ unlocked: true }))).toBe('/a.png');
  });

  it('switches to the still frame when the user turns on reduced motion, and stops listening on unmount', async () => {
    const mq = { matches: false, listener: undefined as (() => void) | undefined };
    window.matchMedia = vi.fn(() => ({
      get matches() {
        return mq.matches;
      },
      addEventListener: (_: string, l: () => void) => {
        mq.listener = l;
      },
      removeEventListener: (_: string, l: () => void) => {
        if (mq.listener === l) mq.listener = undefined;
      },
    })) as unknown as typeof window.matchMedia;
    const icons = createIconResolver({
      overrides: { a: { src: '/a.gif', still: '/a.png', animated: true } },
    });
    const engine = createEngine({
      events: memoryEventStore(),
      scores: memoryScoreStore(),
      achievements: memoryAchievementStore(),
      streaks: memoryStreakStore(),
      clock: { now: () => 0 },
      definitions: {},
    });
    const w = badge(view({ unlocked: true }), [createBadgetrip(engine, { icons })]);
    expect(w.get('img').attributes('src')).toBe('/a.gif');
    mq.matches = true;
    mq.listener?.();
    await w.vm.$nextTick();
    expect(w.get('img').attributes('src')).toBe('/a.png');
    w.unmount();
    expect(mq.listener).toBeUndefined();
  });

  it('re-renders when the achievement prop changes', async () => {
    setReducedMotion(false);
    const w = badge(view());
    await w.setProps({ achievement: view({ unlocked: true }) });
    expect(w.find('progress').exists()).toBe(false);
    expect((w.get('img').element as HTMLImageElement).style.filter).toBe('');
  });
});

describe('AchievementBadge props', () => {
  it('sizes the icon, hides progress on request, and lets class fall through', () => {
    setReducedMotion(false);
    const w = mount(AchievementBadge, {
      props: { achievement: view(), size: 32, showProgress: false },
      attrs: { class: 'cell' },
    });
    expect([w.get('img').attributes('width'), w.get('img').attributes('height')]).toEqual([
      '32',
      '32',
    ]);
    expect(w.find('progress').exists()).toBe(false);
    expect(w.get('figure').classes()).toEqual(['cell']);
  });
});
