import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  AchievementBadgeComponent,
  BADGETRIP_NOTIFIER,
  BadgetripService,
  provideBadgetrip,
} from '@walangstudio/badgetrip-angular';
import { createIconResolver, defineTheme } from '@walangstudio/badgetrip-assets';
import {
  type AchievementView,
  createEngine,
  defineAchievements,
  memoryAchievementStore,
  memoryEventStore,
  memoryScoreStore,
  memoryStreakStore,
  rules,
} from '@walangstudio/badgetrip-core';
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
        a: { name: 'Alpha', description: '', when: rules.count('win', 1) },
      }),
    },
  });
const ev = (id: string) => ({ id, actor: 'u', type: 'win', ts: 0, payload: {} });

const neon = defineTheme({
  name: 'neon',
  style: { accent: '#ff2bd6', bg: '#14002b' },
  icons: { overrides: { a: { src: '/neon-a.png' } } },
});
const plain = defineTheme({ name: 'plain', style: { bg: '#fff' } });
const titled = defineTheme({ name: 'titled', celebrations: { default: { title: 'Nice one' } } });

const view: AchievementView = {
  code: 'a',
  name: 'Alpha',
  description: '',
  rarity: 1,
  points: 0,
  unlocked: false,
  concealed: false,
  progress: { current: 0, target: 1, percent: 0 },
};
const rootVar = (k: string) => document.documentElement.style.getPropertyValue(k);
const host = () => document.querySelector('[data-badgetrip-notifier]') as HTMLElement;

function badge() {
  const fixture = TestBed.createComponent(AchievementBadgeComponent);
  fixture.componentRef.setInput('achievement', view);
  fixture.detectChanges();
  return fixture;
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  TestBed.resetTestingModule();
  document.documentElement.removeAttribute('style');
  vi.restoreAllMocks();
});

describe('provideBadgetrip theme', () => {
  it('puts the colors on the page and switches with setTheme', () => {
    TestBed.configureTestingModule({
      providers: [provideBadgetrip(makeEngine(), { theme: neon })],
    });
    const service = TestBed.inject(BadgetripService);
    TestBed.tick();
    expect(rootVar('--badgetrip-accent')).toBe('#ff2bd6');
    expect(service.theme()).toBe(neon);
    service.setTheme(plain);
    TestBed.tick();
    expect(rootVar('--badgetrip-accent')).toBe('');
    expect(rootVar('--badgetrip-bg')).toBe('#fff');
    TestBed.resetTestingModule();
    expect(rootVar('--badgetrip-bg')).toBe('');
  });

  it('leaves the page alone on the server', () => {
    TestBed.configureTestingModule({
      providers: [
        provideBadgetrip(makeEngine(), { theme: neon }),
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });
    TestBed.inject(BadgetripService);
    TestBed.tick();
    expect(rootVar('--badgetrip-accent')).toBe('');
  });

  it('gives badges the theme icons and re-renders on a switch, while explicit icons win', () => {
    TestBed.configureTestingModule({
      providers: [provideBadgetrip(makeEngine(), { theme: neon })],
    });
    const fixture = badge();
    const img = () =>
      (fixture.nativeElement as HTMLElement).querySelector('img') as HTMLImageElement;
    expect(img().getAttribute('src')).toBe('/neon-a.png');
    TestBed.inject(BadgetripService).setTheme(plain);
    fixture.detectChanges();
    expect(img().getAttribute('src')).not.toBe('/neon-a.png');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideBadgetrip(makeEngine(), { theme: neon, icons: createIconResolver() })],
    });
    expect(
      (badge().nativeElement as HTMLElement).querySelector('img')?.getAttribute('src'),
    ).not.toBe('/neon-a.png');
  });

  it('draws the locked look through theme variables', () => {
    TestBed.configureTestingModule({ providers: [provideBadgetrip(makeEngine())] });
    const el = badge().nativeElement as HTMLElement;
    expect(el.querySelector('img')?.style.filter).toBe(
      'var(--badgetrip-locked-filter, grayscale(1))',
    );
    expect(el.querySelector('progress')?.getAttribute('style')).toContain(
      'var(--badgetrip-accent, auto)',
    );
  });
});

describe('notifier and unlocks follow the theme', () => {
  it('styles the overlay with the theme and switches it in place', async () => {
    TestBed.configureTestingModule({
      providers: [provideBadgetrip(makeEngine(), { theme: neon, notifier: { actor: 'u' } })],
    });
    const service = TestBed.inject(BadgetripService);
    TestBed.inject(BADGETRIP_NOTIFIER);
    const first = host();
    expect(first.style.getPropertyValue('--badgetrip-accent')).toBe('#ff2bd6');
    await service.engine.emit(ev('1'));
    await vi.waitFor(() =>
      expect(first.shadowRoot?.querySelector('.toast img')?.getAttribute('src')).toBe(
        '/neon-a.png',
      ),
    );
    service.setTheme(plain);
    TestBed.tick();
    expect(host()).toBe(first);
    expect(first.style.getPropertyValue('--badgetrip-bg')).toBe('#fff');
  });

  it('celebrates unlocks() with the current theme', async () => {
    TestBed.configureTestingModule({
      providers: [provideBadgetrip(makeEngine(), { theme: titled })],
    });
    const service = TestBed.inject(BadgetripService);
    const u = TestBed.runInInjectionContext(() => service.unlocks({ actor: 'u' }));
    await service.engine.emit(ev('1'));
    await vi.waitFor(() => expect(u.queue()).toHaveLength(1));
    expect(u.queue()[0]?.celebration.title).toBe('Nice one');
  });
});
