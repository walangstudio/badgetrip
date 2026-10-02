import {
  type CelebrationResolverOptions,
  type Motion,
  type Theme,
  type ThemeInput,
  defineTheme,
  themes,
} from '@walangstudio/badgetrip-assets';
import {
  type AchievementDef,
  type AchievementSpec,
  type AchievementView,
  type Definitions,
  type Engine,
  type RuleInput,
  createEngine,
  defineAchievements,
  memoryAchievementStore,
  memoryEventStore,
  memoryScoreStore,
  memoryStreakStore,
  observe,
  systemClock,
} from '@walangstudio/badgetrip-core';
import {
  type Notifier,
  applyTheme,
  createNotifier,
  renderCatalog,
} from '@walangstudio/badgetrip-html';
import { animatedTheme } from './animated.js';
import { jsonErrorAt } from './json.js';
import { samples } from './sample.js';

const ACTOR = 'player';
const DEFINITION_KEYS = [
  'scores',
  'points',
  'streaks',
  'achievements',
  'tiers',
  'leaderboards',
  'escalators',
];
const CONFIG_KEYS = [...DEFINITION_KEYS, 'celebrations', 'theme'];

type Config = Omit<Definitions, 'achievements'> & {
  achievements?: Record<string, AchievementSpec>;
  celebrations?: CelebrationResolverOptions;
  /** Tweaks on top of the theme picked in the page, e.g. { "style": { "accent": "#e11d48" } }. */
  theme?: Partial<ThemeInput>;
};

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const editor = el<HTMLTextAreaElement>('config');
const message = el('message');
const eventsBox = el('events');
const previewCode = el<HTMLSelectElement>('preview-code');
const stats = el('stats');
const catalog = el('catalog');
const soundBox = el<HTMLInputElement>('sound');
const secretBox = el<HTMLInputElement>('secret');
const themePicker = el<HTMLSelectElement>('theme');
const samplePicker = el<HTMLSelectElement>('sample');
samplePicker.replaceChildren(
  ...Object.entries(samples).map(([key, s]) => {
    const o = document.createElement('option');
    o.value = key;
    o.textContent = s.label;
    return o;
  }),
);
// The built-in themes plus the all-GIF sample theme.
const bases: Record<string, Theme> = { ...themes, animated: animatedTheme };
themePicker.replaceChildren(
  ...Object.keys(bases).map((name) => {
    const o = document.createElement('option');
    o.value = name;
    o.textContent = name;
    return o;
  }),
);

let session:
  | {
      engine: Engine;
      notifier: Notifier;
      defs: AchievementDef[];
      cfg: Config;
      theme: Theme;
      stop: () => void;
    }
  | undefined;

// Entrance and exit pickers: blank keeps the theme's own motion.
const MOTIONS: Motion[] = [
  'fade',
  'slide',
  'slide-up',
  'slide-down',
  'slide-left',
  'slide-right',
  'scale',
  'pop',
  'bounce',
  'none',
];
const enterPicker = el<HTMLSelectElement>('enter');
const exitPicker = el<HTMLSelectElement>('exit');
for (const picker of [enterPicker, exitPicker]) {
  picker.replaceChildren(
    ...['', ...MOTIONS].map((m) => {
      const o = document.createElement('option');
      o.value = m;
      o.textContent = m || 'theme default';
      return o;
    }),
  );
}

/** The picked theme, then the config's `theme` and `celebrations` blocks, then the motion pickers. */
function buildTheme(cfg: Config): Theme {
  const base = bases[themePicker.value] ?? themes.classic;
  // A broken `theme` block still lets `celebrations` be checked, so both sets of mistakes show.
  const errors: string[] = [];
  const layer = (from: Theme, input: Partial<ThemeInput>) => {
    try {
      return defineTheme({ name: 'playground', extends: from, ...input } as ThemeInput);
    } catch (err) {
      errors.push((err as Error).message);
      return from;
    }
  };
  let t = layer(base, cfg.theme ?? {});
  if (cfg.celebrations) t = layer(t, { celebrations: cfg.celebrations });
  if (errors.length) throw new Error(errors.join('\n'));
  const animation = {
    ...(enterPicker.value ? { enter: enterPicker.value as Motion } : {}),
    ...(exitPicker.value ? { exit: exitPicker.value as Motion } : {}),
  };
  return Object.keys(animation).length
    ? defineTheme({ name: t.name, extends: t, celebrations: { default: { animation } } })
    : t;
}

const say = (text: string, error = false) => {
  message.textContent = text;
  message.classList.toggle('error', error);
};

/** Every event type the config reacts to, so each gets a button. */
function eventTypes(cfg: Config): string[] {
  const types = new Set<string>();
  for (const p of cfg.points ?? []) types.add(p.on);
  for (const s of cfg.streaks ?? [])
    for (const t of [...s.tickEvents, ...s.resetEvents]) types.add(t);
  for (const e of cfg.escalators ?? [])
    for (const t of [...e.triggerEvents, ...e.resetEvents]) types.add(t);
  const walk = (r: RuleInput) => {
    if ('eventType' in r) types.add(r.eventType);
    if (r.kind === 'all' || r.kind === 'any') r.rules.forEach(walk);
  };
  for (const spec of Object.values(cfg.achievements ?? {})) walk(spec.when);
  return [...types].sort();
}

async function render() {
  const s = session;
  if (!s) return;
  const views = await s.engine.catalog(ACTOR);
  if (s !== session) return;
  catalog.innerHTML = renderCatalog(views, { secret: secretBox.checked, theme: s.theme });
  const scores = await Promise.all(
    s.engine.definitions.scores.map(
      async (code) => `${code}: ${await s.engine.score(ACTOR, code)}`,
    ),
  );
  const streaks = await Promise.all(
    s.engine.definitions.streaks.map(
      async (d) => `${d.code} streak: ${(await s.engine.streak(ACTOR, d.code)).current}`,
    ),
  );
  if (s !== session) return;
  const unlocked = views.filter((v) => v.unlocked).length;
  stats.textContent = [...scores, ...streaks, `${unlocked}/${views.length} unlocked`].join('  ·  ');
}

function fire(type: string, payload: Record<string, unknown> = {}) {
  const s = session;
  if (!s) return;
  const observed = observe(s.engine);
  observed.engine
    .emit({ id: crypto.randomUUID(), actor: ACTOR, type, ts: Date.now(), payload })
    .catch((err: Error) => say(err.message, true));
}

function apply(): boolean {
  let cfg: Config;
  try {
    cfg = JSON.parse(editor.value);
  } catch (err) {
    const at = jsonErrorAt(editor.value);
    const before = editor.value.slice(0, at).split('\n');
    const where = `line ${before.length}, column ${(before.at(-1)?.length ?? 0) + 1}`;
    say(`That isn't valid JSON (${where}): ${(err as Error).message}`, true);
    editor.focus();
    editor.setSelectionRange(at, at + 1);
    return false;
  }
  if (typeof cfg !== 'object' || cfg === null || Array.isArray(cfg)) {
    say('The config must be a JSON object: { "achievements": { ... } }.', true);
    return false;
  }
  // Build every part even if one fails, so every mistake shows at once.
  const errors: string[] = Object.keys(cfg)
    .filter((k) => !CONFIG_KEYS.includes(k))
    .map((k) => `unknown key '${k}': the config takes ${CONFIG_KEYS.join(', ')}`);
  const attempt = <T>(fn: () => T): T | undefined => {
    try {
      return fn();
    } catch (err) {
      errors.push((err as Error).message);
      return undefined;
    }
  };
  const { achievements = {}, ...rest } = cfg;
  const definitions = Object.fromEntries(
    Object.entries(rest).filter(([k]) => DEFINITION_KEYS.includes(k)),
  );
  const defs = attempt(() => defineAchievements(achievements));
  const theme = attempt(() => buildTheme(cfg));
  const engine =
    defs &&
    attempt(() =>
      createEngine({
        events: memoryEventStore(),
        scores: memoryScoreStore(),
        achievements: memoryAchievementStore(),
        streaks: memoryStreakStore(),
        clock: systemClock,
        definitions: { ...definitions, achievements: defs },
      }),
    );
  if (errors.length || !defs || !theme || !engine) {
    say(errors.join('\n'), true);
    return false;
  }

  session?.stop();
  const observed = observe(engine);
  applyTheme(theme);
  const notifier = createNotifier(observed, {
    actor: ACTOR,
    theme,
    sound: soundBox.checked,
    onError: (err) => say(String(err), true),
  });
  const off = observed.subscribe(() => void render());
  session = {
    engine,
    notifier,
    defs,
    cfg,
    theme,
    stop: () => {
      off();
      notifier.dispose();
    },
  };

  eventsBox.replaceChildren(
    ...eventTypes(cfg).map((type) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = type;
      b.addEventListener('click', () => fire(type));
      return b;
    }),
  );
  previewCode.replaceChildren(
    ...defs.map((d) => {
      const o = document.createElement('option');
      o.value = d.code;
      o.textContent = `${d.name} (${d.code})`;
      return o;
    }),
  );

  const missing = theme.celebrations.missing(defs);
  say(
    missing.length
      ? `Applied, but no preset is named ${missing.map((m) => `'${m}'`).join(', ')}.`
      : `Applied: ${defs.length} achievements. Fire some events.`,
    missing.length > 0,
  );
  void render();
  return true;
}

/** Load a sample into the editor, with the pickers back on their defaults so it shows as written. */
let loaded = '';
function loadSample() {
  const s = samples[samplePicker.value];
  if (!s) return;
  if (editor.value !== loaded && !window.confirm('Replace your edits with this sample?')) return;
  loaded = JSON.stringify(s.config, null, 2);
  editor.value = loaded;
  themePicker.value = 'classic';
  enterPicker.value = '';
  exitPicker.value = '';
  soundBox.checked = s.sound === true;
  if (apply()) say(s.note);
}

/** Celebrate one achievement as if it just unlocked, without changing any state. */
function preview() {
  const def = session?.defs.find((d) => d.code === previewCode.value);
  if (!def || !session) return;
  const view: AchievementView = {
    code: def.code,
    name: def.name,
    description: def.description,
    ...(def.icon !== undefined ? { icon: def.icon } : {}),
    ...(def.category !== undefined ? { category: def.category } : {}),
    ...(def.series ? { series: def.series } : {}),
    ...(def.celebration !== undefined ? { celebration: def.celebration } : {}),
    ...(def.hidden ? { hidden: true as const } : {}),
    rarity: def.rarity,
    points: def.points ?? 0,
    unlocked: true,
    concealed: false,
    progress: { current: 1, target: 1, percent: 100 },
  };
  session.notifier.show(view);
}

el('apply').addEventListener('click', apply);
el('restart').addEventListener('click', apply);
el('load').addEventListener('click', loadSample);
el('preview').addEventListener('click', preview);
el<HTMLFormElement>('custom').addEventListener('submit', (e) => {
  e.preventDefault();
  const type = el<HTMLInputElement>('custom-type').value.trim();
  const raw = el<HTMLInputElement>('custom-payload').value.trim();
  let payload: Record<string, unknown> = {};
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      say('The payload must be JSON, like {"level": 3}.', true);
      return;
    }
  }
  if (type) fire(type, payload);
});
editor.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    apply();
  }
});
soundBox.addEventListener('change', () => session?.notifier.update({ sound: soundBox.checked }));
secretBox.addEventListener('change', () => void render());
/** Rebuild the theme from the pickers and switch the running session to it. */
function restyle() {
  const s = session;
  if (!s) return;
  let theme: Theme;
  try {
    theme = buildTheme(s.cfg);
  } catch (err) {
    say((err as Error).message, true);
    return;
  }
  s.theme = theme;
  applyTheme(theme);
  s.notifier.update({ theme });
  const parts = [`Theme: ${themePicker.value}.`];
  if (enterPicker.value) parts.push(`Entrance: ${enterPicker.value}.`);
  if (exitPicker.value) parts.push(`Exit: ${exitPicker.value}.`);
  say(`${parts.join(' ')} Fire an event or preview a celebration.`);
  void render();
}
for (const picker of [themePicker, enterPicker, exitPicker])
  picker.addEventListener('change', restyle);

loadSample();
