import { crossesMilestone, progressCount } from '@walangstudio/badgetrip-assets';
import { describe, expect, it } from 'vitest';

const subject = (
  current: number,
  target: number,
  over: { unlocked?: boolean; concealed?: boolean } = {},
) => ({
  unlocked: false,
  concealed: false,
  progress: { current, target, percent: Math.floor((current / target) * 100) },
  ...over,
});

describe('progressCount', () => {
  it('labels locked multi-step achievements as current/target', () => {
    expect(progressCount(subject(1, 5))).toBe('1/5');
    expect(progressCount(subject(0, 5))).toBe('0/5');
  });

  it('shows nothing for unlocked, concealed, or one-step achievements', () => {
    expect(progressCount(subject(5, 5, { unlocked: true }))).toBeNull();
    expect(progressCount(subject(1, 5, { concealed: true }))).toBeNull();
    expect(progressCount(subject(0, 1))).toBeNull();
  });

  it('takes a custom format and never shows more than the target', () => {
    expect(progressCount(subject(3, 5), (p) => `${p.current} of ${p.target} todos`)).toBe(
      '3 of 5 todos',
    );
    expect(
      progressCount({ ...subject(9, 5), progress: { current: 9, target: 5, percent: 99 } }),
    ).toBe('5/5');
  });
});

describe('crossesMilestone', () => {
  const every = (n: number) => ({ at: null, every: n });
  const at = (...m: number[]) => ({ at: m, every: null });

  it('fires every N steps, but never on the final step', () => {
    expect(crossesMilestone(every(1), 0, 1, 5)).toBe(true);
    expect(crossesMilestone(every(2), 1, 2, 10)).toBe(true);
    expect(crossesMilestone(every(2), 2, 3, 10)).toBe(false);
    expect(crossesMilestone(every(1), 4, 5, 5)).toBe(false);
    expect(crossesMilestone(every(10), 3, 25, 100)).toBe(true);
  });

  it('fires when a percentage mark is passed, once', () => {
    expect(crossesMilestone(at(50), 4, 5, 10)).toBe(true);
    expect(crossesMilestone(at(50), 5, 6, 10)).toBe(false);
    expect(crossesMilestone(at(25, 75), 1, 8, 10)).toBe(true);
    expect(crossesMilestone(at(25), 0, 2, 10)).toBe(false);
  });

  it('ignores no-ops, regressions, and one-step achievements', () => {
    expect(crossesMilestone(every(1), 2, 2, 5)).toBe(false);
    expect(crossesMilestone(every(1), 3, 1, 5)).toBe(false);
    expect(crossesMilestone(every(1), 0, 1, 1)).toBe(false);
    expect(crossesMilestone({ at: null, every: null }, 0, 3, 5)).toBe(false);
  });
});

describe('progressCount for combined rules', () => {
  it('shows nothing when current/target count sub-rules', () => {
    expect(
      progressCount({
        unlocked: false,
        concealed: false,
        progress: { current: 0, target: 2, percent: 40, countable: false },
      }),
    ).toBeNull();
  });
});
