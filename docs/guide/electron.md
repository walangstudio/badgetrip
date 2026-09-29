# Electron

Run the engine in the main process, where your database lives, and use it from the window. `@badgetrip/ipc` carries the calls across. The window can't touch the stores directly or call anything you haven't allowed.

```sh
npm install @badgetrip/core @badgetrip/ipc @badgetrip/react
```

Swap `@badgetrip/react` for whichever UI package you use. This uses the `engine` from [Getting started](getting-started.md), with a real store in place of the memory ones.

## Main process

```ts
// main.ts
import { serveEngine, electronMainTransport } from '@badgetrip/ipc';
import { BrowserWindow, app, ipcMain } from 'electron';
import { engine } from './badges';

app.whenReady().then(() => {
  const win = new BrowserWindow({ webPreferences: { preload: `${__dirname}/preload.js` } });

  const stop = serveEngine(engine, electronMainTransport(ipcMain, win.webContents), {
    // The window may only record events for the signed-in user.
    authorize: (method, args) =>
      method !== 'emit' || (args[0] as { actor?: string }).actor === signedInUser(),
    // Push only this user's unlocks, for an unlock notifier in the window.
    unlocks: (u) => u.actor === signedInUser(),
  });
  win.on('closed', stop);

  win.loadFile('index.html');
});

function signedInUser() {
  return 'ana'; // your auth here
}
```

Each window gets its own `serveEngine`. They all share one change stream, so an event from one window updates the others too.

## Preload

```ts
// preload.ts
import { electronRendererTransport } from '@badgetrip/ipc';
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('badgetrip', electronRendererTransport(ipcRenderer));
```

The page only ever sees this transport, never `ipcRenderer` itself.

## Window

```tsx
// renderer.tsx
import { type Transport, connectEngine } from '@badgetrip/ipc';
import { BadgetripProvider } from '@badgetrip/react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

declare global {
  interface Window {
    badgetrip: Transport;
  }
}

const remote = connectEngine(window.badgetrip);

createRoot(document.getElementById('root')!).render(
  <BadgetripProvider engine={remote}>
    <App />
  </BadgetripProvider>,
);
```

From here it's the normal [React guide](react.md). The one change is that `useBadgetrip()` returns the remote engine, so give it that type: `useBadgetrip<RemoteEngine['engine']>()`.

## What the window can and can't do

By default the window can call `emit`, `refresh`, and the read-only queries: `score`, `tier`, `leaderboard`, `achievements`, `streak`, `escalator`, `progress` and `catalog`.

`seed` and `replay` are left out, because they write data without the usual checks. Add them with the `methods` option only for a window you fully trust.

Every call has its arguments checked and its size capped. Errors come back with a name and message, but never a stack trace.

Unlocks can be pushed to the window too, so an [unlock notifier](celebrations.md) there works. They carry actor ids and achievement codes, so with `authorize` set they are off until you pass `unlocks`, as the example above does. Without `authorize` they are on; pass `unlocks: false` to turn them off.

The transports are tested against stand-ins for Electron's IPC objects, not a running Electron app. If something doesn't line up in your version, please open an issue.
