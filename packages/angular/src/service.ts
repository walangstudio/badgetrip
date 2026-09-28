import {
  DestroyRef,
  type EnvironmentProviders,
  ErrorHandler,
  Injectable,
  InjectionToken,
  type Injector,
  type Signal,
  type WritableSignal,
  assertInInjectionContext,
  effect,
  inject,
  isSignal,
  makeEnvironmentProviders,
  signal,
} from '@angular/core';
import { type IconResolver, createIconResolver } from '@badgetrip/assets';
import {
  type AchievementView,
  type Engine,
  type EngineApi,
  type Observable,
  type Progress,
  type TierStatus,
  toObservable,
} from '@badgetrip/core';

export const BADGETRIP_ENGINE = new InjectionToken<Observable>('BADGETRIP_ENGINE');

/** Icon resolver for badges. Defaults to the built-in `@badgetrip/assets` pack. */
export const BADGETRIP_ICONS = new InjectionToken<IconResolver>('BADGETRIP_ICONS', {
  providedIn: 'root',
  factory: () => createIconResolver(),
});

/**
 * Wire an engine (and optionally a custom icon resolver) into an environment injector.
 * Accepts a local engine or an `Observable` such as a `@badgetrip/ipc` remote.
 */
export function provideBadgetrip(
  engine: Engine | Observable,
  opts: { icons?: IconResolver } = {},
): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: BADGETRIP_ENGINE, useValue: toObservable(engine) },
    opts.icons ? [{ provide: BADGETRIP_ICONS, useValue: opts.icons }] : [],
    BadgetripService,
  ]);
}

/** A plain value or a signal of one. Signal args re-run the query when they change. */
export type Arg<T = string> = T | Signal<T>;

/** The latest resolved value; `error` holds the last rejection until the next success. */
export type EngineQuery<T> = Signal<T> & { error: Signal<unknown> };

/** Pass `injector` to create a query outside an injection context. */
export type QueryOptions = { injector?: Injector };

const read = <T>(a: Arg<T>): T => (isSignal(a) ? (a as Signal<T>)() : a);

@Injectable({ providedIn: 'root' })
export class BadgetripService {
  private readonly errors = inject(ErrorHandler);
  private readonly version: WritableSignal<number>;
  /** Call `engine.emit(...)` here so queries refresh. */
  readonly engine: EngineApi;

  constructor() {
    const observed = inject(BADGETRIP_ENGINE, { optional: true });
    if (!observed) throw new Error('BadgetripService needs provideBadgetrip(engine)');
    this.engine = observed.engine;
    this.version = signal(observed.getVersion());
    const off = observed.subscribe(() => this.version.set(observed.getVersion()));
    inject(DestroyRef).onDestroy(off);
  }

  score(actor: Arg, score: Arg, opts?: QueryOptions): EngineQuery<number> {
    return this.query(() => this.engine.score(read(actor), read(score)), 0, opts);
  }

  achievements(actor: Arg, opts?: QueryOptions): EngineQuery<{ code: string; at: number }[]> {
    return this.query(() => this.engine.achievements(read(actor)), [], opts);
  }

  /** Every achievement for `actor`, ready to render (see `engine.catalog`). */
  catalog(actor: Arg, opts?: QueryOptions): EngineQuery<AchievementView[]> {
    return this.query(() => this.engine.catalog(read(actor)), [], opts);
  }

  progress(actor: Arg, code: Arg, opts?: QueryOptions): EngineQuery<Progress> {
    return this.query(
      () => this.engine.progress(read(actor), read(code)),
      { current: 0, target: 1, percent: 0 },
      opts,
    );
  }

  leaderboard(code: Arg, opts?: QueryOptions): EngineQuery<{ actor: string; value: number }[]> {
    return this.query(() => this.engine.leaderboard(read(code)), [], opts);
  }

  streak(
    actor: Arg,
    code: Arg,
    key?: Arg<string | undefined>,
    opts?: QueryOptions,
  ): EngineQuery<{ current: number; best: number; lastTick: number }> {
    return this.query(
      () => this.engine.streak(read(actor), read(code), read(key)),
      { current: 0, best: 0, lastTick: 0 },
      opts,
    );
  }

  tier(actor: Arg, code: Arg, opts?: QueryOptions): EngineQuery<TierStatus | null> {
    return this.query<TierStatus | null>(
      () => this.engine.tier(read(actor), read(code)),
      null,
      opts,
    );
  }

  escalator(
    actor: Arg,
    code: Arg,
    key?: Arg<string | undefined>,
    opts?: QueryOptions,
  ): EngineQuery<number> {
    return this.query(() => this.engine.escalator(read(actor), read(code), read(key)), 0, opts);
  }

  /**
   * Re-run `fn` when the engine changes or a signal it reads changes. Results of a
   * superseded run are dropped. Lives as long as the calling injection context.
   */
  private query<T>(fn: () => Promise<T>, initial: T, opts?: QueryOptions): EngineQuery<T> {
    if (!opts?.injector) assertInInjectionContext(this.query);
    const value = signal(initial);
    const error = signal<unknown>(undefined);
    effect(
      (onCleanup) => {
        this.version();
        let alive = true;
        onCleanup(() => {
          alive = false;
        });
        fn().then(
          (v) => {
            if (!alive) return;
            value.set(v);
            error.set(undefined);
          },
          (err) => {
            if (!alive) return;
            error.set(err);
            this.errors.handleError(err);
          },
        );
      },
      { injector: opts?.injector },
    );
    return Object.assign(value.asReadonly(), { error: error.asReadonly() });
  }
}
