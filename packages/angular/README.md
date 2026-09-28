# @badgetrip/angular

Angular bindings for badgetrip: an environment provider, a signal-based service, and a standalone badge component. No NgModule, no zone.js requirement. Angular >= 17.1.

[Angular guide](../../docs/guide/angular.md) · [Achievements](../../docs/ACHIEVEMENTS.md) · [badgetrip](../../README.md)

## Install

```sh
npm install @badgetrip/angular @badgetrip/core
```

Peer dependency: Angular 17.1 or later.

## Usage

```ts
import { provideBadgetrip } from '@badgetrip/angular';

bootstrapApplication(App, {
  providers: [provideZonelessChangeDetection(), provideBadgetrip(engine, { icons })],
});
```

```ts
import { Component, inject, input } from '@angular/core';
import { AchievementBadgeComponent, BadgetripService } from '@badgetrip/angular';

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
  private readonly gk = inject(BadgetripService);
  readonly score = this.gk.score(this.actor, 'honor');
  readonly catalog = this.gk.catalog(this.actor);

  win() {
    this.gk.engine.emit({ id: crypto.randomUUID(), actor: this.actor(), type: 'win', ts: Date.now(), payload: {} });
  }
}
```

## API

- Queries: `score`, `achievements`, `catalog`, `progress`, `leaderboard`, `streak`, `tier`, `escalator`. Arguments are strings or signals.
- Each returns a `Signal<T>` that re-runs after any `emit`/`replay`/`seed`/`refresh` through `gk.engine`, and when a signal argument changes. Superseded results are dropped.
- A rejected query sets `query.error()` and goes to Angular's `ErrorHandler`. The last good value stays.
- Create queries in an injection context (field initializers) or pass `{ injector }`. They are torn down with that injector.
- Only calls through `gk.engine` notify. Calls on the raw engine do not.
- `achievementIcon(signal)` returns the icon a custom badge should show (resolver + `displayIcon` + `prefers-reduced-motion`, SSR-safe).

## Development

Build: `pnpm build` (ng-packagr, partial Ivy, output in `dist/`). Publish from `dist/` (`publishConfig.directory`). Test: `pnpm test` (vitest + Analog, zoneless TestBed).

## License

MIT
