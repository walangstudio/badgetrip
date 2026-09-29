import { isPlatformBrowser } from '@angular/common';
import {
  DestroyRef,
  ENVIRONMENT_INITIALIZER,
  type EnvironmentProviders,
  ErrorHandler,
  Injectable,
  InjectionToken,
  type Injector,
  PLATFORM_ID,
  type Signal,
  type WritableSignal,
  assertInInjectionContext,
  effect,
  inject,
  isSignal,
  makeEnvironmentProviders,
  signal,
} from '@angular/core';
import {
  type Celebration,
  type CelebrationResolver,
  type IconResolver,
  createCelebrationResolver,
  createIconResolver,
} from '@walangstudio/badgetrip-assets';
import {
  type AchievementView,
  type Engine,
  type EngineApi,
  type Observable,
  type Progress,
  type TierStatus,
  toObservable,
  watchUnlocks,
} from '@walangstudio/badgetrip-core';
import { type Notifier, type NotifierOptions, createNotifier } from '@walangstudio/badgetrip-html';

export const BADGETRIP_ENGINE = new InjectionToken<Observable>('BADGETRIP_ENGINE');

/** Icon resolver for badges. Defaults to the built-in `@walangstudio/badgetrip-assets` pack. */
export const BADGETRIP_ICONS = new InjectionToken<IconResolver>('BADGETRIP_ICONS', {
  providedIn: 'root',
  factory: () => createIconResolver(),
});

/**
 * The unlock overlay created by `provideBadgetrip(engine, { notifier })`, or null (no
 * notifier requested, or not in a browser). Use it to change sound settings:
 * `inject(BADGETRIP_NOTIFIER)?.update({ sound: true })`.
 */
export const BADGETRIP_NOTIFIER = new InjectionToken<Notifier | null>('BADGETRIP_NOTIFIER', {
  providedIn: 'root',
  factory: () => null,
});

/**
 * Wire an engine (and optionally a custom icon resolver) into an environment injector.
 * Accepts a local engine or an `Observable` such as a `@walangstudio/badgetrip-ipc` remote. Pass
 * `notifier` (options, or `true` for the defaults) to celebrate unlocks on top of the
 * page; it mounts in the browser only and is removed with the injector.
 */
export function provideBadgetrip(
  engine: Engine | Observable,
  opts: {
    icons?: IconResolver;
    /** Options, `true` for the defaults, or a function run in the injection context. */
    notifier?: NotifierOptions | true | (() => NotifierOptions);
  } = {},
): EnvironmentProviders {
  const notifier = opts.notifier === true ? {} : opts.notifier;
  return makeEnvironmentProviders([
    { provide: BADGETRIP_ENGINE, useValue: toObservable(engine) },
    opts.icons ? [{ provide: BADGETRIP_ICONS, useValue: opts.icons }] : [],
    notifier
      ? [
          {
            provide: BADGETRIP_NOTIFIER,
            useFactory: () => {
              if (!isPlatformBrowser(inject(PLATFORM_ID))) return null;
              const n = createNotifier(inject(BADGETRIP_ENGINE), {
                ...(opts.icons ? { icons: opts.icons } : {}),
                ...(typeof notifier === 'function' ? notifier() : notifier),
              });
              inject(DestroyRef).onDestroy(() => n.dispose());
              return n;
            },
          },
          {
            provide: ENVIRONMENT_INITIALIZER,
            multi: true,
            useValue: () => void inject(BADGETRIP_NOTIFIER),
          },
        ]
      : [],
    BadgetripService,
  ]);
}

export type UnlockItem = { view: AchievementView; celebration: Celebration };

export type UnlocksOptions = QueryOptions & {
  /** Only this actor, or actors the predicate accepts. */
  actor?: string | ((actor: string) => boolean);
  celebrations?: CelebrationResolver;
};

/** A queue of new unlocks for a custom celebration UI. */
export type UnlockQueue = {
  queue: Signal<UnlockItem[]>;
  /** Drop the oldest. */
  dismiss: () => void;
  clear: () => void;
};

const defaultCelebrations = createCelebrationResolver();

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

  private readonly observed: Observable;

  constructor() {
    const observed = inject(BADGETRIP_ENGINE, { optional: true });
    if (!observed) throw new Error('BadgetripService needs provideBadgetrip(engine)');
    this.observed = observed;
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
   * New unlocks as a signal queue, for drawing your own celebration UI. Quiet
   * achievements are left out. Lives as long as the calling injection context.
   */
  unlocks(opts: UnlocksOptions = {}): UnlockQueue {
    if (!opts.injector) assertInInjectionContext(this.unlocks);
    const destroy = opts.injector ? opts.injector.get(DestroyRef) : inject(DestroyRef);
    const queue = signal<UnlockItem[]>([]);
    const resolver = opts.celebrations ?? defaultCelebrations;
    const stop = watchUnlocks(
      this.observed,
      { actor: opts.actor, onError: (err) => this.errors.handleError(err) },
      (items) => {
        const next = items
          .map(({ view }) => ({ view, celebration: resolver.resolve(view) }))
          .filter((i) => !i.celebration.quiet);
        if (next.length) queue.update((q) => [...q, ...next]);
      },
    );
    destroy.onDestroy(stop);
    return {
      queue: queue.asReadonly(),
      dismiss: () => queue.update((q) => q.slice(1)),
      clear: () => queue.set([]),
    };
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
