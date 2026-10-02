import { type IconName, svgs } from './icons.js';

export { svgs, type IconName };
export { safeSrc } from './safe.js';
export { builtinSounds, type BuiltinSound, type SoundAsset, type Tone } from './sounds.js';
export {
  createCelebrationResolver,
  type Animation,
  type AnimationSpec,
  type Celebration,
  type CelebrationResolver,
  type CelebrationResolverOptions,
  type CelebrationSpec,
  type CelebrationSubject,
  type ConfettiSpec,
  type Layout,
  type Motion,
  type Position,
  type ProgressCelebration,
  type ProgressSpec,
} from './celebrations.js';

export {
  createIconResolver,
  displayIcon,
  svgToDataUrl,
  tierColors,
  type AssetInput,
  type IconAsset,
  type IconResolver,
  type IconResolverOptions,
  type IconSubject,
} from './resolver.js';
export { gradient, type GradientDirection, type GradientSpec } from './gradient.js';
export {
  defineTheme,
  themeCss,
  themeVars,
  themes,
  type BuiltinThemeName,
  type Theme,
  type ThemeInput,
  type ThemeStyle,
} from './themes.js';
export {
  crossesMilestone,
  defaultCountFormat,
  progressCount,
  type CountFormat,
  type CountSubject,
} from './progress.js';
