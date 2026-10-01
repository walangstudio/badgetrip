import {
  createCelebrationResolver,
  createIconResolver,
  defineTheme,
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
  it('ships classic, dark, arcade and minimal, all frozen', () => {
    expect(Object.keys(themes)).toEqual(['classic', 'dark', 'arcade', 'minimal']);
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
