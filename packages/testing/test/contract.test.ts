import {
  type Stores,
  memoryAchievementStore,
  memoryEventStore,
  memoryScoreStore,
  memoryStreakStore,
} from '@badgetrip/core';
import { runStoreContract } from '@badgetrip/testing';

// The in-memory reference is the canonical store; running the contract against it
// both verifies the reference and exercises the conformance kit itself.
const makeMemoryStores = (): Stores => ({
  events: memoryEventStore(),
  scores: memoryScoreStore(),
  achievements: memoryAchievementStore(),
  streaks: memoryStreakStore(),
});

runStoreContract(makeMemoryStores);
