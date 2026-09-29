import { getPath, matchFilter } from '../path.js';
import type {
  AchievementStore,
  Event,
  EventStore,
  ScoreDelta,
  ScoreStore,
  StreakStore,
} from '../types.js';

const SEP = '\0';

/**
 * Reference EventStore. Keeps events in memory, dedupes by id (idempotent append),
 * and yields in (ts, insertion) order so folds and first-of-day are deterministic.
 */
export function memoryEventStore(): EventStore {
  const events: { e: Event; seq: number }[] = [];
  const seen = new Set<string>();
  let seq = 0;

  function sorted() {
    return [...events].sort((a, b) => a.e.ts - b.e.ts || a.seq - b.seq).map((x) => x.e);
  }

  return {
    async append(e) {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      events.push({ e, seq: seq++ });
      return true;
    },
    async *read(opts) {
      let n = 0;
      for (const e of sorted()) {
        if (opts.actor && e.actor !== opts.actor) continue;
        if (opts.type && e.type !== opts.type) continue;
        if (opts.since !== undefined && e.ts < opts.since) continue;
        yield e;
        n++;
        if (opts.limit && n >= opts.limit) break;
      }
    },
    async count(opts) {
      let n = 0;
      for (const { e } of events) {
        if (e.actor !== opts.actor) continue;
        if (e.type !== opts.type) continue;
        if (opts.where && !matchFilter(e, opts.where)) continue;
        n++;
      }
      return n;
    },
    async maxGroupSize(opts) {
      const counts = new Map<unknown, number>();
      let max = 0;
      for (const { e } of events) {
        if (e.actor !== opts.actor) continue;
        if (e.type !== opts.type) continue;
        if (opts.where && !matchFilter(e, opts.where)) continue;
        const v = getPath(e, opts.by);
        if (v === undefined) continue;
        const n = (counts.get(v) ?? 0) + 1;
        counts.set(v, n);
        if (n > max) max = n;
      }
      return max;
    },
  };
}

export function memoryScoreStore(): ScoreStore {
  const totals = new Map<string, number>();
  const log: { actor: string; score: string; delta: number; ts: number }[] = [];
  const key = (a: string, s: string) => `${a}${SEP}${s}`;

  return {
    async get(actor, score) {
      return totals.get(key(actor, score)) ?? 0;
    },
    async apply(d: ScoreDelta) {
      const next = (totals.get(key(d.actor, d.score)) ?? 0) + d.delta;
      totals.set(key(d.actor, d.score), next);
      log.push({ actor: d.actor, score: d.score, delta: d.delta, ts: d.ts });
      return next;
    },
    async top(score, limit, window) {
      const agg = new Map<string, number>();
      if (window) {
        for (const e of log) {
          if (e.score === score && e.ts >= window.since) {
            agg.set(e.actor, (agg.get(e.actor) ?? 0) + e.delta);
          }
        }
      } else {
        for (const [k, v] of totals) {
          const idx = k.indexOf(SEP);
          if (k.slice(idx + 1) === score) agg.set(k.slice(0, idx), v);
        }
      }
      return [...agg]
        .map(([actor, value]) => ({ actor, value }))
        .sort((a, b) => b.value - a.value || (a.actor < b.actor ? -1 : a.actor > b.actor ? 1 : 0))
        .slice(0, limit);
    },
  };
}

export function memoryAchievementStore(): AchievementStore {
  const owned = new Map<string, Map<string, number>>();

  return {
    async award(actor, code, at) {
      let m = owned.get(actor);
      if (!m) {
        m = new Map();
        owned.set(actor, m);
      }
      if (m.has(code)) return false;
      m.set(code, at);
      return true;
    },
    async list(actor) {
      const m = owned.get(actor);
      return m ? [...m].map(([code, at]) => ({ code, at })) : [];
    },
    async has(actor, code) {
      return owned.get(actor)?.has(code) ?? false;
    },
  };
}

export function memoryStreakStore(): StreakStore {
  type Row = { current: number; best: number; lastTick: number };
  const data = new Map<string, Row>();
  const key = (a: string, c: string, k?: string) => `${a}${SEP}${c}${SEP}${k ?? ''}`;
  const blank = (): Row => ({ current: 0, best: 0, lastTick: 0 });

  return {
    async get(actor, code, k) {
      return { ...(data.get(key(actor, code, k)) ?? blank()) };
    },
    async tick(actor, code, k, at) {
      const cur = data.get(key(actor, code, k)) ?? blank();
      const current = cur.current + 1;
      const best = Math.max(cur.best, current);
      data.set(key(actor, code, k), { current, best, lastTick: at });
      return { current, best };
    },
    async reset(actor, code, k, at) {
      const cur = data.get(key(actor, code, k)) ?? blank();
      data.set(key(actor, code, k), {
        current: 0,
        best: cur.best,
        lastTick: at,
      });
      return cur.current;
    },
    async topByCurrentSum(code, limit) {
      const agg = new Map<string, number>();
      for (const [k, row] of data) {
        const sep1 = k.indexOf(SEP);
        const sep2 = k.indexOf(SEP, sep1 + 1);
        if (k.slice(sep1 + 1, sep2) !== code) continue;
        const actor = k.slice(0, sep1);
        agg.set(actor, (agg.get(actor) ?? 0) + row.current);
      }
      return [...agg]
        .map(([actor, value]) => ({ actor, value }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value || (a.actor < b.actor ? -1 : a.actor > b.actor ? 1 : 0))
        .slice(0, limit);
    },
    async statsAcrossKeys(actor, code) {
      const prefix = `${actor}${SEP}${code}${SEP}`;
      let maxCurrent = 0;
      let maxBest = 0;
      for (const [k, row] of data) {
        if (!k.startsWith(prefix)) continue;
        if (row.current > maxCurrent) maxCurrent = row.current;
        if (row.best > maxBest) maxBest = row.best;
      }
      return { maxCurrent, maxBest };
    },
  };
}
