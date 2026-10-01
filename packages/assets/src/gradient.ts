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

/**
 * A plain color (`#fff`, `rebeccapurple`, `rgb(...)`, `hsl(... / 50%)`): safe inside a CSS
 * declaration and inside an SVG attribute, because it has no quotes, `;`, braces or `<>`.
 */
export function isColor(v: unknown): v is string {
  if (typeof v !== 'string' || v.length < 1 || v.length > 100) return false;
  if (!/^[#\w\s(),.%/+-]+$/.test(v)) return false;
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
 * An SVG `<defs>` gradient with the given id, in user space of a `size` x `size` viewBox,
 * so the whole icon shares one sweep instead of one per path.
 */
function svgDefs(g: GradientSpec, id: string, size: number): string {
  const n = g.colors.length;
  const stopTags = g.colors
    .map((c, i) => {
      const color = typeof c === 'string' ? c : c.color;
      const at = typeof c === 'string' ? (i / (n - 1)) * 100 : c.at;
      return `<stop offset="${r(at)}%" stop-color="${color}"/>`;
    })
    .join('');
  if (g.type === 'radial') {
    const [x, y] = POINTS[g.position ?? 'center'];
    return `<defs><radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${r(x * size)}" cy="${r(y * size)}" r="${r(size * (x === 0.5 && y === 0.5 ? 0.5 : 1))}">${stopTags}</radialGradient></defs>`;
  }
  // CSS angles: 0deg points up and turns clockwise; the line runs through the center.
  const deg = g.angle ?? (g.to ? ANGLES[g.to] : 180);
  const rad = (deg * Math.PI) / 180;
  const dx = (Math.sin(rad) * size) / 2;
  const dy = (-Math.cos(rad) * size) / 2;
  const c = size / 2;
  return `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${r(c - dx)}" y1="${r(c - dy)}" x2="${r(c + dx)}" y2="${r(c + dy)}">${stopTags}</linearGradient></defs>`;
}

/** SVG markup painted with a color or a gradient wherever it says `currentColor`. */
export function paintSvg(markup: string, paint: string | GradientSpec): string {
  if (!isGradient(paint)) return markup.replaceAll('currentColor', paint);
  const size = Number(/viewBox="0 0 (\d+(?:\.\d+)?)/.exec(markup)?.[1] ?? 24);
  // A stable id per gradient, so inline SVGs on one page (React Native web) never share one.
  let h = 5381;
  for (const ch of JSON.stringify(paint)) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  const id = `badgetrip-paint-${h.toString(36)}`;
  const painted = markup.replaceAll('currentColor', `url(#${id})`);
  const open = painted.indexOf('>') + 1;
  return painted.slice(0, open) + svgDefs(paint, id, size) + painted.slice(open);
}
