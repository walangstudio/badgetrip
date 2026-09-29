import { type Engine, type ObservedEngine, type Unlock, observe } from '@badgetrip/core';
import {
  DEFAULT_METHODS,
  REMOTE_METHODS,
  type RemoteMethod,
  type Response,
  type Transport,
  isRecord,
} from './protocol.js';

export type ServeOptions = {
  /** Methods the peer may call. Defaults to `DEFAULT_METHODS` (no `seed`, no `replay`). */
  methods?: readonly RemoteMethod[];
  /**
   * Per-call check, run after shape validation and the allowlist. Anything but `true`
   * denies. Use it to bind a peer to its own actor.
   */
  authorize?: (method: RemoteMethod, args: readonly unknown[]) => boolean | Promise<boolean>;
  /**
   * Max `JSON.stringify(args).length`. Events are persisted forever, so an unbounded
   * payload is unbounded storage growth per call. Default 65536.
   */
  maxPayloadSize?: number;
  /**
   * Push `{type:'unlocked', unlocks}` to the peer after changes that unlock achievements.
   * It reveals actor ids and achievement codes. Default true, or false when `authorize`
   * is set; a server shared by several users should pass a filter such as the peer's
   * own actor.
   */
  unlocks?: boolean | ((unlock: Unlock) => boolean);
};

type Check = (v: unknown) => boolean;
const str: Check = (v) => typeof v === 'string';
const optStr: Check = (v) => v === undefined || typeof v === 'string';
const optNum: Check = (v) => v === undefined || (typeof v === 'number' && Number.isFinite(v));

// Shallow shapes only; the engine does the deep validation (assertEvent) itself.
const ARGS: Record<RemoteMethod, Check[]> = {
  emit: [isRecord],
  replay: [(v) => Array.isArray(v) && v.every(isRecord)],
  seed: [isRecord],
  refresh: [str],
  score: [str, str],
  tier: [str, str],
  leaderboard: [str, optNum],
  achievements: [str],
  streak: [str, str, optStr],
  escalator: [str, str, optStr],
  progress: [str, str],
  catalog: [str],
};

const fail = (name: string, message: string) => Object.assign(new Error(message), { name });

function argsSize(args: unknown[]): number {
  try {
    return JSON.stringify(args).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

const isObserved = (e: Engine | ObservedEngine): e is ObservedEngine =>
  'subscribe' in e && typeof e.subscribe === 'function';

/**
 * Answer engine RPCs arriving on `transport` and push `{type:'changed', version}` after
 * state changes. Treat the peer as untrusted: only allowlisted methods run, args are
 * shape-checked and size-capped, and errors cross as `{name, message}` only.
 * Every server (and UI adapter) observing the same engine shares one change stream.
 */
export function serveEngine(
  engine: Engine | ObservedEngine,
  transport: Transport,
  opts: ServeOptions = {},
): () => void {
  const observed = isObserved(engine) ? engine : observe(engine);
  const methods = opts.methods ?? DEFAULT_METHODS;
  for (const m of methods) {
    if (!(REMOTE_METHODS as readonly string[]).includes(m)) {
      throw new Error(`serveEngine: unknown method in allowlist: ${String(m)}`);
    }
  }
  const allowed = new Set<string>(methods);
  // With authorize, peers are scoped per actor, so never broadcast unlocks unless asked.
  const unlocks = opts.unlocks ?? !opts.authorize;
  if (typeof unlocks !== 'boolean' && typeof unlocks !== 'function') {
    throw new TypeError('serveEngine: unlocks must be a boolean or a function');
  }
  const maxPayloadSize = opts.maxPayloadSize ?? 65536;
  let disposed = false;

  const send = (msg: unknown) => {
    if (disposed) return;
    try {
      transport.send(msg);
    } catch {
      // A closed window or an uncloneable value must not crash the serving process.
    }
  };

  const reply = (res: Response) => {
    if (disposed) return;
    try {
      transport.send(res);
    } catch (err) {
      if (res.ok) send({ id: res.id, ok: false, error: toWire(err) });
    }
  };

  async function run(method: string, args: unknown[]): Promise<unknown> {
    if (!allowed.has(method)) throw fail('MethodNotAllowed', `method not allowed: ${method}`);
    const m = method as RemoteMethod;
    const checks = ARGS[m];
    if (args.length > checks.length || !checks.every((c, i) => c(args[i]))) {
      throw fail('InvalidArguments', `invalid arguments for ${m}`);
    }
    if (argsSize(args) > maxPayloadSize) {
      throw fail('PayloadTooLarge', `payload for ${m} exceeds ${maxPayloadSize}`);
    }
    if (opts.authorize && (await opts.authorize(m, args)) !== true) {
      throw fail('Forbidden', `not authorized: ${m}`);
    }
    return (observed.engine[m] as (...a: unknown[]) => Promise<unknown>)(...args);
  }

  const offMessage = transport.onMessage((msg) => {
    if (disposed || !isRecord(msg)) return;
    const { id, method, args } = msg;
    if (typeof id !== 'number' && typeof id !== 'string') return;
    if (typeof method !== 'string' || !Array.isArray(args)) return;
    run(method, args).then(
      (value) => reply({ id, ok: true, value }),
      (err) => reply({ id, ok: false, error: toWire(err) }),
    );
  });
  const offChange = observed.subscribe((kind) =>
    send({ type: 'changed', version: observed.getVersion(), ...(kind ? { kind } : {}) }),
  );
  const offUnlock =
    unlocks === false
      ? undefined
      : observed.onUnlock?.((batch) => {
          const out = unlocks === true ? batch : batch.filter(unlocks);
          if (out.length) send({ type: 'unlocked', unlocks: out });
        });

  return () => {
    disposed = true;
    offMessage();
    offChange();
    offUnlock?.();
  };
}

function toWire(err: unknown): { name: string; message: string } {
  if (err instanceof Error) return { name: err.name, message: err.message };
  return { name: 'Error', message: String(err) };
}
