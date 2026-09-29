import type {
  AchievementView,
  EngineApi,
  Progress,
  TierStatus,
} from '@walangstudio/badgetrip-core';
import {
  type MaybeRefOrGetter,
  type Ref,
  onScopeDispose,
  shallowReadonly,
  shallowRef,
  toValue,
  watch,
} from 'vue';
import { useReactiveEngine } from './plugin.js';

export type EngineQuery<T> = {
  /** Latest resolved value; `initial` until the first query resolves. */
  data: Readonly<Ref<T>>;
  /** Rejection of the latest query, cleared by the next success. */
  error: Readonly<Ref<unknown>>;
};

type Args<A extends unknown[]> = { [K in keyof A]: MaybeRefOrGetter<A[K]> };

/**
 * Re-run `run` when the engine changes (emit/replay/seed/refresh) or any arg changes.
 * Only the latest request applies. A rejection sets `error` and is rethrown from the
 * watcher, so Vue routes it through `onErrorCaptured` and `app.config.errorHandler`.
 */
function useEngineQuery<A extends unknown[], T>(
  args: Args<A>,
  run: (engine: EngineApi, ...a: A) => Promise<T>,
  initial: T,
): EngineQuery<T> {
  const reactive = useReactiveEngine();
  const version = shallowRef(reactive.getVersion());
  onScopeDispose(
    reactive.subscribe(() => {
      version.value = reactive.getVersion();
    }),
  );
  const data = shallowRef(initial);
  const error = shallowRef<unknown>();

  watch(
    [version, ...args.map((a) => () => toValue(a))],
    async ([, ...a], _, onCleanup) => {
      let stale = false;
      onCleanup(() => {
        stale = true;
      });
      try {
        const v = await run(reactive.engine, ...(a as A));
        if (stale) return;
        data.value = v;
        error.value = undefined;
      } catch (err) {
        if (stale) return;
        error.value = err;
        throw err;
      }
    },
    { immediate: true },
  );

  return { data: shallowReadonly(data), error: shallowReadonly(error) };
}

export function useScore(
  actor: MaybeRefOrGetter<string>,
  score: MaybeRefOrGetter<string>,
): EngineQuery<number> {
  return useEngineQuery([actor, score], (e, a, s) => e.score(a, s), 0);
}

export function useAchievements(
  actor: MaybeRefOrGetter<string>,
): EngineQuery<{ code: string; at: number }[]> {
  return useEngineQuery([actor], (e, a) => e.achievements(a), []);
}

/** Every achievement for `actor`, ready to render (see `engine.catalog`). */
export function useAchievementCatalog(
  actor: MaybeRefOrGetter<string>,
): EngineQuery<AchievementView[]> {
  return useEngineQuery([actor], (e, a) => e.catalog(a), []);
}

export function useAchievementProgress(
  actor: MaybeRefOrGetter<string>,
  code: MaybeRefOrGetter<string>,
): EngineQuery<Progress> {
  return useEngineQuery([actor, code], (e, a, c) => e.progress(a, c), {
    current: 0,
    target: 1,
    percent: 0,
  });
}

export function useLeaderboard(
  code: MaybeRefOrGetter<string>,
): EngineQuery<{ actor: string; value: number }[]> {
  return useEngineQuery([code], (e, c) => e.leaderboard(c), []);
}

export function useStreak(
  actor: MaybeRefOrGetter<string>,
  code: MaybeRefOrGetter<string>,
  key?: MaybeRefOrGetter<string | undefined>,
): EngineQuery<{ current: number; best: number; lastTick: number }> {
  return useEngineQuery([actor, code, key], (e, a, c, k) => e.streak(a, c, k), {
    current: 0,
    best: 0,
    lastTick: 0,
  });
}

export function useTier(
  actor: MaybeRefOrGetter<string>,
  code: MaybeRefOrGetter<string>,
): EngineQuery<TierStatus | null> {
  return useEngineQuery<[string, string], TierStatus | null>(
    [actor, code],
    (e, a, c) => e.tier(a, c),
    null,
  );
}

export function useEscalator(
  actor: MaybeRefOrGetter<string>,
  code: MaybeRefOrGetter<string>,
  key?: MaybeRefOrGetter<string | undefined>,
): EngineQuery<number> {
  return useEngineQuery([actor, code, key], (e, a, c, k) => e.escalator(a, c, k), 0);
}
