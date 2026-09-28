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

/** Anything UI adapters bind to: `observe(engine)`, or a remote from `@badgetrip/ipc`. */
export type Observable<E extends EngineApi = EngineApi> = {
  engine: E;
  /** Called after every state change through `engine`. Returns an unsubscribe. */
  subscribe: (cb: () => void) => () => void;
  /** Increments on every notification; use it as a cache key or snapshot. */
  getVersion: () => number;
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

  const out: ObservedEngine = {
    engine: {
      ...engine,
      emit: tracked(engine.emit),
      replay: tracked(engine.replay),
      seed: tracked(engine.seed),
      refresh: tracked(engine.refresh),
    },
    subscribe: (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    getVersion: () => version,
  };
  observed.set(engine, out);
  return out;
}
