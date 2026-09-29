import type { AchievementDef, Filter, Rule } from './types.js';

type Rarity = AchievementDef['rarity'];
type ThresholdKind = 'count' | 'score' | 'streak' | 'unique' | 'group-count';
type Threshold<R> = R extends { gte: number } ? Omit<R, 'gte'> & { gte?: number } : never;

/** A rule whose top-level threshold (`gte`) may be left for `tiers` to fill in. */
export type RuleInput =
  | Threshold<Extract<Rule, { kind: ThresholdKind }>>
  | Extract<Rule, { kind: 'first-of-day' | 'rank' }>
  | { kind: 'all' | 'any'; rules: RuleInput[] };

export type TierSpec = {
  at: number;
  points?: number;
  rarity?: Rarity;
  icon?: string;
  name?: string;
  description?: string;
  /** Celebration preset for this tier only, for example `'epic'` on gold. */
  celebration?: string;
};

export type AchievementSpec = {
  /** `{tier}` and `{n}` are replaced per tier. */
  name: string;
  description: string;
  when: RuleInput;
  rarity?: Rarity;
  points?: number;
  hidden?: boolean;
  lockedDescription?: string;
  icon?: string;
  category?: string;
  /** Celebration preset key for the unlock popup, such as `'modal'` or `'epic'`. */
  celebration?: string;
  metadata?: Record<string, unknown>;
  /**
   * One unlock per tier, in ascending order: `{ bronze: 10, silver: 50, gold: 100 }`.
   * Each tier becomes `<code>.<tier>` with the tier value as the top-level `gte`.
   */
  tiers?: Record<string, number | TierSpec>;
};

/** Rule builders. Every builder returns plain JSON-safe data. */
export const rules = {
  count: (
    eventType: string,
    gte?: number,
    opts: { where?: Filter; todBetween?: [number, number] } = {},
  ): RuleInput => ({ kind: 'count', eventType, gte, ...opts }),
  score: (score: string, gte?: number): RuleInput => ({
    kind: 'score',
    score,
    gte,
  }),
  streak: (
    streak: string,
    gte?: number,
    opts: { key?: string; of?: 'current' | 'best'; anyKey?: boolean } = {},
  ): RuleInput => ({ kind: 'streak', streak, gte, ...opts }),
  unique: (eventType: string, by: string, gte?: number): RuleInput => ({
    kind: 'unique',
    eventType,
    by,
    gte,
  }),
  groupCount: (eventType: string, by: string, gte?: number, where?: Filter): RuleInput => ({
    kind: 'group-count',
    eventType,
    by,
    gte,
    ...(where ? { where } : {}),
  }),
  firstOfDay: (eventType: string, between?: [number, number]): RuleInput => ({
    kind: 'first-of-day',
    eventType,
    ...(between ? { between } : {}),
  }),
  rank: (leaderboard: string, eq: number): RuleInput => ({
    kind: 'rank',
    leaderboard,
    eq,
  }),
  all: (...rs: RuleInput[]): RuleInput => ({ kind: 'all', rules: rs }),
  any: (...rs: RuleInput[]): RuleInput => ({ kind: 'any', rules: rs }),
};

const THRESHOLD = new Set(['count', 'score', 'streak', 'unique', 'group-count']);

function toRule(r: RuleInput, where: string): Rule {
  if (r.kind === 'all' || r.kind === 'any') {
    return { kind: r.kind, rules: r.rules.map((sub) => toRule(sub, where)) };
  }
  if (THRESHOLD.has(r.kind) && (r as { gte?: number }).gte === undefined) {
    throw new Error(`${where}: '${r.kind}' rule needs a threshold, or use tiers`);
  }
  return r as Rule;
}

const fill = (s: string, tier: string, n: number) =>
  s.replaceAll('{tier}', tier).replaceAll('{n}', String(n));

/**
 * Compile a keyed achievement config into `AchievementDef[]` for `createEngine`.
 * The object key is the stable achievement code.
 *
 *   defineAchievements({
 *     first_win: { name: 'First Win', description: 'Win once', when: rules.count('win', 1) },
 *     fan: {
 *       name: 'Fan ({tier})', description: '{n} reactions',
 *       when: rules.count('reaction'), tiers: { bronze: 10, silver: 50, gold: 100 },
 *     },
 *   })
 */
export function defineAchievements(specs: Record<string, AchievementSpec>): AchievementDef[] {
  const out: AchievementDef[] = [];
  for (const [code, spec] of Object.entries(specs)) {
    const { when, tiers, rarity, ...rest } = spec;
    if (!tiers) {
      out.push({
        ...rest,
        code,
        rarity: rarity ?? 1,
        rule: toRule(when, `achievement ${code}`),
      });
      continue;
    }
    if (!THRESHOLD.has(when.kind) || (when as { gte?: number }).gte !== undefined) {
      throw new Error(
        `achievement ${code}: tiers need a count/score/streak/unique/group-count rule without gte`,
      );
    }
    if (Object.keys(tiers).length === 0) throw new Error(`achievement ${code}: tiers is empty`);
    const entries = Object.entries(tiers).map(
      ([tier, t]) => [tier, typeof t === 'number' ? { at: t } : t] as const,
    );
    let prev = Number.NEGATIVE_INFINITY;
    entries.forEach(([tier, t], index) => {
      if (!(t.at > prev))
        throw new Error(`achievement ${code}: tier '${tier}' must be above the previous tier`);
      prev = t.at;
      out.push({
        ...rest,
        code: `${code}.${tier}`,
        name: fill(t.name ?? spec.name, tier, t.at),
        description: fill(t.description ?? spec.description, tier, t.at),
        ...(spec.lockedDescription
          ? { lockedDescription: fill(spec.lockedDescription, tier, t.at) }
          : {}),
        rarity: t.rarity ?? rarity ?? (Math.min(5, index + 1) as Rarity),
        ...(t.points !== undefined ? { points: t.points } : {}),
        ...(t.icon !== undefined ? { icon: t.icon } : {}),
        ...(t.celebration !== undefined ? { celebration: t.celebration } : {}),
        rule: { ...when, gte: t.at } as Rule,
        series: { code, tier, index, of: entries.length },
      });
    });
  }
  return out;
}
