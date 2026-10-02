import { defineTheme, themes } from '@walangstudio/badgetrip-assets';
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
import { jsonErrorAt } from '../src/json.js';
import { samples } from '../src/sample.js';

describe('samples', () => {
  for (const [key, { config }] of Object.entries(samples)) {
    it(`${key} is valid, as JSON too`, () => {
      const { achievements, celebrations, theme, ...definitions } = JSON.parse(
        JSON.stringify(config),
      );
      const engine = createEngine({
        events: memoryEventStore(),
        scores: memoryScoreStore(),
        achievements: memoryAchievementStore(),
        streaks: memoryStreakStore(),
        clock: systemClock,
        definitions: { ...definitions, achievements: defineAchievements(achievements) },
      });
      const t = defineTheme({ name: 'p', extends: themes.classic, ...theme, celebrations });
      expect(t.celebrations.missing(engine.definitions.achievements)).toEqual([]);
    });
  }
});

describe('jsonErrorAt', () => {
  const at = (text: string) => text.slice(jsonErrorAt(text), jsonErrorAt(text) + 3);
  it('points at the mistake', () => {
    expect(at('{\n  "a": ["x",]\n}')).toBe(']\n}');
    expect(at('{\n  "a": 1\n  "b": 2\n}')).toBe('"b"');
    expect(at("{\n  'a': 1\n}")).toBe("'a'");
    expect(at('{"hidden": tru, "b": 1}')).toBe(', "');
    expect(at(String.raw`{"a": "x\qy"}`)).toBe('qy"');
    expect(jsonErrorAt('{"a": [1')).toBe(8);
  });
});
