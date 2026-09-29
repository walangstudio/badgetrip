import {
  type Celebration,
  type CelebrationResolver,
  type CountFormat,
  type IconResolver,
  type Position,
  createCelebrationResolver,
  createIconResolver,
  crossesMilestone,
  defaultCountFormat,
  displayIcon,
  safeSrc,
} from '@badgetrip/assets';
import {
  type AchievementView,
  type Engine,
  type Observable,
  type ProgressChange,
  toObservable,
  watchProgress,
  watchUnlocks,
} from '@badgetrip/core';
import { createPlayer } from './audio.js';
import { startConfetti } from './confetti.js';

export type NotifierLabels = {
  /** Accessible label of the close button. Default `'Close'`. */
  close?: string;
  /** Text of the summary toast when too many unlocks queue up. */
  more?: (count: number) => string;
  /** Wording of the count in progress popups. Default "3/5". */
  count?: CountFormat;
};

export type NotifierOptions = {
  /** How each unlock is celebrated. Defaults to `createCelebrationResolver()`. */
  celebrations?: CelebrationResolver;
  /** Icons for the popups. Defaults to the built-in pack. */
  icons?: IconResolver;
  /**
   * Only celebrate this actor (the signed-in user), or actors the predicate accepts.
   * Progress popups need a single actor, so they only run when this is a string.
   */
  actor?: string | ((actor: string) => boolean);
  /** Play sounds. Default false; browsers also need one user gesture first. */
  sound?: boolean;
  /** 0-1. Default 0.5. */
  volume?: number;
  /** Silence sounds without turning them off. */
  muted?: boolean;
  /** Toasts shown at once per position. Default 3; the rest wait their turn. */
  maxVisible?: number;
  /** Waiting toasts before the rest collapse into one "+N more" toast. Default 10. */
  maxQueue?: number;
  /** Where the overlay is attached. Default `document.body`. */
  root?: Element;
  /** Stacking order of the overlay. Default 2147483000, above almost everything. */
  zIndex?: number;
  labels?: NotifierLabels;
  /** Receives query errors. Defaults to rethrowing asynchronously. */
  onError?: (err: unknown) => void;
};

export type Notifier = {
  /** Change sound settings without re-creating the notifier. */
  update(opts: { sound?: boolean; volume?: number; muted?: boolean }): void;
  /** Celebrate one achievement now, for example to preview a celebration. */
  show(view: AchievementView): void;
  /** Close every popup and drop the queue. */
  dismissAll(): void;
  /** Stop listening and remove the overlay. Safe to call twice. */
  dispose(): void;
};

const POSITIONS: Position[] = [
  'top-left',
  'top',
  'top-right',
  'right',
  'bottom-right',
  'bottom',
  'bottom-left',
  'left',
];
const OPTION_KEYS = new Set([
  'celebrations',
  'icons',
  'actor',
  'sound',
  'volume',
  'muted',
  'maxVisible',
  'maxQueue',
  'root',
  'zIndex',
  'labels',
  'onError',
]);
const MOTION = '(prefers-reduced-motion: reduce)';
const RANK = { toast: 0, modal: 1, fullscreen: 2 } as const;

const CSS = `
.region{position:fixed;display:flex;flex-direction:column;gap:8px;padding:16px;
  width:min(360px,calc(100vw - 32px));box-sizing:border-box;pointer-events:none}
.region[data-position^=bottom]{flex-direction:column-reverse}
[data-position=top-left]{top:0;left:0}
[data-position=top]{top:0;left:50%;transform:translateX(-50%)}
[data-position=top-right]{top:0;right:0}
[data-position=right]{top:50%;right:0;transform:translateY(-50%)}
[data-position=bottom-right]{bottom:0;right:0}
[data-position=bottom]{bottom:0;left:50%;transform:translateX(-50%)}
[data-position=bottom-left]{bottom:0;left:0}
[data-position=left]{top:50%;left:0;transform:translateY(-50%)}
.toast,.dialog{pointer-events:auto;box-sizing:border-box;color:var(--badgetrip-fg,#f5f6fa);
  background:var(--badgetrip-bg,#1f2330);font:var(--badgetrip-font,14px/1.4 system-ui,sans-serif);
  box-shadow:0 10px 30px rgba(0,0,0,.3)}
.toast{position:relative;display:flex;align-items:center;gap:12px;padding:12px 40px 12px 12px;
  border-radius:var(--badgetrip-radius,12px);animation:badgetrip-in .25s ease-out}
.icon{box-sizing:border-box;flex:none;border-radius:50%;background:var(--badgetrip-icon-bg,#f5f6fa)}
.toast .icon{width:44px;height:44px;padding:6px}
.title{font-size:11px;letter-spacing:.06em;text-transform:uppercase;
  color:var(--badgetrip-accent,#f9c74f)}
.name{font-weight:700}
.description{opacity:.8}
.count{font-size:12px;opacity:.8;font-variant-numeric:tabular-nums}
.bar{display:block;width:100%;height:4px;margin-top:4px;accent-color:var(--badgetrip-accent,#f9c74f)}
.close{position:absolute;top:6px;right:6px;width:28px;height:28px;border:0;border-radius:50%;
  background:transparent;color:inherit;font:18px/1 system-ui,sans-serif;cursor:pointer}
.close:hover{background:rgba(255,255,255,.12)}
.close:focus-visible{outline:2px solid var(--badgetrip-accent,#f9c74f);outline-offset:1px}
.backdrop{position:fixed;inset:0;display:grid;place-items:center;padding:16px;pointer-events:auto;
  background:var(--badgetrip-backdrop,rgba(8,10,20,.6));animation:badgetrip-fade .2s ease-out}
.backdrop[data-layout=fullscreen]{background:var(--badgetrip-fullscreen-bg,
  radial-gradient(circle at 50% 40%,#2b2f45 0%,#0b0d17 70%))}
.dialog{position:relative;display:flex;flex-direction:column;align-items:center;gap:8px;
  text-align:center;padding:32px 40px;border-radius:var(--badgetrip-radius,16px);
  max-width:min(420px,100%);animation:badgetrip-pop .35s cubic-bezier(.2,1.4,.4,1)}
.dialog .icon{width:104px;height:104px;padding:14px}
.dialog .name{font-size:22px}
[data-layout=fullscreen] .dialog{background:transparent;box-shadow:none;max-width:min(640px,100%)}
[data-layout=fullscreen] .dialog .icon{width:168px;height:168px;padding:22px}
[data-layout=fullscreen] .name{font-size:clamp(28px,5vw,44px)}
[data-layout=fullscreen] .title{font-size:14px}
[data-layout=fullscreen] .description{font-size:16px}
[data-layout=fullscreen] .close{position:fixed;top:16px;right:16px;width:44px;height:44px;font-size:26px}
.live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@keyframes badgetrip-in{from{opacity:0;transform:translateY(-8px)}}
@keyframes badgetrip-fade{from{opacity:0}}
@keyframes badgetrip-pop{from{opacity:0;transform:scale(.8)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

const isInt = (v: unknown, lo: number, hi: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const isVolume = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

function checkSound(o: { sound?: unknown; volume?: unknown; muted?: unknown }, where: string) {
  if (o.sound !== undefined && typeof o.sound !== 'boolean') {
    throw new TypeError(`${where}: sound must be true or false`);
  }
  if (o.muted !== undefined && typeof o.muted !== 'boolean') {
    throw new TypeError(`${where}: muted must be true or false`);
  }
  if (o.volume !== undefined && !isVolume(o.volume)) {
    throw new TypeError(`${where}: volume must be a number from 0 to 1`);
  }
}

function checkOptions(o: NotifierOptions) {
  const where = 'createNotifier';
  if (typeof o !== 'object' || o === null)
    throw new TypeError(`${where}: options must be an object`);
  for (const k of Object.keys(o)) {
    if (!OPTION_KEYS.has(k)) throw new TypeError(`${where}: unknown option '${k}'`);
  }
  const resolver = (v: unknown) =>
    v === undefined ||
    (typeof v === 'object' &&
      v !== null &&
      typeof (v as { resolve?: unknown }).resolve === 'function');
  if (!resolver(o.celebrations)) {
    throw new TypeError(`${where}: celebrations must come from createCelebrationResolver()`);
  }
  if (!resolver(o.icons))
    throw new TypeError(`${where}: icons must come from createIconResolver()`);
  if (o.actor !== undefined && typeof o.actor !== 'string' && typeof o.actor !== 'function') {
    throw new TypeError(`${where}: actor must be a string or a function`);
  }
  checkSound(o, where);
  if (o.maxVisible !== undefined && !isInt(o.maxVisible, 1, 10)) {
    throw new TypeError(`${where}: maxVisible must be a whole number from 1 to 10`);
  }
  if (o.maxQueue !== undefined && !isInt(o.maxQueue, 0, 100)) {
    throw new TypeError(`${where}: maxQueue must be a whole number from 0 to 100`);
  }
  if (o.zIndex !== undefined && !Number.isInteger(o.zIndex)) {
    throw new TypeError(`${where}: zIndex must be a whole number`);
  }
  if (o.onError !== undefined && typeof o.onError !== 'function') {
    throw new TypeError(`${where}: onError must be a function`);
  }
  const l = o.labels;
  if (l !== undefined) {
    if (typeof l !== 'object' || l === null)
      throw new TypeError(`${where}: labels must be an object`);
    if (l.close !== undefined && !(typeof l.close === 'string' && l.close)) {
      throw new TypeError(`${where}: labels.close must be a non-empty string`);
    }
    if (l.more !== undefined && typeof l.more !== 'function') {
      throw new TypeError(`${where}: labels.more must be a function`);
    }
    if (l.count !== undefined && typeof l.count !== 'function') {
      throw new TypeError(`${where}: labels.count must be a function`);
    }
  }
}

const NOOP: Notifier = { update() {}, show() {}, dismissAll() {}, dispose() {} };

type Item = { view?: AchievementView; more?: number; progress?: boolean; c: Celebration };

/**
 * Celebrate unlocks on top of the page: toasts in any corner or edge, a modal, or
 * fullscreen, with optional confetti and sound, as `celebrations` decides per
 * achievement. Mount once near the root of the app. Returns a no-op outside a browser.
 */
export function createNotifier(source: Engine | Observable, opts: NotifierOptions = {}): Notifier {
  checkOptions(opts);
  if (typeof document === 'undefined') return NOOP;
  const root = opts.root ?? document.body;
  if (!(root instanceof Element)) throw new TypeError('createNotifier: root must be an element');
  const observed = toObservable(source);
  if (typeof observed.onUnlock !== 'function') {
    throw new TypeError(
      'createNotifier: this source has no onUnlock. Wrap the engine with observe(), or update @badgetrip/ipc.',
    );
  }

  const celebrations = opts.celebrations ?? createCelebrationResolver();
  const icons = opts.icons ?? createIconResolver();
  const maxVisible = opts.maxVisible ?? 3;
  const maxQueue = opts.maxQueue ?? 10;
  const zIndex = opts.zIndex ?? 2147483000;
  const closeLabel = opts.labels?.close ?? 'Close';
  const moreText =
    opts.labels?.more ?? ((n: number) => `+${n} more achievement${n === 1 ? '' : 's'} unlocked`);
  const countText = (v: AchievementView) =>
    (opts.labels?.count ?? defaultCountFormat)({
      current: Math.min(v.progress.current, v.progress.target),
      target: v.progress.target,
    });
  let sound = opts.sound ?? false;
  let volume = opts.volume ?? 0.5;
  let muted = opts.muted ?? false;
  let disposed = false;

  const player = createPlayer();
  if (sound) player.arm();

  const host = document.createElement('div');
  host.setAttribute('data-badgetrip-notifier', '');
  Object.assign(host.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    zIndex: String(zIndex),
  });
  const shadow = host.attachShadow({ mode: 'open' });
  const Sheet = globalThis.CSSStyleSheet as
    | (typeof CSSStyleSheet & { prototype: { replaceSync?: unknown } })
    | undefined;
  if (
    Sheet &&
    'adoptedStyleSheets' in shadow &&
    typeof Sheet.prototype.replaceSync === 'function'
  ) {
    const sheet = new Sheet();
    sheet.replaceSync(CSS);
    shadow.adoptedStyleSheets = [sheet];
  } else {
    const style = document.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);
  }
  const el = (tag: string, cls: string, text?: string) => {
    const n = document.createElement(tag);
    n.className = cls;
    n.setAttribute('part', cls);
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const live = el('div', 'live');
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  shadow.appendChild(live);
  const regions = new Map<Position, HTMLElement>();
  for (const p of POSITIONS) {
    const r = el('div', 'region');
    r.dataset.position = p;
    shadow.appendChild(r);
    regions.set(p, r);
  }
  root.appendChild(host);

  const reducedMotion = () => !!globalThis.matchMedia?.(MOTION)?.matches;
  const cleanups = new Set<() => void>();
  const announce = (text: string) => {
    live.textContent = '';
    queueMicrotask(() => {
      if (!disposed) live.textContent = text;
    });
  };
  const confetti = (c: Celebration) => {
    if (!c.confetti || reducedMotion()) return;
    const stop = startConfetti(shadow, c.confetti, zIndex, () => cleanups.delete(stop));
    cleanups.add(stop);
  };

  const content = (box: HTMLElement, item: Item, idPrefix?: string) => {
    if (item.view) {
      const asset = displayIcon(icons.resolve(item.view), {
        unlocked: true,
        reducedMotion: reducedMotion(),
      });
      const img = el('img', 'icon') as HTMLImageElement;
      img.alt = '';
      img.src = safeSrc(asset.src);
      box.appendChild(img);
    }
    const text = el('div', 'text');
    const title = el(idPrefix ? 'h2' : 'div', 'title', item.view ? item.c.title : undefined);
    if (idPrefix) title.id = `${idPrefix}-title`;
    if (item.view) {
      text.append(title, el('div', 'name', item.view.name));
      if (item.progress) {
        text.appendChild(el('div', 'count', countText(item.view)));
        const bar = el('progress', 'bar') as HTMLProgressElement;
        bar.max = 100;
        bar.value = item.view.progress.percent;
        bar.setAttribute('aria-hidden', 'true');
        text.appendChild(bar);
      } else if (item.view.description) {
        text.appendChild(el('div', 'description', item.view.description));
      }
    } else {
      text.appendChild(el('div', 'name', moreText(item.more ?? 0)));
    }
    box.appendChild(text);
    const close = el('button', 'close', '×') as HTMLButtonElement;
    close.type = 'button';
    close.setAttribute('aria-label', closeLabel);
    box.appendChild(close);
    return close;
  };

  // The timer runs only while the box is neither hovered nor (for toasts) focused.
  const autoClose = (box: HTMLElement, ms: number, done: () => void, pauseOnFocus: boolean) => {
    if (!ms) return () => {};
    let left = ms;
    let started = Date.now();
    let hovered = false;
    let focused = false;
    let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(done, left);
    const sync = () => {
      const hold = hovered || focused;
      if (hold && timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
        left -= Date.now() - started;
      } else if (!hold && timer === undefined) {
        started = Date.now();
        timer = setTimeout(done, Math.max(0, left));
      }
    };
    const on = (type: string, set: () => void) =>
      box.addEventListener(type, () => {
        set();
        sync();
      });
    on('mouseenter', () => {
      hovered = true;
    });
    on('mouseleave', () => {
      hovered = false;
    });
    if (pauseOnFocus) {
      on('focusin', () => {
        focused = true;
      });
      on('focusout', () => {
        focused = box.contains((box.getRootNode() as ShadowRoot).activeElement);
      });
    }
    return () => clearTimeout(timer);
  };

  // Toasts: up to maxVisible per position, the rest wait in order.
  const waiting = new Map<Position, Item[]>(POSITIONS.map((p) => [p, []]));
  const visible = new Map<Position, number>(POSITIONS.map((p) => [p, 0]));
  const pending = () => [...waiting.values()].reduce((n, q) => n + q.length, 0);
  // The "+N more" toast still waiting to be shown; later overflow adds to it.
  let summary: Item | undefined;

  const showToast = (item: Item) => {
    const pos = item.c.position;
    const box = el('div', 'toast');
    if (item.progress) box.dataset.kind = 'progress';
    const close = content(box, item);
    visible.set(pos, (visible.get(pos) ?? 0) + 1);
    regions.get(pos)?.appendChild(box);
    if (item === summary) summary = undefined;
    confetti(item.c);
    let gone = false;
    const remove = () => {
      if (gone) return;
      gone = true;
      cancelTimer();
      cleanups.delete(remove);
      box.remove();
      visible.set(pos, (visible.get(pos) ?? 1) - 1);
      const next = waiting.get(pos)?.shift();
      if (next && !disposed) showToast(next);
    };
    const cancelTimer = autoClose(box, item.c.duration, remove, true);
    close.addEventListener('click', remove);
    cleanups.add(remove);
  };
  const queueToast = (item: Item) => {
    const pos = item.c.position;
    if ((visible.get(pos) ?? 0) < maxVisible) return showToast(item);
    const queue = waiting.get(pos) ?? [];
    // An unlock waits behind other unlocks, but ahead of any waiting progress popup.
    const at = item.progress ? -1 : queue.findIndex((q) => q.progress);
    if (at === -1) queue.push(item);
    else queue.splice(at, 0, item);
  };

  // Modal and fullscreen: one at a time, focus trapped while open.
  const dialogs: Item[] = [];
  let closeDialog: (() => void) | undefined;
  let dialogCount = 0;
  const openDialog = (item: Item) => {
    const layout = item.c.layout;
    const backdrop = el('div', 'backdrop');
    backdrop.dataset.layout = layout;
    const box = el('div', 'dialog');
    const id = `badgetrip-dialog-${++dialogCount}`;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', `${id}-title`);
    box.tabIndex = -1;
    const close = content(box, item, id);
    backdrop.appendChild(box);
    const before = document.activeElement;
    shadow.appendChild(backdrop);
    close.focus();
    confetti(item.c);
    let gone = false;
    const finish = (restore: boolean) => {
      if (gone) return;
      gone = true;
      cancelTimer();
      document.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      closeDialog = undefined;
      if (restore && before instanceof HTMLElement && before.isConnected) before.focus();
      const next = dialogs.shift();
      if (next && !disposed) openDialog(next);
    };
    closeDialog = () => finish(true);
    // Keys are caught at the document so they work wherever focus ended up (a click
    // on the dialog text, for example). The page behind is not reachable by Tab.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        close.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    // Dialogs pause on hover only: focus sits inside them from the start.
    const cancelTimer = autoClose(box, item.c.duration, () => finish(true), false);
    close.addEventListener('click', () => finish(true));
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) finish(true);
    });
  };
  const queueDialog = (item: Item) => {
    if (closeDialog) dialogs.push(item);
    else openDialog(item);
  };

  const celebrate = (views: AchievementView[]) => {
    if (disposed) return;
    const items = views
      .map((view): Item => ({ view, c: celebrations.resolve(view) }))
      .filter((i) => !i.c.quiet);
    if (!items.length) return;
    announce(items.map((i) => `${i.c.title}: ${i.view?.name}`).join('. '));
    if (sound && !muted) {
      const loudest = items
        .filter((i) => i.c.sound)
        .sort((a, b) => RANK[b.c.layout] - RANK[a.c.layout])[0];
      if (loudest?.c.sound) player.play(loudest.c.sound, volume);
    }
    let overflow = 0;
    let overflowAt: Celebration | undefined;
    for (const item of items) {
      if (item.c.layout !== 'toast') {
        queueDialog(item);
      } else if ((visible.get(item.c.position) ?? 0) >= maxVisible && pending() >= maxQueue) {
        overflow += 1;
        overflowAt ??= item.c;
      } else {
        queueToast(item);
      }
    }
    if (overflow && overflowAt) {
      if (summary) summary.more = (summary.more ?? 0) + overflow;
      else {
        summary = { more: overflow, c: { ...overflowAt, confetti: null } };
        queueToast(summary);
      }
    }
  };

  // Progress popups: a quieter toast when an achievement passes a milestone.
  const progressed = (changes: ProgressChange[]) => {
    if (disposed) return;
    const items: Item[] = [];
    // A tier series reports progress toward its next tier only, not every tier.
    const next = new Map<string, number>();
    for (const { view } of changes) {
      if (!view.series) continue;
      const seen = next.get(view.series.code);
      if (seen === undefined || view.series.index < seen)
        next.set(view.series.code, view.series.index);
    }
    for (const { view, from } of changes) {
      if (view.progress.countable === false) continue;
      if (view.series && next.get(view.series.code) !== view.series.index) continue;
      const c = celebrations.resolve(view);
      const p = c.progress;
      if (
        c.quiet ||
        !p ||
        !crossesMilestone(p, from, view.progress.current, view.progress.target)
      ) {
        continue;
      }
      items.push({
        view,
        progress: true,
        c: {
          ...c,
          layout: 'toast',
          position: p.position,
          duration: p.duration,
          sound: p.sound,
          title: p.title,
          confetti: null,
        },
      });
    }
    if (!items.length) return;
    announce(
      items
        .map((i) => `${i.c.title}: ${i.view?.name}, ${countText(i.view as AchievementView)}`)
        .join('. '),
    );
    const loud = items.find((i) => i.c.sound)?.c.sound;
    if (sound && !muted && loud) player.play(loud, volume);
    for (const item of items) queueToast(item);
  };
  const stopProgress =
    typeof opts.actor === 'string' && celebrations.usesProgress?.()
      ? watchProgress(observed, { actor: opts.actor, onError: opts.onError }, progressed)
      : () => {};

  const stopWatching = watchUnlocks(
    observed,
    { actor: opts.actor, onError: opts.onError },
    (items) => celebrate(items.map((i) => i.view)),
  );

  const dismissAll = () => {
    summary = undefined;
    for (const q of waiting.values()) q.length = 0;
    dialogs.length = 0;
    for (const c of [...cleanups]) c();
    cleanups.clear();
    closeDialog?.();
  };

  return {
    update(o) {
      if (disposed) return;
      checkSound(o, 'notifier.update');
      if (o.volume !== undefined) volume = o.volume;
      if (o.muted !== undefined) muted = o.muted;
      if (o.sound !== undefined) {
        sound = o.sound;
        if (sound) player.arm();
        else player.disarm();
      }
    },
    show(view) {
      celebrate([view]);
    },
    dismissAll,
    dispose() {
      if (disposed) return;
      stopWatching();
      stopProgress();
      dismissAll();
      disposed = true;
      player.dispose();
      host.remove();
    },
  };
}
