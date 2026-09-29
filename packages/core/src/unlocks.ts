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
      'watchUnlocks: this source has no onUnlock. Wrap the engine with observe(), or update @walangstudio/badgetrip-ipc.',
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
 * Call `cb` when locked, visible achievements of `actor` move forward, with the views
 * that became unlocked since the last check (so a UI can skip a series that just
 * unlocked a tier). One catalog query per change; changes that land while a query runs
 * fold into the next one. The first query only sets the baseline, and so does the
 * first one after `seed` or `replay`, so imported or rebuilt progress is never reported.
 */
export function watchProgress(
  source: Observable,
  opts: { actor: string; onError?: (err: unknown) => void },
  cb: (changes: ProgressChange[], unlocked: AchievementView[]) => void,
): () => void {
  const { actor, onError = rethrow } = opts;
  if (typeof actor !== 'string' || !actor) {
    throw new TypeError('watchProgress: actor must be a non-empty string');
  }
  let last: Map<string, { current: number; unlocked: boolean }> | undefined;
  let running = false;
  let again = false;
  let rebase = false;
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
        const rebasing = rebase;
        rebase = false;
        const views = await source.engine.catalog(actor);
        if (stopped) return;
        const prev = rebasing ? undefined : last;
        last = new Map(
          views.map((v) => [v.code, { current: v.progress.current, unlocked: v.unlocked }]),
        );
        if (!prev) continue;
        const changes: ProgressChange[] = [];
        const unlocked: AchievementView[] = [];
        for (const v of views) {
          const before = prev.get(v.code);
          if (!before) continue;
          if (v.unlocked && !before.unlocked) unlocked.push(v);
          else if (!v.unlocked && !v.concealed && v.progress.current > before.current) {
            changes.push({ view: v, from: before.current });
          }
        }
        if (changes.length) cb(changes, unlocked);
      } while (again && !stopped);
    } catch (err) {
      if (stopped) return;
      try {
        onError(err);
      } catch (thrown) {
        rethrow(thrown);
      }
    } finally {
      running = false;
      // A change that arrived while a failed query ran still deserves a look.
      if (again && !stopped) void run();
    }
  };
  void run();
  const off = source.subscribe((kind) => {
    if (kind === 'seed' || kind === 'replay') rebase = true;
    void run();
  });
  return () => {
    stopped = true;
    off();
  };
}
