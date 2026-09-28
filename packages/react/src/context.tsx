import {
  type Engine,
  type EngineApi,
  type Observable,
  observe,
  toObservable,
} from '@badgetrip/core';
import { type ReactNode, createContext, useContext, useMemo } from 'react';

/** An engine whose mutating methods notify React subscribers after they run. */
export type ReactiveEngine = Observable;

/** Alias of `observe` from `@badgetrip/core`. */
export const makeReactive = observe;

const BadgetripContext = createContext<ReactiveEngine | null>(null);

export function BadgetripProvider({
  engine,
  children,
}: {
  /** A local engine, or an `Observable` such as a `@badgetrip/ipc` remote. */
  engine: Engine | Observable;
  children: ReactNode;
}) {
  const value = useMemo(() => toObservable(engine), [engine]);
  return <BadgetripContext.Provider value={value}>{children}</BadgetripContext.Provider>;
}

export function useReactiveEngine(): ReactiveEngine {
  const ctx = useContext(BadgetripContext);
  if (!ctx) throw new Error('badgetrip hooks must be used inside <BadgetripProvider>');
  return ctx;
}

/**
 * The engine. Call `engine.emit(...)` from here so the UI re-renders on change.
 * Typed as a local `Engine` by default; pass the remote type when the provider was
 * given an `@badgetrip/ipc` remote: `useBadgetrip<RemoteEngine['engine']>()`.
 */
export function useBadgetrip<E extends EngineApi = Engine>(): E {
  return useReactiveEngine().engine as E;
}
