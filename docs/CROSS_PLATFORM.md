# badgetrip - Cross-platform support

`@walangstudio/badgetrip-core` is plain ES2022 with **zero runtime dependencies** and no platform
globals: no `window`, `document`, `localStorage`, `fs`, `Date.now` or `Math.random`. Time comes
from the caller's `Clock` and `event.ts`. So the core runs anywhere JavaScript does, and where you
can run it is decided by your store, not the engine (see the end of this page).

## Matrix

| Package            | Node | Deno / Bun | Hermes (Expo RN, iOS/Android) | Browser / RN-web | Tauri (desktop) |
|--------------------|:----:|:---------:|:-----------------------------:|:----------------:|:---------------:|
| `@walangstudio/badgetrip-core`    | yes   | yes        | yes                            | yes               | yes (webview or sidecar) |
| `@walangstudio/badgetrip-react`   | yes (SSR) | yes     | yes (React Native)             | yes               | yes (webview)    |
| `@walangstudio/badgetrip-assets`  | yes   | yes        | yes                            | yes               | yes              |
| `@walangstudio/badgetrip-html`    | yes (SSR strings) | yes | n/a                        | yes (custom elements) | yes (webview) |
| `@walangstudio/badgetrip-vue`     | n/a  | n/a       | n/a                           | yes               | yes (webview)    |
| `@walangstudio/badgetrip-angular` | n/a  | n/a       | n/a                           | yes (Angular >=17.1) | yes (webview) |
| `@walangstudio/badgetrip-react-native` | n/a | n/a  | yes (mocked tests only, not run on a device) | n/a | n/a        |
| `@walangstudio/badgetrip-ipc`     | yes   | yes        | n/a                           | yes (Worker, iframe) | yes (webview + Worker) |
| `@walangstudio/badgetrip-testing` | yes   | yes        | n/a (test-time only)          | n/a              | n/a             |

Electron uses the browser column in the renderer plus `@walangstudio/badgetrip-ipc` to reach an engine in
the main process. The Electron transports are tested against fakes, not a real Electron app.

"yes" means tested in this repo, or safe by construction (plain ESM, no platform APIs).

## Verified in this repo

- **Node (built dist, ESM):** `node --input-type=module` importing `packages/core/dist/index.js`
  emits an event and unlocks an achievement. Proves the published artifact (not just source)
  loads under plain Node ESM.
- **Node (source, vitest):** the full suite (`pnpm test`): vitest, then the Angular specs. Results are on [CI](https://github.com/walangstudio/badgetrip/actions/workflows/ci.yml).
- **Bun + Expo/Metro (Hermes):** the todont app uses the built dist through a `file:` dep, and a
  Bun smoke test there builds an engine with todont's full definitions. That test lives in
  todont, not in this repo.
- **Deno:** `examples/deno-smoke.ts` (`deno run examples/deno-smoke.ts`) - same core, no shims.

## Consumption notes per target

- **Expo / Metro (RN + RN-web):** depend on the **built `dist`** (not TS source). The package
  exposes both a legacy `main` (`dist/index.js`) and an `exports` map, so Metro resolves it
  even without `unstable_enablePackageExports`. If you enable package exports, it still works.
  A `file:`/workspace dep copies the dist into `node_modules`; Metro bundles it like any package.
- **Deno / Supabase Edge:** import `npm:@walangstudio/badgetrip-core`, or vendor the built `dist`. Core has no deps, so nothing else to resolve. Deterministic clock
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

The engine is portable; your **store** may not be. The `memory*Store` references run everywhere.
A SQL or KV store runs wherever its driver does: a `pg` store is Node, Deno and Bun only, while a
`@supabase/supabase-js` store (PostgREST over fetch) also runs in the browser, React Native and at
the edge. Pick the store for where the engine runs; your definitions stay the same everywhere.
