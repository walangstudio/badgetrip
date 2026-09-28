import {
  createEngine,
  memoryAchievementStore,
  memoryEventStore,
  memoryScoreStore,
  memoryStreakStore,
  observe,
} from '@walangstudio/badgetrip-core';
import { expect, it } from 'vitest';
import { defineBadgetripElements, renderCatalog } from '../src/index.js';

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
});
