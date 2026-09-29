import type { ChangeKind, Engine, Unlock } from '@walangstudio/badgetrip-core';

/** A bidirectional message channel. `onMessage` returns an unsubscribe. */
export type Transport = {
  send(msg: unknown): void;
  onMessage(cb: (msg: unknown) => void): () => void;
};

/** Every engine method that can cross a transport. `definitions` never does. */
export const REMOTE_METHODS = [
  'emit',
  'replay',
  'seed',
  'refresh',
  'score',
  'tier',
  'leaderboard',
  'achievements',
  'streak',
  'escalator',
  'progress',
  'catalog',
] as const;

export type RemoteMethod = (typeof REMOTE_METHODS)[number];

/**
 * Served unless `serveEngine` is given `methods`. Excludes `seed` (unvalidated,
 * non-idempotent bulk writes of scores/achievements/streaks) and `replay` (bulk emit of
 * a caller-chosen log). Both are admin operations; opt in only for a trusted peer.
 */
export const DEFAULT_METHODS = [
  'emit',
  'refresh',
  'score',
  'tier',
  'leaderboard',
  'achievements',
  'streak',
  'escalator',
  'progress',
  'catalog',
] as const satisfies readonly RemoteMethod[];

export type DefaultMethod = (typeof DEFAULT_METHODS)[number];

export type RemoteMethods = Pick<Engine, RemoteMethod>;

export type Request = { id: number | string; method: string; args: unknown[] };

export type Response =
  | { id: number | string; ok: true; value: unknown }
  | {
      id: number | string;
      ok: false;
      error: { name: string; message: string };
    };

export type Changed = { type: 'changed'; version: number; kind?: ChangeKind };

/** Pushed after `Changed` when the change unlocked achievements. */
export type Unlocked = { type: 'unlocked'; unlocks: Unlock[] };

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
