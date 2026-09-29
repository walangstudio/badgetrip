import { type ChangeKind, type Unlock, notifyAll } from '@walangstudio/badgetrip-core';
import {
  type DefaultMethod,
  REMOTE_METHODS,
  type RemoteMethod,
  type RemoteMethods,
  type Transport,
  isRecord,
} from './protocol.js';

export type ConnectOptions = {
  /** Reject a call that gets no response within this many ms. Default 10000; Infinity disables. */
  timeoutMs?: number;
};

/**
 * Engine methods over a transport, plus the `ObservedEngine` shape (`engine`,
 * `subscribe`, `getVersion`) so UI adapters can consume it. `M` narrows the typed
 * methods to what the server allows; the server's allowlist is what enforces it.
 */
export type RemoteEngine<M extends RemoteMethod = DefaultMethod> = Pick<RemoteMethods, M> & {
  engine: Pick<RemoteMethods, M>;
  /** Called after each change the server reports, with its kind. Returns an unsubscribe. */
  subscribe: (cb: (change?: ChangeKind) => void) => () => void;
  /** The server's version from its latest change notification. */
  getVersion: () => number;
  /** Called with each batch of unlocks the server reports. Returns an unsubscribe. */
  onUnlock: (cb: (unlocks: readonly Unlock[]) => void) => () => void;
  /** Stop listening and reject every pending call. */
  dispose: () => void;
};

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout> | undefined;
};

const named = (name: string, message: string) => Object.assign(new Error(message), { name });

const MAX_UNLOCKS = 1000;
const KINDS = new Set(['emit', 'refresh', 'replay', 'seed']);

/** The well-formed `{actor, code}` entries of an untrusted `unlocks` payload. */
function readUnlocks(raw: unknown): readonly Unlock[] {
  if (!Array.isArray(raw) || raw.length > MAX_UNLOCKS) return [];
  const out: Unlock[] = [];
  for (const u of raw) {
    if (!isRecord(u)) continue;
    const { actor, code } = u;
    if (typeof actor === 'string' && actor && typeof code === 'string' && code) {
      out.push({ actor, code });
    }
  }
  return Object.freeze(out);
}

export function connectEngine<M extends RemoteMethod = DefaultMethod>(
  transport: Transport,
  opts: ConnectOptions = {},
): RemoteEngine<M> {
  const timeoutMs = opts.timeoutMs ?? 10000;
  const pending = new Map<string, Pending>();
  const listeners = new Set<(change?: ChangeKind) => void>();
  const unlockListeners = new Set<(unlocks: readonly Unlock[]) => void>();
  // Replies reach every listener on a shared channel (two clients, a reload), so ids
  // must be unique per client, not just per call.
  const prefix =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  let nextId = 1;
  let version = 0;
  let disposed = false;

  const off = transport.onMessage((msg) => {
    if (!isRecord(msg)) return;
    if (msg.type === 'changed') {
      // Versions restart when a server is re-created, so never dedupe on them.
      if (typeof msg.version !== 'number') return;
      version = msg.version;
      const kind = KINDS.has(msg.kind as string) ? (msg.kind as ChangeKind) : undefined;
      notifyAll([...listeners].map((l) => () => l(kind)));
      return;
    }
    if (msg.type === 'unlocked') {
      const batch = readUnlocks(msg.unlocks);
      if (batch.length) notifyAll([...unlockListeners].map((l) => () => l(batch)));
      return;
    }
    const p = typeof msg.id === 'string' ? pending.get(msg.id) : undefined;
    if (!p || typeof msg.ok !== 'boolean') return;
    pending.delete(msg.id as string);
    clearTimeout(p.timer);
    if (msg.ok) {
      p.resolve(msg.value);
    } else {
      const e = isRecord(msg.error) ? msg.error : {};
      p.reject(
        named(
          typeof e.name === 'string' ? e.name : 'Error',
          typeof e.message === 'string' ? e.message : 'remote call failed',
        ),
      );
    }
  });

  function call(method: RemoteMethod, args: unknown[]): Promise<unknown> {
    if (disposed)
      return Promise.reject(named('DisposedError', 'badgetrip ipc: connection disposed'));
    return new Promise((resolve, reject) => {
      const id = `${prefix}:${nextId++}`;
      const timer = Number.isFinite(timeoutMs)
        ? setTimeout(() => {
            pending.delete(id);
            reject(
              named('TimeoutError', `badgetrip ipc: ${method} timed out after ${timeoutMs}ms`),
            );
          }, timeoutMs)
        : undefined;
      pending.set(id, { resolve, reject, timer });
      try {
        transport.send({ id, method, args });
      } catch (err) {
        pending.delete(id);
        clearTimeout(timer);
        reject(err instanceof Error ? err : named('Error', String(err)));
      }
    });
  }

  const methods = Object.fromEntries(
    REMOTE_METHODS.map((m) => [m, (...args: unknown[]) => call(m, args)]),
  ) as unknown as Pick<RemoteMethods, M>;

  return {
    ...methods,
    engine: methods,
    subscribe: (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    getVersion: () => version,
    onUnlock: (cb) => {
      unlockListeners.add(cb);
      return () => {
        unlockListeners.delete(cb);
      };
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      off();
      unlockListeners.clear();
      for (const p of pending.values()) {
        clearTimeout(p.timer);
        p.reject(named('DisposedError', 'badgetrip ipc: connection disposed'));
      }
      pending.clear();
    },
  };
}
