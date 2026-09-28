import type { Pool } from 'pg';
import { pgAchievementStore } from './achievement-store.js';
import { pgEventStore } from './event-store.js';
import { migrate } from './migrate.js';
import { pgScoreStore } from './score-store.js';
import { pgStreakStore } from './streak-store.js';

export { pgEventStore } from './event-store.js';
export { pgScoreStore } from './score-store.js';
export { pgAchievementStore } from './achievement-store.js';
export { pgStreakStore } from './streak-store.js';
export { migrate } from './migrate.js';

export function pgStores(pool: Pool): {
  events: ReturnType<typeof pgEventStore>;
  scores: ReturnType<typeof pgScoreStore>;
  achievements: ReturnType<typeof pgAchievementStore>;
  streaks: ReturnType<typeof pgStreakStore>;
  migrate: () => Promise<void>;
} {
  return {
    events: pgEventStore(pool),
    scores: pgScoreStore(pool),
    achievements: pgAchievementStore(pool),
    streaks: pgStreakStore(pool),
    migrate: () => migrate(pool),
  };
}
