import { TestBed } from '@angular/core/testing';
import { AchievementBadgeComponent, provideBadgetrip } from '@badgetrip/angular';
import { createIconResolver, svgToDataUrl, svgs } from '@badgetrip/assets';
import {
  type AchievementView,
  createEngine,
  memoryAchievementStore,
  memoryEventStore,
  memoryScoreStore,
  memoryStreakStore,
} from '@badgetrip/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

function render(a: AchievementView, inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(AchievementBadgeComponent);
  fixture.componentRef.setInput('achievement', a);
  for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    el,
    figure: el.querySelector('figure') as HTMLElement,
    img: el.querySelector('img') as HTMLImageElement,
    bar: el.querySelector('progress') as HTMLProgressElement | null,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AchievementBadgeComponent', () => {
  it('shows a locked badge greyscale with accessible progress', () => {
    setReducedMotion(false);
    const { figure, img, bar } = render(view());
    expect(figure.dataset).toMatchObject({
      unlocked: 'false',
      concealed: 'false',
    });
    expect(img.getAttribute('alt')).toBe('');
    expect(img.style.filter).toBe('grayscale(1)');
    expect(img.src).toBe(svgToDataUrl(svgs.trophy));
    expect([img.width, img.height]).toEqual([48, 48]);
    expect(figure.querySelector('figcaption strong')?.textContent).toBe('Alpha');
    expect(figure.querySelector('figcaption div')?.textContent).toBe('Do the thing');
    expect(bar?.getAttribute('aria-label')).toBe('Alpha: 25%');
    expect([bar?.value, bar?.max]).toEqual([25, 100]);
  });

  it('shows an unlocked badge in colour without progress', () => {
    setReducedMotion(false);
    const { figure, img, bar } = render(view({ unlocked: true }));
    expect(figure.dataset.unlocked).toBe('true');
    expect(img.style.filter).toBe('');
    expect(bar).toBeNull();
  });

  it('a concealed badge shows no progress and the hidden icon', () => {
    setReducedMotion(false);
    const { figure, img, bar } = render(view({ concealed: true, icon: 'moon' }));
    expect(figure.dataset.concealed).toBe('true');
    expect(bar).toBeNull();
    expect(img.src).toBe(svgToDataUrl(svgs.hidden));
  });

  it('honours size and showProgress, and stretches to its cell', () => {
    setReducedMotion(false);
    const { el, figure, img, bar } = render(view(), {
      size: 24,
      showProgress: false,
    });
    expect([img.width, img.height]).toEqual([24, 24]);
    expect(bar).toBeNull();
    expect(figure.style.height).toBe('100%');
    expect(getComputedStyle(el).display).toBe('block');
  });

  it('uses provideBadgetrip icon overrides, animating only when unlocked and motion is allowed', () => {
    TestBed.configureTestingModule({
      providers: [
        provideBadgetrip(
          createEngine({
            events: memoryEventStore(),
            scores: memoryScoreStore(),
            achievements: memoryAchievementStore(),
            streaks: memoryStreakStore(),
            clock: { now: () => 0 },
            definitions: {},
          }),
          {
            icons: createIconResolver({
              overrides: {
                a: { src: '/a.gif', still: '/a.png', animated: true },
              },
            }),
          },
        ),
      ],
    });
    const src = (a: AchievementView) => render(a).img.getAttribute('src');
    setReducedMotion(false);
    expect(src(view({ unlocked: true }))).toBe('/a.gif');
    expect(src(view())).toBe('/a.png');
    setReducedMotion(true);
    expect(src(view({ unlocked: true }))).toBe('/a.png');
  });
});

describe('AchievementBadgeComponent progress count', () => {
  it('shows 1/4 by default, and can be hidden or reworded', () => {
    setReducedMotion(false);
    const count = (a: AchievementView, inputs: Record<string, unknown> = {}) =>
      render(a, inputs).el.querySelector('[data-count]')?.textContent;
    expect(count(view())).toBe('1/4');
    expect(count(view(), { showCount: false })).toBeUndefined();
    expect(
      count(view(), {
        formatCount: (p: { current: number; target: number }) => `${p.current} of ${p.target}`,
      }),
    ).toBe('1 of 4');
    expect(count(view({ unlocked: true }))).toBeUndefined();
  });
});
