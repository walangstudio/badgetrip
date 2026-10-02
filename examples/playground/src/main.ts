import { type Motion, type Theme, themes } from '@walangstudio/badgetrip-assets';
import {
  type AchievementDef,
  type AchievementView,
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
import { type EngineConfig, type Parts, type Problem, buildTheme, issues } from './config.js';
import { evaluate } from './evaluate.js';
import { type TabKey, scope, tabs } from './tabs.js';

const ACTOR = 'player';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const message = el('message');
const eventsBox = el('events');
const previewCode = el<HTMLSelectElement>('preview-code');
const stats = el('stats');
const catalog = el('catalog');
const soundBox = el<HTMLInputElement>('sound');
const secretBox = el<HTMLInputElement>('secret');
const themePicker = el<HTMLSelectElement>('theme');
const samplePicker = el<HTMLSelectElement>('sample');
const tabList = el('tabs');
const help = el('help');

const option = (value: string, text = value) => {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = text;
  return o;
};

// The built-in themes plus the all-GIF sample theme.
const bases: Record<string, Theme> = { ...themes, animated: animatedTheme };
themePicker.replaceChildren(...Object.keys(bases).map((name) => option(name)));

// Entrance and exit pickers: blank keeps the configured motion.
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
for (const picker of [enterPicker, exitPicker])
  picker.replaceChildren(...['', ...MOTIONS].map((m) => option(m, m || 'as configured')));

// One tab and one editor per part of the config.
const editors = {} as Record<TabKey, HTMLTextAreaElement>;
const panels = {} as Record<TabKey, HTMLDivElement>;
const tabButtons = {} as Record<TabKey, HTMLButtonElement>;
const loaded = {} as Record<TabKey, string>;
const chosen = {} as Record<TabKey, number>;
let active: TabKey = 'achievements';
for (const tab of tabs) {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = `tab-${tab.key}`;
  button.textContent = tab.label;
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-controls', `panel-${tab.key}`);
  button.addEventListener('click', () => show(tab.key));
  tabList.appendChild(button);
  tabButtons[tab.key] = button;

  const editor = document.createElement('textarea');
  editor.id = `code-${tab.key}`;
  editor.spellcheck = false;
  editor.autocomplete = 'off';
  editor.setAttribute('aria-label', `${tab.label} config`);
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      apply();
    }
  });
  const panel = document.createElement('div');
  panel.id = `panel-${tab.key}`;
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', button.id);
  panel.appendChild(editor);
  el('editors').appendChild(panel);
  panels[tab.key] = panel;
  editors[tab.key] = editor;
}

const tabOf = (key: TabKey) => tabs.find((t) => t.key === key) ?? (tabs[0] as (typeof tabs)[0]);

function show(key: TabKey, focus = false) {
  active = key;
  for (const tab of tabs) {
    const on = tab.key === key;
    tabButtons[tab.key].setAttribute('aria-selected', String(on));
    tabButtons[tab.key].tabIndex = on ? 0 : -1;
    panels[tab.key].hidden = !on;
  }
  const tab = tabOf(key);
  samplePicker.replaceChildren(...tab.samples.map((s, i) => option(String(i), s.label)));
  samplePicker.value = String(chosen[key] ?? 0);
  help.innerHTML = tab.help;
  // On a phone the tab strip scrolls; keep the open tab in sight.
  const strip = tabList.getBoundingClientRect();
  const button = tabButtons[key].getBoundingClientRect();
  if (button.left < strip.left || button.right > strip.right)
    tabList.scrollLeft += button.left - strip.left - 16;
  if (focus) tabButtons[key].focus();
}

// Arrow keys move between tabs, as in any tablist.
tabList.addEventListener('keydown', (e) => {
  const i = tabs.findIndex((t) => t.key === active);
  const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
  if (!step) return;
  e.preventDefault();
  show((tabs[(i + step + tabs.length) % tabs.length] as (typeof tabs)[0]).key, true);
});

let session:
  | {
      engine: Engine;
      notifier: Notifier;
      defs: AchievementDef[];
      parts: Parts;
      theme: Theme;
      picks: Picks;
      stop: () => void;
    }
  | undefined;

/** The right-hand controls that feed the build, so a failed Apply can put them back. */
type Picks = { theme: string; enter: string; exit: string; sound: boolean };
const picks = (): Picks => ({
  theme: themePicker.value,
  enter: enterPicker.value,
  exit: exitPicker.value,
  sound: soundBox.checked,
});
const restore = (p: Picks) => {
  themePicker.value = p.theme;
  enterPicker.value = p.enter;
  exitPicker.value = p.exit;
  soundBox.checked = p.sound;
};

const build = (parts: Parts, problems: Problem[]) =>
  buildTheme(
    parts,
    bases[themePicker.value] ?? themes.classic,
    {
      ...(enterPicker.value ? { enter: enterPicker.value as Motion } : {}),
      ...(exitPicker.value ? { exit: exitPicker.value as Motion } : {}),
    },
    problems,
  );

/** The status after a successful build: a warning when a preset name is unknown. */
function settled(theme: Theme, defs: AchievementDef[], ok: string): 'ok' | 'warning' {
  const missing = theme.celebrations.missing(defs);
  if (!missing.length) {
    say(ok);
    return 'ok';
  }
  say(`Applied, but no preset is named ${missing.map((m) => `'${m}'`).join(', ')}.`, true);
  return 'warning';
}

const say = (text: string, error = false) => {
  message.textContent = text;
  message.classList.toggle('error', error);
};

/** Every event type the config reacts to, so each gets a button. */
function eventTypes(cfg: EngineConfig): string[] {
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

/**
 * List every problem, mark the tabs that have one, and put the cursor on the first: on its
 * line when the browser gave one, else on the first name it quotes (like 'icno').
 */
function report(problems: Problem[]) {
  for (const tab of tabs) {
    const bad = problems.some((p) => p.key === tab.key);
    tabButtons[tab.key].classList.toggle('invalid', bad);
    tabButtons[tab.key].setAttribute(
      'aria-label',
      bad ? `${tab.label} (has a mistake)` : tab.label,
    );
  }
  const first = problems[0];
  if (!first) return;
  say(
    problems
      .map((p) => {
        const where = p.line ? `, line ${p.line}, column ${p.column}` : '';
        return `${tabOf(p.key).label} tab${where}: ${p.text}`;
      })
      .join('\n'),
    true,
  );
  show(first.key);
  const editor = editors[first.key];
  const text = editor.value;
  let at = -1;
  let length = 1;
  if (first.line) {
    const lines = text.split('\n');
    at =
      lines.slice(0, first.line - 1).reduce((n, l) => n + l.length + 1, 0) +
      Math.min(Math.max((first.column ?? 1) - 1, 0), lines[first.line - 1]?.length ?? 0);
  } else {
    // Prefer the name used as a key over a mention in a comment or a value.
    const name = /'([^']+)'/.exec(first.text)?.[1];
    if (name) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const key = new RegExp(`(?<![\\w$])['"]?${escaped}['"]?\\s*:`);
      const m = key.exec(text);
      at = m ? m.index + (m[0].startsWith(name) ? 0 : 1) : text.indexOf(name);
      length = name.length;
    }
  }
  editor.focus();
  if (at >= 0) editor.setSelectionRange(at, at + length);
}

/** Run every tab's code. Returns the parts, or lists each tab's mistake and returns nothing. */
function read(): Parts | undefined {
  const parts: Record<string, unknown> = {};
  const problems: Problem[] = [];
  for (const tab of tabs) {
    const r = evaluate(editors[tab.key].value, scope);
    if (!r.ok) problems.push({ key: tab.key, text: r.message, line: r.line, column: r.column });
    else if (typeof r.value !== 'object' || r.value === null || Array.isArray(r.value))
      problems.push({ key: tab.key, text: 'write one object, { ... }', line: 1, column: 1 });
    else parts[tab.key] = r.value;
  }
  report(problems);
  return problems.length ? undefined : (parts as Parts);
}

/** Build and start a session from the tabs. On any mistake the running session is kept. */
function apply(): 'ok' | 'warning' | 'failed' {
  const parts = read();
  if (!parts) return 'failed';
  // Build every part even if one fails, so every mistake shows at once.
  const problems: Problem[] = [];
  const attempt = <T>(fn: () => T): T | undefined => {
    try {
      return fn();
    } catch (err) {
      problems.push(...issues('achievements', err));
      return undefined;
    }
  };
  const { achievements = {}, ...definitions } = parts.achievements;
  const defs = attempt(() => defineAchievements(achievements));
  const theme = build(parts, problems);
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
  report(problems);
  if (problems.length || !defs || !theme || !engine) return 'failed';

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
    parts,
    theme,
    picks: picks(),
    stop: () => {
      off();
      notifier.dispose();
    },
  };

  eventsBox.replaceChildren(
    ...eventTypes(parts.achievements).map((type) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = type;
      b.addEventListener('click', () => fire(type));
      return b;
    }),
  );
  const previewing = previewCode.value;
  previewCode.replaceChildren(...defs.map((d) => option(d.code, `${d.name} (${d.code})`)));
  if (defs.some((d) => d.code === previewing)) previewCode.value = previewing;

  void render();
  return settled(theme, defs, `Applied: ${defs.length} achievements. Fire some events.`);
}

/** Put a sample in a tab. The pickers that would hide it go back to their defaults. */
function load(key: TabKey, index: number) {
  const s = tabOf(key).samples[index];
  if (!s) return false;
  editors[key].value = loaded[key] = s.code;
  chosen[key] = index;
  if (key === 'theme') themePicker.value = 'classic';
  if (key === 'animations') enterPicker.value = exitPicker.value = '';
  if (s.sound) soundBox.checked = true;
  return true;
}

/** Picking a sample applies it at once. Edits in the tab are only replaced after asking. */
function pickSample() {
  const key = active;
  const index = Number(samplePicker.value);
  if (
    editors[key].value !== loaded[key] &&
    !window.confirm(`Replace your edits in the ${tabOf(key).label} tab with this sample?`)
  ) {
    samplePicker.value = String(chosen[key] ?? 0);
    return;
  }
  const before = picks();
  if (!load(key, index)) return;
  const result = apply();
  // Keep the controls matching the session that is still running.
  if (result === 'failed') restore(before);
  if (result === 'ok') say(tabOf(key).samples[index]?.note ?? '');
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
samplePicker.addEventListener('change', pickSample);
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
soundBox.addEventListener('change', () => {
  session?.notifier.update({ sound: soundBox.checked });
  if (session) session.picks.sound = soundBox.checked;
});
secretBox.addEventListener('change', () => void render());
/** Rebuild the theme from the pickers and switch the running session to it. */
function restyle() {
  const s = session;
  if (!s) return;
  const problems: Problem[] = [];
  const theme = build(s.parts, problems);
  if (!theme) {
    restore(s.picks);
    return report(problems);
  }
  s.theme = theme;
  s.picks = picks();
  applyTheme(theme);
  s.notifier.update({ theme });
  void render();
  const status = [
    s.parts.theme.extends
      ? `The Theme tab extends '${String(s.parts.theme.extends)}', so the Theme picker has no effect.`
      : `Theme: ${themePicker.value}.`,
  ];
  if (enterPicker.value) status.push(`Entrance: ${enterPicker.value}.`);
  if (exitPicker.value) status.push(`Exit: ${exitPicker.value}.`);
  settled(theme, s.defs, `${status.join(' ')} Fire an event or preview a celebration.`);
}
for (const picker of [themePicker, enterPicker, exitPicker])
  picker.addEventListener('change', restyle);

for (const tab of tabs) load(tab.key, 0);
show('achievements');
if (apply() === 'ok') say(tabOf('achievements').samples[0]?.note ?? '');
