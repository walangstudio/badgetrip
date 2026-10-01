import { mount } from '@vue/test-utils';
// @vitest-environment jsdom
import { createIconResolver, defineTheme } from '@walangstudio/badgetrip-assets';
import {
  type AchievementView,
  type Engine,
  defineAchievements,
  observe,
  rules,
} from '@walangstudio/badgetrip-core';
import { makeTestEngine } from '@walangstudio/badgetrip-testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import {
  AchievementBadge,
  UnlockNotifier,
  createBadgetrip,
  provideBadgetrip,
  useBadgetrip,
  useTheme,
  useUnlocks,
} from '../src/index.js';

const engine = () =>
  makeTestEngine({
    achievements: defineAchievements({
      a: { name: 'Alpha', description: '', when: rules.count('win', 1) },
    }),
  }).engine;
const ev = (id: string) => ({ id, actor: 'u', type: 'win', ts: 0, payload: {} });

const neon = defineTheme({
  name: 'neon',
  style: { accent: '#ff2bd6', bg: '#14002b' },
  icons: { overrides: { a: { src: '/neon-a.png' } } },
});
const plain = defineTheme({ name: 'plain', style: { bg: '#fff' } });
const titled = defineTheme({ name: 'titled', celebrations: { default: { title: 'Nice one' } } });

const view: AchievementView = {
  code: 'a',
  name: 'Alpha',
  description: '',
  rarity: 1,
  points: 0,
  unlocked: false,
  concealed: false,
  progress: { current: 0, target: 1, percent: 0 },
};
const rootVar = (k: string) => document.documentElement.style.getPropertyValue(k);
const host = () => document.querySelector('[data-badgetrip-notifier]') as HTMLElement;

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  document.documentElement.removeAttribute('style');
  vi.restoreAllMocks();
});

function app(e: Engine, opts: Parameters<typeof createBadgetrip>[1], render: () => unknown) {
  let theme!: ReturnType<typeof useTheme>;
  let api!: Engine;
  const wrapper = mount(
    defineComponent({
      setup() {
        theme = useTheme();
        api = useBadgetrip();
        return render;
      },
    }),
    { global: { plugins: [createBadgetrip(e, opts)] } },
  );
  return { wrapper, theme: () => theme, api: () => api };
}

describe('createBadgetrip theme', () => {
  it('puts the colors on the page and switches when useTheme() is assigned', async () => {
    const { wrapper, theme } = app(engine(), { theme: neon }, () => null);
    expect(rootVar('--badgetrip-accent')).toBe('#ff2bd6');
    theme().value = plain;
    await nextTick();
    expect(rootVar('--badgetrip-accent')).toBe('');
    expect(rootVar('--badgetrip-bg')).toBe('#fff');
    wrapper.unmount();
  });

  it('gives badges the theme icons, re-rendering on a switch, while explicit icons win', async () => {
    const { wrapper, theme } = app(engine(), { theme: neon }, () =>
      h(AchievementBadge, { achievement: view }),
    );
    expect(wrapper.find('img').attributes('src')).toBe('/neon-a.png');
    theme().value = plain;
    await nextTick();
    expect(wrapper.find('img').attributes('src')).not.toBe('/neon-a.png');
    wrapper.unmount();
    const own = app(engine(), { theme: neon, icons: createIconResolver() }, () =>
      h(AchievementBadge, { achievement: view }),
    );
    expect(own.wrapper.find('img').attributes('src')).not.toBe('/neon-a.png');
    own.wrapper.unmount();
  });

  it('draws the locked look through theme variables', () => {
    const { wrapper } = app(engine(), {}, () => h(AchievementBadge, { achievement: view }));
    // jsdom drops var() from opacity; the browser check covers it.
    expect(wrapper.find('img').attributes('style')).toContain(
      'var(--badgetrip-locked-filter, grayscale(1))',
    );
    expect(wrapper.find('progress').attributes('style')).toContain('var(--badgetrip-accent, auto)');
    wrapper.unmount();
  });
});

describe('<UnlockNotifier> with a theme', () => {
  it('follows the app theme and switches it in place', async () => {
    const { wrapper, theme, api } = app(engine(), { theme: neon }, () =>
      h(UnlockNotifier, { actor: 'u' }),
    );
    const first = host();
    expect(first.style.getPropertyValue('--badgetrip-accent')).toBe('#ff2bd6');
    await api().emit(ev('1'));
    await vi.waitFor(() =>
      expect(first.shadowRoot?.querySelector('.toast img')?.getAttribute('src')).toBe(
        '/neon-a.png',
      ),
    );
    theme().value = plain;
    await nextTick();
    expect(host()).toBe(first);
    expect(first.style.getPropertyValue('--badgetrip-bg')).toBe('#fff');
    wrapper.unmount();
  });

  it('lets its own theme prop win', () => {
    const { wrapper } = app(engine(), { theme: neon }, () => h(UnlockNotifier, { theme: plain }));
    expect(host().style.getPropertyValue('--badgetrip-bg')).toBe('#fff');
    wrapper.unmount();
  });
});

describe('component-scoped themes and useUnlocks', () => {
  it('provideBadgetrip takes a theme, and useUnlocks celebrates with it', async () => {
    const e = engine();
    let queue!: ReturnType<typeof useUnlocks>['queue'];
    const wrapper = mount(
      defineComponent({
        setup() {
          provideBadgetrip(e, { theme: titled });
          return () =>
            h(
              defineComponent({
                setup() {
                  queue = useUnlocks().queue;
                  return () => null;
                },
              }),
            );
        },
      }),
    );
    expect(rootVar('--badgetrip-accent')).toBe('');
    await observe(e).engine.emit(ev('1'));
    await vi.waitFor(() => expect(queue.value).toHaveLength(1));
    expect(queue.value[0]?.celebration.title).toBe('Nice one');
    wrapper.unmount();
  });
});

describe('nested providers', () => {
  it('keep the app page colors, and inherit the app theme when they have none', async () => {
    const e = engine();
    let inherited: unknown;
    let own: unknown;
    // inject() sees the parent's provide, so read the theme from a child.
    const Inner = (theme?: typeof neon) => {
      const Peek = defineComponent({
        setup() {
          if (theme) own = useTheme().value;
          else inherited = useTheme().value;
          return () => null;
        },
      });
      return defineComponent({
        setup() {
          provideBadgetrip(e, theme ? { theme } : {});
          return () => h(Peek);
        },
      });
    };
    const show = ref(true);
    const InnerPlain = Inner(plain);
    const InnerNone = Inner();
    const { wrapper } = app(e, { theme: neon }, () =>
      show.value ? [h(InnerPlain), h(InnerNone)] : null,
    );
    expect(own).toBe(plain);
    expect(inherited).toBe(neon);
    expect(rootVar('--badgetrip-accent')).toBe('#ff2bd6');
    show.value = false;
    await nextTick();
    expect(rootVar('--badgetrip-accent')).toBe('#ff2bd6');
    wrapper.unmount();
    expect(rootVar('--badgetrip-accent')).toBe('');
  });
});
