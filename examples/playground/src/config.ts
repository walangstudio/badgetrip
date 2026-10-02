import {
  type CelebrationResolverOptions,
  type Motion,
  type Theme,
  type ThemeInput,
  defineTheme,
} from '@walangstudio/badgetrip-assets';
import type { AchievementSpec, Definitions } from '@walangstudio/badgetrip-core';
import type { TabKey } from './tabs.js';

/** The page logic that needs no DOM, so the tests run exactly what the page runs. */

export type EngineConfig = Omit<Definitions, 'achievements'> & {
  achievements?: Record<string, AchievementSpec>;
};
export type Parts = {
  achievements: EngineConfig;
  theme: Partial<ThemeInput>;
  animations: CelebrationResolverOptions;
  sounds: CelebrationResolverOptions;
  popups: CelebrationResolverOptions;
};
export type Problem = { key: TabKey; text: string; line?: number; column?: number };

/**
 * Let a snippet copied from the docs run as one expression: drop a leading
 * `export const x =` (or `export default`) and a trailing `;` with its comment. Line numbers
 * stay the same, so error positions still match the editor.
 */
export function prepare(code: string): string {
  return code
    .replace(
      /^((?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*)(?:export\s+default\s+|(?:export\s+)?(?:const|let|var)\s+[\w$]+\s*=\s*)/,
      '$1',
    )
    .replace(/;\s*(?:\/\/[^\n]*)?\s*$/, '');
}

/** One problem per line of a validation error, without the "invalid badgetrip ..." header. */
export function issues(key: TabKey, err: unknown): Problem[] {
  return String(err instanceof Error ? err.message : err)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^invalid badgetrip \w+:$/.test(l))
    .map((l) => ({ key, text: key === 'theme' ? l : l.replace(/^celebrations: /, '') }));
}

/**
 * The picked base theme, then the Theme, Sounds, Popups and Animations tabs as layers (so
 * each tab's mistakes are reported under its name), then the Entrance and Exit pickers as
 * the default motion.
 */
export function buildTheme(
  parts: Parts,
  base: Theme,
  motion: { enter?: Motion; exit?: Motion },
  problems: Problem[],
): Theme | undefined {
  const before = problems.length;
  const layer = (from: Theme, key: TabKey, input: Partial<ThemeInput>) => {
    try {
      return defineTheme({ name: 'playground', extends: from, ...input } as ThemeInput);
    } catch (err) {
      problems.push(...issues(key, err));
      return from;
    }
  };
  let t = layer(base, 'theme', parts.theme);
  t = layer(t, 'sounds', { celebrations: parts.sounds });
  t = layer(t, 'popups', { celebrations: parts.popups });
  t = layer(t, 'animations', { celebrations: parts.animations });
  if (problems.length > before) return undefined;
  return Object.keys(motion).length
    ? defineTheme({ name: t.name, extends: t, celebrations: { default: { animation: motion } } })
    : t;
}
