import { existsSync } from 'node:fs';
import { themes } from '@walangstudio/badgetrip-assets';
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
import { type Parts, type Problem, buildTheme, prepare } from '../src/config.js';
import { type TabKey, scope, tabs } from '../src/tabs.js';

// The page runs a tab through a script element for error positions; the value is the same.
const run = (code: string) =>
  new Function(...Object.keys(scope), `'use strict'; return (\n${prepare(code)}\n);`)(
    ...Object.values(scope),
  );

/** Build what Apply builds, from one code string per tab, with the page's own buildTheme. */
function build(code: Record<TabKey, string>) {
  const parts = Object.fromEntries(tabs.map((t) => [t.key, run(code[t.key])])) as Parts;
  const { achievements, ...definitions } = parts.achievements;
  const defs = defineAchievements(achievements ?? {});
  createEngine({
    events: memoryEventStore(),
    scores: memoryScoreStore(),
    achievements: memoryAchievementStore(),
    streaks: memoryStreakStore(),
    clock: systemClock,
    definitions: { ...definitions, achievements: defs },
  });
  const problems: Problem[] = [];
  const theme = buildTheme(parts, themes.classic, {}, problems);
  expect(problems).toEqual([]);
  return theme?.celebrations.missing(defs);
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
        for (const [, file] of sample.code.matchAll(/'(samples\/[^']+)'/g))
          expect(existsSync(new URL(`../public/${file}`, import.meta.url)), file).toBe(true);
      });
});

describe('prepare', () => {
  it('lets a docs snippet run as one expression, keeping line numbers', () => {
    expect(prepare("export const t = defineTheme({\n  name: 'x',\n}); // from the docs")).toBe(
      "defineTheme({\n  name: 'x',\n})",
    );
    expect(prepare('// a note\nconst x = { a: 1 };')).toBe('// a note\n{ a: 1 }');
    expect(prepare('export default {}')).toBe('{}');
    expect(prepare("{ a: 'b;' }")).toBe("{ a: 'b;' }");
    expect(prepare('const x =\n{ a: 1 }')).toBe('\n{ a: 1 }');
    expect(prepare('/* export const y = */ { a: 1 }')).toBe('/* export const y = */ { a: 1 }');
  });
});

describe('buildTheme', () => {
  it('reports each tab under its own key, and the pickers set the default motion', () => {
    const parts = Object.fromEntries(tabs.map((t) => [t.key, run(firsts[t.key])])) as Parts;
    const problems: Problem[] = [];
    buildTheme(
      { ...parts, theme: { styel: {} } as never, popups: { default: { positon: 1 } } as never },
      themes.classic,
      {},
      problems,
    );
    expect(problems.map((p) => [p.key, p.text])).toEqual([
      ['theme', "unknown option 'styel'"],
      ['popups', "default: unknown option 'positon'"],
    ]);
    const t = buildTheme(parts, themes.classic, { enter: 'bounce' }, []);
    expect(t?.celebrations.resolve({ code: 'x' }).animation.enter).toBe('bounce');
  });
});
