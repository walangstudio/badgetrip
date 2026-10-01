import {
  createCelebrationResolver,
  createIconResolver,
  defineTheme,
  gradient,
  svgToDataUrl,
  svgs,
  themeCss,
  themes,
} from '@walangstudio/badgetrip-assets';
import { describe, expect, it } from 'vitest';

const bad = (input: unknown, re: RegExp) =>
  expect(() => defineTheme(input as Parameters<typeof defineTheme>[0])).toThrow(re);

describe('defineTheme', () => {
  it('builds the resolvers and no vars from a bare name', () => {
    const t = defineTheme({ name: 'plain' });
    expect(t.name).toBe('plain');
    expect(t.vars).toEqual({});
    expect(t.icons.resolve({ code: 'a' })).toEqual(createIconResolver().resolve({ code: 'a' }));
    expect(t.celebrations.resolve({ code: 'a' })).toEqual(
      createCelebrationResolver().resolve({ code: 'a' }),
    );
  });

  it('maps style to --badgetrip-* custom properties', () => {
    const t = defineTheme({
      name: 'x',
      style: {
        accent: '#ff2bd6',
        fg: '#fff',
        bg: '#14002b',
        radius: '4px',
        font: '600 14px/1.4 ui-monospace, monospace',
        backdrop: 'rgba(0,0,0,.5)',
        fullscreenBg: 'linear-gradient(#000, #222)',
        iconBg: '#00f0ff',
        locked: { filter: 'grayscale(1) blur(1px)', opacity: 0.3 },
      },
    });
    expect(t.vars).toEqual({
      '--badgetrip-accent': '#ff2bd6',
      '--badgetrip-fg': '#fff',
      '--badgetrip-bg': '#14002b',
      '--badgetrip-radius': '4px',
      '--badgetrip-font': '600 14px/1.4 ui-monospace, monospace',
      '--badgetrip-backdrop': 'rgba(0,0,0,.5)',
      '--badgetrip-fullscreen-bg': 'linear-gradient(#000, #222)',
      '--badgetrip-icon-bg': '#00f0ff',
      '--badgetrip-locked-filter': 'grayscale(1) blur(1px)',
      '--badgetrip-locked-opacity': '0.3',
    });
  });

  it('passes icons and celebrations through to the resolvers', () => {
    const t = defineTheme({
      name: 'x',
      icons: { overrides: { a: { src: '/a.png' } } },
      celebrations: { default: { position: 'bottom' }, sounds: { chime: '/ding.mp3' } },
    });
    expect(t.icons.resolve({ code: 'a' }).src).toBe('/a.png');
    const c = t.celebrations.resolve({ code: 'b' });
    expect(c.position).toBe('bottom');
    expect(c.sound).toEqual({ src: '/ding.mp3' });
  });

  it('returns a frozen theme', () => {
    const t = defineTheme({ name: 'x', style: { accent: 'red' } });
    expect(Object.isFrozen(t)).toBe(true);
    expect(Object.isFrozen(t.vars)).toBe(true);
    expect(() => {
      (t.vars as Record<string, string>)['--badgetrip-accent'] = 'blue';
    }).toThrow();
  });

  it('does not keep a reference to the caller input', () => {
    const input = { name: 'x', style: { accent: 'red' } };
    const t = defineTheme(input);
    input.style.accent = 'blue';
    expect(t.vars['--badgetrip-accent']).toBe('red');
  });
});

describe('extends', () => {
  it('starts from a built-in by name or by object, the new theme winning', () => {
    for (const base of ['dark', themes.dark] as const) {
      const t = defineTheme({ name: 'mine', extends: base, style: { accent: '#0f0' } });
      expect(t.vars['--badgetrip-accent']).toBe('#0f0');
      expect(t.vars['--badgetrip-bg']).toBe(themes.dark.vars['--badgetrip-bg']);
    }
  });

  it('merges nested maps key by key and replaces arrays', () => {
    const base = defineTheme({
      name: 'base',
      icons: { overrides: { a: { src: '/a.png' } } },
      celebrations: {
        presets: { big: { layout: 'modal', confetti: { colors: ['#111', '#222'] } } },
      },
    });
    const t = defineTheme({
      name: 'child',
      extends: base,
      icons: { overrides: { b: { src: '/b.png' } } },
      celebrations: { presets: { big: { confetti: { colors: ['#333'] } } } },
    });
    expect(t.icons.resolve({ code: 'a' }).src).toBe('/a.png');
    expect(t.icons.resolve({ code: 'b' }).src).toBe('/b.png');
    const c = t.celebrations.resolve({ code: 'x', celebration: 'big' });
    expect(c.layout).toBe('modal');
    expect(c.confetti?.colors).toEqual(['#333']);
  });

  it('chains: a theme can extend a theme that extends another', () => {
    const a = defineTheme({ name: 'a', extends: 'arcade', style: { radius: '0' } });
    const b = defineTheme({ name: 'b', extends: a });
    expect(b.vars['--badgetrip-radius']).toBe('0');
    expect(b.vars['--badgetrip-accent']).toBe(themes.arcade.vars['--badgetrip-accent']);
  });
});

describe('validation', () => {
  it('needs a name', () => {
    bad({}, /name must be 1-64 characters/);
    bad({ name: '' }, /name must be 1-64 characters/);
    bad(null, /theme must be an object/);
  });

  it('rejects unknown keys at every level, so typos surface', () => {
    bad({ name: 'x', colours: {} }, /unknown option 'colours'/);
    bad({ name: 'x', style: { acent: 'red' } }, /style: unknown option 'acent'/);
    bad({ name: 'x', style: { locked: { blur: 1 } } }, /style.locked: unknown option 'blur'/);
    bad({ name: 'x', icons: { colour: 'red' } }, /icons: unknown option 'colour'/);
  });

  it('keeps style values from escaping their declaration', () => {
    bad({ name: 'x', style: { accent: 'red;}body{display:none' } }, /style.accent/);
    bad({ name: 'x', style: { bg: '</style><script>' } }, /style.bg/);
    bad({ name: 'x', style: { bg: '' } }, /style.bg/);
    bad({ name: 'x', style: { accent: 5 } }, /style.accent/);
  });

  it('vets url() in style values like any other image', () => {
    bad({ name: 'x', style: { fullscreenBg: 'url(javascript:alert(1))' } }, /unsafe URL/);
    bad({ name: 'x', style: { fullscreenBg: 'url("data:text/html,<b>")' } }, /style.fullscreenBg/);
    const ok = defineTheme({ name: 'x', style: { fullscreenBg: 'url("/bg.png") center/cover' } });
    expect(ok.vars['--badgetrip-fullscreen-bg']).toBe('url("/bg.png") center/cover');
  });

  it('checks the locked badge look', () => {
    bad({ name: 'x', style: { locked: { opacity: 2 } } }, /style.locked.opacity must be 0-1/);
    bad({ name: 'x', style: { locked: 'gray' } }, /style.locked must be an object/);
  });

  it('checks icon assets and colors', () => {
    bad({ name: 'x', icons: { overrides: { a: { src: 'javascript:x' } } } }, /icons.overrides.a/);
    bad({ name: 'x', icons: { icons: { t: { src: '/t.png', still: 'vbscript:x' } } } }, /still/);
    bad({ name: 'x', icons: { icons: { t: 7 } } }, /icons.icons.t/);
    bad({ name: 'x', icons: { color: 'red;x' } }, /icons.color/);
    bad({ name: 'x', icons: { tierColors: { gold: '}' } } }, /icons.tierColors.gold/);
    bad({ name: 'x', icons: { fallback: '' } }, /icons.fallback/);
  });

  it('folds celebration errors into the same message', () => {
    bad(
      { name: 'x', celebrations: { default: { layout: 'banner' } } },
      /celebrations: default.layout must be toast, modal or fullscreen/,
    );
  });

  it('only extends a theme or a built-in name', () => {
    bad({ name: 'x', extends: 'nope' }, /extends: unknown theme 'nope'/);
    bad({ name: 'x', extends: { name: 'fake', vars: {} } }, /extends must be a built-in name/);
  });

  it('reports every problem in one error', () => {
    try {
      defineTheme({
        name: '',
        style: { accent: '}' },
        icons: { colour: 'x' },
      } as unknown as Parameters<typeof defineTheme>[0]);
      expect.unreachable();
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toMatch(/^invalid badgetrip theme/);
      expect(msg).toMatch(/name/);
      expect(msg).toMatch(/style.accent/);
      expect(msg).toMatch(/icons: unknown option 'colour'/);
    }
  });
});

describe('built-in themes', () => {
  it('ships classic, dark, arcade, minimal and aurora, all frozen', () => {
    expect(Object.keys(themes)).toEqual(['classic', 'dark', 'arcade', 'minimal', 'aurora']);
    expect(Object.isFrozen(themes)).toBe(true);
    for (const [k, t] of Object.entries(themes)) {
      expect(t.name).toBe(k);
      expect(Object.isFrozen(t)).toBe(true);
    }
  });

  it('classic is exactly the look without a theme', () => {
    expect(themes.classic.vars).toEqual({});
    for (const s of [{ code: 'a' }, { code: 'b', series: { code: 's', tier: 'gold' } }]) {
      expect(themes.classic.icons.resolve(s)).toEqual(createIconResolver().resolve(s));
    }
    for (const s of [
      { code: 'a' },
      { code: 'b', celebration: 'epic' },
      { code: 'c', hidden: true },
    ]) {
      expect(themes.classic.celebrations.resolve(s)).toEqual(
        createCelebrationResolver().resolve(s),
      );
    }
  });

  it('arcade plays its own synthesized sound with confetti, minimal stays silent', () => {
    const arcade = themes.arcade.celebrations.resolve({ code: 'a' });
    expect(arcade.sound).toMatchObject({ tones: expect.any(Array) });
    expect(arcade.confetti).not.toBeNull();
    const minimal = themes.minimal.celebrations.resolve({ code: 'a', celebration: 'epic' });
    expect(minimal.sound).toBeNull();
    expect(minimal.confetti).toBeNull();
    expect(minimal.layout).not.toBe('fullscreen');
  });
});

describe('themeCss', () => {
  it('writes the vars as one rule for server rendering', () => {
    const t = defineTheme({ name: 'x', style: { accent: 'red', radius: '4px' } });
    expect(themeCss(t)).toBe(':root{--badgetrip-accent:red;--badgetrip-radius:4px}');
    expect(themeCss(t, '.app')).toBe('.app{--badgetrip-accent:red;--badgetrip-radius:4px}');
    expect(themeCss(themes.classic)).toBe('');
  });

  it('refuses a selector that could break out of the rule', () => {
    const t = defineTheme({ name: 'x', style: { accent: 'red' } });
    expect(() => themeCss(t, '}body{')).toThrow(/selector/);
    expect(() => themeCss(t, '</style>')).toThrow(/selector/);
  });
});

describe('review fixes', () => {
  it('replaces a whole icon, sound or progress setting when extending, never mixing fields', () => {
    const base = defineTheme({
      name: 'base',
      icons: { overrides: { a: { src: '/a.gif', still: '/a.png', animated: true } } },
      celebrations: {
        default: { progress: { at: [50] } },
        sounds: { ding: '/ding.mp3' },
        presets: { p: { sound: 'ding' } },
      },
    });
    const t = defineTheme({
      name: 'child',
      extends: base,
      icons: { overrides: { a: { src: '/b.png' } } },
      celebrations: {
        default: { progress: { every: 2 } },
        sounds: { ding: { tones: [{ freq: 440, at: 0, dur: 0.1 }] } },
      },
    });
    expect(t.icons.resolve({ code: 'a' })).toEqual({ src: '/b.png' });
    const c = t.celebrations.resolve({ code: 'x', celebration: 'p' });
    expect(c.sound).toEqual({ tones: [{ freq: 440, at: 0, dur: 0.1 }] });
    expect(c.progress).toMatchObject({ at: null, every: 2 });
  });

  it('rejects CSS that would leave the rule open', () => {
    for (const v of ['rgb(1,2,3', 'red)', '"Inter, sans-serif', "'x", 'red /* x', 'red */']) {
      bad({ name: 'x', style: { accent: v } }, /style.accent/);
    }
    const ok = defineTheme({
      name: 'x',
      style: { font: '600 14px/1.4 "Press Start 2P", monospace' },
    });
    expect(ok.vars['--badgetrip-font']).toBe('600 14px/1.4 "Press Start 2P", monospace');
  });
});

describe('gradients', () => {
  it('builds linear gradients from an angle or a direction, with optional stops', () => {
    expect(gradient({ colors: ['#4c1d95', '#db2777'], angle: 135 })).toBe(
      'linear-gradient(135deg, #4c1d95, #db2777)',
    );
    expect(gradient({ colors: ['red', 'blue'], to: 'bottom right' })).toBe(
      'linear-gradient(to bottom right, red, blue)',
    );
    expect(
      gradient({ colors: [{ color: 'red', at: 0 }, 'white', { color: 'blue', at: 80 }] }),
    ).toBe('linear-gradient(red 0%, white, blue 80%)');
  });

  it('builds radial gradients with a shape and position', () => {
    expect(gradient({ type: 'radial', colors: ['#3a0a6b', '#0a0014'], position: 'top' })).toBe(
      'radial-gradient(circle at top, #3a0a6b, #0a0014)',
    );
    expect(gradient({ type: 'radial', shape: 'ellipse', colors: ['a', 'b'] })).toBe(
      'radial-gradient(ellipse at center, a, b)',
    );
  });

  it('takes a gradient object in background style fields, so themes stay plain JSON', () => {
    const json = JSON.stringify({
      name: 'sunset',
      style: {
        bg: { colors: ['#f97316', '#db2777'], angle: 90 },
        fullscreenBg: { type: 'radial', colors: ['#7c2d12', '#1c1917'] },
        iconBg: { colors: ['#fff7ed', '#fde68a'], to: 'bottom' },
      },
    });
    const t = defineTheme(JSON.parse(json));
    expect(t.vars['--badgetrip-bg']).toBe('linear-gradient(90deg, #f97316, #db2777)');
    expect(t.vars['--badgetrip-fullscreen-bg']).toBe(
      'radial-gradient(circle at center, #7c2d12, #1c1917)',
    );
    expect(t.vars['--badgetrip-icon-bg']).toBe('linear-gradient(to bottom, #fff7ed, #fde68a)');
    expect(themeCss(t)).toContain('--badgetrip-bg:linear-gradient(90deg, #f97316, #db2777)');
  });

  it('checks every part of a gradient', () => {
    const g = (spec: unknown) => () => gradient(spec as Parameters<typeof gradient>[0]);
    expect(g({ colors: ['red'] })).toThrow(/2-8 colors/);
    expect(g({ colors: ['red', 'blue'], angle: 400 })).toThrow(/angle/);
    expect(g({ colors: ['red', 'blue'], angle: 90, to: 'right' })).toThrow(/angle or to/);
    expect(g({ colors: ['red', 'blue'], to: 'sideways' })).toThrow(/to must be/);
    expect(g({ type: 'radial', colors: ['red', 'blue'], angle: 90 })).toThrow(/linear only/);
    expect(g({ type: 'conic', colors: ['red', 'blue'] })).toThrow(/type/);
    expect(g({ colors: ['red;}', 'blue'] })).toThrow(/colors\[0\]/);
    expect(g({ colors: [{ color: 'red', at: 120 }, 'blue'] })).toThrow(/at must be 0-100/);
    expect(g({ colors: ['red', 'blue'], spin: 1 })).toThrow(/unknown option 'spin'/);
    bad({ name: 'x', style: { accent: { colors: ['a', 'b'] } } }, /style.accent/);
    bad({ name: 'x', style: { bg: { colors: ['a'] } } }, /style.bg.colors/);
  });

  it('replaces a whole gradient when extending', () => {
    const t = defineTheme({
      name: 'mine',
      extends: 'aurora',
      style: { bg: { colors: ['#0ea5e9', '#22c55e'], to: 'right' } },
    });
    expect(t.vars['--badgetrip-bg']).toBe('linear-gradient(to right, #0ea5e9, #22c55e)');
  });

  it('ships aurora, a gradient theme, as the sample', () => {
    expect(themes.aurora.vars['--badgetrip-bg']).toMatch(/^linear-gradient\(/);
    expect(themes.aurora.vars['--badgetrip-fullscreen-bg']).toMatch(/^radial-gradient\(/);
  });
});

describe('gradient icons', () => {
  const decode = (src: string) => decodeURIComponent(src.slice('data:image/svg+xml,'.length));

  it('paints an icon with one gradient across the whole drawing', () => {
    const markup = decode(svgToDataUrl(svgs.star, { colors: ['#f97316', '#db2777'], angle: 90 }));
    const id = /<linearGradient id="([\w-]+)" gradientUnits="userSpaceOnUse"/.exec(markup)?.[1];
    expect(id).toMatch(/^badgetrip-paint-/);
    expect(markup).toContain('x1="0" y1="12" x2="24" y2="12"');
    expect(markup).toContain('<stop offset="0%" stop-color="#f97316"/>');
    expect(markup).toContain('<stop offset="100%" stop-color="#db2777"/>');
    expect(markup).toContain(`stroke="url(#${id})"`);
    expect(markup).not.toContain('currentColor');
  });

  it('gives different gradients different ids, and radial gradients a center', () => {
    const a = decode(svgToDataUrl(svgs.star, { colors: ['red', 'blue'] }));
    const b = decode(svgToDataUrl(svgs.star, { colors: ['red', 'green'] }));
    const id = (m: string) => /id="([\w-]+)"/.exec(m)?.[1];
    expect(id(a)).not.toBe(id(b));
    const radial = decode(svgToDataUrl(svgs.star, { type: 'radial', colors: ['red', 'blue'] }));
    expect(radial).toContain('<radialGradient');
    expect(radial).toContain('cx="12" cy="12" r="16.971"');
  });

  it('works as the icon color and as a tier color, keeping raw markup for tinting', () => {
    const icons = createIconResolver({
      color: { colors: ['#a855f7', '#ec4899'], to: 'bottom right' },
      tierColors: { gold: { colors: ['#fde68a', '#d97706'], angle: 180 } },
    });
    const plain = icons.resolve({ code: 'a' });
    expect(decode(plain.src)).toContain('stop-color="#a855f7"');
    expect(plain.svg).toContain('currentColor');
    const gold = icons.resolve({ code: 'b', series: { code: 's', tier: 'gold' } });
    expect(decode(gold.src)).toContain('stop-color="#d97706"');
  });

  it('is accepted in themes, validated, and replaced whole when extending', () => {
    const t = defineTheme({
      name: 'x',
      extends: 'aurora',
      icons: { color: { colors: ['#22c55e', '#0ea5e9'], to: 'right' } },
    });
    expect(decode(t.icons.resolve({ code: 'a' }).src)).toContain('stop-color="#0ea5e9"');
    bad({ name: 'x', icons: { color: '"red' } }, /icons.color/);
    bad({ name: 'x', icons: { color: { colors: ['red'] } } }, /icons.color.colors/);
    bad(
      { name: 'x', icons: { tierColors: { gold: { colors: ['a"b', 'c'] } } } },
      /tierColors.gold/,
    );
  });

  it('aurora paints its icons with a gradient', () => {
    expect(decode(themes.aurora.icons.resolve({ code: 'a' }).src)).toContain('<linearGradient');
  });
});

describe('docs samples', () => {
  it('the themes guide sunset theme is valid', () => {
    const sunset = defineTheme({
      name: 'sunset',
      style: {
        accent: '#fde68a',
        fg: '#ffffff',
        bg: { colors: ['#f97316', '#db2777'], angle: 135 },
        iconBg: { colors: ['rgba(255,255,255,.3)', 'rgba(255,255,255,.1)'], to: 'bottom' },
        fullscreenBg: {
          type: 'radial',
          position: 'top',
          colors: [
            { color: '#fb923c', at: 0 },
            { color: '#9d174d', at: 60 },
            { color: '#1c1917', at: 100 },
          ],
        },
      },
      icons: {
        color: { colors: ['#ffffff', '#fde68a'], to: 'bottom right' },
        tierColors: {
          gold: { colors: ['#fef3c7', '#d97706'], angle: 180 },
          silver: { colors: ['#f8fafc', '#94a3b8'], angle: 180 },
        },
      },
    });
    expect(sunset.vars['--badgetrip-fullscreen-bg']).toBe(
      'radial-gradient(circle at top, #fb923c 0%, #9d174d 60%, #1c1917 100%)',
    );
    expect(gradient({ colors: ['#4c1d95', '#db2777'], to: 'right' })).toBe(
      'linear-gradient(to right, #4c1d95, #db2777)',
    );
  });
});

describe('gradient review fixes', () => {
  const decode = (src: string) => decodeURIComponent(src.slice('data:image/svg+xml,'.length));
  const paint = (spec: Parameters<typeof gradient>[0], markup = svgs.star) =>
    decode(svgToDataUrl(markup, spec));

  it('refuses url() and other non-color functions as icon colors', () => {
    bad({ name: 'x', icons: { color: 'url(//tracker.example/p.svg#a)' } }, /icons.color/);
    bad({ name: 'x', icons: { color: { colors: ['url(#x)', 'red'] } } }, /icons.color.colors\[0\]/);
    bad({ name: 'x', icons: { color: 'expression(alert(1))' } }, /icons.color/);
    const ok = defineTheme({
      name: 'x',
      icons: { color: { colors: ['rgb(1 2 3 / 50%)', 'hsl(280 80% 60%)', 'oklch(70% 0.2 300)'] } },
    });
    expect(ok.name).toBe('x');
  });

  it('places mixed stops the way CSS does', () => {
    const svg = paint({ colors: [{ color: 'red', at: 0 }, 'blue', { color: 'green', at: 20 }] });
    expect(svg).toContain('<stop offset="0%" stop-color="red"/>');
    expect(svg).toContain('<stop offset="10%" stop-color="blue"/>');
    expect(svg).toContain('<stop offset="20%" stop-color="green"/>');
    const back = paint({
      colors: [
        { color: 'red', at: 60 },
        { color: 'blue', at: 30 },
      ],
    });
    expect(back).toContain('<stop offset="60%" stop-color="blue"/>');
  });

  it('runs a linear gradient corner to corner like CSS, and radial out to the farthest corner', () => {
    expect(paint({ colors: ['a', 'b'], angle: 135 })).toContain('x1="0" y1="0" x2="24" y2="24"');
    expect(paint({ colors: ['a', 'b'], angle: 90 })).toContain('x1="0" y1="12" x2="24" y2="12"');
    expect(paint({ type: 'radial', colors: ['a', 'b'] })).toContain('cx="12" cy="12" r="16.971"');
    expect(paint({ type: 'radial', colors: ['a', 'b'], position: 'top left' })).toContain(
      'cx="0" cy="0" r="33.941"',
    );
  });

  it('handles user SVGs with an xml header and a non-square, offset viewBox', () => {
    const own =
      '<?xml version="1.0"?><!-- art --><svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 48 24"><path stroke="currentColor" d="M0 0"/></svg>';
    const svg = paint({ colors: ['red', 'blue'], angle: 90 }, own);
    expect(svg.indexOf('<defs>')).toBeGreaterThan(svg.indexOf('<svg'));
    expect(svg).toContain('x1="10" y1="32" x2="58" y2="32"');
    const square = paint({ colors: ['red', 'blue'], angle: 90 });
    const id = (m: string) => /id="([\w-]+)"/.exec(m)?.[1];
    expect(id(svg)).not.toBe(id(square));
  });

  it('createIconResolver checks gradient objects too', () => {
    expect(() => createIconResolver({ color: { colors: ['red'] } })).toThrow(/color.colors/);
    expect(() =>
      createIconResolver({
        tierColors: { gold: { type: 'radial', position: 'middle' as never, colors: ['a', 'b'] } },
      }),
    ).toThrow(/tierColors.gold.position/);
  });
});
