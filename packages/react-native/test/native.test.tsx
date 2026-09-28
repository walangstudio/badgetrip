import { createIconResolver, svgToDataUrl, svgs } from '@badgetrip/assets';
import {
  type AchievementView,
  createEngine,
  defineAchievements,
  memoryAchievementStore,
  memoryEventStore,
  memoryScoreStore,
  memoryStreakStore,
  rules,
} from '@badgetrip/core';
import type { ReactElement } from 'react';
import { type ReactTestRenderer, act, create } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AchievementBadge,
  BadgetripProvider,
  IconProvider,
  useAchievementCatalog,
  useAchievementProgress,
  useBadgetrip,
  useScore,
} from '../src/index.js';

const motion = vi.hoisted(() => ({
  enabled: false,
  listener: undefined as ((v: boolean) => void) | undefined,
}));

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Image: 'Image',
  AccessibilityInfo: {
    isReduceMotionEnabled: () => Promise.resolve(motion.enabled),
    addEventListener: (_: string, cb: (v: boolean) => void) => {
      motion.listener = cb;
      return {
        remove: () => {
          motion.listener = undefined;
        },
      };
    },
  },
}));
vi.mock('react-native-svg', () => ({ SvgXml: 'SvgXml', SvgUri: 'SvgUri' }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const decode = (url: string) => decodeURIComponent(url.slice('data:image/svg+xml,'.length));

let tree: ReactTestRenderer | undefined;
async function mount(node: ReactElement) {
  await act(async () => {
    tree = create(node);
  });
  return tree as ReactTestRenderer;
}

afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  motion.enabled = false;
});

describe('AchievementBadge', () => {
  it('locked: grey tintable SVG, dimmed, accessible progress bar', async () => {
    const t = await mount(<AchievementBadge achievement={view()} />);
    const svg = t.root.findByType('SvgXml' as never);
    expect(svg.props.xml).toBe(svgs.trophy);
    expect(svg.props.color).toBe('#8a8f98');
    expect(svg.parent?.props.style).toEqual({ opacity: 0.45 });
    expect(svg.parent?.props.importantForAccessibility).toBe('no-hide-descendants');
    const bar = t.root.findByProps({ accessibilityRole: 'progressbar' });
    expect(bar.props.accessibilityLabel).toBe('Alpha: 25%');
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 25 });
    const texts = t.root.findAllByType('Text' as never).map((n) => n.props.children);
    expect(texts).toEqual(['Alpha', 'Do the thing']);
  });

  it('unlocked: full-colour tier-tinted SVG, no progress bar', async () => {
    const t = await mount(
      <AchievementBadge
        achievement={view({
          unlocked: true,
          icon: 'crown',
          series: { code: 's', tier: 'gold' } as AchievementView['series'],
        })}
      />,
    );
    const svg = t.root.findByType('SvgXml' as never);
    expect(svg.props.xml).toBe(decode(svgToDataUrl(svgs.crown, '#d4a017')));
    expect(svg.props.color).toBeUndefined();
    expect(svg.parent?.props.style).toBeUndefined();
    expect(t.root.findAllByProps({ accessibilityRole: 'progressbar' })).toHaveLength(0);
  });

  it('concealed: hidden icon, no progress bar', async () => {
    const t = await mount(
      <AchievementBadge achievement={view({ concealed: true, icon: 'moon' })} />,
    );
    expect(t.root.findByType('SvgXml' as never).props.xml).toBe(svgs.hidden);
    expect(t.root.findAllByProps({ accessibilityRole: 'progressbar' })).toHaveLength(0);
  });

  it('showProgress=false hides the bar', async () => {
    const t = await mount(<AchievementBadge achievement={view()} showProgress={false} />);
    expect(t.root.findAllByProps({ accessibilityRole: 'progressbar' })).toHaveLength(0);
  });

  it('raster assets render via Image; locked ones as a grey silhouette', async () => {
    const icons = createIconResolver({
      overrides: { a: { src: 'https://x/a.png' } },
    });
    const img = async (a: AchievementView) => {
      const t = await mount(
        <IconProvider icons={icons}>
          <AchievementBadge achievement={a} size={32} />
        </IconProvider>,
      );
      expect(t.root.findAllByType('SvgXml' as never)).toHaveLength(0);
      return t.root.findByType('Image' as never).props;
    };
    expect(await img(view())).toEqual({
      source: { uri: 'https://x/a.png' },
      style: { width: 32, height: 32, tintColor: '#8a8f98' },
    });
    expect((await img(view({ unlocked: true }))).style.tintColor).toBeUndefined();
  });
});

describe('useAchievementIcon motion', () => {
  const icons = createIconResolver({
    overrides: {
      a: { src: 'https://x/a.gif', still: 'https://x/a.png', animated: true },
    },
  });
  const uri = (t: ReactTestRenderer) => t.root.findByType('Image' as never).props.source.uri;
  const badge = (a: AchievementView) => (
    <IconProvider icons={icons}>
      <AchievementBadge achievement={a} />
    </IconProvider>
  );

  it('animates only when unlocked and motion is allowed', async () => {
    expect(uri(await mount(badge(view({ unlocked: true }))))).toBe('https://x/a.gif');
    expect(uri(await mount(badge(view())))).toBe('https://x/a.png');
  });

  it('shows the still frame under reduce motion and follows live changes', async () => {
    motion.enabled = true;
    const t = await mount(badge(view({ unlocked: true })));
    expect(uri(t)).toBe('https://x/a.png');
    await act(async () => motion.listener?.(false));
    expect(uri(t)).toBe('https://x/a.gif');
    await act(async () => motion.listener?.(true));
    expect(uri(t)).toBe('https://x/a.png');
  });

  it('never plays motion before the OS setting is known', () => {
    act(() => {
      tree = create(badge(view({ unlocked: true })));
    });
    expect(uri(tree as ReactTestRenderer)).toBe('https://x/a.png');
  });

  it('uses the still SVG when a tintable animated icon is locked', async () => {
    const t = await mount(<AchievementBadge achievement={view({ icon: 'sparkle-animated' })} />);
    expect(t.root.findByType('SvgXml' as never).props.xml).toBe(svgs.sparkle);
  });
});

describe('re-exported hooks', () => {
  it('update after emit through useBadgetrip', async () => {
    const engine = createEngine({
      events: memoryEventStore(),
      scores: memoryScoreStore(),
      achievements: memoryAchievementStore(),
      streaks: memoryStreakStore(),
      clock: { now: () => 0 },
      definitions: {
        scores: ['honor'],
        points: [{ on: 'win', score: 'honor', delta: 2 }],
        achievements: defineAchievements({
          winner: {
            name: 'Winner ({tier})',
            description: 'Win {n} times',
            when: rules.count('win'),
            tiers: { bronze: 1, silver: 3 },
          },
        }),
      },
    });
    const seen: { score: number; list: AchievementView[]; silver: number }[] = [];
    let emit: ReturnType<typeof useBadgetrip>['emit'] | undefined;
    function Probe() {
      emit = useBadgetrip().emit;
      seen.push({
        score: useScore('u', 'honor'),
        list: useAchievementCatalog('u'),
        silver: useAchievementProgress('u', 'winner.silver').percent,
      });
      return null;
    }
    await mount(
      <BadgetripProvider engine={engine}>
        <Probe />
      </BadgetripProvider>,
    );
    await act(async () => {
      await emit?.({ id: 'w', actor: 'u', type: 'win', ts: 0, payload: {} });
    });
    await act(async () => {});
    const last = seen.at(-1);
    expect(last?.score).toBe(2);
    expect(last?.list.map((a) => [a.code, a.unlocked])).toEqual([
      ['winner.bronze', true],
      ['winner.silver', false],
    ]);
    expect(last?.silver).toBe(33);
  });
});

describe('svg handling review fixes', () => {
  it('parses SVG data URLs with params, raw %, and UTF-8 base64 without throwing', async () => {
    const { svgMarkup } = await import('../src/badge.js');
    expect(svgMarkup('data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E')).toBe('<svg/>');
    expect(svgMarkup('data:image/svg+xml,<svg width="100%"/>')).toBe('<svg width="100%"/>');
    const b64 = btoa(
      String.fromCharCode(...new TextEncoder().encode('<svg><title>é</title></svg>')),
    );
    expect(svgMarkup(`data:image/svg+xml;base64,${b64}`)).toBe('<svg><title>é</title></svg>');
    expect(svgMarkup('https://x/a.png')).toBeUndefined();
  });

  it('renders a remote .svg with SvgUri instead of Image', async () => {
    const icons = createIconResolver({
      overrides: { a: { src: 'https://cdn.example/a.svg' } },
    });
    const t = await mount(
      <IconProvider icons={icons}>
        <AchievementBadge achievement={view({ unlocked: true })} />
      </IconProvider>,
    );
    expect(t.root.findByType('SvgUri' as never).props.uri).toBe('https://cdn.example/a.svg');
    expect(t.root.findAllByType('Image' as never)).toHaveLength(0);
  });
});
