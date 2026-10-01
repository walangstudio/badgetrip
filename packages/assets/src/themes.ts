import {
  type CelebrationResolver,
  type CelebrationResolverOptions,
  createCelebrationResolver,
} from './celebrations.js';
import { type IconResolver, type IconResolverOptions, createIconResolver } from './resolver.js';
import { safeSrc } from './safe.js';

/** Colors and shape, written to `--badgetrip-*` custom properties. Popups and badges read them. */
export type ThemeStyle = {
  /** Popup titles, progress bars and focus rings. */
  accent?: string;
  /** Popup text. */
  fg?: string;
  /** Popup background. */
  bg?: string;
  radius?: string;
  /** A CSS `font` shorthand for popups. */
  font?: string;
  /** Behind a modal. */
  backdrop?: string;
  /** Behind a fullscreen celebration. `url(...)` images are allowed. */
  fullscreenBg?: string;
  /** The circle behind a popup's icon. */
  iconBg?: string;
  /** How locked badges look. */
  locked?: { filter?: string; opacity?: number };
};

export type BuiltinThemeName = 'classic' | 'dark' | 'arcade' | 'minimal';

export type ThemeInput = {
  name: string;
  /** Start from another theme or a built-in name. Nested maps merge key by key; this theme wins. */
  extends?: Theme | BuiltinThemeName;
  style?: ThemeStyle;
  icons?: IconResolverOptions;
  celebrations?: CelebrationResolverOptions;
};

/** A validated theme. Pass it to a provider, notifier or `applyTheme`, or share it as a package. */
export type Theme = {
  readonly name: string;
  readonly icons: IconResolver;
  readonly celebrations: CelebrationResolver;
  /** `--badgetrip-*` custom properties. Empty means the built-in look. */
  readonly vars: Readonly<Record<string, string>>;
};

type Spec = Omit<ThemeInput, 'extends'>;

const KEYS = new Set(['name', 'extends', 'style', 'icons', 'celebrations']);
const VARS: Record<string, string> = {
  accent: '--badgetrip-accent',
  fg: '--badgetrip-fg',
  bg: '--badgetrip-bg',
  radius: '--badgetrip-radius',
  font: '--badgetrip-font',
  backdrop: '--badgetrip-backdrop',
  fullscreenBg: '--badgetrip-fullscreen-bg',
  iconBg: '--badgetrip-icon-bg',
};
const STYLE_KEYS = new Set([...Object.keys(VARS), 'locked']);
const LOCKED_KEYS = new Set(['filter', 'opacity']);
const ICON_KEYS = new Set(['icons', 'overrides', 'categories', 'fallback', 'color', 'tierColors']);
const ASSET_KEYS = new Set(['src', 'still', 'animated']);

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A deep copy with nested plain objects merged key by key; arrays and scalars are replaced. */
function merge(a: unknown, b: unknown): unknown {
  if (b === undefined) return copy(a);
  if (!isObj(a) || !isObj(b)) return copy(b);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return Object.fromEntries([...keys].map((k) => [k, merge(a[k], b[k])]));
}
const copy = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(copy)
    : isObj(v)
      ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, copy(x)]))
      : v;

const URL_RE = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s'")]*))\s*\)/gi;

/** A CSS value that cannot end its declaration or rule, with every `url()` vetted. */
function checkCss(where: string, v: unknown, errs: string[]) {
  if (typeof v !== 'string' || v.length < 1 || v.length > 300 || /[;{}<>\\]/.test(v)) {
    return void errs.push(`${where} must be a CSS value of 1-300 characters without ; { } < > \\`);
  }
  const urls = [...v.matchAll(URL_RE)];
  if (urls.length !== (v.match(/url\(/gi) ?? []).length) {
    return void errs.push(`${where}: malformed url()`);
  }
  for (const m of urls) {
    if (!safeSrc(m[1] ?? m[2] ?? m[3] ?? '', 'image')) errs.push(`${where}: unsafe URL`);
  }
}

function checkStyle(style: unknown, errs: string[]) {
  if (style === undefined) return;
  if (!isObj(style)) return void errs.push('style must be an object');
  for (const [k, v] of Object.entries(style)) {
    if (!STYLE_KEYS.has(k)) errs.push(`style: unknown option '${k}'`);
    else if (k !== 'locked') checkCss(`style.${k}`, v, errs);
  }
  const locked = style.locked;
  if (locked === undefined) return;
  if (!isObj(locked)) return void errs.push('style.locked must be an object');
  for (const k of Object.keys(locked)) {
    if (!LOCKED_KEYS.has(k)) errs.push(`style.locked: unknown option '${k}'`);
  }
  if (locked.filter !== undefined) checkCss('style.locked.filter', locked.filter, errs);
  const o = locked.opacity;
  if (o !== undefined && !(typeof o === 'number' && Number.isFinite(o) && o >= 0 && o <= 1)) {
    errs.push('style.locked.opacity must be 0-1');
  }
}

const isKey = (v: unknown) => typeof v === 'string' && v.length >= 1 && v.length <= 100;

function checkAssets(where: string, map: unknown, errs: string[]) {
  if (map === undefined) return;
  if (!isObj(map)) return void errs.push(`${where} must be an object`);
  for (const [k, v] of Object.entries(map)) {
    const w = `${where}.${k}`;
    if (isKey(v)) continue;
    if (!isObj(v) || typeof v.src !== 'string') {
      errs.push(`${w} must be an icon key or { src, still?, animated? }`);
      continue;
    }
    for (const x of Object.keys(v))
      if (!ASSET_KEYS.has(x)) errs.push(`${w}: unknown option '${x}'`);
    if (!v.src || !safeSrc(v.src, 'image')) errs.push(`${w}.src: unsafe URL`);
    if (v.still !== undefined && (typeof v.still !== 'string' || !safeSrc(v.still, 'image'))) {
      errs.push(`${w}.still: unsafe URL`);
    }
    if (v.animated !== undefined && typeof v.animated !== 'boolean') {
      errs.push(`${w}.animated must be true or false`);
    }
  }
}

function checkIcons(icons: unknown, errs: string[]) {
  if (icons === undefined) return;
  if (!isObj(icons)) return void errs.push('icons must be an object');
  for (const k of Object.keys(icons)) {
    if (!ICON_KEYS.has(k)) errs.push(`icons: unknown option '${k}'`);
  }
  checkAssets('icons.icons', icons.icons, errs);
  checkAssets('icons.overrides', icons.overrides, errs);
  if (icons.categories !== undefined) {
    if (!isObj(icons.categories)) errs.push('icons.categories must be an object');
    else {
      for (const [k, v] of Object.entries(icons.categories)) {
        if (!isKey(v)) errs.push(`icons.categories.${k} must be an icon key`);
      }
    }
  }
  if (icons.fallback !== undefined && !isKey(icons.fallback)) {
    errs.push('icons.fallback must be an icon key');
  }
  if (icons.color !== undefined) checkCss('icons.color', icons.color, errs);
  const tc = icons.tierColors;
  if (tc === undefined || tc === false) return;
  if (!isObj(tc)) return void errs.push('icons.tierColors must be an object or false');
  for (const [k, v] of Object.entries(tc)) checkCss(`icons.tierColors.${k}`, v, errs);
}

const specs = new WeakMap<Theme, Spec>();

function deepFreeze<T>(v: T): T {
  if (typeof v === 'object' && v !== null) {
    for (const x of Object.values(v)) deepFreeze(x);
    Object.freeze(v);
  }
  return v;
}

/**
 * A theme from plain data: colors, icons and celebrations in one object. Validates
 * everything up front and throws one error listing every problem. The result is
 * frozen and safe to share.
 */
export function defineTheme(input: ThemeInput): Theme {
  if (!isObj(input)) throw new TypeError('invalid badgetrip theme: theme must be an object');
  const errs: string[] = [];
  for (const k of Object.keys(input)) {
    if (!KEYS.has(k)) errs.push(`unknown option '${k}'`);
  }
  const { extends: base, ...own } = input;
  let baseSpec: Spec = { name: '' };
  if (typeof base === 'string') {
    const t = Object.hasOwn(builtins, base) ? builtins[base as BuiltinThemeName] : undefined;
    if (t) baseSpec = specs.get(t) as Spec;
    else errs.push(`extends: unknown theme '${base}'`);
  } else if (base !== undefined) {
    const s = specs.get(base as Theme);
    if (s) baseSpec = s;
    else errs.push('extends must be a built-in name or a theme from defineTheme()');
  }

  const spec = merge(baseSpec, own) as Spec;
  if (!(typeof spec.name === 'string' && spec.name.length >= 1 && spec.name.length <= 64)) {
    errs.push('name must be 1-64 characters');
  }
  checkStyle(spec.style, errs);
  checkIcons(spec.icons, errs);

  let celebrations: CelebrationResolver | undefined;
  try {
    celebrations = createCelebrationResolver(spec.celebrations ?? {});
  } catch (e) {
    const lines = (e as Error).message.split('\n').slice(1);
    if (lines.length) for (const l of lines) errs.push(`celebrations: ${l.trim()}`);
    else errs.push('celebrations must be an object');
  }

  if (errs.length) throw new Error(`invalid badgetrip theme:\n  ${errs.join('\n  ')}`);

  const vars: Record<string, string> = {};
  for (const [k, prop] of Object.entries(VARS)) {
    const v = (spec.style as Record<string, unknown> | undefined)?.[k];
    if (typeof v === 'string') vars[prop] = v;
  }
  const locked = spec.style?.locked;
  if (locked?.filter !== undefined) vars['--badgetrip-locked-filter'] = locked.filter;
  if (locked?.opacity !== undefined) vars['--badgetrip-locked-opacity'] = String(locked.opacity);

  const theme: Theme = Object.freeze({
    name: spec.name,
    icons: createIconResolver(spec.icons),
    celebrations: celebrations as CelebrationResolver,
    vars: Object.freeze(vars),
  });
  specs.set(theme, deepFreeze(spec));
  return theme;
}

/**
 * The theme's custom properties as one CSS rule, for a server-rendered `<style>` so the
 * page never flashes the default look. Empty for a theme with no style.
 */
export function themeCss(theme: Theme, selector = ':root'): string {
  if (typeof selector !== 'string' || !selector.trim() || /[{}<>;]/.test(selector)) {
    throw new TypeError(`themeCss: invalid selector '${selector}'`);
  }
  const decls = Object.entries(theme.vars).map(([k, v]) => `${k}:${v}`);
  return decls.length ? `${selector}{${decls.join(';')}}` : '';
}

const neon = ['#ff2bd6', '#00f0ff', '#f9f871', '#7b2ff7', '#39ff14'];

const builtins: Record<BuiltinThemeName, Theme> = {} as Record<BuiltinThemeName, Theme>;
builtins.classic = defineTheme({ name: 'classic' });
builtins.dark = defineTheme({
  name: 'dark',
  style: {
    accent: '#8b9cff',
    fg: '#f5f6fa',
    bg: '#161a24',
    iconBg: '#323a4e',
    backdrop: 'rgba(0,0,0,.7)',
    locked: { opacity: 0.35 },
  },
  icons: { color: '#d7dbe6' },
});
builtins.arcade = defineTheme({
  name: 'arcade',
  style: {
    accent: '#ff2bd6',
    fg: '#ffffff',
    bg: '#14002b',
    radius: '4px',
    font: '600 14px/1.4 ui-monospace, Menlo, Consolas, monospace',
    iconBg: '#3a0f63',
    locked: { opacity: 0.6 },
    fullscreenBg: 'radial-gradient(circle at 50% 40%, #3a0a6b 0%, #0a0014 70%)',
  },
  icons: { color: '#c084fc' },
  celebrations: {
    default: { sound: 'coin', confetti: { particles: 120, colors: neon } },
    presets: { epic: { sound: 'levelup', confetti: { particles: 320, colors: neon } } },
    sounds: {
      coin: {
        tones: [
          { freq: 987.77, at: 0, dur: 0.08, wave: 'square', gain: 0.25 },
          { freq: 1318.51, at: 0.08, dur: 0.35, wave: 'square', gain: 0.25 },
        ],
      },
      levelup: {
        tones: [
          { freq: 523.25, at: 0, dur: 0.1, wave: 'square', gain: 0.25 },
          { freq: 659.25, at: 0.1, dur: 0.1, wave: 'square', gain: 0.25 },
          { freq: 783.99, at: 0.2, dur: 0.1, wave: 'square', gain: 0.25 },
          { freq: 1046.5, at: 0.3, dur: 0.5, wave: 'square', gain: 0.3 },
        ],
      },
    },
  },
});
builtins.minimal = defineTheme({
  name: 'minimal',
  style: {
    accent: '#4b5563',
    fg: '#1f2330',
    bg: '#ffffff',
    radius: '6px',
    iconBg: '#f3f4f6',
    backdrop: 'rgba(15,17,26,.25)',
    fullscreenBg: 'rgba(255,255,255,.96)',
  },
  celebrations: {
    default: { sound: false, duration: 3000 },
    presets: {
      epic: { layout: 'modal', sound: false, confetti: false },
      secret: { sound: false },
    },
  },
});

/** Built-in themes. `classic` is the look without any theme. */
export const themes: Readonly<Record<BuiltinThemeName, Theme>> = Object.freeze(builtins);
