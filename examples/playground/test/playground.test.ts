import { type ThemeInput, defineTheme, themes } from '@walangstudio/badgetrip-assets';
import {
  createEngine,
  defineAchievements,
  memoryAchievementStore,
  memoryEventStore,
  memoryScoreStore,
  memoryStreakStore,
  systemClock,
} from '@walangstudio/badgetrip-core';
import { describe, expect, it } from 'vitest';
import { type TabKey, scope, tabs } from '../src/tabs.js';

// The page runs a tab through a script element for error positions; the value is the same.
const run = (code: string) =>
  new Function(...Object.keys(scope), `'use strict'; return (\n${code}\n);`)(
    ...Object.values(scope),
  );

/** Build what Apply builds, from one code string per tab. */
function build(code: Record<TabKey, string>) {
  const part = (key: TabKey) => run(code[key]);
  const { achievements, ...definitions } = part('achievements');
  const defs = defineAchievements(achievements);
  createEngine({
    events: memoryEventStore(),
    scores: memoryScoreStore(),
    achievements: memoryAchievementStore(),
    streaks: memoryStreakStore(),
    clock: systemClock,
    definitions: { ...definitions, achievements: defs },
  });
  let t = defineTheme({ name: 'p', extends: themes.classic, ...part('theme') } as ThemeInput);
  for (const key of ['sounds', 'popups', 'animations'] as const)
    t = defineTheme({ name: 'p', extends: t, celebrations: part(key) });
  return t.celebrations.missing(defs);
}

const firsts = Object.fromEntries(tabs.map((t) => [t.key, t.samples[0]?.code])) as Record<
  TabKey,
  string
>;

describe('tab samples', () => {
  for (const tab of tabs)
    for (const sample of tab.samples)
      it(`${tab.label}: ${sample.label} runs with the other tabs' first samples`, () => {
        expect(build({ ...firsts, [tab.key]: sample.code })).toEqual([]);
      });
});
