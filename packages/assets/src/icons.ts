// 24x24 line icons drawn for badgetrip (MIT). They paint with `currentColor`, so the
// resolver can tint them per tier.
const svg = (body: string, fill = 'none') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const sparkle = '<path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z"/>';

export const svgs = {
  trophy: svg(
    '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 5"/><path d="M17 6h3a3 3 0 0 1-3 5"/><path d="M12 14v4"/><path d="M8 21h8"/><path d="M9 18h6"/>',
  ),
  star: svg('<path d="M12 2l3.1 6.3 6.9 1-5 4.8 1.2 6.9L12 17.8 5.8 21 7 14.1 2 9.3l6.9-1z"/>'),
  medal: svg(
    '<path d="M8 2l2.5 7"/><path d="M16 2l-2.5 7"/><circle cx="12" cy="15" r="6"/><circle cx="12" cy="15" r="2"/>',
  ),
  crown: svg('<path d="M2 18h20L20 7l-5 5-3-7-3 7-5-5z"/><path d="M4 21h16"/>'),
  flame: svg(
    '<path d="M12 22c4 0 7-2.7 7-6.5 0-3-2-5.2-3.5-7 .1 2-1 3.5-2.5 3.5C14 9 13 5 10 2c0 3.5-3 5.5-4.2 8.2A7.5 7.5 0 0 0 5 15.5C5 19.3 8 22 12 22z"/>',
  ),
  shield: svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>'),
  bolt: svg('<path d="M13 2L3 14h9l-1 8 10-12h-9z"/>'),
  heart: svg(
    '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z"/>',
  ),
  chat: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z"/>'),
  sprout: svg(
    '<path d="M12 22V11"/><path d="M12 11C12 7 9 4 4 4c0 4 3 7 8 7z"/><path d="M12 14c0-3.5 2.5-6 7-6 0 3.5-2.5 6-7 6z"/>',
  ),
  target: svg(
    '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  ),
  clock: svg('<circle cx="12" cy="12" r="10"/><path d="M12 7v5l3 2"/>'),
  moon: svg('<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>'),
  check: svg('<circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/>'),
  lock: svg(
    '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  ),
  hidden: svg(
    '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  ),
  sparkle: svg(sparkle),
  'sparkle-animated': svg(
    `<g>${sparkle}<animate attributeName="opacity" values="1;0.35;1" dur="1.6s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="6s" repeatCount="indefinite"/></g>`,
  ),
} as const;

export type IconName = keyof typeof svgs;
