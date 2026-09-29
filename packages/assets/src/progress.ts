/** What `progressCount` needs from an achievement. `AchievementView` fits. */
export type CountSubject = {
  unlocked: boolean;
  concealed: boolean;
  progress: { current: number; target: number; percent: number; countable?: false };
};

export type CountFormat = (progress: { current: number; target: number }) => string;

export const defaultCountFormat: CountFormat = (p) => `${p.current}/${p.target}`;

/**
 * The "3/5" label for a badge, or null when there is nothing to count: unlocked,
 * concealed, a one-step achievement, or an `all`/`any` rule (not countable).
 */
export function progressCount(
  a: CountSubject,
  format: CountFormat = defaultCountFormat,
): string | null {
  if (a.unlocked || a.concealed || a.progress.target <= 1 || a.progress.countable === false) {
    return null;
  }
  return format({
    current: Math.min(a.progress.current, a.progress.target),
    target: a.progress.target,
  });
}

/**
 * Whether moving from `from` to `to` steps (of `target`) crosses a progress milestone:
 * a percentage in `at`, or a multiple of `every`. Reaching the target never counts;
 * the unlock celebration covers that.
 */
export function crossesMilestone(
  rule: { at: number[] | null; every: number | null },
  from: number,
  to: number,
  target: number,
): boolean {
  if (!(to > from) || to >= target || target <= 1) return false;
  if (rule.every && Math.floor(to / rule.every) > Math.floor(from / rule.every)) return true;
  if (rule.at) {
    const a = (from / target) * 100;
    const b = (to / target) * 100;
    return rule.at.some((m) => m > a && m <= b);
  }
  return false;
}
