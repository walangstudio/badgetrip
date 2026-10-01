import { type GradientSpec, assertPaints, paintSvg } from './gradient.js';
import { svgs } from './icons.js';

/**
 * A renderable icon. `src` is anything an `<img>` accepts: a data URL, a PNG, a GIF,
 * an animated SVG or WebP. For animated icons give `still`, a static frame used for
 * locked badges and under `prefers-reduced-motion`.
 */
export type IconAsset = {
  src: string;
  still?: string;
  animated?: boolean;
  /** Raw SVG markup painted with `currentColor`, when the asset is tintable. */
  svg?: string;
  /** Raw SVG of the still frame, when tintable. */
  stillSvg?: string;
};

/** A registry key (`'trophy'`) or an asset (`{ src: '/badges/first.gif', animated: true }`). */
export type AssetInput = string | IconAsset;

/** The fields of an achievement (a def or a catalog view) the resolver reads. */
export type IconSubject = {
  code: string;
  icon?: string;
  category?: string;
  series?: { code: string; tier: string };
  concealed?: boolean;
};

export const tierColors: Record<string, string> = {
  bronze: '#b8733d',
  silver: '#8a96a3',
  gold: '#d4a017',
  platinum: '#3fa7b8',
  diamond: '#5b7cfa',
};

/** Encode SVG markup as a data URL, painting `currentColor` with a color or a gradient. */
export function svgToDataUrl(markup: string, color: string | GradientSpec = '#3d4451'): string {
  return `data:image/svg+xml,${encodeURIComponent(paintSvg(markup, color))}`;
}

const pack = (color: string | GradientSpec): Record<string, IconAsset> => {
  const out: Record<string, IconAsset> = {};
  for (const [name, markup] of Object.entries(svgs)) {
    out[name] = { src: svgToDataUrl(markup, color), svg: markup };
  }
  const animated = out['sparkle-animated'];
  if (animated) {
    Object.assign(animated, {
      animated: true,
      still: out.sparkle?.src,
      stillSvg: svgs.sparkle,
    });
  }
  return out;
};

export type IconResolverOptions = {
  /** Add or replace registry entries: `{ trophy: { src: '/my-trophy.png' }, lava: 'flame' }`. */
  icons?: Record<string, AssetInput>;
  /** Per-achievement override by code, or by series code to cover every tier. */
  overrides?: Record<string, AssetInput>;
  /** Icon key per category, used when an achievement names no icon. */
  categories?: Record<string, string>;
  /** Key used when nothing else matches. Defaults to `'trophy'`. */
  fallback?: string;
  /** Paint for the built-in SVGs: a color, or a gradient such as `{ colors: ['#a855f7', '#ec4899'], angle: 135 }`. */
  color?: string | GradientSpec;
  /** Tint per tier name for tintable (SVG) icons, merged over the default `tierColors`. A color or a gradient; `false` disables tinting. */
  tierColors?: Record<string, string | GradientSpec> | false;
};

export type IconResolver = {
  /**
   * The icon for an achievement. Order: overrides[code], overrides[series.code],
   * icon, categories[category], fallback. A concealed achievement always gets `hidden`.
   */
  resolve(subject: IconSubject): IconAsset;
  /** Icon keys the given achievements reference that the registry cannot resolve. */
  missing(subjects: IconSubject[]): string[];
};

export function createIconResolver(opts: IconResolverOptions = {}): IconResolver {
  assertPaints('', { color: opts.color });
  if (opts.tierColors) assertPaints('tierColors.', opts.tierColors);
  const color = opts.color ?? '#3d4451';
  const tints: Record<string, string | GradientSpec> =
    opts.tierColors === false ? {} : { ...tierColors, ...opts.tierColors };
  const registry: Record<string, AssetInput> = {
    ...pack(color),
    ...opts.icons,
  };
  const fallback = opts.fallback ?? 'trophy';

  const lookup = (input: AssetInput, seen = new Set<string>()): IconAsset | undefined => {
    if (typeof input !== 'string') return input;
    if (seen.has(input)) return undefined;
    seen.add(input);
    const hit = Object.hasOwn(registry, input) ? registry[input] : undefined;
    return hit === undefined ? undefined : lookup(hit, seen);
  };

  const tint = (asset: IconAsset, tier?: string): IconAsset => {
    const c = tier ? tints[tier] : undefined;
    if (!c || !asset.svg) return asset;
    const out: IconAsset = { ...asset, src: svgToDataUrl(asset.svg, c) };
    if (asset.stillSvg) out.still = svgToDataUrl(asset.stillSvg, c);
    return out;
  };

  const chain = (s: IconSubject): AssetInput[] =>
    s.concealed
      ? ['hidden']
      : [
          opts.overrides?.[s.code],
          s.series ? opts.overrides?.[s.series.code] : undefined,
          s.icon,
          s.category !== undefined ? opts.categories?.[s.category] : undefined,
          fallback,
          'trophy',
        ].filter((x): x is AssetInput => x !== undefined);

  return {
    resolve(s) {
      for (const input of chain(s)) {
        const asset = lookup(input);
        if (asset) return s.concealed ? asset : tint(asset, s.series?.tier);
      }
      throw new Error(`no icon for achievement ${s.code}`);
    },
    missing(subjects) {
      const keys = new Set<string>();
      for (const s of subjects) {
        for (const k of [
          s.icon,
          s.category !== undefined ? opts.categories?.[s.category] : undefined,
        ]) {
          if (k !== undefined && !lookup(k)) keys.add(k);
        }
      }
      if (opts.fallback !== undefined && !lookup(opts.fallback)) keys.add(opts.fallback);
      for (const v of Object.values(opts.overrides ?? {})) {
        if (typeof v === 'string' && !lookup(v)) keys.add(v);
      }
      return [...keys];
    },
  };
}

/**
 * The asset to display right now: an animated icon plays only once unlocked and
 * falls back to its still frame when the user prefers reduced motion. Every
 * framework adapter uses this so badges behave the same everywhere.
 */
export function displayIcon(
  asset: IconAsset,
  state: { unlocked: boolean; reducedMotion: boolean },
): IconAsset {
  if (!asset.animated || !asset.still || (state.unlocked && !state.reducedMotion)) return asset;
  return { ...asset, src: asset.still, animated: false };
}
