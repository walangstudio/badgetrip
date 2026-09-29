import { mount } from '@vue/test-utils';
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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { createBadgetrip, useAchievementCatalog, useBadgetrip, useScore } from '../src/index.js';

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

describe('Vue composables over an @walangstudio/badgetrip-ipc remote engine', () => {
  it('update when the served engine changes', async () => {
    const remote = remoteEngine();
    let out!: {
      score: ReturnType<typeof useScore>;
      list: ReturnType<typeof useAchievementCatalog>;
      engine: RemoteEngine['engine'];
    };
    mount(
      defineComponent({
        setup() {
          out = {
            score: useScore('u', 'honor'),
            list: useAchievementCatalog('u'),
            engine: useBadgetrip<RemoteEngine['engine']>(),
          };
          return () => null;
        },
      }),
      { global: { plugins: [createBadgetrip(remote)] } },
    );
    await vi.waitFor(() => expect(out.list.data.value).toHaveLength(1));
    await out.engine.emit({ id: 'w', actor: 'u', type: 'win', ts: 0, payload: {} });
    await vi.waitFor(() => {
      expect(out.score.data.value).toBe(2);
      expect(out.list.data.value?.[0]?.unlocked).toBe(true);
    });
  });
});
