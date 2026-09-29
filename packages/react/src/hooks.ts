import type { AchievementView, Progress, TierStatus } from '@walangstudio/badgetrip-core';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useBadgetrip, useReactiveEngine } from './context.js';

/**
 * Re-run `fn` whenever the engine changes (an emit/replay/seed), the provider's engine
 * is swapped, or `deps` change, storing the latest resolved value. `initial` is the
 * value before the first resolve. A rejected query is rethrown during render so the
 * nearest React error boundary handles it.
 */
function useEngineQuery<T>(fn: () => Promise<T>, deps: unknown[], initial: T): T {
  const reactive = useReactiveEngine();
  const version = useSyncExternalStore(
    reactive.subscribe,
    reactive.getVersion,
    reactive.getVersion,
  );
  const [value, setValue] = useState<T>(initial);
  const [, rethrowInRender] = useState<unknown>();
  const fnRef = useRef(fn);
  fnRef.current = fn;

  // biome-ignore lint/correctness/useExhaustiveDependencies: version + deps are the intended triggers.
  useEffect(() => {
    let alive = true;
    fnRef.current().then(
      (v) => {
        if (alive) setValue(v);
      },
      (err) => {
        if (alive)
          rethrowInRender(() => {
            throw err;
          });
      },
    );
    return () => {
      alive = false;
    };
  }, [reactive, version, ...deps]);

  return value;
}

export function useScore(actor: string, score: string): number {
  const engine = useBadgetrip();
  return useEngineQuery(() => engine.score(actor, score), [actor, score], 0);
}

export function useAchievements(actor: string): { code: string; at: number }[] {
  const engine = useBadgetrip();
  return useEngineQuery(() => engine.achievements(actor), [actor], []);
}

/** Every achievement for `actor`, ready to render (see `engine.catalog`). */
export function useAchievementCatalog(actor: string): AchievementView[] {
  const engine = useBadgetrip();
  return useEngineQuery(() => engine.catalog(actor), [actor], []);
}

export function useAchievementProgress(actor: string, code: string): Progress {
  const engine = useBadgetrip();
  return useEngineQuery(() => engine.progress(actor, code), [actor, code], {
    current: 0,
    target: 1,
    percent: 0,
  });
}

export function useLeaderboard(code: string): { actor: string; value: number }[] {
  const engine = useBadgetrip();
  return useEngineQuery(() => engine.leaderboard(code), [code], []);
}

export function useStreak(
  actor: string,
  code: string,
  key?: string,
): { current: number; best: number; lastTick: number } {
  const engine = useBadgetrip();
  return useEngineQuery(() => engine.streak(actor, code, key), [actor, code, key], {
    current: 0,
    best: 0,
    lastTick: 0,
  });
}

export function useTier(actor: string, code: string): TierStatus | null {
  const engine = useBadgetrip();
  return useEngineQuery<TierStatus | null>(() => engine.tier(actor, code), [actor, code], null);
}

export function useEscalator(actor: string, code: string, key?: string): number {
  const engine = useBadgetrip();
  return useEngineQuery(() => engine.escalator(actor, code, key), [actor, code, key], 0);
}
