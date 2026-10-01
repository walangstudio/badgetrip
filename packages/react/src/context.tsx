import type { Theme } from '@walangstudio/badgetrip-assets';
import {
  type Engine,
  type EngineApi,
  type Observable,
  observe,
  toObservable,
} from '@walangstudio/badgetrip-core';
import { applyTheme } from '@walangstudio/badgetrip-html';
import { type ReactNode, createContext, useContext, useEffect, useMemo } from 'react';

/** An engine whose mutating methods notify React subscribers after they run. */
export type ReactiveEngine = Observable;

/** Alias of `observe` from `@walangstudio/badgetrip-core`. */
export const makeReactive = observe;

const BadgetripContext = createContext<ReactiveEngine | null>(null);
const ThemeContext = createContext<Theme | null>(null);

export function BadgetripProvider({
  engine,
  theme,
  children,
}: {
  /** A local engine, or an `Observable` such as a `@walangstudio/badgetrip-ipc` remote. */
  engine: Engine | Observable;
  /**
   * A `defineTheme()` result. Its colors go on the page, and badges and `<UnlockNotifier>`
   * use its icons and celebrations. Pass another theme to switch.
   */
  theme?: Theme;
  children: ReactNode;
}) {
  const value = useMemo(() => toObservable(engine), [engine]);
  useEffect(() => (theme ? applyTheme(theme) : undefined), [theme]);
  return (
    <BadgetripContext.Provider value={value}>
      <ThemeContext.Provider value={theme ?? null}>{children}</ThemeContext.Provider>
    </BadgetripContext.Provider>
  );
}

/** The theme from the nearest `BadgetripProvider`, or `null`. */
export function useTheme(): Theme | null {
  return useContext(ThemeContext);
}

export function useReactiveEngine(): ReactiveEngine {
  const ctx = useContext(BadgetripContext);
  if (!ctx) throw new Error('badgetrip hooks must be used inside <BadgetripProvider>');
  return ctx;
}

/**
 * The engine. Call `engine.emit(...)` from here so the UI re-renders on change.
 * Typed as a local `Engine` by default; pass the remote type when the provider was
 * given an `@walangstudio/badgetrip-ipc` remote: `useBadgetrip<RemoteEngine['engine']>()`.
 */
export function useBadgetrip<E extends EngineApi = Engine>(): E {
  return useReactiveEngine().engine as E;
}
