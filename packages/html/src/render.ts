import { type IconResolver, createIconResolver, displayIcon } from '@walangstudio/badgetrip-assets';
import type { AchievementView } from '@walangstudio/badgetrip-core';

const defaultIcons = createIconResolver();

export type BadgeOptions = {
  /** Icon resolver (see `createIconResolver` in `@walangstudio/badgetrip-assets`). Defaults to the built-in pack. */
  icons?: IconResolver;
  /** Show animated icons as their still frame. Default false. */
  reducedMotion?: boolean;
  /** Icon edge in px. Default 48. */
  size?: number;
  /** Show a progress bar while locked. Default true. */
  showProgress?: boolean;
  className?: string;
};

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const esc = (v: unknown) => String(v).replace(/[&<>"']/g, (c) => ESCAPES[c] as string);

// Browsers ignore whitespace and control characters when parsing a URL scheme, so strip
// them (and any non-printable-ASCII) before checking. Custom schemes stay allowed for
// webviews (tauri://, app://); only script-capable ones are dropped.
const safeSrc = (src: string) => {
  const s = src.replace(/[^!-~]/g, '').toLowerCase();
  if (/^(?:javascript|vbscript):/.test(s)) return '';
  if (s.startsWith('data:') && !s.startsWith('data:image/')) return '';
  return src;
};

/**
 * A badge as an HTML string: icon (greyscale while locked), name, description, and a
 * `<progress>` bar while locked and not concealed. Same markup as the React
 * `AchievementBadge`. Every value is HTML-escaped.
 */
export function renderBadge(a: AchievementView, opts: BadgeOptions = {}): string {
  const {
    icons = defaultIcons,
    reducedMotion = false,
    size = 48,
    showProgress = true,
    className,
  } = opts;
  const icon = displayIcon(icons.resolve(a), {
    unlocked: a.unlocked,
    reducedMotion,
  });
  const cls = className ? ` class="${esc(className)}"` : '';
  const imgStyle = a.unlocked ? '' : ' style="filter:grayscale(1);opacity:0.45"';
  const desc = a.description ? `<div>${esc(a.description)}</div>` : '';
  const pct = a.progress.percent;
  const bar =
    showProgress && !a.unlocked && !a.concealed
      ? `<progress value="${esc(pct)}" max="100" style="width:100%" aria-label="${esc(`${a.name}: ${pct}%`)}"></progress>`
      : '';
  const figure = `<figure${cls} data-unlocked="${esc(a.unlocked)}" data-concealed="${esc(a.concealed)}" style="${FIGURE}">`;
  const image = `<img src="${esc(safeSrc(icon.src))}" alt="" width="${esc(size)}" height="${esc(size)}"${imgStyle}>`;
  const caption = `<figcaption style="text-align:center;flex:1"><strong>${esc(a.name)}</strong>${desc}</figcaption>`;
  return `${figure}${image}${caption}${bar}</figure>`;
}

const FIGURE = 'margin:0;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%';
const GRID = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:1rem';

/** Badges in a responsive grid (`repeat(auto-fill, minmax(140px, 1fr))`). */
export function renderCatalog(views: AchievementView[], opts: BadgeOptions = {}): string {
  return `<div style="${GRID}">${views.map((v) => renderBadge(v, opts)).join('')}</div>`;
}
