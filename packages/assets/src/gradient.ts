export type GradientDirection =
  | 'top'
  | 'top right'
  | 'right'
  | 'bottom right'
  | 'bottom'
  | 'bottom left'
  | 'left'
  | 'top left';

/**
 * A gradient as data, so themes stay plain JSON. Linear by default: give `angle` in
 * degrees or a `to` direction. Radial takes `shape` and `position`. Each color can carry
 * a stop: `{ color: '#fff', at: 40 }` (percent).
 */
export type GradientSpec = {
  type?: 'linear' | 'radial';
  colors: (string | { color: string; at: number })[];
  angle?: number;
  to?: GradientDirection;
  shape?: 'circle' | 'ellipse';
  position?: GradientDirection | 'center';
};

const KEYS = new Set(['type', 'colors', 'angle', 'to', 'shape', 'position']);
const ANGLES: Record<GradientDirection, number> = {
  top: 0,
  'top right': 45,
  right: 90,
  'bottom right': 135,
  bottom: 180,
  'bottom left': 225,
  left: 270,
  'top left': 315,
};
// Where a radial gradient centers, as fractions of the box.
const POINTS: Record<GradientDirection | 'center', [number, number]> = {
  center: [0.5, 0.5],
  top: [0.5, 0],
  'top right': [1, 0],
  right: [1, 0.5],
  'bottom right': [1, 1],
  bottom: [0.5, 1],
  'bottom left': [0, 1],
  left: [0, 0.5],
  'top left': [0, 0],
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const COLOR_FUNCTIONS = new Set([
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'color',
]);

/**
 * A plain color (`#fff`, `rebeccapurple`, `rgb(...)`, `oklch(...)`): safe inside a CSS
 * declaration and inside an SVG attribute, because it has no quotes, `;`, braces or `<>`,
 * and no function but a color function, so no `url()` that could fetch anything.
 */
export function isColor(v: unknown): v is string {
  if (typeof v !== 'string' || v.length < 1 || v.length > 100) return false;
  if (!/^[#\w\s(),.%/+-]+$/.test(v)) return false;
  for (const m of v.matchAll(/([\w-]*)\s*\(/g)) {
    if (!COLOR_FUNCTIONS.has((m[1] ?? '').toLowerCase())) return false;
  }
  let depth = 0;
  for (const c of v) {
    if (c === '(') depth++;
    else if (c === ')' && --depth < 0) return false;
  }
  return depth === 0;
}

const isGradient = (v: unknown): v is GradientSpec => isObj(v) && Array.isArray(v.colors);

/** Push a message for every problem with a gradient (or, with `allowColor`, a plain color). */
export function checkPaint(where: string, v: unknown, errs: string[], allowColor = true) {
  if (allowColor && typeof v === 'string') {
    if (!isColor(v)) errs.push(`${where} must be a color such as #a855f7 or rgb(168,85,247)`);
    return;
  }
  if (!isObj(v)) return void errs.push(`${where} must be a color or a gradient object`);
  for (const k of Object.keys(v)) {
    if (!KEYS.has(k)) errs.push(`${where}: unknown option '${k}'`);
  }
  const type = v.type ?? 'linear';
  if (type !== 'linear' && type !== 'radial') errs.push(`${where}.type must be linear or radial`);
  const colors = v.colors;
  if (!Array.isArray(colors) || colors.length < 2 || colors.length > 8) {
    errs.push(`${where}.colors must be 2-8 colors`);
  } else {
    colors.forEach((c, i) => {
      const w = `${where}.colors[${i}]`;
      const color = isObj(c) ? c.color : c;
      if (!isColor(color)) errs.push(`${w} must be a color such as #a855f7 or rgb(168,85,247)`);
      if (isObj(c)) {
        const at = c.at;
        if (!(typeof at === 'number' && Number.isFinite(at) && at >= 0 && at <= 100)) {
          errs.push(`${w}.at must be 0-100`);
        }
      }
    });
  }
  if (v.angle !== undefined && v.to !== undefined)
    errs.push(`${where}: give angle or to, not both`);
  if (
    v.angle !== undefined &&
    !(typeof v.angle === 'number' && Number.isFinite(v.angle) && Math.abs(v.angle) <= 360)
  ) {
    errs.push(`${where}.angle must be -360 to 360 degrees`);
  }
  if (v.to !== undefined && !Object.hasOwn(ANGLES, v.to as string)) {
    errs.push(`${where}.to must be one of ${Object.keys(ANGLES).join(', ')}`);
  }
  if (v.shape !== undefined && v.shape !== 'circle' && v.shape !== 'ellipse') {
    errs.push(`${where}.shape must be circle or ellipse`);
  }
  if (v.position !== undefined && !Object.hasOwn(POINTS, v.position as string)) {
    errs.push(`${where}.position must be one of ${Object.keys(POINTS).join(', ')}`);
  }
  if (type === 'radial' && (v.angle !== undefined || v.to !== undefined)) {
    errs.push(`${where}: angle and to are for linear only`);
  }
  if (type === 'linear' && (v.shape !== undefined || v.position !== undefined)) {
    errs.push(`${where}: shape and position are for radial only`);
  }
}

const stops = (g: GradientSpec) =>
  g.colors.map((c) => (typeof c === 'string' ? c : `${c.color} ${c.at}%`));

/** A CSS gradient for a validated spec. */
export function cssGradient(g: GradientSpec): string {
  if (g.type === 'radial') {
    return `radial-gradient(${g.shape ?? 'circle'} at ${g.position ?? 'center'}, ${stops(g).join(', ')})`;
  }
  const dir = g.angle !== undefined ? `${g.angle}deg, ` : g.to ? `to ${g.to}, ` : '';
  return `linear-gradient(${dir}${stops(g).join(', ')})`;
}

/**
 * A CSS gradient from data: `gradient({ colors: ['#4c1d95', '#db2777'], angle: 135 })`.
 * Validates and throws one error listing every problem. Theme style fields take the same
 * object directly.
 */
export function gradient(spec: GradientSpec): string {
  const errs: string[] = [];
  checkPaint('gradient', spec, errs, false);
  if (errs.length) throw new Error(`invalid badgetrip gradient:\n  ${errs.join('\n  ')}`);
  return cssGradient(spec);
}

const r = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Stop positions as CSS computes them: unset ends are 0% and 100%, unset stops in
 * between spread evenly between their neighbors, and a stop never sits before the last.
 */
function positions(g: GradientSpec): { color: string; at: number }[] {
  const n = g.colors.length;
  const at: (number | undefined)[] = g.colors.map((c) =>
    typeof c === 'string' ? undefined : c.at,
  );
  if (at[0] === undefined) at[0] = 0;
  if (at[n - 1] === undefined) at[n - 1] = 100;
  let max = 0;
  for (let i = 0; i < n; i++) {
    if (at[i] !== undefined) {
      max = Math.max(max, at[i] as number);
      at[i] = max;
    }
  }
  for (let i = 1; i < n; i++) {
    if (at[i] !== undefined) continue;
    let j = i;
    while (at[j] === undefined) j++;
    const from = at[i - 1] as number;
    const to = at[j] as number;
    for (let k = i; k < j; k++) at[k] = from + ((to - from) * (k - i + 1)) / (j - i + 1);
  }
  return g.colors.map((c, i) => ({
    color: typeof c === 'string' ? c : c.color,
    at: at[i] as number,
  }));
}

type Box = { x: number; y: number; w: number; h: number };

/**
 * The CSS angle for a `to` direction. Sides are fixed; corners depend on the box, so the
 * 50% line runs through the other two corners, as CSS draws it.
 */
function toAngle(to: GradientDirection, box: Box): number {
  const corner: Partial<Record<GradientDirection, [number, number]>> = {
    'top right': [box.h, -box.w],
    'bottom right': [box.h, box.w],
    'bottom left': [-box.h, box.w],
    'top left': [-box.h, -box.w],
  };
  const v = corner[to];
  if (!v) return ANGLES[to];
  return (Math.atan2(v[0], -v[1]) * 180) / Math.PI;
}

/** An SVG `<defs>` gradient laid out over the viewBox the way CSS lays one over a box. */
function svgDefs(g: GradientSpec, id: string, box: Box): string {
  const stopTags = positions(g)
    .map((p) => `<stop offset="${r(p.at)}%" stop-color="${p.color}"/>`)
    .join('');
  if (g.type === 'radial') {
    const [fx, fy] = POINTS[g.position ?? 'center'];
    const cx = box.x + fx * box.w;
    const cy = box.y + fy * box.h;
    // Distances to the farther side on each axis. CSS sizes to the farthest corner: a
    // circle by its distance, an ellipse with the sides' ratio scaled by sqrt(2).
    const sx = Math.max(cx - box.x, box.x + box.w - cx);
    const sy = Math.max(cy - box.y, box.y + box.h - cy);
    if (g.shape === 'ellipse' && sx > 0 && sy > 0 && sx !== sy) {
      const rx = sx * Math.SQRT2;
      const k = sy / sx;
      return `<defs><radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${r(cx)}" cy="${r(cy)}" r="${r(rx)}" gradientTransform="translate(${r(cx)} ${r(cy)}) scale(1 ${r(k)}) translate(${r(-cx)} ${r(-cy)})">${stopTags}</radialGradient></defs>`;
    }
    const radius = g.shape === 'ellipse' ? sx * Math.SQRT2 : Math.hypot(sx, sy);
    return `<defs><radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${r(cx)}" cy="${r(cy)}" r="${r(radius)}">${stopTags}</radialGradient></defs>`;
  }
  // CSS angles: 0deg points up and turns clockwise. The line runs through the center and
  // is long enough that its ends touch the corners, so the colors land where CSS puts them.
  const rad = (g.angle !== undefined ? g.angle : g.to ? toAngle(g.to, box) : 180) * (Math.PI / 180);
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  const half = (Math.abs(box.w * sin) + Math.abs(box.h * cos)) / 2;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${r(cx - sin * half)}" y1="${r(cy + cos * half)}" x2="${r(cx + sin * half)}" y2="${r(cy - cos * half)}">${stopTags}</linearGradient></defs>`;
}

/**
 * SVG markup painted with a color or a gradient wherever it says `currentColor`. A
 * gradient spans the whole viewBox, so the drawing gets one sweep, not one per path.
 */
export function paintSvg(markup: string, paint: string | GradientSpec): string {
  if (!isGradient(paint)) return markup.replaceAll('currentColor', paint);
  const errs: string[] = [];
  checkPaint('gradient', paint, errs, false);
  if (errs.length) throw new Error(`invalid badgetrip gradient:\n  ${errs.join('\n  ')}`);
  const tag = /<svg\b[^>]*>/i.exec(markup);
  if (!tag) return markup;
  const vb =
    /viewBox\s*=\s*["']\s*([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)/.exec(
      tag[0],
    );
  const box: Box = vb
    ? { x: Number(vb[1]), y: Number(vb[2]), w: Number(vb[3]), h: Number(vb[4]) }
    : { x: 0, y: 0, w: 24, h: 24 };
  if (![box.x, box.y, box.w, box.h].every(Number.isFinite)) return markup;
  // A stable id per gradient and box, so inline SVGs on one page (React Native web) never share one.
  let h = 5381;
  for (const ch of JSON.stringify([paint, box])) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  const id = `badgetrip-paint-${h.toString(36)}`;
  const end = tag.index + tag[0].length;
  const head = markup.slice(0, end).replaceAll('currentColor', `url(#${id})`);
  const body = markup.slice(end).replaceAll('currentColor', `url(#${id})`);
  return head + svgDefs(paint, id, box) + body;
}

/** Throws one error listing every problem with gradient icon colors, for `createIconResolver`. */
export function assertPaints(where: string, paints: Record<string, unknown>) {
  const errs: string[] = [];
  for (const [k, v] of Object.entries(paints)) {
    if (isObj(v)) checkPaint(`${where}${k}`, v, errs, false);
  }
  if (errs.length) throw new Error(`invalid badgetrip icons:\n  ${errs.join('\n  ')}`);
}
