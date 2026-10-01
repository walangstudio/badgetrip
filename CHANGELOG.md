# Changelog

All notable changes to badgetrip are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/), and versions follow [SemVer](https://semver.org/).

## [0.1.0] - 2026-10-01

### Added

- **Themes.** `defineTheme` in `@walangstudio/badgetrip-assets` puts colors, icons and celebrations in one validated object, with `extends` to start from another theme. Five built-ins ship in `themes`: `classic` (the look without a theme), `dark`, `arcade`, `minimal` and `aurora`. Theme values can't escape their CSS declaration, and every `url()` is vetted like an image.
  - React: `theme` on `BadgetripProvider` and `useTheme()`. Badges, `<UnlockNotifier>` and `useUnlocks` follow it, and a new `theme` prop switches it live.
  - Vue: `theme` on `createBadgetrip` and `provideBadgetrip`; `useTheme()` returns a ref, and assigning it switches the theme.
  - Angular: `theme` on `provideBadgetrip`, `BadgetripService.theme` and `setTheme()`, and the `BADGETRIP_THEME` token. Colors apply in the browser only.
  - HTML: `applyTheme(theme, target?)`, a `theme` option on `createNotifier`, `renderBadge`, `renderCatalog` and `defineBadgetripElements`, which now returns `{ setTheme }`.
  - React Native: `useTheme()`; a theme brings its icons and celebrations.
  - A provider nested in another uses the outer theme unless it has its own, and page colors come from the outermost provider. A notifier with its own theme ignores the page's colors.
- `themeCss(theme)` writes a theme's colors as one CSS rule for server-rendered pages.
- **Gradients.** Theme backgrounds (`bg`, `fullscreenBg`, `backdrop`, `iconBg`) and icons (`icons.color`, `icons.tierColors`) take a gradient as plain data: 2-8 colors with optional stops, linear with an `angle` or `to` direction, or radial with a `shape` and `position`. A gradient icon is one sweep across the whole drawing. `gradient(spec)` returns the CSS. A fifth built-in theme, `aurora`, is the sample.
- `notifier.update()` also takes `theme`, `icons` and `celebrations`. Popups already on screen or waiting keep their look, and progress popups start or stop to match.
- The docs site and playground at [walangstudio.github.io/badgetrip](https://walangstudio.github.io/badgetrip/), deployed from `main`. The playground has a theme picker and takes a `theme` block in its config.
- A themes guide, and docs for replacing a built-in sound and giving popups your own icons.
- Three sample GIF badges (a star, a trophy and a flame, MIT) with still frames, used in the playground.

### Changed

- Locked badges and progress bars read `--badgetrip-locked-filter`, `--badgetrip-locked-opacity` and `--badgetrip-accent`, falling back to the old values, so nothing looks different without a theme.

## [0.0.1] - 2026-09-29

First release. Packages are published under the `@walangstudio` npm org.

### Added

- **`@walangstudio/badgetrip-core`**: the event-sourced engine, with zero runtime dependencies.
  - `createEngine` with `emit`, `replay`, `seed` and `refresh`, plus the queries `score`, `tier`, `leaderboard`, `achievements`, `streak`, `escalator`, `progress` and `catalog`.
  - Points from fixed or event-relative deltas. Streaks per actor or per actor and key. Threshold tiers. All-time and rolling leaderboards ranked by score or by summed streaks. Capped escalators with decay.
  - Achievements as keyed config through `defineAchievements`, with `rules.*` builders: `count` (with `where` filters and a time-of-day window), `score`, `streak` (current or best, any key), `unique`, `groupCount`, `firstOfDay`, `rank`, `all` and `any`.
  - Tiered achievements that expand one entry into several unlocks, with `{tier}` and `{n}` templating and per-tier overrides. Hidden achievements with a spoiler-free `lockedDescription`. Points, icons and categories per achievement.
  - Idempotent `emit` by event id, enforced atomically by the event store. Emits are queued per actor, so concurrent calls see consistent state.
  - `createEngine` validates every definition up front and rejects unknown references, bad thresholds and missing store capabilities.
  - Deterministic: the engine reads the injected `Clock` only for queries, never during `emit`, and `replay` rebuilds the same state from the same log.
  - Store-agnostic persistence through four interfaces (`EventStore`, `ScoreStore`, `AchievementStore`, `StreakStore`), with in-memory reference stores.
  - `observe(engine)`, the shared change stream every UI adapter builds on.
- **`@walangstudio/badgetrip-assets`**: 18 SVG icons, one of them animated, and `createIconResolver` with per-achievement, per-series and per-category overrides, tier tinting, still frames for animated icons, and `missing()` for catching typos.
- **`@walangstudio/badgetrip-react`**: `BadgetripProvider`, hooks for every query, `AchievementBadge`, `IconProvider` and `useAchievementIcon`.
- **`@walangstudio/badgetrip-react-native`**: the React hooks plus a native `AchievementBadge` on react-native-svg, following the OS reduce-motion setting.
- **`@walangstudio/badgetrip-vue`**: a plugin, composables returning `{ data, error }`, and `AchievementBadge`.
- **`@walangstudio/badgetrip-angular`**: `provideBadgetrip`, a signal-based `BadgetripService` and a standalone badge component. Zoneless-ready, Angular 17.1+.
- **`@walangstudio/badgetrip-html`**: escaped `renderBadge` / `renderCatalog` strings for servers and htmx, and `<badgetrip-catalog>` / `<badgetrip-badge>` custom elements.
- **`@walangstudio/badgetrip-ipc`**: serve an engine in one process and use it from another over MessagePort or Electron IPC, behind a method allowlist, argument checks, a size cap and an `authorize` hook.
- **`@walangstudio/badgetrip-testing`**: `makeTestEngine`, a steppable clock, event and id helpers, and `runStoreContract`, the conformance suite for custom stores.
- **Celebrations and progress**:
  - **Unlock celebrations.** `createNotifier` in `@walangstudio/badgetrip-html` shows each unlock on top of the page: toasts in eight positions, a modal, or fullscreen with confetti, with optional sound (off by default, synthesized, no audio files). It is accessible (live region, dialog focus handling, reduced motion) and styled in a shadow root. `<UnlockNotifier>` in React and Vue, and `provideBadgetrip(engine, { notifier })` in Angular, mount it.
  - `createCelebrationResolver` and `builtinSounds` in `@walangstudio/badgetrip-assets`: presets (`toast`, `modal`, `epic`, `quiet`, `secret`), layered by rarity, category, preset, series and code, with the whole config validated up front.
  - A `celebration` preset key on achievements and tiers.
  - `observe(engine).onUnlock` and `watchUnlocks` in `@walangstudio/badgetrip-core`. They report new unlocks from `emit` and `refresh`, never from `replay` or `seed`.
  - `useUnlocks` for React, React Native and Vue, and `BadgetripService.unlocks()` for Angular, to build your own celebration UI.
  - Secret mode: `splitConcealed`, `renderCatalog(views, { secret: true })` and `<badgetrip-catalog secret>` hide hidden achievements and count the ones left.
  - `@walangstudio/badgetrip-ipc` forwards unlocks to clients. The `unlocks` option on `serveEngine` filters or disables them. It defaults to off when `authorize` is set, so a scoped server never broadcasts other users' unlocks.
  - `safeSrc` in `@walangstudio/badgetrip-assets` vets image and audio URLs.
  - **Progress you can see.** Every badge shows a "3/5" count under locked multi-step achievements (`showCount`, `formatCount`). Optional progress popups (`progress` in a celebration: `at` percentages or `every` N steps, with their own position, duration, sound and title) report progress before the unlock. `watchProgress` in core and `progressCount`/`crossesMilestone` in assets for custom UIs. Unlock toasts go ahead of waiting progress popups, which never crowd unlocks out of the queue.
  - `subscribe` listeners receive the kind of change (`emit`, `refresh`, `replay`, `seed`), also over `@walangstudio/badgetrip-ipc`.
- **Docs**: a getting-started guide and one guide per framework (React, React Native, Vue, Angular, HTML, htmx, Electron, Tauri), a celebrations guide, plus references for achievements, rules, architecture, store adapters and platform support.
- **Examples**: `playground` (a browser sandbox: edit a config, fire events, watch the celebrations; nothing is saved), `node-cli`, `react-spa`, `todont-extract` (a production 12-badge ruleset) and `adapter-postgres` (a store that passes the contract suite).
- **Tooling**: tests with line and branch coverage (`pnpm test:coverage`), typechecked tests, CI running lint, build, typecheck, tests and the examples, and a release workflow that publishes every package to npm with provenance when a `v*` tag is pushed.

### Decided

- badgetrip ships no database adapters. Persistence belongs to the application, implemented against the store interfaces. See [ADR-0001](https://github.com/walangstudio/badgetrip/blob/main/docs/adr/0001-store-agnostic-persistence.md).
