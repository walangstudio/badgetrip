import {
  type IconAsset,
  type IconResolver,
  createIconResolver,
  displayIcon,
} from '@walangstudio/badgetrip-assets';
import type { AchievementView } from '@walangstudio/badgetrip-core';
import { type ReactNode, createContext, useContext, useMemo, useSyncExternalStore } from 'react';

const defaultResolver = createIconResolver();
const IconContext = createContext<IconResolver>(defaultResolver);

/** The icon resolver from the nearest `IconProvider`, or the built-in pack. */
export function useIconResolver(): IconResolver {
  return useContext(IconContext);
}

/** Supply a custom icon resolver (see `createIconResolver` in `@walangstudio/badgetrip-assets`). */
export function IconProvider({ icons, children }: { icons: IconResolver; children: ReactNode }) {
  return <IconContext.Provider value={icons}>{children}</IconContext.Provider>;
}

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
  const icons = useContext(IconContext);
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
  className,
}: AchievementBadgeProps) {
  const icon = useAchievementIcon(a);
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
        style={a.unlocked ? undefined : { filter: 'grayscale(1)', opacity: 0.45 }}
      />
      <figcaption style={{ textAlign: 'center', flex: 1 }}>
        <strong>{a.name}</strong>
        {a.description ? <div>{a.description}</div> : null}
      </figcaption>
      {showProgress && !a.unlocked && !a.concealed ? (
        <progress
          value={a.progress.percent}
          max={100}
          style={{ width: '100%' }}
          aria-label={`${a.name}: ${a.progress.percent}%`}
        />
      ) : null}
    </figure>
  );
}
