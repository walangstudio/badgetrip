import { safeSrc } from './safe.js';
import { type SoundAsset, type Tone, builtinSounds } from './sounds.js';

export type Layout = 'toast' | 'modal' | 'fullscreen';
export type Position =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'right'
  | 'bottom-right'
  | 'bottom'
  | 'bottom-left'
  | 'left';

export type ConfettiSpec = { particles?: number; colors?: string[]; duration?: number };

/** How an unlock is celebrated. Every field is optional; layers merge field by field. */
export type CelebrationSpec = {
  /** `toast` (default), `modal`, or `fullscreen`. */
  layout?: Layout;
  /** Where toasts appear. Ignored by `modal` and `fullscreen`. */
  position?: Position;
  /** Milliseconds before it closes itself. `0` stays until dismissed. */
  duration?: number;
  /** A sound key (built-in or from `sounds`), or `false` for silence. */
  sound?: string | false;
  confetti?: boolean | ConfettiSpec;
  /** Heading above the achievement name, e.g. "Achievement unlocked". */
  title?: string;
  /** Record the unlock without any popup or sound. */
  quiet?: boolean;
};

/** A fully resolved celebration, ready for a notifier. */
export type Celebration = {
  layout: Layout;
  position: Position;
  duration: number;
  sound: SoundAsset | null;
  confetti: Required<ConfettiSpec> | null;
  title: string;
  quiet: boolean;
};

/** What the resolver needs from an achievement. `AchievementView` fits. */
export type CelebrationSubject = {
  code: string;
  celebration?: string;
  category?: string;
  rarity?: number;
  series?: { code: string };
  hidden?: boolean;
};

type Ref = string | CelebrationSpec;

export type CelebrationResolverOptions = {
  /** Merged over the built-in default for every unlock. */
  default?: CelebrationSpec;
  /** Named presets an achievement picks with `celebration: 'name'`. Merged over the built-ins. */
  presets?: Record<string, CelebrationSpec>;
  /** Per achievement code, or per tier series code to cover every tier. */
  overrides?: Record<string, Ref>;
  /** Per achievement category. */
  categories?: Record<string, Ref>;
  /** Per rarity level, 1-5. */
  rarity?: Partial<Record<1 | 2 | 3 | 4 | 5, Ref>>;
  /** Extra sounds: a file URL, or synthesized `{ tones }`. */
  sounds?: Record<string, string | SoundAsset>;
};

export type CelebrationResolver = {
  /**
   * The celebration for one unlock. Layers merge field by field, later ones winning:
   * default, rarity, category, `secret` (hidden achievements), the achievement's own
   * preset, the series override, the code override.
   */
  resolve(subject: CelebrationSubject): Celebration;
  /** Preset keys the given achievements name that no preset defines. */
  missing(subjects: CelebrationSubject[]): string[];
};

const LAYOUTS = new Set<string>(['toast', 'modal', 'fullscreen']);
const POSITIONS = new Set<string>([
  'top-left',
  'top',
  'top-right',
  'right',
  'bottom-right',
  'bottom',
  'bottom-left',
  'left',
]);
const WAVES = new Set<string>(['sine', 'square', 'triangle', 'sawtooth']);
const SPEC_KEYS = new Set([
  'layout',
  'position',
  'duration',
  'sound',
  'confetti',
  'title',
  'quiet',
]);
const CONFETTI_KEYS = new Set(['particles', 'colors', 'duration']);
const OPTION_KEYS = new Set(['default', 'presets', 'overrides', 'categories', 'rarity', 'sounds']);

const DEFAULT_CONFETTI: Required<ConfettiSpec> = {
  particles: 150,
  colors: ['#f94144', '#f8961e', '#f9c74f', '#90be6d', '#43aa8b', '#577590', '#9b5de5'],
  duration: 3000,
};

const BASE: Required<Omit<CelebrationSpec, 'confetti'>> & { confetti: boolean } = {
  layout: 'toast',
  position: 'top-right',
  duration: 5000,
  sound: 'chime',
  confetti: false,
  title: 'Achievement unlocked',
  quiet: false,
};

const BUILTIN_PRESETS: Record<string, CelebrationSpec> = {
  toast: { layout: 'toast' },
  modal: { layout: 'modal', duration: 0 },
  epic: { layout: 'fullscreen', duration: 7000, sound: 'fanfare', confetti: true },
  quiet: { quiet: true },
  secret: { title: 'Secret achievement unlocked', sound: 'sparkle' },
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, lo: number, hi: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const isNum = (v: unknown, lo: number, hi: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const own = (o: object, k: string) => Object.hasOwn(o, k);

function checkTones(where: string, tones: unknown, errs: string[]) {
  if (!Array.isArray(tones) || tones.length === 0) {
    errs.push(`${where}.tones must be a non-empty array`);
    return;
  }
  if (tones.length > 32) errs.push(`${where}.tones: at most 32 tones`);
  let end = 0;
  tones.forEach((t: Tone, i) => {
    const w = `${where}.tones[${i}]`;
    if (!isObj(t)) return void errs.push(`${w} must be an object`);
    if (!isNum(t.freq, 20, 20000)) errs.push(`${w}.freq must be 20-20000 Hz`);
    if (!isNum(t.at, 0, 5)) errs.push(`${w}.at must be 0-5 seconds`);
    if (!isNum(t.dur, 0.001, 5)) errs.push(`${w}.dur must be above 0 and at most 5 seconds`);
    if (t.gain !== undefined && !isNum(t.gain, 0, 1)) errs.push(`${w}.gain must be 0-1`);
    if (t.wave !== undefined && !WAVES.has(t.wave)) {
      errs.push(`${w}.wave must be sine, square, triangle or sawtooth`);
    }
    if (Number.isFinite(t.at + t.dur)) end = Math.max(end, t.at + t.dur);
  });
  if (end > 5) errs.push(`${where}: a sound must end within 5 seconds`);
}

function toSound(where: string, v: unknown, errs: string[]): SoundAsset | undefined {
  if (typeof v === 'string') {
    if (!safeSrc(v, 'audio')) return void errs.push(`${where}: unsafe URL`);
    return { src: v };
  }
  if (isObj(v) && typeof v.src === 'string') {
    if (!safeSrc(v.src, 'audio')) return void errs.push(`${where}: unsafe URL`);
    return { src: v.src };
  }
  if (isObj(v) && own(v, 'tones')) {
    checkTones(where, v.tones, errs);
    return v as SoundAsset;
  }
  errs.push(`${where} must be a URL, { src } or { tones }`);
}

function checkSpec(where: string, spec: unknown, sounds: Map<string, SoundAsset>, errs: string[]) {
  if (!isObj(spec)) return void errs.push(`${where} must be an object`);
  for (const k of Object.keys(spec)) {
    if (!SPEC_KEYS.has(k)) errs.push(`${where}: unknown option '${k}'`);
  }
  const s = spec as CelebrationSpec;
  if (s.layout !== undefined && !LAYOUTS.has(s.layout)) {
    errs.push(`${where}.layout must be toast, modal or fullscreen`);
  }
  if (s.position !== undefined && !POSITIONS.has(s.position)) {
    errs.push(`${where}.position must be one of ${[...POSITIONS].join(', ')}`);
  }
  if (s.duration !== undefined && !isInt(s.duration, 0, 600_000)) {
    errs.push(`${where}.duration must be a whole number of ms, 0-600000`);
  }
  if (
    s.sound !== undefined &&
    s.sound !== false &&
    !(typeof s.sound === 'string' && sounds.has(s.sound))
  ) {
    errs.push(`${where}: unknown sound '${String(s.sound)}'`);
  }
  if (
    s.title !== undefined &&
    !(typeof s.title === 'string' && s.title.length >= 1 && s.title.length <= 200)
  ) {
    errs.push(`${where}.title must be 1-200 characters`);
  }
  if (s.quiet !== undefined && typeof s.quiet !== 'boolean')
    errs.push(`${where}.quiet must be true or false`);
  const c = s.confetti;
  if (c === undefined || typeof c === 'boolean') return;
  if (!isObj(c)) return void errs.push(`${where}.confetti must be true, false or an object`);
  for (const k of Object.keys(c)) {
    if (!CONFETTI_KEYS.has(k)) errs.push(`${where}.confetti: unknown option '${k}'`);
  }
  if (c.particles !== undefined && !isInt(c.particles, 1, 500)) {
    errs.push(`${where}.confetti.particles must be 1-500`);
  }
  if (
    c.colors !== undefined &&
    !(
      Array.isArray(c.colors) &&
      c.colors.length >= 1 &&
      c.colors.length <= 16 &&
      c.colors.every((x) => typeof x === 'string' && x.length > 0)
    )
  ) {
    errs.push(`${where}.confetti.colors must be 1-16 non-empty strings`);
  }
  if (c.duration !== undefined && !isInt(c.duration, 100, 10_000)) {
    errs.push(`${where}.confetti.duration must be 100-10000 ms`);
  }
}

/**
 * Decide how each unlock is celebrated: layout, position, sound, confetti. Validates
 * the whole config up front and throws one error listing every problem.
 */
export function createCelebrationResolver(
  opts: CelebrationResolverOptions = {},
): CelebrationResolver {
  const errs: string[] = [];
  if (!isObj(opts)) throw new TypeError('createCelebrationResolver: options must be an object');
  for (const k of Object.keys(opts)) {
    if (!OPTION_KEYS.has(k)) errs.push(`unknown option '${k}'`);
  }

  const sounds = new Map<string, SoundAsset>(Object.entries(builtinSounds));
  for (const [k, v] of Object.entries(opts.sounds ?? {})) {
    const asset = toSound(`sounds.${k}`, v, errs);
    if (asset) sounds.set(k, asset);
  }

  const presets = new Map<string, CelebrationSpec>(Object.entries(BUILTIN_PRESETS));
  for (const [k, v] of Object.entries(opts.presets ?? {})) {
    checkSpec(`presets.${k}`, v, sounds, errs);
    presets.set(k, { ...presets.get(k), ...v });
  }
  if (opts.default !== undefined) checkSpec('default', opts.default, sounds, errs);

  const refs = (where: string, map: Record<string, Ref> | undefined) => {
    const out = new Map<string, CelebrationSpec>();
    for (const [k, v] of Object.entries(map ?? {})) {
      if (typeof v === 'string') {
        const p = presets.get(v);
        if (p) out.set(k, p);
        else errs.push(`${where}.${k}: unknown preset '${v}'`);
      } else {
        checkSpec(`${where}.${k}`, v, sounds, errs);
        out.set(k, v);
      }
    }
    return out;
  };
  for (const k of Object.keys(opts.rarity ?? {})) {
    if (!['1', '2', '3', '4', '5'].includes(k)) errs.push(`rarity: level '${k}' must be 1-5`);
  }
  const overrides = refs('overrides', opts.overrides);
  const categories = refs('categories', opts.categories);
  const rarity = refs('rarity', opts.rarity as Record<string, Ref>);

  if (errs.length) throw new Error(`invalid badgetrip celebrations:\n  ${errs.join('\n  ')}`);

  const base = { ...BASE, ...opts.default };
  return {
    resolve(s) {
      const layers = [
        s.rarity !== undefined ? rarity.get(String(s.rarity)) : undefined,
        s.category !== undefined ? categories.get(s.category) : undefined,
        s.hidden ? presets.get('secret') : undefined,
        s.celebration !== undefined ? presets.get(s.celebration) : undefined,
        s.series ? overrides.get(s.series.code) : undefined,
        overrides.get(s.code),
      ];
      const m = Object.assign({ ...base }, ...layers.filter(Boolean)) as typeof base;
      const c = m.confetti;
      return {
        layout: m.layout,
        position: m.position,
        duration: m.duration,
        sound: m.sound === false ? null : (sounds.get(m.sound) ?? null),
        confetti: c ? { ...DEFAULT_CONFETTI, ...(c === true ? {} : c) } : null,
        title: m.title,
        quiet: m.quiet,
      };
    },
    missing(subjects) {
      const keys = new Set<string>();
      for (const s of subjects) {
        if (s.celebration !== undefined && !presets.has(s.celebration)) keys.add(s.celebration);
      }
      return [...keys];
    },
  };
}
