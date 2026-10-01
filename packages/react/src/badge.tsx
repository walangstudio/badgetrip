import {
  type CountFormat,
  type IconAsset,
  type IconResolver,
  createIconResolver,
  displayIcon,
  progressCount,
} from '@walangstudio/badgetrip-assets';
import type { AchievementView } from '@walangstudio/badgetrip-core';
import { type ReactNode, createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import { useTheme } from './context.js';

const defaultResolver = createIconResolver();
const IconContext = createContext<IconResolver | null>(null);

/** The icon resolver from the nearest `IconProvider`, then the provider's theme, then the built-in pack. */
export function useIconResolver(): IconResolver {
  const own = useContext(IconContext);
  const theme = useTheme();
  return own ?? theme?.icons ?? defaultResolver;
}

/** Supply a custom icon resolver (see `createIconResolver` in `@walangstudio/badgetrip-assets`). */
export function IconProvider({ icons, children }: { icons: IconResolver; children: ReactNode }) {
  return <IconContext.Provider value={icons}>{children}</IconContext.Provider>;
}

// Theme hooks; the fallbacks are the look without a theme.
const LOCKED = {
  filter: 'var(--badgetrip-locked-filter, grayscale(1))',
  opacity: 'var(--badgetrip-locked-opacity, 0.45)',
};
const BAR = { width: '100%', accentColor: 'var(--badgetrip-accent, auto)' };

const MOTION = '(prefers-reduced-motion: reduce)';
const subscribeMotion = (cb: () => void) => {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(MOTION);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(MOTION).matches;

/**
 * The icon to show for an achievement. Animated icons play only once unlocked and
 * fall back to their still frame under `prefers-reduced-motion`.
 */
export function useAchievementIcon(achievement: AchievementView): IconAsset {
  const icons = useIconResolver();
  const reduce = useSyncExternalStore(subscribeMotion, reducedMotion, () => false);
  const asset = useMemo(() => icons.resolve(achievement), [icons, achievement]);
  return displayIcon(asset, {
    unlocked: achievement.unlocked,
    reducedMotion: reduce,
  });
}

export type AchievementBadgeProps = {
  achievement: AchievementView;
  /** Icon edge in px. */
  size?: number;
  /** Show a progress bar while locked. Default true. */
  showProgress?: boolean;
  /** Show a "3/5" count under locked multi-step achievements. Default true. */
  showCount?: boolean;
  /** Wording of the count, e.g. `(p) => \`${p.current} of ${p.target}\``. */
  formatCount?: CountFormat;
  className?: string;
};

/**
 * A minimal, unstyled-by-class badge: icon, name, description, and progress while
 * locked. Locked icons render greyscale. Build your own with `useAchievementIcon`.
 */
export function AchievementBadge({
  achievement: a,
  size = 48,
  showProgress = true,
  showCount = true,
  formatCount,
  className,
}: AchievementBadgeProps) {
  const icon = useAchievementIcon(a);
  const count = showCount ? progressCount(a, formatCount) : null;
  return (
    <figure
      className={className}
      data-unlocked={a.unlocked}
      data-concealed={a.concealed}
      style={{
        margin: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        height: '100%',
      }}
    >
      <img
        src={icon.src}
        alt=""
        width={size}
        height={size}
        style={a.unlocked ? undefined : LOCKED}
      />
      <figcaption style={{ textAlign: 'center', flex: 1 }}>
        <strong>{a.name}</strong>
        {a.description ? <div>{a.description}</div> : null}
      </figcaption>
      {showProgress && !a.unlocked && !a.concealed ? (
        <progress
          value={a.progress.percent}
          max={100}
          style={BAR}
          aria-label={`${a.name}: ${a.progress.percent}%`}
        />
      ) : null}
      {count === null ? null : (
        <small data-count style={{ fontSize: 12, opacity: 0.7 }}>
          {count}
        </small>
      )}
    </figure>
  );
}
