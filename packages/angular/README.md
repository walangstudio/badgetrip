# @walangstudio/badgetrip-angular

Angular bindings for badgetrip: an environment provider, a signal-based service, and a standalone badge component. No NgModule, and zone.js is optional.

[Angular guide](https://github.com/walangstudio/badgetrip/blob/main/docs/guide/angular.md) · [Achievements](https://github.com/walangstudio/badgetrip/blob/main/docs/ACHIEVEMENTS.md) · [badgetrip](https://github.com/walangstudio/badgetrip#readme)

## Install

```sh
npm install @walangstudio/badgetrip-angular @walangstudio/badgetrip-core
```

Peer dependency: Angular 17.1 or later.

## Usage

```ts
import { provideBadgetrip } from '@walangstudio/badgetrip-angular';

bootstrapApplication(App, {
  providers: [provideZonelessChangeDetection(), provideBadgetrip(engine, { icons })],
});
```

```ts
import { Component, inject, input } from '@angular/core';
import { AchievementBadgeComponent, BadgetripService } from '@walangstudio/badgetrip-angular';

@Component({
  selector: 'app-profile',
  imports: [AchievementBadgeComponent],
  template: `
    <p>Honor: {{ score() }}</p>
    @for (a of catalog(); track a.code) {
      <badgetrip-achievement-badge [achievement]="a" [size]="40" />
    }
    <button (click)="win()">Win</button>
  `,
})
export class Profile {
  readonly actor = input.required<string>();
  private readonly badgetrip = inject(BadgetripService);
  readonly score = this.badgetrip.score(this.actor, 'honor');
  readonly catalog = this.badgetrip.catalog(this.actor);

  win() {
    this.badgetrip.engine.emit({ id: crypto.randomUUID(), actor: this.actor(), type: 'win', ts: Date.now(), payload: {} });
  }
}
```

## API

- Queries: `score`, `achievements`, `catalog`, `progress`, `leaderboard`, `streak`, `tier`, `escalator`. Arguments are strings or signals.
- Each returns a `Signal<T>` that re-runs after any `emit`/`replay`/`seed`/`refresh` through `badgetrip.engine`, and when a signal argument changes. Superseded results are dropped.
- A rejected query sets `query.error()` and goes to Angular's `ErrorHandler`. The last good value stays.
- Create queries in an injection context (field initializers) or pass `{ injector }`. They are torn down with that injector.
- Only calls through `badgetrip.engine` notify. Calls on the raw engine do not.
- `provideBadgetrip(engine, { theme })` applies a theme (colors in the browser only); `BadgetripService.theme` reads it and `setTheme()` switches badges, the page and the notifier. See the [themes guide](https://github.com/walangstudio/badgetrip/blob/main/docs/guide/themes.md).
- `provideBadgetrip(engine, { notifier })` celebrates unlocks on top of the page (browser only; `BADGETRIP_NOTIFIER` exposes it for `update({ sound })`). `unlocks()` returns a signal queue for a custom UI. See the [celebrations guide](https://github.com/walangstudio/badgetrip/blob/main/docs/guide/celebrations.md).
- `<badgetrip-achievement-badge>` inputs: `achievement`, `size`, `showProgress`, `showCount` ("3/5", default true) and `formatCount`.
- `achievementIcon(signal)` returns the icon a custom badge should show (resolver + `displayIcon` + `prefers-reduced-motion`, SSR-safe).

## Development

Build: `pnpm build` (ng-packagr, partial Ivy, output in `dist/`). Publish from `dist/` (`publishConfig.directory`). Test: `pnpm test` (vitest + Analog, zoneless TestBed).

## License

MIT
