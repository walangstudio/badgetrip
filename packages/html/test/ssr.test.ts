import {
  createEngine,
  memoryAchievementStore,
  memoryEventStore,
  memoryScoreStore,
  memoryStreakStore,
  observe,
} from '@walangstudio/badgetrip-core';
import { expect, it } from 'vitest';
import { createNotifier, defineBadgetripElements, renderCatalog } from '../src/index.js';

it('imports, renders and defines without a DOM', () => {
  expect(typeof customElements).toBe('undefined');
  const engine = createEngine({
    events: memoryEventStore(),
    scores: memoryScoreStore(),
    achievements: memoryAchievementStore(),
    streaks: memoryStreakStore(),
    clock: { now: () => 0 },
    definitions: {},
  });
  expect(() => defineBadgetripElements(observe(engine))).not.toThrow();
  expect(renderCatalog([])).toMatch(/^<div style="display:grid/);
  const n = createNotifier(observe(engine), { sound: true });
  expect(() => {
    n.update({ volume: 0.2 });
    n.dismissAll();
    n.dispose();
  }).not.toThrow();
  expect(() => createNotifier(observe(engine), { volume: 5 })).toThrow(/volume/);
});
