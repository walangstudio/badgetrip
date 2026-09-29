# @badgetrip/ipc

Run the engine in one process (Electron main, a Web/Node worker, a server) and call it from
another (the renderer, the UI thread). Zero runtime deps beyond `@badgetrip/core`; no Electron
or Tauri dependency - transports are typed structurally.

[Electron guide](../../docs/guide/electron.md) · [Tauri guide](../../docs/guide/tauri.md) · [badgetrip](../../README.md)

## Install

```sh
npm install @badgetrip/ipc @badgetrip/core
```

## Usage

```ts
// engine side
import { serveEngine, messagePortTransport } from '@badgetrip/ipc';
const stop = serveEngine(engine, messagePortTransport(port1));

// UI side
import { connectEngine, messagePortTransport } from '@badgetrip/ipc';
const remote = connectEngine(messagePortTransport(port2), { timeoutMs: 10000 });
await remote.emit({ id, actor: 'u1', type: 'task.done', ts: Date.now(), payload: {} });
remote.subscribe(() => rerender(remote.getVersion()));
```

## API

- `serveEngine(engine | observedEngine, transport, opts?) => dispose`
  - Answers `{id, method, args}` with `{id, ok: true, value}` or `{id, ok: false, error: {name, message}}`.
  - Pushes `{type: 'changed', version}` after `emit`/`replay`/`seed`/`refresh`, before the response.
  - Pass an `ObservedEngine` (from `observe`) to share one engine across several peers or with
    in-process callers; every change reaches every peer.
- `connectEngine<M>(transport, { timeoutMs? }) => RemoteEngine<M>`
  - Same async methods as `Engine` (`Pick`), plus `engine` (the same methods), `subscribe`,
    `getVersion` - the `ObservedEngine` shape - and `dispose`.
  - Calls reject with `TimeoutError` after `timeoutMs` (default 10000, `Infinity` disables) and
    with `DisposedError` on or after `dispose()`. Remote errors arrive as `Error` with the
    original `name` and `message`.
  - `M` defaults to `DefaultMethod`. Widen it when the server allows more:
    `connectEngine<DefaultMethod | 'replay'>(t)`.
- Transports: `messagePortTransport(port)`, `electronMainTransport(ipcMain, webContents, channel?)`,
  `electronRendererTransport(ipcRenderer, channel?)`. Anything with `send` + `onMessage` works.

## Security model

The peer is untrusted: a compromised renderer can send any message on the channel.

| Decision | Why |
|---|---|
| Allowlist (`opts.methods`), default `emit refresh score tier leaderboard achievements streak escalator progress catalog` | Only named engine methods run. Unknown names in the config throw at startup. Lookup is a `Set`, never `engine[anyString]`, so `__proto__`/`constructor` cannot be reached. |
| `seed` excluded by default | Writes arbitrary scores, achievements and streaks with no rule check and is not idempotent. Admin-only. |
| `replay` excluded by default | Bulk emit of a caller-chosen log. `emit` already covers normal use; opt in for a trusted peer and raise `maxPayloadSize`. |
| `definitions` and stores never exposed | They are not in `REMOTE_METHODS`; the wire only carries method results. |
| Shape checks per method | Query args must be strings (`leaderboard`'s `now` a finite number); `emit` takes one object, which `assertEvent` then validates. Extra args are rejected. Malformed envelopes (no id, non-string method, non-array args) are dropped silently. |
| `maxPayloadSize` (default 65536, measured as `JSON.stringify(args).length`) | Events are persisted forever, so an uncapped payload is unbounded storage growth per call. Non-JSON args (cycles, BigInt) are rejected too. It does not stop the transport itself deserializing a huge message. |
| `authorize(method, args)` | Per-call hook after the checks above; anything but `true` denies with `Forbidden`. Bind a peer to its own actor here. |
| `unlocks` (default `true`, or `false` when `authorize` is set) | New unlocks are pushed to the peer as `{type: 'unlocked', unlocks}` so celebration notifiers work remotely. They reveal actor ids and codes, so a server that scopes peers with `authorize` sends none unless you pass a filter such as `(u) => u.actor === peerUser`. The client ignores oversized batches and malformed entries. |
| Errors cross as `{name, message}` | No stack traces. Store errors (e.g. SQL messages) are forwarded as-is; wrap your stores if their messages are sensitive. |
| No `eval`, no dynamic code | Messages are data only. |

```ts
serveEngine(engine, transport, {
  authorize: (method, args) => {
    if (method === 'emit') return (args[0] as Event).actor === session.userId;
    return args[0] === session.userId || method === 'leaderboard';
  },
});
```

An allowed `emit` still carries a client-chosen `ts`, `type` and `payload`. When scoring must
not trust the client, don't allow `emit`: build events engine-side in your own handler.

## Web Worker / MessageChannel / iframe

`messagePortTransport` takes a `MessagePort`, a `Worker`, or `self` inside a dedicated worker
(checked against the DOM and WebWorker lib types). Give badgetrip its own channel: other
messages on the same port are ignored only if they don't look like a request.

```ts
// worker.ts
serveEngine(createEngine(config), messagePortTransport(self));
// main thread
const remote = connectEngine(messagePortTransport(new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })));
```

For an iframe, don't listen on `window`: it receives messages from every frame and origin.
Create a `MessageChannel`, send one port to the frame with `postMessage(msg, exactOrigin, [port])`,
and run `messagePortTransport` on the ports.

Node `worker_threads` ports (`MessagePort`, global `MessageChannel`) work - that is what the
tests use. A Node `Worker` object is an EventEmitter; pass `worker_threads` ports rather than
the `Worker` itself (unverified whether `Worker` exposes `addEventListener`).

## Electron

Run the engine in the main process; the renderer only sees a transport.

```ts
// main.ts
import { ipcMain } from 'electron';
const stop = serveEngine(observed, electronMainTransport(ipcMain, win.webContents), {
  authorize: (m, args) => m !== 'emit' || (args[0] as Event).actor === currentUser,
});
win.on('closed', stop);

// preload.ts (contextIsolation: true, sandbox: true)
import { contextBridge, ipcRenderer } from 'electron';
import { electronRendererTransport } from '@badgetrip/ipc';
contextBridge.exposeInMainWorld('badgetripTransport', electronRendererTransport(ipcRenderer));

// renderer
const remote = connectEngine(window.badgetripTransport);
```

- Never expose `ipcRenderer` itself. The transport forwards only the message, never the IPC
  event (whose `sender` is `ipcRenderer`), and only on its one channel.
- `electronMainTransport` drops messages whose `event.sender` is not that `webContents`, so one
  window cannot drive another's session. Serve each window separately; pass a shared
  `ObservedEngine` so they all get change notifications.
- A sandboxed preload can only `require` a few Electron modules, so bundle the preload (or
  inline the ~15 lines of `electronRendererTransport`).
- Unverified in this repo (no Electron here): that `contextBridge` proxies the transport's
  functions and the returned unsubscribe as expected. Electron documents functions as a
  supported `contextBridge` type; test it in your app.

## Tauri

The Tauri backend is Rust, so the engine cannot run there. Pick one:

1. **Engine in the webview, SQLite via `@tauri-apps/plugin-sql`** (not shipped - sketch).
   Engine and UI share one trust domain, so no IPC layer is needed; persistence goes through
   the plugin's Rust side.

   ```ts
   import Database from '@tauri-apps/plugin-sql';
   const db = await Database.load('sqlite:badgetrip.db');
   const events: EventStore = {
     async append(e) {
       const r = await db.execute(
         'INSERT INTO events (id, actor, type, ts, payload) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
         [e.id, e.actor, e.type, e.ts, JSON.stringify(e.payload)],
       );
       return r.rowsAffected > 0;
     },
     // read/count and the other stores: port examples/adapter-postgres, then run
     // runStoreContract from @badgetrip/testing against it.
   };
   ```

   From the plugin README: sqlite uses `$1` placeholders, paths are relative to AppConfig, and
   the capability needs `sql:allow-execute` besides load/select. Unverified here: exact
   `rowsAffected` semantics for `ON CONFLICT DO NOTHING`, and atomicity of multi-statement
   store writes.

2. **Engine in a Web Worker** with `messagePortTransport`, to keep the UI thread free. The
   plugin's JS API calls into Tauri via the window context; whether it works inside a worker
   is unverified, so use IndexedDB or memory stores there, or proxy storage calls to the main
   thread.

3. **Node/Bun sidecar** for server-authoritative scoring. Needs a stdio or socket `Transport`
   (a few lines over newline-delimited JSON); not shipped.

## UI adapters

A `RemoteEngine` goes straight into any UI adapter: `BadgetripProvider`, `createBadgetrip`,
`provideBadgetrip` and `defineBadgetripElements` all take one in place of a local engine.

## License

MIT
