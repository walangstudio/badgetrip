import type { TierDef, TierStatus } from './types.js';

/** Resolve which tier a score value falls into, plus distance to the next. */
export function evalTier(def: TierDef, value: number): TierStatus {
  const sorted = [...def.thresholds].sort((a, b) => a.at - b.at);
  let current: string | null = null;
  let next: string | null = null;
  let nextAt = 0;
  for (const t of sorted) {
    if (value >= t.at) {
      current = t.name;
    } else {
      next = t.name;
      nextAt = t.at;
      break;
    }
  }
  const remaining = next ? Math.max(0, nextAt - value) : 0;
  return { current, next, remaining, value };
}
