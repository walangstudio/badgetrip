import { type CountFormat, type IconAsset, displayIcon, progressCount } from '@badgetrip/assets';
import type { AchievementView } from '@badgetrip/core';
import { useIconResolver } from '@badgetrip/react';
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Image, type StyleProp, Text, View, type ViewStyle } from 'react-native';
import { SvgUri, SvgXml } from 'react-native-svg';

/** The OS "reduce motion" setting. `true` until the async first read resolves, so motion never flashes. */
function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(
      (v) => alive && setReduce(v),
      () => alive && setReduce(false),
    );
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce ?? true;
}

/**
 * The icon to show for an achievement. Animated icons play only once unlocked and
 * fall back to their still frame while the OS "reduce motion" setting is on.
 */
export function useAchievementIcon(achievement: AchievementView): IconAsset {
  const icons = useIconResolver();
  const reducedMotion = useReducedMotion();
  const asset = useMemo(() => icons.resolve(achievement), [icons, achievement]);
  return displayIcon(asset, { unlocked: achievement.unlocked, reducedMotion });
}

const SVG_DATA = /^data:image\/svg\+xml((?:;[^,]*)?),/i;

/** Decode base64 to UTF-8 text (atob alone yields Latin-1 bytes). */
function utf8FromBase64(b64: string): string {
  const bytes = atob(b64);
  let pct = '';
  for (let i = 0; i < bytes.length; i++)
    pct += `%${bytes.charCodeAt(i).toString(16).padStart(2, '0')}`;
  return decodeURIComponent(pct);
}

/** Markup of an SVG data URL (any params), or undefined for anything else. Never throws. */
export function svgMarkup(src: string): string | undefined {
  const m = SVG_DATA.exec(src);
  if (!m) return undefined;
  const body = src.slice(m[0].length);
  try {
    return /;base64/i.test(m[1] ?? '') ? utf8FromBase64(body) : decodeURIComponent(body);
  } catch {
    // A raw % in hand-written SVG is not valid percent-encoding; use the body as is.
    return /;base64/i.test(m[1] ?? '') ? undefined : body;
  }
}

const isRemoteSvg = (src: string) => /^https?:\/\/[^?#]+\.svg(?:[?#]|$)/i.test(src);

const LOCKED_COLOR = '#8a8f98';
const LOCKED_OPACITY = 0.45;

export type AchievementBadgeProps = {
  achievement: AchievementView;
  /** Icon edge in dp. */
  size?: number;
  /** Show a progress bar while locked. Default true. */
  showProgress?: boolean;
  /** Show a "3/5" count under locked multi-step achievements. Default true. */
  showCount?: boolean;
  /** Wording of the count, e.g. `(p) => \`${p.current} of ${p.target}\``. */
  formatCount?: CountFormat;
  style?: StyleProp<ViewStyle>;
};

/**
 * Icon, name, description, and progress while locked. Built-in SVG icons render via
 * react-native-svg; image assets via `Image`. Locked icons render grey (RN has no CSS
 * filter): tintable SVGs repaint in grey, images become a grey silhouette. Build your
 * own with `useAchievementIcon`.
 */
export function AchievementBadge({
  achievement: a,
  size = 48,
  showProgress = true,
  showCount = true,
  formatCount,
  style,
}: AchievementBadgeProps) {
  const icon = useAchievementIcon(a);
  const count = showCount ? progressCount(a, formatCount) : null;
  const locked = !a.unlocked;
  const tintable = icon.src === icon.still ? icon.stillSvg : icon.svg;
  const xml = locked && tintable ? tintable : svgMarkup(icon.src);
  const percent = a.progress.percent;
  return (
    <View style={[{ alignItems: 'center', gap: 4 }, style]}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={locked ? { opacity: LOCKED_OPACITY } : undefined}
      >
        {xml !== undefined ? (
          <SvgXml xml={xml} width={size} height={size} color={locked ? LOCKED_COLOR : undefined} />
        ) : isRemoteSvg(icon.src) ? (
          <SvgUri uri={icon.src} width={size} height={size} />
        ) : (
          <Image
            source={{ uri: icon.src }}
            style={{
              width: size,
              height: size,
              tintColor: locked ? LOCKED_COLOR : undefined,
            }}
          />
        )}
      </View>
      <Text style={{ fontWeight: 'bold', textAlign: 'center' }}>{a.name}</Text>
      {a.description ? <Text style={{ textAlign: 'center' }}>{a.description}</Text> : null}
      {showProgress && locked && !a.concealed ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`${a.name}: ${percent}%`}
          accessibilityValue={{ min: 0, max: 100, now: percent }}
          style={{
            alignSelf: 'stretch',
            height: 6,
            borderRadius: 3,
            backgroundColor: '#e3e5e8',
          }}
        >
          <View
            style={{
              width: `${percent}%`,
              height: '100%',
              borderRadius: 3,
              backgroundColor: '#3d4451',
            }}
          />
        </View>
      ) : null}
      {count === null ? null : <Text style={{ fontSize: 12, opacity: 0.7 }}>{count}</Text>}
    </View>
  );
}
