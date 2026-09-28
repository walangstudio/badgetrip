import { type IconResolver, createIconResolver } from '@walangstudio/badgetrip-assets';
import {
  type Engine,
  type EngineApi,
  type Observable,
  toObservable,
} from '@walangstudio/badgetrip-core';
import { type InjectionKey, type Plugin, inject, provide } from 'vue';

/** An engine whose mutating methods notify Vue subscribers after they run. */
export type ReactiveEngine = Observable;

export type BadgetripOptions = {
  /** Custom icon resolver (see `createIconResolver` in `@walangstudio/badgetrip-assets`). */
  icons?: IconResolver;
};

export const BadgetripKey: InjectionKey<ReactiveEngine> = Symbol('badgetrip');
export const IconsKey: InjectionKey<IconResolver> = Symbol('badgetrip.icons');

export const defaultIcons = createIconResolver();

/** App-wide provision: `app.use(createBadgetrip(engine, { icons }))`. */
export function createBadgetrip(engine: Engine | Observable, opts: BadgetripOptions = {}): Plugin {
  return {
    install(app) {
      app.provide(BadgetripKey, toObservable(engine));
      if (opts.icons) app.provide(IconsKey, opts.icons);
    },
  };
}

/** Component-scoped provision; call from `setup()`. Descendants see this engine. */
export function provideBadgetrip(
  engine: Engine | Observable,
  opts: BadgetripOptions = {},
): ReactiveEngine {
  const reactive = toObservable(engine);
  provide(BadgetripKey, reactive);
  if (opts.icons) provide(IconsKey, opts.icons);
  return reactive;
}

export function useReactiveEngine(): ReactiveEngine {
  const reactive = inject(BadgetripKey, null);
  if (!reactive) {
    throw new Error(
      'badgetrip composables need app.use(createBadgetrip(engine)) or provideBadgetrip()',
    );
  }
  return reactive;
}

/** The engine. Call `engine.emit(...)` from here so composables re-query on change. */
export function useBadgetrip<E extends EngineApi = Engine>(): E {
  return useReactiveEngine().engine as E;
}
