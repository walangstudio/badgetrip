import { act, renderHook, waitFor } from '@testing-library/react';
// @vitest-environment jsdom
import {
  createEngine,
  defineAchievements,
  memoryAchievementStore,
  memoryEventStore,
  memoryScoreStore,
  memoryStreakStore,
  rules,
} from '@walangstudio/badgetrip-core';
import {
  type RemoteEngine,
  connectEngine,
  messagePortTransport,
  serveEngine,
} from '@walangstudio/badgetrip-ipc';
import {
  BadgetripProvider,
  useAchievementCatalog,
  useBadgetrip,
  useScore,
} from '@walangstudio/badgetrip-react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

function remoteEngine() {
  const engine = createEngine({
    events: memoryEventStore(),
    scores: memoryScoreStore(),
    achievements: memoryAchievementStore(),
    streaks: memoryStreakStore(),
    clock: { now: () => 0 },
    definitions: {
      scores: ['honor'],
      points: [{ on: 'win', score: 'honor', delta: 2 }],
      achievements: defineAchievements({
        first: { name: 'First', description: '', when: rules.count('win', 1) },
      }),
    },
  });
  const { port1, port2 } = new MessageChannel();
  const stop = serveEngine(engine, messagePortTransport(port1));
  const remote = connectEngine(messagePortTransport(port2));
  cleanups.push(() => {
    remote.dispose();
    stop();
    port1.close();
    port2.close();
  });
  return remote;
}

describe('React hooks over an @walangstudio/badgetrip-ipc remote engine', () => {
  it('re-render when the served engine changes', async () => {
    const remote = remoteEngine();
    const { result } = renderHook(
      () => ({
        score: useScore('u', 'honor'),
        list: useAchievementCatalog('u'),
        engine: useBadgetrip<RemoteEngine['engine']>(),
      }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <BadgetripProvider engine={remote}>{children}</BadgetripProvider>
        ),
      },
    );
    await waitFor(() => expect(result.current.list).toHaveLength(1));
    await act(async () => {
      await result.current.engine.emit({
        id: 'w',
        actor: 'u',
        type: 'win',
        ts: 0,
        payload: {},
      });
    });
    await waitFor(() => {
      expect(result.current.score).toBe(2);
      expect(result.current.list[0]?.unlocked).toBe(true);
    });
  });
});
