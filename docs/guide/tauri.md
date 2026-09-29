# Tauri

Tauri's backend is Rust, and badgetrip is JavaScript, so the engine runs in the webview, next to your UI. That's less odd than it sounds: it's the same engine you'd run in a browser, and Tauri gives it a real SQLite database to save to.

## Setup

Follow the guide for your frontend ([React](react.md), [Vue](vue.md), [plain HTML](html.md)...) exactly as written. Nothing about Tauri changes the UI code.

The only difference is storage. The memory stores from [Getting started](getting-started.md) forget everything when the app closes. For data that survives, implement the four store interfaces on top of `@tauri-apps/plugin-sql`.

The SQL is the same as the Postgres reference in [examples/adapter-postgres](../../examples/adapter-postgres), with a few SQLite adjustments. [ADAPTERS.md](../ADAPTERS.md) spells out what each method must do, and `runStoreContract` from `@walangstudio/badgetrip-testing` checks your stores against it.

`packages/ipc/README.md` has a starting sketch of a plugin-sql store. It hasn't been run inside a real Tauri app yet, so treat it as a starting point.

## Keeping the UI smooth

On big histories, working out every badge takes real work. To keep that off the UI thread, run the engine in a Web Worker and talk to it with `@walangstudio/badgetrip-ipc`:

```ts
// worker.ts
import { messagePortTransport, serveEngine } from '@walangstudio/badgetrip-ipc';
import { engine } from './badges';

serveEngine(engine, messagePortTransport(self));
```

```ts
// in the UI
import { connectEngine, messagePortTransport } from '@walangstudio/badgetrip-ipc';

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
export const remote = connectEngine(messagePortTransport(worker));
```

Then hand `remote` to your provider, as the [Electron guide](electron.md#window) does.

## Server-side scoring

If users shouldn't be able to edit their own badges, run the engine on a server instead and treat the desktop app like any web client. See the [htmx guide](htmx.md) for the server side.
