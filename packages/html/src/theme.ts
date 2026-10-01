import type { Theme } from '@walangstudio/badgetrip-assets';

/** Throws unless `v` looks like a `defineTheme()` result. `null` and `undefined` pass. */
export function checkTheme(v: unknown, where: string): asserts v is Theme | null | undefined {
  if (v === undefined || v === null) return;
  const t = v as Partial<Theme>;
  if (
    typeof v !== 'object' ||
    typeof t.name !== 'string' ||
    typeof t.vars !== 'object' ||
    t.vars === null ||
    typeof t.icons?.resolve !== 'function' ||
    typeof t.celebrations?.resolve !== 'function'
  ) {
    throw new TypeError(`${where}: theme must come from defineTheme()`);
  }
}

// What each element held before a theme set its vars, so a switch or undo restores it.
const applied = new WeakMap<HTMLElement, Map<string, string>>();

const restore = (el: HTMLElement, prev: Map<string, string>) => {
  for (const [k, v] of prev) {
    if (v) el.style.setProperty(k, v);
    else el.style.removeProperty(k);
  }
  if (!el.getAttribute('style')) el.removeAttribute('style');
};

/**
 * Set a theme's `--badgetrip-*` custom properties on `target` (the whole page by
 * default). Applying another theme first clears this one, and `null` clears it. Returns
 * an undo that puts back what was there, unless a newer theme replaced it since.
 */
export function applyTheme(theme: Theme | null, target?: HTMLElement): () => void {
  checkTheme(theme, 'applyTheme');
  if (typeof document === 'undefined') return () => {};
  const el = target ?? document.documentElement;
  const old = applied.get(el);
  if (old) {
    restore(el, old);
    applied.delete(el);
  }
  if (!theme) return () => {};
  const prev = new Map<string, string>();
  for (const [k, v] of Object.entries(theme.vars)) {
    prev.set(k, el.style.getPropertyValue(k));
    el.style.setProperty(k, v);
  }
  applied.set(el, prev);
  return () => {
    if (applied.get(el) !== prev) return;
    restore(el, prev);
    applied.delete(el);
  };
}
