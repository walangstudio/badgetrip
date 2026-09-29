# badgetrip - Cross-platform support

`@walangstudio/badgetrip-core` is pure ES2022 TypeScript with **zero runtime dependencies** and no
platform globals (no `window`, `document`, `localStorage`, `fs`, `Date.now`, or
`Math.random` - the engine never reads the system clock; all time comes from the caller's
`Clock` and `event.ts`). That makes the core runnable anywhere JavaScript runs. Persistence
is the app's (the four store ports), so platform reach is decided by the adapter, not the engine.

## Matrix

| Package            | Node | Deno / Bun | Hermes (Expo RN, iOS/Android) | Browser / RN-web | Tauri (desktop) |
|--------------------|:----:|:---------:|:-----------------------------:|:----------------:|:---------------:|
| `@walangstudio/badgetrip-core`    | ✅   | ✅        | ✅                            | ✅               | ✅ (webview or sidecar) |
| `@walangstudio/badgetrip-react`   | ✅ (SSR) | ✅     | ✅ (React Native)             | ✅               | ✅ (webview)    |
| `@walangstudio/badgetrip-assets`  | ✅   | ✅        | ✅                            | ✅               | ✅              |
| `@walangstudio/badgetrip-html`    | ✅ (SSR strings) | ✅ | n/a                        | ✅ (custom elements) | ✅ (webview) |
| `@walangstudio/badgetrip-vue`     | n/a  | n/a       | n/a                           | ✅               | ✅ (webview)    |
| `@walangstudio/badgetrip-angular` | n/a  | n/a       | n/a                           | ✅ (Angular >=17.1) | ✅ (webview) |
| `@walangstudio/badgetrip-react-native` | n/a | n/a  | ✅ (mocked tests only, not run on a device) | n/a | n/a        |
| `@walangstudio/badgetrip-ipc`     | ✅   | ✅        | n/a                           | ✅ (Worker, iframe) | ✅ (webview + Worker) |
| `@walangstudio/badgetrip-testing` | ✅   | ✅        | n/a (test-time only)          | n/a              | n/a             |

Electron uses the browser column in the renderer plus `@walangstudio/badgetrip-ipc` to reach an engine in
the main process. The Electron transports are tested against fakes, not a real Electron app.

✅ = verified or by-construction (pure ESM, no platform APIs).

## Verified in this repo

- **Node (built dist, ESM):** `node --input-type=module` importing `packages/core/dist/index.js`
  emits an event and unlocks an achievement. Proves the published artifact (not just source)
  loads under plain Node ESM.
- **Node (source, vitest):** the full suite (`pnpm test`) - 400 tests (382 root + 18 Angular).
- **Bun + Expo/Metro (Hermes):** consumed from the todont app via a `file:` dep on the built
  dist; a bun smoke in todont's integration layer builds an engine and runs todont's full
  definitions. Bun executes the same pure-ESM artifact Hermes bundles.
- **Deno:** `examples/deno-smoke.ts` (`deno run examples/deno-smoke.ts`) - same core, no shims.
  In a Supabase Edge Function, import `npm:@walangstudio/badgetrip-core` instead of the relative dist path.

## Consumption notes per target

- **Expo / Metro (RN + RN-web):** depend on the **built `dist`** (not TS source). The package
  exposes both a legacy `main` (`dist/index.js`) and an `exports` map, so Metro resolves it
  even without `unstable_enablePackageExports`. If you enable package exports, it still works.
  A `file:`/workspace dep copies the dist into `node_modules`; Metro bundles it like any package.
- **Deno / Supabase Edge:** use `npm:@walangstudio/badgetrip-core` (Deno's npm specifier) once published, or
  vendor the built `dist`. Core has no deps, so nothing else to resolve. Deterministic clock
  means edge cold-starts replay identically.
- **Tauri / desktop:** the Tauri backend is Rust, so the engine cannot run there. Shapes:
  1. **In the webview** (the common case): core is browser-grade ESM; bundle it with your
     frontend (Vite/etc.) exactly like the web build, with a SQLite store over
     `@tauri-apps/plugin-sql` for persistence (see `packages/ipc/README.md`).
  2. **In a Web Worker:** keep the UI thread free and talk to it with `@walangstudio/badgetrip-ipc`'s
     `messagePortTransport`.
  3. **In a Node/Bun sidecar:** for server-authoritative scoring; needs a stdio/socket
     transport for `@walangstudio/badgetrip-ipc` (not shipped).
- **Browser:** `sideEffects: false` + ESM means tree-shaking works; ship only what you import.

## What decides reach: the adapter, not the engine

The engine is portable; a **store adapter** may not be. `@walangstudio/badgetrip-core`'s `memory*Store`
reference runs everywhere. A SQL/KV adapter inherits its driver's platform support - e.g. a
`pg` adapter is Node/Deno/Bun only, a `@supabase/supabase-js` adapter (PostgREST over fetch)
runs in the browser/RN/edge too. Choose the adapter to match where you run the engine; the
rules/definitions stay identical across all of them.
