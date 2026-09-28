import { type IconAsset, displayIcon } from '@walangstudio/badgetrip-assets';
import type { AchievementView } from '@walangstudio/badgetrip-core';
import {
  type ComputedRef,
  type MaybeRefOrGetter,
  type PropType,
  computed,
  defineComponent,
  h,
  inject,
  onScopeDispose,
  shallowRef,
  toValue,
} from 'vue';
import { IconsKey, defaultIcons } from './plugin.js';

const MOTION = '(prefers-reduced-motion: reduce)';

function usePrefersReducedMotion() {
  const reduce = shallowRef(false);
  if (typeof window === 'undefined' || !window.matchMedia) return reduce;
  const mq = window.matchMedia(MOTION);
  reduce.value = mq.matches;
  const onChange = () => {
    reduce.value = mq.matches;
  };
  mq.addEventListener('change', onChange);
  onScopeDispose(() => mq.removeEventListener('change', onChange));
  return reduce;
}

/**
 * The icon to show for an achievement. Animated icons play only once unlocked and
 * fall back to their still frame under `prefers-reduced-motion`.
 */
export function useAchievementIcon(
  achievement: MaybeRefOrGetter<AchievementView>,
): ComputedRef<IconAsset> {
  const icons = inject(IconsKey, defaultIcons);
  const reduce = usePrefersReducedMotion();
  const asset = computed(() => icons.resolve(toValue(achievement)));
  return computed(() =>
    displayIcon(asset.value, {
      unlocked: toValue(achievement).unlocked,
      reducedMotion: reduce.value,
    }),
  );
}

/**
 * A minimal, unstyled-by-class badge: icon, name, description, and progress while
 * locked. Locked icons render greyscale. Build your own with `useAchievementIcon`.
 * `class` falls through to the `<figure>`.
 */
export const AchievementBadge = defineComponent({
  name: 'AchievementBadge',
  props: {
    achievement: { type: Object as PropType<AchievementView>, required: true },
    /** Icon edge in px. */
    size: { type: Number, default: 48 },
    /** Show a progress bar while locked. */
    showProgress: { type: Boolean, default: true },
  },
  setup(props) {
    const icon = useAchievementIcon(() => props.achievement);
    return () => {
      const a = props.achievement;
      return h(
        'figure',
        {
          'data-unlocked': String(a.unlocked),
          'data-concealed': String(a.concealed),
          style: {
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            height: '100%',
          },
        },
        [
          h('img', {
            src: icon.value.src,
            alt: '',
            width: props.size,
            height: props.size,
            style: a.unlocked ? undefined : { filter: 'grayscale(1)', opacity: 0.45 },
          }),
          h('figcaption', { style: { textAlign: 'center', flex: 1 } }, [
            h('strong', a.name),
            a.description ? h('div', a.description) : null,
          ]),
          props.showProgress && !a.unlocked && !a.concealed
            ? h('progress', {
                value: a.progress.percent,
                max: 100,
                style: { width: '100%' },
                'aria-label': `${a.name}: ${a.progress.percent}%`,
              })
            : null,
        ],
      );
    };
  },
});
