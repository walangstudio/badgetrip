import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  type Signal,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { type IconAsset, displayIcon } from '@badgetrip/assets';
import type { AchievementView } from '@badgetrip/core';
import { BADGETRIP_ICONS } from './service.js';

const MOTION = '(prefers-reduced-motion: reduce)';

function prefersReducedMotion(): Signal<boolean> {
  const win = inject(DOCUMENT).defaultView;
  if (!isPlatformBrowser(inject(PLATFORM_ID)) || !win?.matchMedia) return signal(false);
  const mq = win.matchMedia(MOTION);
  const reduce = signal(mq.matches);
  const onChange = () => reduce.set(mq.matches);
  mq.addEventListener('change', onChange);
  inject(DestroyRef).onDestroy(() => mq.removeEventListener('change', onChange));
  return reduce.asReadonly();
}

/**
 * The icon to show for an achievement. Animated icons play only once unlocked and
 * fall back to their still frame under `prefers-reduced-motion`. Call in an injection context.
 */
export function achievementIcon(achievement: Signal<AchievementView>): Signal<IconAsset> {
  const icons = inject(BADGETRIP_ICONS);
  const reduce = prefersReducedMotion();
  const asset = computed(() => icons.resolve(achievement()));
  return computed(() =>
    displayIcon(asset(), {
      unlocked: achievement().unlocked,
      reducedMotion: reduce(),
    }),
  );
}

/**
 * A minimal, unstyled-by-class badge: icon, name, description, and progress while
 * locked. Locked icons render greyscale. Build your own with `achievementIcon`.
 */
@Component({
  selector: 'badgetrip-achievement-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host { display: block; height: 100%; }'],
  template: `
    <figure
      [attr.data-unlocked]="achievement().unlocked"
      [attr.data-concealed]="achievement().concealed"
      style="margin: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%"
    >
      <img
        [src]="icon().src"
        alt=""
        [width]="size()"
        [height]="size()"
        [style.filter]="achievement().unlocked ? null : 'grayscale(1)'"
        [style.opacity]="achievement().unlocked ? null : 0.45"
      />
      <figcaption style="text-align: center; flex: 1">
        <strong>{{ achievement().name }}</strong>
        @if (achievement().description) {
          <div>{{ achievement().description }}</div>
        }
      </figcaption>
      @if (showProgress() && !achievement().unlocked && !achievement().concealed) {
        <progress
          [value]="achievement().progress.percent"
          max="100"
          style="width: 100%"
          [attr.aria-label]="achievement().name + ': ' + achievement().progress.percent + '%'"
        ></progress>
      }
    </figure>
  `,
})
export class AchievementBadgeComponent {
  readonly achievement = input.required<AchievementView>();
  /** Icon edge in px. */
  readonly size = input(48);
  /** Show a progress bar while locked. */
  readonly showProgress = input(true);
  protected readonly icon = achievementIcon(this.achievement);
}
