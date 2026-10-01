import {
  type CountFormat,
  type IconAsset,
  displayIcon,
  progressCount,
} from '@walangstudio/badgetrip-assets';
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
import { IconsKey, defaultIcons, useTheme } from './plugin.js';

// Theme hooks; the fallbacks are the look without a theme.
const LOCKED = {
  filter: 'var(--badgetrip-locked-filter, grayscale(1))',
  opacity: 'var(--badgetrip-locked-opacity, 0.45)',
};
const BAR = { width: '100%', accentColor: 'var(--badgetrip-accent, auto)' };

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
  const own = inject(IconsKey, null);
  const theme = useTheme();
  const reduce = usePrefersReducedMotion();
  const asset = computed(() =>
    (own ?? theme.value?.icons ?? defaultIcons).resolve(toValue(achievement)),
  );
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
    /** Show a "3/5" count under locked multi-step achievements. */
    showCount: { type: Boolean, default: true },
    /** Wording of the count. */
    formatCount: Function as PropType<CountFormat>,
  },
  setup(props) {
    const icon = useAchievementIcon(() => props.achievement);
    return () => {
      const a = props.achievement;
      const count = props.showCount ? progressCount(a, props.formatCount) : null;
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
            style: a.unlocked ? undefined : LOCKED,
          }),
          h('figcaption', { style: { textAlign: 'center', flex: 1 } }, [
            h('strong', a.name),
            a.description ? h('div', a.description) : null,
          ]),
          props.showProgress && !a.unlocked && !a.concealed
            ? h('progress', {
                value: a.progress.percent,
                max: 100,
                style: BAR,
                'aria-label': `${a.name}: ${a.progress.percent}%`,
              })
            : null,
          count === null
            ? null
            : h('small', { 'data-count': '', style: { fontSize: '12px', opacity: 0.7 } }, count),
        ],
      );
    };
  },
});
