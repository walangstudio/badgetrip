// @vitest-environment jsdom
import { createCelebrationResolver, createIconResolver } from '@walangstudio/badgetrip-assets';
import {
  type AchievementView,
  type Engine,
  type Observable,
  defineAchievements,
  observe,
  rules,
} from '@walangstudio/badgetrip-core';
import { connectEngine, messagePortTransport, serveEngine } from '@walangstudio/badgetrip-ipc';
import { makeTestEngine } from '@walangstudio/badgetrip-testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Notifier, type NotifierOptions, createNotifier } from '../src/index.js';

const view = (over: Partial<AchievementView> = {}): AchievementView => ({
  code: 'a',
  name: 'Alpha',
  description: 'Did the thing',
  rarity: 1,
  points: 0,
  unlocked: true,
  concealed: false,
  progress: { current: 1, target: 1, percent: 100 },
  ...over,
});

const engine = () =>
  makeTestEngine({
    scores: ['xp'],
    points: [{ on: 'win', score: 'xp', delta: 30 }],
    achievements: defineAchievements({
      first: { name: 'First', description: 'Win once', when: rules.count('win', 1) },
      rich: {
        name: 'Rich ({tier})',
        description: '{n} xp',
        when: rules.score('xp'),
        tiers: { bronze: 10, silver: 20, gold: { at: 30, celebration: 'epic' } },
      },
      shh: { name: 'Shh', description: '', celebration: 'quiet', when: rules.count('hush', 1) },
    }),
  }).engine;

const win = (id: string, actor = 'u', type = 'win') => ({ id, actor, type, ts: 0, payload: {} });

let notifiers: Notifier[] = [];
const make = (source: Engine | Observable, opts?: NotifierOptions) => {
  const n = createNotifier(source, opts);
  notifiers.push(n);
  return n;
};
const hosts = () => [...document.querySelectorAll('[data-badgetrip-notifier]')];
const shadow = (i = 0) => (hosts()[i] as HTMLElement).shadowRoot as ShadowRoot;
const toasts = (pos = 'top-right') =>
  [...shadow().querySelectorAll(`[data-position="${pos}"] .toast .name`)].map((n) => n.textContent);
const motion = (reduce: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: reduce && q.includes('reduce'),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
};

beforeEach(() => {
  motion(false);
  // jsdom has no canvas; tests that need one stub it themselves.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  for (const n of notifiers) n.dispose();
  notifiers = [];
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('toasts', () => {
  it('celebrates an emitted unlock top-right with title, name, description and icon', async () => {
    const observed = observe(engine());
    const n = make(observed, {
      celebrations: createCelebrationResolver({ presets: { epic: { layout: 'toast' } } }),
    });
    expect(n).toBeTruthy();
    await observed.engine.emit(win('a'));
    await vi.waitFor(() => expect(toasts()).toEqual(['First', 'Rich (bronze)', 'Rich (silver)']));
    const first = shadow().querySelector('.toast') as HTMLElement;
    expect(first.querySelector('.title')?.textContent).toBe('Achievement unlocked');
    expect(first.querySelector('.description')?.textContent).toBe('Win once');
    expect(first.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/svg\+xml,/);
    expect(first.querySelector('button')?.getAttribute('aria-label')).toBe('Close');
  });

  it('announces each popup through a polite live region that exists up front', async () => {
    const n = make(observe(engine()));
    const live = shadow().querySelector('[aria-live="polite"]');
    expect(live?.getAttribute('role')).toBe('status');
    n.show(view());
    await Promise.resolve();
    expect(live?.textContent).toBe('Achievement unlocked: Alpha');
  });

  it('places toasts in every position the celebration names', () => {
    const positions = [
      'top-left',
      'top',
      'top-right',
      'right',
      'bottom-right',
      'bottom',
      'bottom-left',
      'left',
    ] as const;
    for (const position of positions) {
      const n = make(observe(engine()), {
        celebrations: createCelebrationResolver({ default: { position } }),
      });
      n.show(view({ name: position }));
      const region = shadow(hosts().length - 1).querySelector(`[data-position="${position}"]`);
      expect(region?.textContent).toContain(position);
    }
  });

  it('renders untrusted text as text and blanks unsafe icon URLs', () => {
    const n = make(observe(engine()), {
      icons: createIconResolver({ overrides: { a: { src: 'javascript:alert(1)' } } }),
    });
    n.show(view({ name: '<img src=x onerror=alert(1)>', description: '<b>bold</b>' }));
    expect(shadow().querySelector('img[onerror]')).toBeNull();
    expect(shadow().querySelector('b')).toBeNull();
    expect(toasts()).toEqual(['<img src=x onerror=alert(1)>']);
    expect(shadow().querySelector('.toast img')?.getAttribute('src')).toBe('');
  });

  it('closes itself after the duration, pausing while hovered, and stays with duration 0', () => {
    vi.useFakeTimers();
    const n = make(observe(engine()), {
      celebrations: createCelebrationResolver({ overrides: { stay: { duration: 0 } } }),
    });
    n.show(view());
    n.show(view({ code: 'stay', name: 'Stay' }));
    const toast = shadow().querySelector('.toast') as HTMLElement;
    vi.advanceTimersByTime(3000);
    toast.dispatchEvent(new Event('mouseenter'));
    vi.advanceTimersByTime(10_000);
    expect(toasts()).toEqual(['Alpha', 'Stay']);
    toast.dispatchEvent(new Event('mouseleave'));
    vi.advanceTimersByTime(1999);
    expect(toasts()).toEqual(['Alpha', 'Stay']);
    vi.advanceTimersByTime(1);
    expect(toasts()).toEqual(['Stay']);
    vi.advanceTimersByTime(600_000);
    expect(toasts()).toEqual(['Stay']);
    (shadow().querySelector('.toast button') as HTMLButtonElement).click();
    expect(toasts()).toEqual([]);
  });

  it('shows maxVisible at a time and folds a long queue into "+N more"', () => {
    const n = make(observe(engine()), { maxVisible: 1, maxQueue: 1 });
    for (const name of ['A', 'B', 'C', 'D']) n.show(view({ code: name, name }));
    const seen: (string | null)[] = [];
    for (let i = 0; i < 3; i++) {
      seen.push(...toasts());
      expect(toasts()).toHaveLength(1);
      (shadow().querySelector('.toast button') as HTMLButtonElement).click();
    }
    expect(seen).toEqual(['A', 'B', '+2 more achievements unlocked']);
    expect(toasts()).toEqual([]);
  });

  it('never steals focus from the page', () => {
    const button = document.body.appendChild(document.createElement('button'));
    button.focus();
    make(observe(engine())).show(view());
    expect(document.activeElement).toBe(button);
  });
});

describe('modal and fullscreen', () => {
  const dialogs = () => [...shadow().querySelectorAll('.backdrop')] as HTMLElement[];

  it('opens a labelled dialog, focuses close, traps Tab, and restores focus on Escape', () => {
    const before = document.body.appendChild(document.createElement('button'));
    before.focus();
    const n = make(observe(engine()), {
      celebrations: createCelebrationResolver({ default: { layout: 'modal' } }),
    });
    n.show(view({ name: 'Legend' }));
    const [backdrop] = dialogs();
    expect(backdrop?.dataset.layout).toBe('modal');
    const dialog = backdrop?.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const label = shadow().getElementById(dialog.getAttribute('aria-labelledby') as string);
    expect(label?.textContent).toBe('Achievement unlocked');
    const close = dialog.querySelector('button');
    expect(shadow().activeElement).toBe(close);
    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    close?.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(shadow().activeElement).toBe(close);
    close?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
    );
    expect(dialogs()).toEqual([]);
    expect(document.activeElement).toBe(before);
  });

  it('shows one dialog at a time and closes on a backdrop click', () => {
    const n = make(observe(engine()), {
      celebrations: createCelebrationResolver({ default: { layout: 'fullscreen' } }),
    });
    n.show(view({ name: 'One' }));
    n.show(view({ name: 'Two' }));
    expect(dialogs()).toHaveLength(1);
    expect(dialogs()[0]?.dataset.layout).toBe('fullscreen');
    expect(dialogs()[0]?.textContent).toContain('One');
    (dialogs()[0]?.querySelector('.dialog') as HTMLElement).click();
    expect(dialogs()).toHaveLength(1);
    dialogs()[0]?.click();
    expect(dialogs()[0]?.textContent).toContain('Two');
  });

  it('celebrates the epic preset with confetti, but not under reduced motion', () => {
    const ctx = {
      scale() {},
      clearRect() {},
      save() {},
      restore() {},
      translate() {},
      rotate() {},
      fillRect() {},
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
    const n = make(observe(engine()));
    n.show(view({ celebration: 'epic' }));
    expect(shadow().querySelector('canvas[aria-hidden="true"]')).not.toBeNull();
    n.dismissAll();
    expect(shadow().querySelector('canvas')).toBeNull();
    motion(true);
    n.show(view({ celebration: 'epic' }));
    expect(dialogs()).toHaveLength(1);
    expect(shadow().querySelector('canvas')).toBeNull();
  });

  it('skips confetti quietly where canvas is unavailable', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    make(observe(engine())).show(view({ celebration: 'epic' }));
    expect(shadow().querySelector('canvas')).toBeNull();
    expect(dialogs()).toHaveLength(1);
  });
});

describe('sound', () => {
  function fakeAudio(state: 'running' | 'suspended' = 'running', resume = () => Promise.resolve()) {
    const ramps: number[] = [];
    const created = vi.fn();
    class Ctx {
      state = state;
      currentTime = 0;
      destination = {};
      constructor() {
        created();
      }
      resume = vi.fn(resume);
      close = vi.fn(() => Promise.resolve());
      createOscillator() {
        return {
          type: '',
          frequency: { setValueAtTime() {} },
          connect() {},
          start() {},
          stop() {},
        };
      }
      createGain() {
        return {
          gain: {
            setValueAtTime() {},
            linearRampToValueAtTime: (v: number) => ramps.push(v),
            exponentialRampToValueAtTime() {},
          },
          connect() {},
        };
      }
    }
    vi.stubGlobal('AudioContext', Ctx);
    return { created, ramps };
  }

  it('is off by default', () => {
    const { created } = fakeAudio();
    make(observe(engine())).show(view());
    expect(created).not.toHaveBeenCalled();
  });

  it('plays the built-in chime at the chosen volume, once per batch, and not when muted', async () => {
    const { ramps } = fakeAudio();
    const observed = observe(engine());
    const n = make(observed, { sound: true, volume: 0.5 });
    await observed.engine.emit(win('a'));
    await vi.waitFor(() => expect(shadow().querySelectorAll('.backdrop')).toHaveLength(1));
    // One batch (first + three tiers, gold epic) plays one sound: the epic fanfare, 5 tones.
    expect(ramps).toHaveLength(5);
    expect(ramps[0]).toBeCloseTo(0.25);
    n.update({ muted: true });
    n.show(view());
    expect(ramps).toHaveLength(5);
    n.update({ muted: false, sound: false });
    n.show(view());
    expect(ramps).toHaveLength(5);
  });

  it('swallows a blocked resume and a rejected file playback', async () => {
    fakeAudio('suspended', () => Promise.reject(new Error('not allowed')));
    const play = vi.fn(() => Promise.reject(new Error('autoplay')));
    const Audio = vi.fn(() => ({ play, volume: 1 }));
    vi.stubGlobal('Audio', Audio);
    const n = make(observe(engine()), {
      sound: true,
      celebrations: createCelebrationResolver({
        sounds: { ding: '/ding.mp3' },
        overrides: { f: { sound: 'ding' } },
      }),
    });
    expect(() => n.show(view())).not.toThrow();
    expect(() => n.show(view({ code: 'f' }))).not.toThrow();
    expect(Audio).toHaveBeenCalledWith('/ding.mp3');
    await new Promise((r) => setTimeout(r));
  });

  it('resumes audio on the next user gesture once sound is on', () => {
    const { created } = fakeAudio('suspended');
    make(observe(engine()), { sound: true });
    document.dispatchEvent(new Event('pointerdown'));
    expect(created).toHaveBeenCalledOnce();
  });
});

describe('what gets celebrated', () => {
  it('ignores quiet achievements and other actors', async () => {
    const observed = observe(engine());
    make(observed, { actor: 'me' });
    await observed.engine.emit(win('a', 'someone-else'));
    await observed.engine.emit(win('b', 'me', 'hush'));
    await observed.engine.emit(win('c', 'me'));
    await vi.waitFor(() => expect(toasts()).toEqual(['First', 'Rich (bronze)', 'Rich (silver)']));
  });

  it('works for several notifiers on one engine and over an ipc remote', async () => {
    const e = engine();
    const observed = observe(e);
    const a = make(observed, { maxVisible: 1 });
    const { port1, port2 } = new MessageChannel();
    const stop = serveEngine(e, messagePortTransport(port1));
    const remote = connectEngine(messagePortTransport(port2));
    make(remote, { maxVisible: 1 });
    await remote.engine.emit(win('a'));
    await vi.waitFor(() => {
      expect(shadow(0).querySelectorAll('.toast')).toHaveLength(1);
      expect(shadow(1).querySelectorAll('.toast')).toHaveLength(1);
    });
    a.dispose();
    expect(hosts()).toHaveLength(1);
    remote.dispose();
    stop();
    port1.close();
    port2.close();
  });

  it('stops celebrating after dispose, mid-animation, and is safe to dispose twice', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      scale() {},
    } as never);
    const observed = observe(engine());
    const n = make(observed);
    n.show(view({ celebration: 'epic' }));
    n.dispose();
    n.dispose();
    expect(hosts()).toHaveLength(0);
    await observed.engine.emit(win('a'));
    await new Promise((r) => setTimeout(r, 10));
    expect(hosts()).toHaveLength(0);
    expect(() => n.show(view())).not.toThrow();
  });

  it('reports catalog errors to onError', async () => {
    const observed = observe(engine());
    const onError = vi.fn();
    vi.spyOn(observed.engine, 'catalog').mockRejectedValueOnce(new Error('db down'));
    make(observed, { onError });
    await observed.engine.emit(win('a'));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(new Error('db down')));
  });
});

describe('options', () => {
  const bad: [string, NotifierOptions, RegExp][] = [
    ['unknown key', { sounds: true } as never, /unknown option 'sounds'/],
    ['sound', { sound: 'yes' as never }, /sound/],
    ['volume', { volume: 2 }, /volume/],
    ['muted', { muted: 1 as never }, /muted/],
    ['maxVisible', { maxVisible: 0 }, /maxVisible/],
    ['maxQueue', { maxQueue: -1 }, /maxQueue/],
    ['zIndex', { zIndex: 1.5 }, /zIndex/],
    ['actor', { actor: 3 as never }, /actor/],
    ['celebrations', { celebrations: {} as never }, /celebrations/],
    ['icons', { icons: 'x' as never }, /icons/],
    ['labels', { labels: { close: '' } }, /labels.close/],
    ['labels.more', { labels: { more: 'x' as never } }, /labels.more/],
    ['onError', { onError: 'x' as never }, /onError/],
    ['root', { root: {} as never }, /root/],
  ];
  for (const [name, opts, msg] of bad) {
    it(`rejects a bad ${name}`, () => {
      expect(() => createNotifier(observe(engine()), opts)).toThrow(msg);
      expect(hosts()).toHaveLength(0);
    });
  }

  it('checks update() too, and mounts under a custom root and label', () => {
    const root = document.body.appendChild(document.createElement('section'));
    const n = make(observe(engine()), { root, zIndex: 5, labels: { close: 'Schliessen' } });
    expect(root.querySelector('[data-badgetrip-notifier]')).not.toBeNull();
    expect((hosts()[0] as HTMLElement).style.zIndex).toBe('5');
    n.show(view());
    expect(shadow().querySelector('.toast button')?.getAttribute('aria-label')).toBe('Schliessen');
    expect(() => n.update({ volume: -1 })).toThrow(/volume/);
  });
});

describe('rendering details', () => {
  it('runs the confetti animation to the end and removes the canvas', () => {
    const fillRect = vi.fn();
    const ctx = {
      scale() {},
      clearRect() {},
      save() {},
      restore() {},
      translate() {},
      rotate() {},
      fillRect,
      globalAlpha: 1,
      fillStyle: '',
    };
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(ctx as never);
    const frames: ((t: number) => void)[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const n = make(observe(engine()), {
      celebrations: createCelebrationResolver({
        default: { confetti: { particles: 5, duration: 100 } },
      }),
    });
    n.show(view());
    expect(shadow().querySelector('canvas')).not.toBeNull();
    let t = 1;
    while (frames.length) {
      frames.shift()?.(t);
      t += 40;
    }
    expect(fillRect).toHaveBeenCalled();
    expect(shadow().querySelector('canvas')).toBeNull();
  });

  it('uses a constructable stylesheet where the browser supports one', () => {
    const sheets: string[] = [];
    vi.stubGlobal(
      'CSSStyleSheet',
      class {
        replaceSync(css: string) {
          sheets.push(css);
        }
      },
    );
    Object.defineProperty(ShadowRoot.prototype, 'adoptedStyleSheets', {
      configurable: true,
      get() {
        return this._sheets ?? [];
      },
      set(v) {
        this._sheets = v;
      },
    });
    try {
      make(observe(engine()));
      expect(sheets).toHaveLength(1);
      expect(shadow().querySelector('style')).toBeNull();
      expect(
        (shadow() as unknown as { adoptedStyleSheets: unknown[] }).adoptedStyleSheets,
      ).toHaveLength(1);
    } finally {
      Reflect.deleteProperty(ShadowRoot.prototype, 'adoptedStyleSheets');
    }
  });

  it('stays silent where audio is unavailable or refuses to start', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('Audio', undefined);
    const n = make(observe(engine()), {
      sound: true,
      celebrations: createCelebrationResolver({
        sounds: { f: '/f.mp3' },
        overrides: { file: { sound: 'f' } },
      }),
    });
    expect(() => n.show(view())).not.toThrow();
    expect(() => n.show(view({ code: 'file' }))).not.toThrow();
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('too many contexts');
        }
      },
    );
    const m = make(observe(engine()), { sound: true });
    expect(() => m.show(view())).not.toThrow();
  });
});

describe('review fixes', () => {
  const key = (k: string) =>
    new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, composed: true });

  it('rejects a source without onUnlock before touching the page', () => {
    const plain = {
      engine: observe(engine()).engine,
      subscribe: () => () => {},
      getVersion: () => 0,
    };
    expect(() => createNotifier(plain as never)).toThrow(/onUnlock/);
    expect(hosts()).toHaveLength(0);
  });

  it('keeps a toast open while it has focus, even after the mouse leaves', () => {
    vi.useFakeTimers();
    const n = make(observe(engine()));
    n.show(view());
    const toast = shadow().querySelector('.toast') as HTMLElement;
    const close = toast.querySelector('button') as HTMLButtonElement;
    close.focus();
    toast.dispatchEvent(new Event('focusin'));
    toast.dispatchEvent(new Event('mouseenter'));
    toast.dispatchEvent(new Event('mouseleave'));
    vi.advanceTimersByTime(20_000);
    expect(toasts()).toEqual(['Alpha']);
    close.blur();
    toast.dispatchEvent(new Event('focusout'));
    vi.advanceTimersByTime(5000);
    expect(toasts()).toEqual([]);
  });

  it('announces every unlock in a batch', async () => {
    const observed = observe(engine());
    make(observed, {
      celebrations: createCelebrationResolver({ presets: { epic: { layout: 'toast' } } }),
    });
    await observed.engine.emit(win('a'));
    const live = shadow().querySelector('[aria-live]');
    await vi.waitFor(() =>
      expect(live?.textContent).toBe(
        'Achievement unlocked: First. Achievement unlocked: Rich (bronze). Achievement unlocked: Rich (silver). Achievement unlocked: Rich (gold)',
      ),
    );
  });

  it('handles Escape and Tab in a dialog wherever focus went, and focus stays inside', () => {
    const n = make(observe(engine()), {
      celebrations: createCelebrationResolver({ default: { layout: 'modal' } }),
    });
    n.show(view());
    const dialog = shadow().querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.tabIndex).toBe(-1);
    dialog.focus();
    const tab = key('Tab');
    document.body.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(shadow().activeElement).toBe(dialog.querySelector('button'));
    document.body.dispatchEvent(key('Escape'));
    expect(shadow().querySelector('.backdrop')).toBeNull();
    const after = key('Tab');
    document.body.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it('frees the confetti canvas when the burst ends on its own', () => {
    const ctx = {
      scale() {},
      clearRect() {},
      save() {},
      restore() {},
      translate() {},
      rotate() {},
      fillRect() {},
    };
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(ctx as never);
    const frames: ((t: number) => void)[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const n = make(observe(engine()), {
      celebrations: createCelebrationResolver({
        default: { confetti: { particles: 1, duration: 100 } },
      }),
    });
    n.show(view());
    const canvas = shadow().querySelector('canvas') as HTMLCanvasElement;
    let t = 1;
    while (frames.length) {
      frames.shift()?.(t);
      t += 60;
    }
    expect(canvas.isConnected).toBe(false);
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });

  it('drops a sound instead of queueing it behind a suspended context', async () => {
    const ramps: number[] = [];
    const resume = vi.fn(() => new Promise<void>(() => {}));
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'suspended';
        currentTime = 0;
        destination = {};
        resume = resume;
        close = () => Promise.resolve();
        createOscillator = () => ({
          type: '',
          frequency: { setValueAtTime() {} },
          connect() {},
          start() {},
          stop() {},
        });
        createGain = () => ({
          gain: {
            setValueAtTime() {},
            linearRampToValueAtTime: (v: number) => ramps.push(v),
            exponentialRampToValueAtTime() {},
          },
          connect() {},
        });
      },
    );
    make(observe(engine()), { sound: true }).show(view());
    await new Promise((r) => setTimeout(r));
    expect(resume).toHaveBeenCalled();
    expect(ramps).toEqual([]);
  });
});
