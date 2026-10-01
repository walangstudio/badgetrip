import { type IconResolver, type Theme, createIconResolver } from '@walangstudio/badgetrip-assets';
import {
  type Engine,
  type EngineApi,
  type Observable,
  toObservable,
} from '@walangstudio/badgetrip-core';
import { applyTheme } from '@walangstudio/badgetrip-html';
import {
  type InjectionKey,
  type Plugin,
  type ShallowRef,
  inject,
  onScopeDispose,
  provide,
  shallowRef,
  watch,
} from 'vue';

/** An engine whose mutating methods notify Vue subscribers after they run. */
export type ReactiveEngine = Observable;

export type BadgetripOptions = {
  /** Custom icon resolver (see `createIconResolver` in `@walangstudio/badgetrip-assets`). */
  icons?: IconResolver;
  /**
   * A `defineTheme()` result. Its colors go on the page, and badges and `<UnlockNotifier>`
   * use its icons and celebrations. Switch with `useTheme().value = other`. Without one,
   * a nested `provideBadgetrip` uses the outer theme; page colors only come from the outermost.
   */
  theme?: Theme;
};

export const BadgetripKey: InjectionKey<ReactiveEngine> = Symbol('badgetrip');
export const IconsKey: InjectionKey<IconResolver> = Symbol('badgetrip.icons');
export const ThemeKey: InjectionKey<ShallowRef<Theme | null>> = Symbol('badgetrip.theme');

export const defaultIcons = createIconResolver();

// The theme lives in a ref so assigning it re-renders badges and restyles the page.
function themeRef(theme: Theme | undefined) {
  const ref = shallowRef<Theme | null>(theme ?? null);
  let undo = () => {};
  const stop = watch(
    ref,
    (t) => {
      undo();
      undo = t ? applyTheme(t) : () => {};
    },
    { immediate: true },
  );
  const dispose = () => {
    stop();
    undo();
  };
  return { ref, dispose };
}

/** App-wide provision: `app.use(createBadgetrip(engine, { icons }))`. */
export function createBadgetrip(engine: Engine | Observable, opts: BadgetripOptions = {}): Plugin {
  return {
    install(app) {
      app.provide(BadgetripKey, toObservable(engine));
      if (opts.icons) app.provide(IconsKey, opts.icons);
      const theme = themeRef(opts.theme);
      app.provide(ThemeKey, theme.ref);
      // app.onUnmount arrived in Vue 3.5; the peer range starts at 3.4.
      if (typeof app.onUnmount === 'function') app.onUnmount(theme.dispose);
      else {
        const unmount = app.unmount.bind(app);
        app.unmount = () => {
          theme.dispose();
          unmount();
        };
      }
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
  // Nested under another provider: inherit its theme, and leave page colors to it.
  const outer = inject(ThemeKey, null);
  if (outer) provide(ThemeKey, opts.theme ? shallowRef(opts.theme) : outer);
  else {
    const theme = themeRef(opts.theme);
    provide(ThemeKey, theme.ref);
    onScopeDispose(theme.dispose);
  }
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

/**
 * The current theme as a ref: read it, or assign another `defineTheme()` result to switch
 * everything under the provider. `null` outside a provider with a theme slot.
 */
export function useTheme(): ShallowRef<Theme | null> {
  return inject(ThemeKey, null) ?? shallowRef(null);
}

/** The engine. Call `engine.emit(...)` from here so composables re-query on change. */
export function useBadgetrip<E extends EngineApi = Engine>(): E {
  return useReactiveEngine().engine as E;
}
