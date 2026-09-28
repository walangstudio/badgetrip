# Changelog

All notable changes to badgetrip are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/), and versions follow [SemVer](https://semver.org/).

## [0.0.1] - 2026-09-28

First release. Not yet published to npm.

### Added

- **`@badgetrip/core`**: the event-sourced engine, with zero runtime dependencies.
  - `createEngine` with `emit`, `replay`, `seed` and `refresh`, plus the queries `score`, `tier`, `leaderboard`, `achievements`, `streak`, `escalator`, `progress` and `catalog`.
  - Points from fixed or event-relative deltas. Streaks per actor or per actor and key. Threshold tiers. All-time and rolling leaderboards ranked by score or by summed streaks. Capped escalators with decay.
  - Achievements as keyed config through `defineAchievements`, with `rules.*` builders: `count` (with `where` filters and a time-of-day window), `score`, `streak` (current or best, any key), `unique`, `groupCount`, `firstOfDay`, `rank`, `all` and `any`.
  - Tiered achievements that expand one entry into several unlocks, with `{tier}` and `{n}` templating and per-tier overrides. Hidden achievements with a spoiler-free `lockedDescription`. Points, icons and categories per achievement.
  - Idempotent `emit` by event id, enforced atomically by the event store. Emits are queued per actor, so concurrent calls see consistent state.
  - `createEngine` validates every definition up front and rejects unknown references, bad thresholds and missing store capabilities.
  - Deterministic: the engine reads the injected `Clock` only for queries, never during `emit`, and `replay` rebuilds the same state from the same log.
  - Store-agnostic persistence through four interfaces (`EventStore`, `ScoreStore`, `AchievementStore`, `StreakStore`), with in-memory reference stores.
  - `observe(engine)`, the shared change stream every UI adapter builds on.
- **`@badgetrip/assets`**: 18 SVG icons, one of them animated, and `createIconResolver` with per-achievement, per-series and per-category overrides, tier tinting, still frames for animated icons, and `missing()` for catching typos.
- **`@badgetrip/react`**: `BadgetripProvider`, hooks for every query, `AchievementBadge`, `IconProvider` and `useAchievementIcon`.
- **`@badgetrip/react-native`**: the React hooks plus a native `AchievementBadge` on react-native-svg, following the OS reduce-motion setting.
- **`@badgetrip/vue`**: a plugin, composables returning `{ data, error }`, and `AchievementBadge`.
- **`@badgetrip/angular`**: `provideBadgetrip`, a signal-based `BadgetripService` and a standalone badge component. Zoneless-ready, Angular 17.1+.
- **`@badgetrip/html`**: escaped `renderBadge` / `renderCatalog` strings for servers and htmx, and `<badgetrip-catalog>` / `<badgetrip-badge>` custom elements.
- **`@badgetrip/ipc`**: serve an engine in one process and use it from another over MessagePort or Electron IPC, behind a method allowlist, argument checks, a size cap and an `authorize` hook.
- **`@badgetrip/testing`**: `makeTestEngine`, a steppable clock, event and id helpers, and `runStoreContract`, the conformance suite for custom stores.
- **Docs**: a getting-started guide and one guide per framework (React, React Native, Vue, Angular, HTML, htmx, Electron, Tauri), plus references for achievements, rules, architecture, store adapters and platform support.
- **Examples**: `node-cli`, `react-spa`, `todont-extract` (a production 12-badge ruleset) and `adapter-postgres` (a store that passes the contract suite).
- **Tooling**: 307 tests with line and branch coverage (`pnpm test:coverage`), typechecked tests, and CI running lint, build, typecheck, tests and the examples.

### Decided

- badgetrip ships no database adapters. Persistence belongs to the application, implemented against the store interfaces. See [ADR-0001](docs/adr/0001-store-agnostic-persistence.md).
