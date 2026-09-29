import { utcDayStart } from './clock.js';
import { evalEscalator } from './escalators.js';
import { getPath, matchFilter } from './path.js';
import { evaluateRule, ruleProgress, ruleTarget } from './rules.js';
import { evalTier } from './tiers.js';
import type {
  AchievementDef,
  AchievementView,
  Definitions,
  EmitResult,
  EngineConfig,
  Escalation,
  Event,
  LeaderboardDef,
  LeaderboardSource,
  Progress,
  ScoreDelta,
  Snapshot,
  StreakChange,
  TierStatus,
} from './types.js';
import { assertDefinitions, assertEvent } from './validate.js';

function withDefaults(d: Definitions): Required<Definitions> {
  return {
    scores: d.scores ?? [],
    points: d.points ?? [],
    achievements: d.achievements ?? [],
    streaks: d.streaks ?? [],
    tiers: d.tiers ?? [],
    leaderboards: d.leaderboards ?? [],
    escalators: d.escalators ?? [],
  };
}

export type Engine = ReturnType<typeof createEngine>;

export function createEngine(config: EngineConfig) {
  const { events, scores, achievements, streaks, clock } = config;
  const defs = withDefaults(config.definitions);
  const dayBoundary = config.dayBoundary ?? utcDayStart;
  assertDefinitions(defs, config);

  function resolveLeaderboardSource(def: LeaderboardDef): LeaderboardSource {
    if (def.source) return def.source;
    if (def.score !== undefined) return { kind: 'score', score: def.score };
    throw new Error(`leaderboard ${def.code}: needs a source or a score`);
  }

  /** `now` anchors rolling windows; emit passes the event ts so replay is clock-independent. */
  async function leaderboard(code: string, now = clock.now()) {
    const def = defs.leaderboards.find((l) => l.code === code);
    if (!def) throw new Error(`unknown leaderboard: ${code}`);
    const src = resolveLeaderboardSource(def);
    if (src.kind === 'score') {
      const window = def.window === 'all-time' ? undefined : { since: now - def.window.ms };
      return scores.top(src.score, def.limit, window);
    }
    if (!streaks.topByCurrentSum) {
      throw new Error(
        `leaderboard ${code} uses source 'streak-sum' but the StreakStore does not implement topByCurrentSum`,
      );
    }
    return streaks.topByCurrentSum(src.streak, def.limit);
  }

  async function applyPoints(event: Event): Promise<ScoreDelta[]> {
    const out: ScoreDelta[] = [];
    for (const p of defs.points) {
      if (p.on !== event.type) continue;
      if (p.where && !matchFilter(event, p.where)) continue;
      const amount = typeof p.delta === 'number' ? p.delta : getPath(event, p.delta.path);
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount === 0) continue;
      const delta: ScoreDelta = {
        actor: event.actor,
        score: p.score,
        delta: amount,
        reason: event.id,
        ts: event.ts,
      };
      await scores.apply(delta);
      out.push(delta);
    }
    return out;
  }

  async function applyStreaks(event: Event): Promise<StreakChange[]> {
    const out: StreakChange[] = [];
    for (const s of defs.streaks) {
      const key =
        s.scoping === 'per-actor' ? undefined : String(getPath(event, s.scoping.key) ?? '');
      const isReset = s.resetEvents.includes(event.type);
      const isTick = s.tickEvents.includes(event.type);
      if (!isReset && !isTick) continue;
      // `from` comes from the store's atomic result, never a read-before-write,
      // so concurrent emits for one actor still report consistent changes.
      if (isReset) {
        const from = await streaks.reset(event.actor, s.code, key, event.ts);
        if (typeof from !== 'number') {
          throw new TypeError('StreakStore.reset must return the previous current');
        }
        if (from !== 0) out.push({ code: s.code, actor: event.actor, key, from, to: 0 });
      } else {
        const { current } = await streaks.tick(event.actor, s.code, key, event.ts);
        if (typeof current !== 'number') {
          throw new TypeError('StreakStore.tick must return the new current');
        }
        out.push({
          code: s.code,
          actor: event.actor,
          key,
          from: current - 1,
          to: current,
        });
      }
    }
    return out;
  }

  async function applyEscalators(event: Event): Promise<Escalation[]> {
    const out: Escalation[] = [];
    for (const esc of defs.escalators) {
      if (!esc.triggerEvents.includes(event.type) && !esc.resetEvents.includes(event.type)) {
        continue;
      }
      const keyValue = esc.key ? String(getPath(event, esc.key) ?? '') : event.actor;
      const before = await evalEscalator(esc, event.actor, keyValue, events, event.ts, event.id);
      const after = await evalEscalator(esc, event.actor, keyValue, events, event.ts);
      if (after !== before) {
        out.push({
          code: esc.key ? `${esc.code}_${keyValue}` : esc.code,
          actor: event.actor,
          key: esc.key ? keyValue : undefined,
          from: before,
          to: after,
        });
      }
    }
    return out;
  }

  async function evaluateAchievements(event: Event): Promise<string[]> {
    const unlocked: string[] = [];
    const ctx = {
      actor: event.actor,
      event,
      events,
      scores,
      streaks,
      leaderboard: (code: string) => leaderboard(code, event.ts),
      dayBoundary,
    };
    for (const a of defs.achievements) {
      if (await achievements.has(event.actor, a.code)) continue;
      if (await evaluateRule(a.rule, ctx)) {
        if (await achievements.award(event.actor, a.code, event.ts)) unlocked.push(a.code);
      }
    }
    return unlocked;
  }

  // Per-actor queue: each emit sees a consistent snapshot of its actor's state in-process.
  // Cross-process safety comes from atomic store writes (docs/ADAPTERS.md).
  // A store method that awaits emit() for the same actor deadlocks here - stores must never call emit.
  const queues = new Map<string, Promise<unknown>>();
  function perActor<T>(actor: string, fn: () => Promise<T>): Promise<T> {
    const run = (queues.get(actor) ?? Promise.resolve()).then(fn);
    const tail = run.catch(() => {});
    queues.set(actor, tail);
    tail.then(() => {
      if (queues.get(actor) === tail) queues.delete(actor);
    });
    return run;
  }

  async function project(event: Event): Promise<EmitResult> {
    const inserted = await events.append(event);
    if (typeof inserted !== 'boolean') {
      throw new TypeError(
        'EventStore.append must return a boolean (true = inserted, false = duplicate id)',
      );
    }
    if (!inserted) {
      return {
        event,
        scoreDeltas: [],
        unlocked: [],
        streakChanges: [],
        escalations: [],
      };
    }
    const scoreDeltas = await applyPoints(event);
    const streakChanges = await applyStreaks(event);
    const escalations = await applyEscalators(event);
    const unlocked = await evaluateAchievements(event);
    return { event, scoreDeltas, unlocked, streakChanges, escalations };
  }

  async function emit(event: Event): Promise<EmitResult> {
    assertEvent(event);
    return perActor(event.actor, () => project(event));
  }

  async function replay(log: Event[]): Promise<EmitResult[]> {
    const ordered = [...log].sort(
      (a, b) => a.ts - b.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    const out: EmitResult[] = [];
    for (const e of ordered) out.push(await emit(e));
    return out;
  }

  /**
   * Import current state (snapshot-and-go migration). Streaks are rebuilt via tick/reset.
   * Not idempotent: seeding twice adds scores twice. Scores are stamped `clock.now()`.
   */
  async function seed(snapshot: Snapshot): Promise<void> {
    const now = clock.now();
    for (const s of snapshot.scores ?? []) {
      await scores.apply({
        actor: s.actor,
        score: s.score,
        delta: s.value,
        reason: 'seed',
        ts: now,
      });
    }
    for (const a of snapshot.achievements ?? []) {
      await achievements.award(a.actor, a.code, a.at);
    }
    for (const st of snapshot.streaks ?? []) {
      const best = Math.max(st.best, st.current);
      for (let i = 0; i < best; i++) await streaks.tick(st.actor, st.code, st.key, st.lastTick);
      await streaks.reset(st.actor, st.code, st.key, st.lastTick);
      for (let i = 0; i < st.current; i++) {
        await streaks.tick(st.actor, st.code, st.key, st.lastTick);
      }
    }
  }

  const complete = (def: AchievementDef): Progress => {
    const target = ruleTarget(def.rule);
    return { current: target, target, percent: 100 };
  };

  const progressCtx = (actor: string) => ({
    actor,
    events,
    scores,
    streaks,
    leaderboard,
    dayBoundary,
  });

  return {
    emit,
    replay,
    seed,
    leaderboard,
    async score(actor: string, score: string): Promise<number> {
      return scores.get(actor, score);
    },
    async tier(actor: string, code: string): Promise<TierStatus> {
      const def = defs.tiers.find((t) => t.code === code);
      if (!def) throw new Error(`unknown tier: ${code}`);
      return evalTier(def, await scores.get(actor, def.score));
    },
    async achievements(actor: string) {
      return achievements.list(actor);
    },
    async streak(actor: string, code: string, key?: string) {
      return streaks.get(actor, code, key);
    },
    /** Current escalator severity for an actor (and key, if the def is keyed) as of `clock.now()`. */
    async escalator(actor: string, code: string, key?: string): Promise<number> {
      const def = defs.escalators.find((e) => e.code === code);
      if (!def) throw new Error(`unknown escalator: ${code}`);
      const keyValue = def.key ? (key ?? '') : actor;
      return evalEscalator(def, actor, keyValue, events, clock.now());
    },
    /** How close `actor` is to achievement `code`. Unlocked achievements report 100%. */
    async progress(actor: string, code: string): Promise<Progress> {
      const def = defs.achievements.find((a) => a.code === code);
      if (!def) throw new Error(`unknown achievement: ${code}`);
      if (await achievements.has(actor, code)) return complete(def);
      return ruleProgress(def.rule, progressCtx(actor));
    },
    /**
     * Every defined achievement for `actor`, ready to render: unlock state, progress,
     * points, and hidden ones concealed until unlocked. In definition order. Read-only:
     * progress can reach 100% on a locked achievement the actor qualifies for without
     * emitting (a rank gained through others, a newly added definition) - call
     * `refresh(actor)` to award those.
     */
    async catalog(actor: string): Promise<AchievementView[]> {
      const owned = new Map((await achievements.list(actor)).map((a) => [a.code, a.at]));
      const ctx = progressCtx(actor);
      const cache = new Map<string, Promise<number>>();
      return Promise.all(
        defs.achievements.map(async (def): Promise<AchievementView> => {
          const at = owned.get(def.code);
          const unlocked = at !== undefined;
          if (def.hidden && !unlocked) {
            return {
              code: def.code,
              name: 'Hidden achievement',
              description: def.lockedDescription ?? '',
              icon: 'hidden',
              rarity: def.rarity,
              points: def.points ?? 0,
              unlocked: false,
              concealed: true,
              progress: { current: 0, target: 1, percent: 0 },
            };
          }
          return {
            code: def.code,
            name: def.name,
            description: unlocked ? def.description : (def.lockedDescription ?? def.description),
            ...(def.icon !== undefined ? { icon: def.icon } : {}),
            ...(def.category !== undefined ? { category: def.category } : {}),
            rarity: def.rarity,
            points: def.points ?? 0,
            ...(def.series ? { series: def.series } : {}),
            ...(def.celebration !== undefined ? { celebration: def.celebration } : {}),
            unlocked,
            ...(unlocked ? { unlockedAt: at } : {}),
            ...(def.hidden && unlocked ? { hidden: true as const } : {}),
            concealed: false,
            progress: unlocked ? complete(def) : await ruleProgress(def.rule, ctx, cache),
          };
        }),
      );
    },
    /**
     * Award every locked achievement `actor` already satisfies, stamped `clock.now()`.
     * Use after adding definitions (retroactive unlocks) or for rules other actors can
     * satisfy for you (`rank`). `first-of-day` only unlocks during `emit`.
     */
    refresh(actor: string): Promise<string[]> {
      return perActor(actor, async () => {
        const ctx = progressCtx(actor);
        const unlocked: string[] = [];
        for (const a of defs.achievements) {
          if (await achievements.has(actor, a.code)) continue;
          if ((await ruleProgress(a.rule, ctx)).percent < 100) continue;
          if (await achievements.award(actor, a.code, clock.now())) unlocked.push(a.code);
        }
        return unlocked;
      });
    },
    /** Read-only view of the resolved definitions. */
    definitions: defs,
  };
}
