import type { Definitions, Event, Rule, Stores } from './types.js';

const isPos = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n > 0;
const isStr = (s: unknown) => typeof s === 'string' && s.length > 0;

/** Throws a TypeError if `e` is not a well-formed Event. Runs before anything is persisted. */
export function assertEvent(e: Event): void {
  const p = (e as { payload?: unknown }).payload;
  if (!isStr(e?.id)) throw new TypeError('event.id must be a non-empty string');
  if (!isStr(e.actor)) throw new TypeError(`event ${e.id}: actor must be a non-empty string`);
  if (!isStr(e.type)) throw new TypeError(`event ${e.id}: type must be a non-empty string`);
  if (typeof e.ts !== 'number' || !Number.isFinite(e.ts)) {
    throw new TypeError(`event ${e.id}: ts must be a finite number`);
  }
  if (p !== undefined && (p === null || typeof p !== 'object' || Array.isArray(p))) {
    throw new TypeError(`event ${e.id}: payload must be an object`);
  }
}

/**
 * Check definitions once at engine construction, so a config mistake fails fast
 * instead of throwing mid-emit after the event is already persisted.
 */
export function assertDefinitions(d: Required<Definitions>, stores: Stores): void {
  const errs: string[] = [];
  const declared = d.scores.length ? new Set(d.scores) : undefined;
  const score = (where: string, s: string) => {
    if (declared && !declared.has(s)) errs.push(`${where}: unknown score '${s}'`);
  };
  const unique = (kind: string, codes: string[]) => {
    const seen = new Set<string>();
    for (const c of codes) {
      if (seen.has(c)) errs.push(`duplicate ${kind} code '${c}'`);
      seen.add(c);
    }
  };
  unique(
    'achievement',
    d.achievements.map((a) => a.code),
  );
  unique(
    'streak',
    d.streaks.map((s) => s.code),
  );
  unique(
    'tier',
    d.tiers.map((t) => t.code),
  );
  unique(
    'leaderboard',
    d.leaderboards.map((l) => l.code),
  );
  unique(
    'escalator',
    d.escalators.map((e) => e.code),
  );

  for (const p of d.points) score(`points on '${p.on}'`, p.score);

  for (const t of d.tiers) {
    score(`tier ${t.code}`, t.score);
    if (t.thresholds.some((x) => !Number.isFinite(x.at))) {
      errs.push(`tier ${t.code}: every threshold 'at' must be finite`);
    }
  }

  const streaks = new Set(d.streaks.map((s) => s.code));
  const boards = new Map(d.leaderboards.map((l) => [l.code, l]));
  for (const l of d.leaderboards) {
    const where = `leaderboard ${l.code}`;
    if (!Number.isInteger(l.limit) || l.limit < 1)
      errs.push(`${where}: limit must be an integer >= 1`);
    if (l.window !== 'all-time' && !isPos(l.window.ms)) {
      errs.push(`${where}: rolling window ms must be a positive number`);
    }
    const src =
      l.source ?? (l.score !== undefined ? { kind: 'score' as const, score: l.score } : undefined);
    if (!src) errs.push(`${where}: needs a source or a score`);
    else if (src.kind === 'score') score(where, src.score);
    else {
      if (!streaks.has(src.streak)) errs.push(`${where}: unknown streak '${src.streak}'`);
      if (!stores.streaks.topByCurrentSum) {
        errs.push(
          `${where}: source 'streak-sum' needs a StreakStore that implements topByCurrentSum`,
        );
      }
    }
  }

  for (const e of d.escalators) {
    const where = `escalator ${e.code}`;
    if (!Number.isFinite(e.min) || !Number.isFinite(e.max) || e.max < e.min) {
      errs.push(`${where}: min/max must be finite with max >= min`);
    }
    if (!isPos(e.step)) errs.push(`${where}: step must be a positive number`);
    if (e.decay && (!isPos(e.decay.every) || !isPos(e.decay.by))) {
      errs.push(`${where}: decay every and by must be positive numbers`);
    }
  }

  const rule = (where: string, r: Rule): void => {
    switch (r.kind) {
      case 'count':
      case 'unique':
      case 'group-count':
      case 'score':
      case 'streak':
        if (!isPos(r.gte)) errs.push(`${where}: gte must be a positive number`);
        break;
    }
    if (r.kind === 'score') score(where, r.score);
    if (r.kind === 'streak') {
      if (!streaks.has(r.streak)) errs.push(`${where}: unknown streak '${r.streak}'`);
      if (r.anyKey && !stores.streaks.statsAcrossKeys) {
        errs.push(`${where}: anyKey needs a StreakStore that implements statsAcrossKeys`);
      }
    }
    if (r.kind === 'rank') {
      const b = boards.get(r.leaderboard);
      if (!b) errs.push(`${where}: unknown leaderboard '${r.leaderboard}'`);
      else if (!Number.isInteger(r.eq) || r.eq < 1 || r.eq > b.limit) {
        errs.push(`${where}: rank eq must be an integer in 1..${b.limit} (the board limit)`);
      }
    }
    if (r.kind === 'all' || r.kind === 'any') {
      if (!r.rules.length) errs.push(`${where}: '${r.kind}' has an empty rules list`);
      for (const sub of r.rules) rule(where, sub);
    }
  };
  for (const a of d.achievements) {
    rule(`achievement ${a.code}`, a.rule);
    if (a.points !== undefined && !(Number.isFinite(a.points) && a.points >= 0)) {
      errs.push(`achievement ${a.code}: points must be a finite number >= 0`);
    }
  }

  if (errs.length) throw new Error(`invalid badgetrip definitions:\n  ${errs.join('\n  ')}`);
}
