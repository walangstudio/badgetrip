import {
  type Celebration,
  type CelebrationResolver,
  type IconResolver,
  createCelebrationResolver,
} from '@badgetrip/assets';
import { type AchievementView, watchUnlocks } from '@badgetrip/core';
import {
  type Notifier,
  type NotifierLabels,
  type NotifierOptions,
  createNotifier,
} from '@badgetrip/html';
import {
  type MaybeRefOrGetter,
  type PropType,
  type ShallowRef,
  defineComponent,
  onBeforeUnmount,
  onMounted,
  onScopeDispose,
  shallowRef,
  toValue,
  watch,
} from 'vue';
import { useReactiveEngine } from './plugin.js';

/**
 * Celebrates unlocks on top of the page (toasts, modal, fullscreen, confetti, sound).
 * Mount it once in the root component. `sound`, `volume` and `muted` update in place;
 * other prop changes re-create the overlay.
 */
export const UnlockNotifier = defineComponent({
  name: 'UnlockNotifier',
  props: {
    celebrations: Object as PropType<CelebrationResolver>,
    icons: Object as PropType<IconResolver>,
    actor: [String, Function] as PropType<NotifierOptions['actor']>,
    sound: { type: Boolean, default: undefined },
    volume: Number,
    muted: { type: Boolean, default: undefined },
    maxVisible: Number,
    maxQueue: Number,
    root: Object as PropType<Element>,
    zIndex: Number,
    labels: Object as PropType<NotifierLabels>,
    onError: Function as PropType<(err: unknown) => void>,
  },
  setup(props) {
    const reactive = useReactiveEngine();
    let notifier: Notifier | undefined;
    // Functions and the labels object are read on use, so an inline `:actor`,
    // `:on-error` or `:labels` doesn't rebuild the overlay on every parent render.
    const create = () => {
      notifier?.dispose();
      const opts = Object.fromEntries(
        Object.entries(props).filter(([, v]) => v !== undefined),
      ) as NotifierOptions;
      if (typeof props.actor === 'function') {
        opts.actor = (a: string) => (props.actor as (a: string) => boolean)(a);
      }
      if (props.onError) opts.onError = (err: unknown) => props.onError?.(err);
      if (props.labels) {
        opts.labels = {
          ...props.labels,
          ...(props.labels.more ? { more: (n: number) => props.labels?.more?.(n) ?? '' } : {}),
          ...(props.labels.count
            ? {
                count: (p: { current: number; target: number }) =>
                  props.labels?.count?.(p) ?? `${p.current}/${p.target}`,
              }
            : {}),
        };
      }
      notifier = createNotifier(reactive, opts);
    };
    onMounted(create);
    watch(
      () => [
        props.celebrations,
        props.icons,
        typeof props.actor === 'function' ? 'fn' : props.actor,
        props.maxVisible,
        props.maxQueue,
        props.root,
        props.zIndex,
        props.labels?.close,
        !!props.onError,
        !!props.labels?.more,
        !!props.labels?.count,
      ],
      (next, prev) => {
        if (notifier && next.some((v, i) => v !== prev[i])) create();
      },
    );
    watch(
      () => [props.sound, props.volume, props.muted],
      () => notifier?.update({ sound: props.sound, volume: props.volume, muted: props.muted }),
    );
    onBeforeUnmount(() => {
      notifier?.dispose();
      notifier = undefined;
    });
    return () => null;
  },
});

export type UnlockItem = { view: AchievementView; celebration: Celebration };

export type UseUnlocksOptions = {
  /** Only this actor. A ref or getter re-filters, and clears the queue, when it changes. */
  actor?: MaybeRefOrGetter<string | undefined>;
  celebrations?: CelebrationResolver;
};

const defaultCelebrations = createCelebrationResolver();

/**
 * New unlocks as a queue, for drawing your own celebration UI. Quiet achievements are
 * left out. `dismiss()` drops the oldest, `clear()` drops all. Stops with the scope.
 */
export function useUnlocks(opts: UseUnlocksOptions = {}): {
  queue: Readonly<ShallowRef<UnlockItem[]>>;
  dismiss: () => void;
  clear: () => void;
} {
  const reactive = useReactiveEngine();
  const queue = shallowRef<UnlockItem[]>([]);
  const resolver = opts.celebrations ?? defaultCelebrations;
  let stop = () => {};
  watch(
    () => toValue(opts.actor),
    (actor) => {
      stop();
      queue.value = [];
      stop = watchUnlocks(reactive, { actor }, (items) => {
        const next = items
          .map(({ view }) => ({ view, celebration: resolver.resolve(view) }))
          .filter((i) => !i.celebration.quiet);
        if (next.length) queue.value = [...queue.value, ...next];
      });
    },
    { immediate: true },
  );
  onScopeDispose(() => stop());
  return {
    queue,
    dismiss: () => {
      queue.value = queue.value.slice(1);
    },
    clear: () => {
      queue.value = [];
    },
  };
}
