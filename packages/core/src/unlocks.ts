import type { Observable } from './observe.js';
import type { AchievementView } from './types.js';

/** A new unlock with the view a UI should show for it. */
export type UnlockedView = { actor: string; view: AchievementView };

export type WatchUnlocksOptions = {
  /** Only report unlocks for this actor, or for actors the predicate accepts. */
  actor?: string | ((actor: string) => boolean);
  /** Receives catalog and callback errors. Defaults to rethrowing asynchronously. */
  onError?: (err: unknown) => void;
};

const rethrow = (err: unknown) =>
  queueMicrotask(() => {
    throw err;
  });

/**
 * Call `cb` with each batch of new unlocks from `source`, resolved to catalog views.
 * One `catalog(actor)` query per actor per batch; batches arrive in the order they
 * happened, each in definition order (bronze before silver). Returns a stop function.
 */
export function watchUnlocks(
  source: Observable,
  opts: WatchUnlocksOptions,
  cb: (items: UnlockedView[]) => void,
): () => void {
  if (typeof source.onUnlock !== 'function') {
    throw new TypeError(
      'watchUnlocks: this source has no onUnlock. Wrap the engine with observe(), or update @badgetrip/ipc.',
    );
  }
  const { actor, onError = rethrow } = opts;
  if (actor !== undefined && typeof actor !== 'string' && typeof actor !== 'function') {
    throw new TypeError('watchUnlocks: actor must be a string or a function');
  }
  const wanted =
    actor === undefined
      ? () => true
      : typeof actor === 'string'
        ? (a: string) => a === actor
        : actor;

  let stopped = false;
  let queue = Promise.resolve();
  const off = source.onUnlock((batch) => {
    const codes = new Map<string, Set<string>>();
    for (const u of batch) {
      if (!wanted(u.actor)) continue;
      const set = codes.get(u.actor) ?? new Set<string>();
      set.add(u.code);
      codes.set(u.actor, set);
    }
    if (!codes.size) return;
    queue = queue
      .then(async () => {
        const items: UnlockedView[] = [];
        for (const [a, wantedCodes] of codes) {
          if (stopped) return;
          for (const view of await source.engine.catalog(a)) {
            if (wantedCodes.has(view.code)) items.push({ actor: a, view });
          }
        }
        if (!stopped && items.length) cb(items);
      })
      .catch((err) => {
        if (stopped) return;
        try {
          onError(err);
        } catch (thrown) {
          rethrow(thrown);
        }
      });
  });
  return () => {
    stopped = true;
    off();
  };
}

/**
 * Secret mode: drop concealed (hidden, still locked) views and count them, for a
 * "3 hidden achievements remaining" line.
 */
export function splitConcealed(views: AchievementView[]): {
  views: AchievementView[];
  hiddenRemaining: number;
} {
  const shown = views.filter((v) => !v.concealed);
  return { views: shown, hiddenRemaining: views.length - shown.length };
}

/** A locked achievement that moved forward, and the step count it moved from. */
export type ProgressChange = { view: AchievementView; from: number };

/**
 * Call `cb` when locked, visible achievements of `actor` move forward. One catalog
 * query per change; changes that land while a query runs fold into the next one. The
 * first query only sets the baseline, so earlier progress is never reported.
 */
export function watchProgress(
  source: Observable,
  opts: { actor: string; onError?: (err: unknown) => void },
  cb: (changes: ProgressChange[]) => void,
): () => void {
  const { actor, onError = rethrow } = opts;
  if (typeof actor !== 'string' || !actor) {
    throw new TypeError('watchProgress: actor must be a non-empty string');
  }
  let last: Map<string, number> | undefined;
  let running = false;
  let again = false;
  let stopped = false;
  const run = async () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        const views = await source.engine.catalog(actor);
        if (stopped) return;
        const prev = last;
        last = new Map(views.map((v) => [v.code, v.progress.current]));
        if (!prev) continue;
        const changes = views
          .filter((v) => !v.unlocked && !v.concealed && prev.has(v.code))
          .filter((v) => v.progress.current > (prev.get(v.code) as number))
          .map((view) => ({ view, from: prev.get(view.code) as number }));
        if (changes.length) cb(changes);
      } while (again && !stopped);
    } catch (err) {
      if (!stopped) onError(err);
    } finally {
      running = false;
    }
  };
  void run();
  const off = source.subscribe(() => void run());
  return () => {
    stopped = true;
    off();
  };
}
