import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
// @vitest-environment jsdom
import { createIconResolver, svgToDataUrl, svgs } from '@walangstudio/badgetrip-assets';
import {
  type AchievementView,
  createEngine,
  defineAchievements,
  memoryAchievementStore,
  memoryEventStore,
  memoryScoreStore,
  memoryStreakStore,
  rules,
} from '@walangstudio/badgetrip-core';
import {
  AchievementBadge,
  BadgetripProvider,
  IconProvider,
  useAchievementCatalog,
  useAchievementProgress,
  useBadgetrip,
} from '@walangstudio/badgetrip-react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const makeEngine = () =>
  createEngine({
    events: memoryEventStore(),
    scores: memoryScoreStore(),
    achievements: memoryAchievementStore(),
    streaks: memoryStreakStore(),
    clock: { now: () => 0 },
    definitions: {
      achievements: defineAchievements({
        winner: {
          name: 'Winner ({tier})',
          description: 'Win {n} times',
          icon: 'trophy',
          when: rules.count('win'),
          tiers: { bronze: 1, silver: 3 },
        },
        secret: {
          name: 'Secret',
          description: 'Found it',
          hidden: true,
          when: rules.count('find', 1),
        },
      }),
    },
  });

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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useAchievementCatalog / useAchievementProgress', () => {
  it('lists every achievement and updates after an unlock', async () => {
    const engine = makeEngine();
    const { result } = renderHook(
      () => ({
        list: useAchievementCatalog('u'),
        silver: useAchievementProgress('u', 'winner.silver'),
        engine: useBadgetrip(),
      }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <BadgetripProvider engine={engine}>{children}</BadgetripProvider>
        ),
      },
    );
    await waitFor(() => expect(result.current.list).toHaveLength(3));
    await act(async () => {
      await result.current.engine.emit({
        id: 'w',
        actor: 'u',
        type: 'win',
        ts: 0,
        payload: {},
      });
    });
    await waitFor(() => {
      expect(result.current.list.map((a) => [a.code, a.unlocked])).toEqual([
        ['winner.bronze', true],
        ['winner.silver', false],
        ['secret', false],
      ]);
      expect(result.current.silver).toEqual({
        current: 1,
        target: 3,
        percent: 33,
      });
    });
  });
});

describe('AchievementBadge', () => {
  it('shows a locked badge greyscale with accessible progress', () => {
    setReducedMotion(false);
    render(<AchievementBadge achievement={view()} />);
    const img = screen.getByRole('presentation', {
      hidden: true,
    }) as HTMLImageElement;
    expect(img.style.filter).toBe('var(--badgetrip-locked-filter, grayscale(1))');
    expect(img.src).toBe(svgToDataUrl(svgs.trophy));
    const bar = screen.getByRole('progressbar', {
      name: 'Alpha: 25%',
    }) as HTMLProgressElement;
    expect([bar.value, bar.max]).toEqual([25, 100]);
  });

  it('shows an unlocked badge in colour without progress', () => {
    setReducedMotion(false);
    render(<AchievementBadge achievement={view({ unlocked: true })} />);
    expect(
      (screen.getByRole('presentation', { hidden: true }) as HTMLImageElement).style.filter,
    ).toBe('');
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('a concealed badge shows no progress and the hidden icon', () => {
    setReducedMotion(false);
    render(<AchievementBadge achievement={view({ concealed: true, icon: 'moon' })} />);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect((screen.getByRole('presentation', { hidden: true }) as HTMLImageElement).src).toBe(
      svgToDataUrl(svgs.hidden),
    );
  });

  it('uses IconProvider overrides, animating only when unlocked and motion is allowed', () => {
    const icons = createIconResolver({
      overrides: { a: { src: '/a.gif', still: '/a.png', animated: true } },
    });
    const src = (a: AchievementView) => {
      const { unmount } = render(
        <IconProvider icons={icons}>
          <AchievementBadge achievement={a} />
        </IconProvider>,
      );
      const out = (
        screen.getByRole('presentation', { hidden: true }) as HTMLImageElement
      ).getAttribute('src');
      unmount();
      return out;
    };
    setReducedMotion(false);
    expect(src(view({ unlocked: true }))).toBe('/a.gif');
    expect(src(view())).toBe('/a.png');
    setReducedMotion(true);
    expect(src(view({ unlocked: true }))).toBe('/a.png');
  });
});

describe('AchievementBadge layout props', () => {
  it('passes className through and stretches to its grid cell', () => {
    setReducedMotion(false);
    const { container } = render(<AchievementBadge achievement={view()} className="cell" />);
    const fig = container.querySelector('figure') as HTMLElement;
    expect(fig.className).toBe('cell');
    expect(fig.style.height).toBe('100%');
  });
});

describe('AchievementBadge progress count', () => {
  it('shows 1/4 by default, and can be hidden or reworded', () => {
    setReducedMotion(false);
    const count = (el: ReturnType<typeof render>) =>
      el.container.querySelector('[data-count]')?.textContent;
    expect(count(render(<AchievementBadge achievement={view()} />))).toBe('1/4');
    cleanup();
    expect(
      count(render(<AchievementBadge achievement={view()} showCount={false} />)),
    ).toBeUndefined();
    cleanup();
    expect(
      count(
        render(
          <AchievementBadge
            achievement={view()}
            formatCount={(p) => `${p.current} of ${p.target}`}
          />,
        ),
      ),
    ).toBe('1 of 4');
    cleanup();
    expect(
      count(render(<AchievementBadge achievement={view({ unlocked: true })} />)),
    ).toBeUndefined();
  });
});
