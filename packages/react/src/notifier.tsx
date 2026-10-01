import {
  type Celebration,
  type CelebrationResolver,
  createCelebrationResolver,
} from '@walangstudio/badgetrip-assets';
import { type AchievementView, watchUnlocks } from '@walangstudio/badgetrip-core';
import { type Notifier, type NotifierOptions, createNotifier } from '@walangstudio/badgetrip-html';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useReactiveEngine, useTheme } from './context.js';

export type UnlockNotifierProps = NotifierOptions;

/**
 * Celebrates unlocks on top of the page (toasts, modal, fullscreen, confetti, sound).
 * Render it once inside `<BadgetripProvider>`. It follows the provider's `theme` unless
 * given its own. `sound`, `volume`, `muted` and `theme` update in place; changing
 * anything else re-creates the overlay, so keep `celebrations` and `icons` stable
 * (create them once, outside the component).
 */
export function UnlockNotifier({
  sound,
  volume,
  muted,
  theme: ownTheme,
  ...opts
}: UnlockNotifierProps): null {
  const reactive = useReactiveEngine();
  const contextTheme = useTheme();
  const theme = ownTheme ?? contextTheme;
  const notifier = useRef<Notifier>();
  const latest = useRef(opts);
  latest.current = opts;
  const latestTheme = useRef(theme);
  latestTheme.current = theme;
  const actorKey = typeof opts.actor === 'function' ? 'fn' : opts.actor;

  // biome-ignore lint/correctness/useExhaustiveDependencies: functions are read through `latest`.
  useEffect(() => {
    const { actor, onError, labels } = latest.current;
    const n = createNotifier(reactive, {
      ...latest.current,
      ...(typeof actor === 'function'
        ? { actor: (a: string) => (latest.current.actor as (a: string) => boolean)(a) }
        : {}),
      ...(onError ? { onError: (err: unknown) => latest.current.onError?.(err) } : {}),
      ...(labels
        ? {
            labels: {
              ...labels,
              ...(labels.more
                ? { more: (n: number) => latest.current.labels?.more?.(n) ?? '' }
                : {}),
              ...(labels.count
                ? {
                    count: (p: { current: number; target: number }) =>
                      latest.current.labels?.count?.(p) ?? `${p.current}/${p.target}`,
                  }
                : {}),
            },
          }
        : {}),
      sound,
      volume,
      muted,
      ...(latestTheme.current ? { theme: latestTheme.current } : {}),
    });
    notifier.current = n;
    return () => {
      n.dispose();
      notifier.current = undefined;
    };
  }, [
    reactive,
    opts.celebrations,
    opts.icons,
    opts.root,
    actorKey,
    opts.maxVisible,
    opts.maxQueue,
    opts.zIndex,
    opts.labels?.close,
    !!opts.onError,
    !!opts.labels?.more,
    !!opts.labels?.count,
  ]);

  useEffect(() => {
    notifier.current?.update({ sound, volume, muted });
  }, [sound, volume, muted]);

  useEffect(() => {
    notifier.current?.update({ theme });
  }, [theme]);

  return null;
}

export type UnlockItem = { view: AchievementView; celebration: Celebration };

export type UseUnlocksOptions = {
  /** Only this actor, or actors the predicate accepts. */
  actor?: string | ((actor: string) => boolean);
  celebrations?: CelebrationResolver;
};

const defaultCelebrations = createCelebrationResolver();

/**
 * New unlocks as a queue, for drawing your own celebration UI (or on React Native).
 * Celebrations come from `celebrations`, then the provider's theme. Quiet achievements are left out. `dismiss()` drops the oldest, `clear()` drops all.
 */
export function useUnlocks(opts: UseUnlocksOptions = {}) {
  const reactive = useReactiveEngine();
  const theme = useTheme();
  const [queue, setQueue] = useState<UnlockItem[]>([]);
  const latest = useRef(opts);
  latest.current = opts;
  const latestTheme = useRef(theme);
  latestTheme.current = theme;
  const actorKey = typeof opts.actor === 'function' ? 'fn' : opts.actor;

  // biome-ignore lint/correctness/useExhaustiveDependencies: the actor predicate is read through `latest`.
  useEffect(() => {
    const { actor } = latest.current;
    setQueue([]);
    return watchUnlocks(
      reactive,
      {
        actor:
          typeof actor === 'function'
            ? (a) => (latest.current.actor as (a: string) => boolean)(a)
            : actor,
      },
      (items) => {
        const resolver =
          latest.current.celebrations ?? latestTheme.current?.celebrations ?? defaultCelebrations;
        const next = items
          .map(({ view }) => ({ view, celebration: resolver.resolve(view) }))
          .filter((i) => !i.celebration.quiet);
        if (next.length) setQueue((q) => [...q, ...next]);
      },
    );
  }, [reactive, actorKey]);

  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), []);
  const clear = useCallback(() => setQueue([]), []);
  return { queue, dismiss, clear };
}
