# Angular

```sh
npm install @walangstudio/badgetrip-core @walangstudio/badgetrip-angular
```

Needs Angular 17.1 or newer (it uses signal inputs). This uses the `engine` from [Getting started](getting-started.md).

## Provide the engine

```ts
// app.config.ts
import type { ApplicationConfig } from '@angular/core';
import { provideBadgetrip } from '@walangstudio/badgetrip-angular';
import { engine } from './badges';

export const appConfig: ApplicationConfig = {
  providers: [provideBadgetrip(engine)],
};
```

## Show the badges and record something

```ts
// trophies.component.ts
import { Component, inject, input } from '@angular/core';
import { AchievementBadgeComponent, BadgetripService } from '@walangstudio/badgetrip-angular';

@Component({
  selector: 'app-trophies',
  imports: [AchievementBadgeComponent],
  template: `
    <button (click)="log()">Done for today</button>
    @if (badges.error()) {
      <p>Couldn't load achievements.</p>
    }
    <div class="grid">
      @for (b of badges(); track b.code) {
        <badgetrip-achievement-badge [achievement]="b" />
      }
    </div>
  `,
  styles: `.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 1rem; }`,
})
export class TrophiesComponent {
  private readonly badgetrip = inject(BadgetripService);
  readonly userId = input.required<string>();
  readonly badges = this.badgetrip.catalog(this.userId);

  async log() {
    const { unlocked } = await this.badgetrip.engine.emit({
      id: crypto.randomUUID(),
      actor: this.userId(),
      type: 'habit.done',
      ts: Date.now(),
      payload: {},
    });
    if (unlocked.length) console.log('Unlocked', unlocked);
  }
}
```

Each query on `BadgetripService` returns a signal. Pass a plain string or a signal like `this.userId`, and the query re-runs when the signal changes and after every `emit` through `badgetrip.engine`. Failures show up in `.error()` and in Angular's `ErrorHandler`.

Create queries in a field initializer or constructor, where Angular's injection context exists. Anywhere else, pass one in: `this.badgetrip.catalog(id, { injector })`.

## Other queries

`score`, `streak`, `leaderboard`, `tier`, `escalator`, `progress` and `achievements` all work like `catalog`.

## Custom icons

```ts
provideBadgetrip(engine, { icons: createIconResolver({ icons: { medal: { src: '/art/medal.png' } } }) });
```

For a badge of your own design, `achievementIcon(signal)` returns a signal of the right image.
