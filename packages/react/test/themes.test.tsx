import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
// @vitest-environment jsdom
import { createIconResolver, defineTheme } from '@walangstudio/badgetrip-assets';
import { type AchievementView, defineAchievements, rules } from '@walangstudio/badgetrip-core';
import {
  AchievementBadge,
  BadgetripProvider,
  IconProvider,
  UnlockNotifier,
  useBadgetrip,
  useTheme,
  useUnlocks,
} from '@walangstudio/badgetrip-react';
import { makeTestEngine } from '@walangstudio/badgetrip-testing';
import { type ReactNode, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  cleanup();
  document.documentElement.removeAttribute('style');
  vi.restoreAllMocks();
});

describe('BadgetripProvider theme', () => {
  it('puts the theme colors on the page, switches them, and clears them on unmount', () => {
    const e = engine();
    const view1 = render(
      <StrictMode>
        <BadgetripProvider engine={e} theme={neon}>
          <span />
        </BadgetripProvider>
      </StrictMode>,
    );
    expect(rootVar('--badgetrip-accent')).toBe('#ff2bd6');
    view1.rerender(
      <StrictMode>
        <BadgetripProvider engine={e} theme={plain}>
          <span />
        </BadgetripProvider>
      </StrictMode>,
    );
    expect(rootVar('--badgetrip-accent')).toBe('');
    expect(rootVar('--badgetrip-bg')).toBe('#fff');
    view1.unmount();
    expect(rootVar('--badgetrip-bg')).toBe('');
  });

  it('exposes the theme through useTheme', () => {
    const e = engine();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <BadgetripProvider engine={e} theme={neon}>
        {children}
      </BadgetripProvider>
    );
    expect(renderHook(() => useTheme(), { wrapper }).result.current).toBe(neon);
  });
});

describe('AchievementBadge with a theme', () => {
  it('uses the theme icons, while an IconProvider wins', () => {
    const e = engine();
    const a = render(
      <BadgetripProvider engine={e} theme={neon}>
        <AchievementBadge achievement={view} />
      </BadgetripProvider>,
    );
    expect(a.container.querySelector('img')?.getAttribute('src')).toBe('/neon-a.png');
    const b = render(
      <BadgetripProvider engine={e} theme={neon}>
        <IconProvider icons={createIconResolver()}>
          <AchievementBadge achievement={view} />
        </IconProvider>
      </BadgetripProvider>,
    );
    expect(b.container.querySelector('img')?.getAttribute('src')).not.toBe('/neon-a.png');
  });

  it('draws the locked look and progress through theme variables', () => {
    const { container } = render(
      <BadgetripProvider engine={engine()}>
        <AchievementBadge achievement={view} />
      </BadgetripProvider>,
    );
    // jsdom drops var() from opacity; the browser check covers it.
    const style = container.querySelector('img')?.getAttribute('style') ?? '';
    expect(style).toContain('var(--badgetrip-locked-filter, grayscale(1))');
    expect(container.querySelector('progress')?.getAttribute('style')).toContain(
      'var(--badgetrip-accent, auto)',
    );
  });
});

describe('UnlockNotifier with a theme', () => {
  it('follows the provider theme and switches it without re-creating the overlay', async () => {
    const e = engine();
    let api!: ReturnType<typeof useBadgetrip>;
    const Grab = () => {
      api = useBadgetrip();
      return null;
    };
    const ui = (theme: typeof neon) => (
      <StrictMode>
        <BadgetripProvider engine={e} theme={theme}>
          <UnlockNotifier actor="u" />
          <Grab />
        </BadgetripProvider>
      </StrictMode>
    );
    const r = render(ui(neon));
    const first = host();
    expect(first.style.getPropertyValue('--badgetrip-accent')).toBe('#ff2bd6');
    await act(async () => {
      await api.emit(ev('1'));
    });
    await waitFor(() =>
      expect(first.shadowRoot?.querySelector('.toast img')?.getAttribute('src')).toBe(
        '/neon-a.png',
      ),
    );
    r.rerender(ui(plain));
    expect(host()).toBe(first);
    expect(first.style.getPropertyValue('--badgetrip-accent')).toBe('');
    expect(first.style.getPropertyValue('--badgetrip-bg')).toBe('#fff');
  });

  it('lets its own theme prop win over the provider', () => {
    render(
      <BadgetripProvider engine={engine()} theme={neon}>
        <UnlockNotifier theme={plain} />
      </BadgetripProvider>,
    );
    expect(host().style.getPropertyValue('--badgetrip-bg')).toBe('#fff');
  });
});

describe('useUnlocks with a theme', () => {
  it('celebrates with the provider theme', async () => {
    const e = engine();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <BadgetripProvider engine={e} theme={titled}>
        {children}
      </BadgetripProvider>
    );
    const { result } = renderHook(() => ({ u: useUnlocks(), api: useBadgetrip() }), { wrapper });
    await act(async () => {
      await result.current.api.emit(ev('1'));
    });
    await waitFor(() => expect(result.current.u.queue).toHaveLength(1));
    expect(result.current.u.queue[0]?.celebration.title).toBe('Nice one');
  });
});
