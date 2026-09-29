import type { Transport } from './protocol.js';

type MessageListener = (e: { data: unknown }) => void;

/** Structural `MessagePort` / `Worker` / `DedicatedWorkerGlobalScope`. Not a `Window`. */
export type MessagePortLike = {
  postMessage(msg: unknown): void;
  addEventListener(type: 'message', listener: MessageListener): void;
  removeEventListener(type: 'message', listener: MessageListener): void;
  start?(): void;
};

/**
 * Transport over a MessagePort, a Worker, or `self` inside a worker. For an iframe,
 * transfer one end of a `MessageChannel` to it and use the port: listening on a
 * `Window` accepts messages from every frame and origin.
 */
export function messagePortTransport(port: MessagePortLike): Transport {
  return {
    send: (msg) => port.postMessage(msg),
    onMessage(cb) {
      const listener: MessageListener = (e) => cb(e.data);
      port.addEventListener('message', listener);
      port.start?.();
      return () => port.removeEventListener('message', listener);
    },
  };
}

/** Structural `Electron.IpcMain`. */
export type IpcMainLike = {
  on(channel: string, listener: (event: { sender: unknown }, msg: unknown) => void): unknown;
  removeListener(
    channel: string,
    listener: (event: { sender: unknown }, msg: unknown) => void,
  ): unknown;
};

/** Structural `Electron.WebContents`. */
export type WebContentsLike = {
  send(channel: string, msg: unknown): void;
  isDestroyed?(): boolean;
};

/**
 * Main-process side of one window. Messages from any other `webContents` on the same
 * channel are ignored, so each window needs its own `serveEngine`.
 */
export function electronMainTransport(
  ipcMain: IpcMainLike,
  webContents: WebContentsLike,
  channel = 'badgetrip',
): Transport {
  return {
    send(msg) {
      if (!webContents.isDestroyed?.()) webContents.send(channel, msg);
    },
    onMessage(cb) {
      const listener = (event: { sender: unknown }, msg: unknown) => {
        if (event.sender === webContents) cb(msg);
      };
      ipcMain.on(channel, listener);
      return () => {
        ipcMain.removeListener(channel, listener);
      };
    },
  };
}

/** Structural `Electron.IpcRenderer`. */
export type IpcRendererLike = {
  send(channel: string, msg: unknown): void;
  on(channel: string, listener: (event: unknown, msg: unknown) => void): unknown;
  removeListener(channel: string, listener: (event: unknown, msg: unknown) => void): unknown;
};

/**
 * Renderer side. Build it in the preload and expose only this transport through
 * `contextBridge`; the page never sees `ipcRenderer` or the IPC event object.
 */
export function electronRendererTransport(
  ipcRenderer: IpcRendererLike,
  channel = 'badgetrip',
): Transport {
  return {
    send: (msg) => ipcRenderer.send(channel, msg),
    onMessage(cb) {
      const listener = (_event: unknown, msg: unknown) => cb(msg);
      ipcRenderer.on(channel, listener);
      return () => {
        ipcRenderer.removeListener(channel, listener);
      };
    },
  };
}
