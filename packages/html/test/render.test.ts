// @vitest-environment jsdom
import { createIconResolver, svgToDataUrl, svgs } from '@walangstudio/badgetrip-assets';
import type { AchievementView } from '@walangstudio/badgetrip-core';
import { describe, expect, it } from 'vitest';
import { type BadgeOptions, renderBadge, renderCatalog } from '../src/index.js';

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

const parse = (html: string) => {
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.content;
};
const badge = (a: AchievementView, opts?: BadgeOptions) =>
  parse(renderBadge(a, opts)).querySelector('figure') as HTMLElement;
const img = (fig: HTMLElement) => fig.querySelector('img') as HTMLImageElement;

describe('renderBadge', () => {
  it('shows a locked badge greyscale with accessible progress', () => {
    const fig = badge(view());
    expect(fig.dataset).toMatchObject({
      unlocked: 'false',
      concealed: 'false',
    });
    expect(fig.style.height).toBe('100%');
    expect(img(fig).getAttribute('src')).toBe(svgToDataUrl(svgs.trophy));
    expect(img(fig).getAttribute('alt')).toBe('');
    expect([img(fig).width, img(fig).height]).toEqual([48, 48]);
    expect(img(fig).style.filter).toBe('grayscale(1)');
    expect(img(fig).style.opacity).toBe('0.45');
    expect(fig.querySelector('figcaption strong')?.textContent).toBe('Alpha');
    expect(fig.querySelector('figcaption div')?.textContent).toBe('Do the thing');
    expect((fig.querySelector('figcaption') as HTMLElement).style.flex).toMatch(/^1/);
    const bar = fig.querySelector('progress') as HTMLProgressElement;
    expect([bar.value, bar.max, bar.getAttribute('aria-label')]).toEqual([25, 100, 'Alpha: 25%']);
    expect(bar.style.width).toBe('100%');
  });

  it('shows an unlocked badge in colour without progress', () => {
    const fig = badge(view({ unlocked: true }), { size: 64 });
    expect(fig.dataset.unlocked).toBe('true');
    expect(img(fig).style.filter).toBe('');
    expect(img(fig).width).toBe(64);
    expect(fig.querySelector('progress')).toBeNull();
  });

  it('a concealed badge shows no progress and the hidden icon', () => {
    const fig = badge(view({ concealed: true, icon: 'moon' }));
    expect(fig.dataset.concealed).toBe('true');
    expect(fig.querySelector('progress')).toBeNull();
    expect(img(fig).getAttribute('src')).toBe(svgToDataUrl(svgs.hidden));
  });

  it('omits the description line when empty and progress when disabled', () => {
    const fig = badge(view({ description: '' }), { showProgress: false });
    expect(fig.querySelector('figcaption div')).toBeNull();
    expect(fig.querySelector('progress')).toBeNull();
  });

  it('uses icon overrides, animating only when unlocked and motion is allowed', () => {
    const icons = createIconResolver({
      overrides: { a: { src: '/a.gif', still: '/a.png', animated: true } },
    });
    const src = (a: AchievementView, reducedMotion: boolean) =>
      img(badge(a, { icons, reducedMotion })).getAttribute('src');
    expect(src(view({ unlocked: true }), false)).toBe('/a.gif');
    expect(src(view(), false)).toBe('/a.png');
    expect(src(view({ unlocked: true }), true)).toBe('/a.png');
  });

  it('escapes every text and attribute value', () => {
    const xss = '"><script>alert(1)</script><img src=x onerror=alert(2)>&\'';
    const icons = createIconResolver({
      overrides: { a: { src: `/x.png"${xss}` } },
    });
    const html = renderBadge(view({ name: xss, description: xss }), {
      icons,
      className: xss,
    });
    const frag = parse(html);
    expect(frag.querySelectorAll('script')).toHaveLength(0);
    expect(frag.querySelectorAll('img')).toHaveLength(1);
    expect(frag.querySelectorAll('[onerror]')).toHaveLength(0);
    const fig = frag.querySelector('figure') as HTMLElement;
    expect(fig.className).toBe(xss);
    expect(fig.querySelector('strong')?.textContent).toBe(xss);
    expect(fig.querySelector('figcaption div')?.textContent).toBe(xss);
    expect(img(fig).getAttribute('src')).toBe(`/x.png"${xss}`);
    expect(fig.querySelector('progress')?.getAttribute('aria-label')).toBe(`${xss}: 25%`);
  });

  it('neutralises script-capable icon URLs and keeps safe ones', () => {
    const src = (s: string) =>
      img(
        badge(view(), {
          icons: createIconResolver({ overrides: { a: { src: s } } }),
        }),
      ).getAttribute('src');
    for (const bad of [
      'javascript:alert(1)',
      ' JaVaScRiPt:alert(1)',
      'java\tscript:alert(1)',
      '\u0001javascript:alert(1)',
      'vbscript:msgbox(1)',
      'data:text/html,<script>alert(1)</script>',
    ]) {
      expect(src(bad)).toBe('');
    }
    for (const ok of [
      '/a.png',
      'https://cdn.example/a.gif',
      'tauri://localhost/a.png',
      'data:image/png;base64,AA',
    ]) {
      expect(src(ok)).toBe(ok);
    }
  });
});

describe('renderCatalog', () => {
  it('wraps badges in a responsive grid', () => {
    const grid = parse(renderCatalog([view(), view({ code: 'b', unlocked: true })]))
      .firstElementChild as HTMLElement;
    expect(grid.style.display).toBe('grid');
    expect(grid.style.gridTemplateColumns).toBe('repeat(auto-fill,minmax(140px,1fr))');
    expect(
      [...grid.querySelectorAll('figure')].map((f) => (f as HTMLElement).dataset.unlocked),
    ).toEqual(['false', 'true']);
  });
});

describe('secret mode', () => {
  const views = [
    view({ code: 'a' }),
    view({ code: 'b', name: 'Hidden achievement', concealed: true }),
    view({ code: 'c', name: 'Hidden achievement', concealed: true }),
    view({ code: 'd', unlocked: true, hidden: true, name: 'Found' }),
  ];

  it('omits concealed achievements and counts them', () => {
    const out = parse(renderCatalog(views, { secret: true }));
    expect(out.querySelectorAll('figure')).toHaveLength(2);
    expect(out.textContent).not.toContain('Hidden achievement');
    const line = out.querySelector('[data-hidden-remaining]');
    expect(line?.getAttribute('data-hidden-remaining')).toBe('2');
    expect(line?.textContent).toBe('2 hidden achievements remaining');
  });

  it('uses the singular, a custom escaped label, and nothing when none are hidden', () => {
    const one = parse(renderCatalog(views.slice(0, 2), { secret: true }));
    expect(one.querySelector('[data-hidden-remaining]')?.textContent).toBe(
      '1 hidden achievement remaining',
    );
    const custom = parse(
      renderCatalog(views, { secret: true, secretLabel: (n) => `<i>${n}</i> secrets` }),
    );
    expect(custom.querySelector('i')).toBeNull();
    expect(custom.querySelector('[data-hidden-remaining]')?.textContent).toBe('<i>2</i> secrets');
    expect(renderCatalog([view()], { secret: true })).not.toContain('data-hidden-remaining');
    expect(parse(renderCatalog(views)).querySelectorAll('figure')).toHaveLength(4);
  });
});

describe('progress count', () => {
  it('shows current/target under locked multi-step badges only', () => {
    expect(badge(view()).querySelector('[data-count]')?.textContent).toBe('1/4');
    expect(badge(view({ unlocked: true })).querySelector('[data-count]')).toBeNull();
    expect(badge(view({ concealed: true })).querySelector('[data-count]')).toBeNull();
    expect(
      badge(view({ progress: { current: 0, target: 1, percent: 0 } })).querySelector(
        '[data-count]',
      ),
    ).toBeNull();
  });

  it('can be hidden, reworded, and escapes the wording', () => {
    expect(badge(view(), { showCount: false }).querySelector('[data-count]')).toBeNull();
    const worded = badge(view(), { formatCount: (p) => `<b>${p.current}</b> of ${p.target}` });
    expect(worded.querySelector('b')).toBeNull();
    expect(worded.querySelector('[data-count]')?.textContent).toBe('<b>1</b> of 4');
  });
});
