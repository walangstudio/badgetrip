import type { Engine } from './engine.js';

/** The engine methods UI adapters call. Local engines and `@badgetrip/ipc` remotes both have them. */
export type EngineApi = Pick<
  Engine,
  | 'emit'
  | 'refresh'
  | 'score'
  | 'tier'
  | 'leaderboard'
  | 'achievements'
  | 'streak'
  | 'escalator'
  | 'progress'
  | 'catalog'
>;

/** One achievement one actor just unlocked. */
export type Unlock = { actor: string; code: string };

/** Anything UI adapters bind to: `observe(engine)`, or a remote from `@badgetrip/ipc`. */
export type Observable<E extends EngineApi = EngineApi> = {
  engine: E;
  /** Called after every state change through `engine`. Returns an unsubscribe. */
  subscribe: (cb: () => void) => () => void;
  /** Increments on every notification; use it as a cache key or snapshot. */
  getVersion: () => number;
  /**
   * Called with each batch of new unlocks from `emit` and `refresh`, after `subscribe`
   * listeners. `replay` and `seed` rebuild or import history, so they never report
   * unlocks. Returns an unsubscribe.
   */
  onUnlock?: (cb: (unlocks: readonly Unlock[]) => void) => () => void;
};

/** An engine whose state-changing methods notify subscribers after they run. */
export type ObservedEngine = Observable<Engine>;

/** Pass an `Observable` through; wrap a plain engine with `observe`. */
export function toObservable(e: Engine | Observable): Observable {
  return 'subscribe' in e ? e : observe(e);
}

const observed = new WeakMap<Engine, ObservedEngine>();

/** Run every listener; a throwing one is reported asynchronously and never blocks the rest. */
export function notifyAll(listeners: Iterable<() => void>): void {
  for (const l of [...listeners]) {
    try {
      l();
    } catch (err) {
      queueMicrotask(() => {
        throw err;
      });
    }
  }
}

/**
 * Wrap an engine for UI bindings. Only calls through the returned `engine` notify.
 * One wrapper per engine: every adapter and `@badgetrip/ipc` server that observes the
 * same engine shares one change stream, so a change through any of them reaches all.
 */
export function observe(engine: Engine): ObservedEngine {
  const hit = observed.get(engine);
  if (hit) return hit;
  const listeners = new Set<() => void>();
  const unlockListeners = new Set<(unlocks: readonly Unlock[]) => void>();
  let version = 0;
  const notify = () => {
    version += 1;
    notifyAll(listeners);
  };
  // Notify even on failure: a partly applied call still changed state.
  const tracked =
    <A extends unknown[], R>(fn: (...a: A) => Promise<R>) =>
    async (...a: A): Promise<R> => {
      try {
        return await fn(...a);
      } finally {
        notify();
      }
    };

  const report = (actor: string, codes: string[]) => {
    if (!codes.length) return;
    const batch: readonly Unlock[] = Object.freeze(codes.map((code) => ({ actor, code })));
    notifyAll([...unlockListeners].map((l) => () => l(batch)));
  };
  const emit = tracked(engine.emit);
  const refresh = tracked(engine.refresh);

  const out: ObservedEngine = {
    engine: {
      ...engine,
      emit: async (event) => {
        const result = await emit(event);
        report(result.event.actor, result.unlocked);
        return result;
      },
      replay: tracked(engine.replay),
      seed: tracked(engine.seed),
      refresh: async (actor) => {
        const codes = await refresh(actor);
        report(actor, codes);
        return codes;
      },
    },
    subscribe: (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    getVersion: () => version,
    onUnlock: (cb) => {
      unlockListeners.add(cb);
      return () => {
        unlockListeners.delete(cb);
      };
    },
  };
  observed.set(engine, out);
  return out;
}
