import { getPath, matchFilter } from './path.js';
import type { Event, EventStore, Rule, ScoreStore, StreakStore } from './types.js';

export type RuleContext = {
  actor: string;
  /** The event currently being projected - anchors first-of-day and fires once. */
  event: Event;
  events: EventStore;
  scores: ScoreStore;
  streaks: StreakStore;
  leaderboard: (code: string) => Promise<{ actor: string; value: number }[]>;
  dayBoundary: (ts: number) => number;
};

export type ProgressContext = Omit<RuleContext, 'event'>;

type ThresholdRule = Extract<Rule, { gte: number }>;

/** The actor's current value for a threshold rule. Shared by unlock checks and progress. */
async function measure(rule: ThresholdRule, ctx: ProgressContext): Promise<number> {
  switch (rule.kind) {
    case 'count': {
      if (!rule.todBetween) {
        return ctx.events.count({
          actor: ctx.actor,
          type: rule.eventType,
          where: rule.where,
        });
      }
      // EventStore.count has no day-boundary context, so a time-of-day window must
      // be evaluated here against the event stream.
      const [lo, hi] = rule.todBetween;
      let n = 0;
      for await (const e of ctx.events.read({
        actor: ctx.actor,
        type: rule.eventType,
      })) {
        if (rule.where && !matchFilter(e, rule.where)) continue;
        const tod = e.ts - ctx.dayBoundary(e.ts);
        if (tod >= lo && tod < hi) n++;
      }
      return n;
    }
    case 'score':
      return ctx.scores.get(ctx.actor, rule.score);
    case 'streak': {
      if (rule.anyKey) {
        if (!ctx.streaks.statsAcrossKeys) {
          throw new Error(
            `streak rule for '${rule.streak}' uses anyKey but the StreakStore does not implement statsAcrossKeys`,
          );
        }
        const stats = await ctx.streaks.statsAcrossKeys(ctx.actor, rule.streak);
        return rule.of === 'best' ? stats.maxBest : stats.maxCurrent;
      }
      const s = await ctx.streaks.get(ctx.actor, rule.streak, rule.key);
      return rule.of === 'best' ? s.best : s.current;
    }
    case 'unique': {
      const seen = new Set<unknown>();
      for await (const e of ctx.events.read({
        actor: ctx.actor,
        type: rule.eventType,
      })) {
        const v = getPath(e, rule.by);
        if (v !== undefined) seen.add(v);
      }
      return seen.size;
    }
    case 'group-count': {
      if (ctx.events.maxGroupSize) {
        return ctx.events.maxGroupSize({
          actor: ctx.actor,
          type: rule.eventType,
          by: rule.by,
          where: rule.where,
        });
      }
      const counts = new Map<unknown, number>();
      let max = 0;
      for await (const e of ctx.events.read({
        actor: ctx.actor,
        type: rule.eventType,
      })) {
        if (rule.where && !matchFilter(e, rule.where)) continue;
        const v = getPath(e, rule.by);
        if (v === undefined) continue;
        const n = (counts.get(v) ?? 0) + 1;
        counts.set(v, n);
        max = Math.max(max, n);
      }
      return max;
    }
  }
}

async function holdsRank(rule: Extract<Rule, { kind: 'rank' }>, ctx: ProgressContext) {
  const board = await ctx.leaderboard(rule.leaderboard);
  return board.findIndex((r) => r.actor === ctx.actor) + 1 === rule.eq;
}

/** Evaluate a declarative rule for the context actor. Pure given the stores. */
export async function evaluateRule(rule: Rule, ctx: RuleContext): Promise<boolean> {
  switch (rule.kind) {
    case 'first-of-day': {
      const dayStart = ctx.dayBoundary(ctx.event.ts);
      let earliest: Event | undefined;
      for await (const e of ctx.events.read({
        actor: ctx.actor,
        type: rule.eventType,
        since: dayStart,
      })) {
        if (ctx.dayBoundary(e.ts) !== dayStart) break;
        if (!earliest || e.ts < earliest.ts) earliest = e;
      }
      if (!earliest || earliest.id !== ctx.event.id) return false;
      if (rule.between) {
        const tod = earliest.ts - dayStart;
        if (tod < rule.between[0] || tod >= rule.between[1]) return false;
      }
      return true;
    }
    case 'rank':
      return holdsRank(rule, ctx);
    case 'all': {
      for (const r of rule.rules) {
        if (!(await evaluateRule(r, ctx))) return false;
      }
      return true;
    }
    case 'any': {
      for (const r of rule.rules) {
        if (await evaluateRule(r, ctx)) return true;
      }
      return false;
    }
    default:
      return (await measure(rule, ctx)) >= rule.gte;
  }
}

const pct = (current: number, target: number) =>
  target <= 0 ? 100 : Math.max(0, Math.min(100, Math.floor((current * 100) / target)));

/**
 * How close the actor is to satisfying `rule`, outside any emit. Composite rules
 * count satisfied children; their percent is the mean (`all`) or max (`any`) of the
 * children. `first-of-day` has no standing progress and reports 0 of 1.
 */
export async function ruleProgress(
  rule: Rule,
  ctx: ProgressContext,
  /** Shares measurements between rules that differ only in `gte` (e.g. tiers). */
  cache?: Map<string, Promise<number>>,
): Promise<{ current: number; target: number; percent: number }> {
  const leaf = (current: number, target: number) => ({
    current,
    target,
    percent: pct(current, target),
  });
  switch (rule.kind) {
    case 'first-of-day':
      return leaf(0, 1);
    case 'rank':
      return leaf((await holdsRank(rule, ctx)) ? 1 : 0, 1);
    case 'all':
    case 'any': {
      const parts = await Promise.all(rule.rules.map((r) => ruleProgress(r, ctx, cache)));
      const done = parts.filter((p) => p.percent === 100).length;
      const percents = parts.map((p) => p.percent);
      const percent =
        rule.kind === 'all'
          ? Math.floor(percents.reduce((a, b) => a + b, 0) / (parts.length || 1))
          : Math.max(0, ...percents);
      return rule.kind === 'all'
        ? { current: done, target: parts.length, percent }
        : { current: Math.min(1, done), target: 1, percent };
    }
    default: {
      if (!cache) return leaf(await measure(rule, ctx), rule.gte);
      const key = JSON.stringify({ ...rule, gte: null });
      let m = cache.get(key);
      if (!m) {
        m = measure(rule, ctx);
        cache.set(key, m);
      }
      return leaf(await m, rule.gte);
    }
  }
}

/** The target a rule's progress counts toward. */
export function ruleTarget(rule: Rule): number {
  if (rule.kind === 'all') return rule.rules.length;
  if (rule.kind === 'any' || rule.kind === 'first-of-day' || rule.kind === 'rank') return 1;
  return rule.gte;
}
