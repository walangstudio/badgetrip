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
import { connectEngine, messagePortTransport, serveEngine } from '@walangstudio/badgetrip-ipc';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineBadgetripElements } from '../src/index.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
  document.body.innerHTML = '';
});

describe('custom elements over an @walangstudio/badgetrip-ipc remote engine', () => {
  it('<catalog> updates when the served engine changes', async () => {
    const engine = createEngine({
      events: memoryEventStore(),
      scores: memoryScoreStore(),
      achievements: memoryAchievementStore(),
      streaks: memoryStreakStore(),
      clock: { now: () => 0 },
      definitions: {
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

    defineBadgetripElements(remote, { tagPrefix: 'rmt' });
    const host = document.createElement('div');
    host.innerHTML = '<rmt-catalog actor="u"></rmt-catalog>';
    document.body.append(host);
    const unlocked = () =>
      [...host.querySelectorAll('figure')].map((f) => (f as HTMLElement).dataset.unlocked);

    await vi.waitFor(() => expect(unlocked()).toEqual(['false']));
    await remote.engine.emit({ id: 'w', actor: 'u', type: 'win', ts: 0, payload: {} });
    await vi.waitFor(() => expect(unlocked()).toEqual(['true']));
  });
});
