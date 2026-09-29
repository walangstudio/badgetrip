import { type CelebrationResolverOptions, createCelebrationResolver } from '@badgetrip/assets';
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
} from '@badgetrip/core';
import { type Notifier, createNotifier, renderCatalog } from '@badgetrip/html';
import { sample } from './sample.js';

const ACTOR = 'player';

type Config = Omit<Definitions, 'achievements'> & {
  achievements?: Record<string, AchievementSpec>;
  celebrations?: CelebrationResolverOptions;
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

let session:
  | { engine: Engine; notifier: Notifier; defs: AchievementDef[]; stop: () => void }
  | undefined;

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
  catalog.innerHTML = renderCatalog(views, { secret: secretBox.checked });
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

function apply() {
  let cfg: Config;
  try {
    cfg = JSON.parse(editor.value);
  } catch (err) {
    say(`That isn't valid JSON: ${(err as Error).message}`, true);
    return;
  }
  // Build both halves even if one fails, so every mistake shows at once.
  const errors: string[] = [];
  const attempt = <T>(fn: () => T): T | undefined => {
    try {
      return fn();
    } catch (err) {
      errors.push((err as Error).message);
      return undefined;
    }
  };
  const { achievements = {}, celebrations: celebrationOptions = {}, ...rest } = cfg;
  const defs = attempt(() => defineAchievements(achievements));
  const celebrations = attempt(() => createCelebrationResolver(celebrationOptions));
  const engine =
    defs &&
    attempt(() =>
      createEngine({
        events: memoryEventStore(),
        scores: memoryScoreStore(),
        achievements: memoryAchievementStore(),
        streaks: memoryStreakStore(),
        clock: systemClock,
        definitions: { ...rest, achievements: defs },
      }),
    );
  if (!defs || !celebrations || !engine) {
    say(errors.join('\n'), true);
    return;
  }

  session?.stop();
  const observed = observe(engine);
  const notifier = createNotifier(observed, {
    actor: ACTOR,
    celebrations,
    sound: soundBox.checked,
    onError: (err) => say(String(err), true),
  });
  const off = observed.subscribe(() => void render());
  session = {
    engine,
    notifier,
    defs,
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

  const missing = celebrations.missing(defs);
  say(
    missing.length
      ? `Applied, but no preset is named ${missing.map((m) => `'${m}'`).join(', ')}.`
      : `Applied: ${defs.length} achievements. Fire some events.`,
    missing.length > 0,
  );
  void render();
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
el('sample').addEventListener('click', () => {
  editor.value = JSON.stringify(sample, null, 2);
  apply();
});
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

editor.value = JSON.stringify(sample, null, 2);
apply();
