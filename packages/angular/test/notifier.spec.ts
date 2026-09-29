import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BADGETRIP_NOTIFIER, BadgetripService, provideBadgetrip } from '@badgetrip/angular';
import {
  createEngine,
  defineAchievements,
  memoryAchievementStore,
  memoryEventStore,
  memoryScoreStore,
  memoryStreakStore,
  rules,
} from '@badgetrip/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const makeEngine = () =>
  createEngine({
    events: memoryEventStore(),
    scores: memoryScoreStore(),
    achievements: memoryAchievementStore(),
    streaks: memoryStreakStore(),
    clock: { now: () => 0 },
    definitions: {
      achievements: defineAchievements({
        first: { name: 'First', description: '', when: rules.count('win', 1) },
        shh: { name: 'Shh', description: '', celebration: 'quiet', when: rules.count('hush', 1) },
        big: { name: 'Big', description: '', celebration: 'epic', when: rules.count('boom', 1) },
      }),
    },
  });
const ev = (id: string, type = 'win', actor = 'u') => ({ id, actor, type, ts: 0, payload: {} });
const hosts = () => document.querySelectorAll('[data-badgetrip-notifier]');
const names = () =>
  [...((hosts()[0] as HTMLElement | undefined)?.shadowRoot?.querySelectorAll('.name') ?? [])].map(
    (n) => n.textContent,
  );

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});

describe('provideBadgetrip notifier', () => {
  it('mounts in the browser, celebrates unlocks, and is removed with the injector', async () => {
    TestBed.configureTestingModule({
      providers: [provideBadgetrip(makeEngine(), { notifier: { sound: false } })],
    });
    const gk = TestBed.inject(BadgetripService);
    expect(hosts()).toHaveLength(1);
    expect(TestBed.inject(BADGETRIP_NOTIFIER)).not.toBeNull();
    await gk.engine.emit(ev('a'));
    await vi.waitFor(() => expect(names()).toEqual(['First']));
    TestBed.resetTestingModule();
    expect(hosts()).toHaveLength(0);
  });

  it('does nothing on the server, and nothing unless asked for', () => {
    TestBed.configureTestingModule({
      providers: [
        provideBadgetrip(makeEngine(), { notifier: true }),
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });
    TestBed.inject(BadgetripService);
    expect(TestBed.inject(BADGETRIP_NOTIFIER)).toBeNull();
    expect(hosts()).toHaveLength(0);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideBadgetrip(makeEngine())] });
    TestBed.inject(BadgetripService);
    expect(TestBed.inject(BADGETRIP_NOTIFIER)).toBeNull();
    expect(hosts()).toHaveLength(0);
  });
});

describe('BadgetripService.unlocks', () => {
  it('queues unlocks with their celebration, skipping quiet ones, filtered by actor', async () => {
    TestBed.configureTestingModule({ providers: [provideBadgetrip(makeEngine())] });
    const gk = TestBed.inject(BadgetripService);
    const u = TestBed.runInInjectionContext(() => gk.unlocks({ actor: 'u' }));
    await gk.engine.emit(ev('a', 'win', 'someone-else'));
    await gk.engine.emit(ev('b', 'hush'));
    await gk.engine.emit(ev('c', 'win'));
    await gk.engine.emit(ev('d', 'boom'));
    await vi.waitFor(() => expect(u.queue()).toHaveLength(2));
    expect(u.queue().map((q) => [q.view.code, q.celebration.layout])).toEqual([
      ['first', 'toast'],
      ['big', 'fullscreen'],
    ]);
    u.dismiss();
    expect(u.queue().map((q) => q.view.code)).toEqual(['big']);
    u.clear();
    expect(u.queue()).toEqual([]);
  });

  it('needs an injection context and stops when it is destroyed', async () => {
    TestBed.configureTestingModule({ providers: [provideBadgetrip(makeEngine())] });
    const gk = TestBed.inject(BadgetripService);
    expect(() => gk.unlocks()).toThrow(/injection context/);
    const u = TestBed.runInInjectionContext(() => gk.unlocks());
    const engine = gk.engine;
    TestBed.resetTestingModule();
    await engine.emit(ev('a'));
    await new Promise((r) => setTimeout(r, 10));
    expect(u.queue()).toEqual([]);
  });
});

describe('provideBadgetrip notifier factory', () => {
  it('builds options in the injection context, so they can use inject()', async () => {
    const e = makeEngine();
    const factory = vi.fn(() => ({ actor: 'u' }));
    TestBed.configureTestingModule({ providers: [provideBadgetrip(e, { notifier: factory })] });
    const gk = TestBed.inject(BadgetripService);
    expect(factory).toHaveBeenCalledOnce();
    await gk.engine.emit(ev('a', 'win', 'someone-else'));
    await gk.engine.emit(ev('b', 'win', 'u'));
    await vi.waitFor(() => expect(names()).toEqual(['First']));
  });
});
