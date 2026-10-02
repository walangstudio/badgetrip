import {
  type CelebrationSpec,
  builtinSounds,
  createCelebrationResolver,
  safeSrc,
} from '@walangstudio/badgetrip-assets';
import { describe, expect, it } from 'vitest';

const subject = { code: 'a' };

describe('createCelebrationResolver defaults', () => {
  it('gives a top-right toast with the chime and no confetti', () => {
    expect(createCelebrationResolver().resolve(subject)).toEqual({
      layout: 'toast',
      position: 'top-right',
      duration: 5000,
      sound: builtinSounds.chime,
      confetti: null,
      title: 'Achievement unlocked',
      quiet: false,
      progress: null,
      animation: {
        enter: 'slide-down',
        exit: 'none',
        duration: 250,
        easing: 'ease-out',
        distance: 8,
      },
    });
    expect(createCelebrationResolver().usesProgress()).toBe(false);
  });

  it('ships toast, modal, epic, quiet and secret presets', () => {
    const r = createCelebrationResolver();
    expect(r.resolve({ code: 'a', celebration: 'modal' })).toMatchObject({
      layout: 'modal',
      duration: 0,
    });
    expect(r.resolve({ code: 'a', celebration: 'epic' })).toMatchObject({
      layout: 'fullscreen',
      sound: builtinSounds.fanfare,
      confetti: { particles: 150, duration: 3000 },
    });
    expect(r.resolve({ code: 'a', celebration: 'quiet' }).quiet).toBe(true);
    expect(r.resolve({ code: 'a', hidden: true })).toMatchObject({
      title: 'Secret achievement unlocked',
      sound: builtinSounds.sparkle,
    });
    expect(r.resolve({ code: 'a', celebration: 'toast' }).layout).toBe('toast');
  });
});

describe('layering', () => {
  const r = createCelebrationResolver({
    default: { position: 'bottom-left', duration: 4000 },
    rarity: { 5: { layout: 'modal', sound: 'pop' } },
    categories: { social: { position: 'top', title: 'Social!' } },
    presets: {
      big: { layout: 'fullscreen', confetti: { particles: 40 } },
      secret: { layout: 'modal' },
    },
    overrides: {
      rich: { sound: false },
      solo: 'quiet',
      'rich.gold': { title: 'Gold!' },
    },
  });

  it('merges field by field, the more specific layer winning', () => {
    expect(r.resolve({ code: 'x', rarity: 5 })).toMatchObject({
      layout: 'modal',
      position: 'bottom-left',
      duration: 4000,
      sound: builtinSounds.pop,
    });
    expect(r.resolve({ code: 'x', rarity: 5, category: 'social' })).toMatchObject({
      layout: 'modal',
      position: 'top',
      title: 'Social!',
    });
    expect(
      r.resolve({ code: 'x', rarity: 5, category: 'social', celebration: 'big' }),
    ).toMatchObject({
      layout: 'fullscreen',
      title: 'Social!',
      confetti: { particles: 40, duration: 3000 },
    });
  });

  it('applies the secret preset to hidden achievements, below their own preset', () => {
    expect(r.resolve({ code: 'x', hidden: true })).toMatchObject({
      layout: 'modal',
      title: 'Secret achievement unlocked',
    });
    expect(r.resolve({ code: 'x', hidden: true, celebration: 'big' }).layout).toBe('fullscreen');
  });

  it('lets a series override cover every tier and a code override win over it', () => {
    const silver = r.resolve({ code: 'rich.silver', series: { code: 'rich' }, celebration: 'big' });
    expect(silver).toMatchObject({
      layout: 'fullscreen',
      sound: null,
      title: 'Achievement unlocked',
    });
    const gold = r.resolve({ code: 'rich.gold', series: { code: 'rich' } });
    expect(gold).toMatchObject({ sound: null, title: 'Gold!' });
    expect(r.resolve({ code: 'solo' }).quiet).toBe(true);
  });

  it('falls through an unknown preset key, and missing() reports it', () => {
    expect(r.resolve({ code: 'x', celebration: 'nope' })).toMatchObject({ layout: 'toast' });
    expect(
      r.missing([
        { code: 'a', celebration: 'nope' },
        { code: 'b', celebration: 'big' },
        { code: 'c' },
      ]),
    ).toEqual(['nope']);
  });

  it('resolves sound keys to registry entries, URLs to { src }', () => {
    const s = createCelebrationResolver({
      sounds: { ding: '/ding.mp3', beep: { tones: [{ freq: 440, at: 0, dur: 0.1 }] } },
      presets: { a: { sound: 'ding' }, b: { sound: 'beep' } },
    });
    expect(s.resolve({ code: 'x', celebration: 'a' }).sound).toEqual({ src: '/ding.mp3' });
    expect(s.resolve({ code: 'x', celebration: 'b' }).sound).toEqual({
      tones: [{ freq: 440, at: 0, dur: 0.1 }],
    });
  });

  it('replaces a built-in sound everywhere when a file reuses its name', () => {
    const s = createCelebrationResolver({ sounds: { chime: '/ding.mp3', fanfare: '/win.mp3' } });
    expect(s.resolve(subject).sound).toEqual({ src: '/ding.mp3' });
    expect(s.resolve({ code: 'x', celebration: 'epic' }).sound).toEqual({ src: '/win.mp3' });
  });

  it('turns confetti: true into the default burst and confetti: false into none', () => {
    const c = createCelebrationResolver({
      presets: { on: { confetti: true }, off: { confetti: false } },
    });
    expect(c.resolve({ code: 'x', celebration: 'on' }).confetti).toMatchObject({
      particles: 150,
      duration: 3000,
    });
    expect(c.resolve({ code: 'x', celebration: 'on' }).confetti?.colors.length).toBeGreaterThan(0);
    expect(c.resolve({ code: 'x', celebration: 'off' }).confetti).toBeNull();
  });
});

describe('validation', () => {
  const bad = (opts: Parameters<typeof createCelebrationResolver>[0], msg: RegExp) =>
    expect(() => createCelebrationResolver(opts)).toThrow(msg);

  it('rejects unknown keys, so typos surface', () => {
    bad({ default: { positon: 'top' } as CelebrationSpec }, /default: unknown option 'positon'/);
    bad(
      { presets: { a: { confetti: { particle: 3 } } as CelebrationSpec } },
      /presets\.a\.confetti: unknown option 'particle'/,
    );
    bad({ extra: 1 } as never, /unknown option 'extra'/);
  });

  it('checks enums and ranges', () => {
    bad({ default: { layout: 'popup' as never } }, /layout/);
    bad({ default: { position: 'middle' as never } }, /position/);
    bad({ default: { duration: -1 } }, /duration/);
    bad({ default: { duration: 1.5 } }, /duration/);
    bad({ default: { duration: 600_001 } }, /duration/);
    bad({ default: { title: '' } }, /title/);
    bad({ default: { title: 'x'.repeat(201) } }, /title/);
    bad({ default: { quiet: 'yes' as never } }, /quiet/);
    bad({ default: { confetti: 'lots' as never } }, /confetti/);
    bad({ default: { confetti: { particles: 0 } } }, /particles/);
    bad({ default: { confetti: { particles: 501 } } }, /particles/);
    bad({ default: { confetti: { colors: [] } } }, /colors/);
    bad({ default: { confetti: { colors: [''] } } }, /colors/);
    bad({ default: { confetti: { duration: 50 } } }, /duration/);
  });

  it('checks references to presets, sounds and rarity levels', () => {
    bad({ default: { sound: 'nope' } }, /sound 'nope'/);
    bad({ overrides: { a: 'nope' } }, /overrides\.a: unknown preset 'nope'/);
    bad({ categories: { c: 'nope' } }, /categories\.c/);
    bad({ rarity: { 6: 'epic' } as never }, /rarity: level '6'/);
    bad({ rarity: { 5: 'nope' } }, /rarity\.5/);
  });

  it('checks sounds: safe URLs and sane tones', () => {
    bad({ sounds: { x: 'javascript:alert(1)' } }, /sounds\.x: unsafe URL/);
    bad({ sounds: { x: ' java\tscript:alert(1)' } }, /unsafe URL/);
    bad({ sounds: { x: 'data:text/html,<b>' } }, /unsafe URL/);
    bad({ sounds: { x: { tones: [] } } }, /tones/);
    bad({ sounds: { x: { tones: [{ freq: 5, at: 0, dur: 1 }] } } }, /freq/);
    bad({ sounds: { x: { tones: [{ freq: 440, at: -1, dur: 1 }] } } }, /at/);
    bad({ sounds: { x: { tones: [{ freq: 440, at: 0, dur: 0 }] } } }, /dur/);
    bad({ sounds: { x: { tones: [{ freq: 440, at: 0, dur: 1, gain: 2 }] } } }, /gain/);
    bad(
      { sounds: { x: { tones: [{ freq: 440, at: 0, dur: 1, wave: 'noise' as never }] } } },
      /wave/,
    );
    bad({ sounds: { x: { tones: [{ freq: 440, at: 4.9, dur: 0.2 }] } } }, /5 seconds/);
    bad(
      {
        sounds: {
          x: { tones: Array.from({ length: 33 }, () => ({ freq: 440, at: 0, dur: 0.1 })) },
        },
      },
      /32/,
    );
    bad({ sounds: { x: 3 as never } }, /sounds\.x/);
  });

  it('reports every problem in one error', () => {
    try {
      createCelebrationResolver({
        default: { layout: 'x' as never, duration: -5 },
        overrides: { a: 'nope' },
      });
      expect.unreachable();
    } catch (err) {
      const msg = String((err as Error).message);
      expect(msg).toMatch(/^invalid badgetrip celebrations:/);
      expect(msg.split('\n')).toHaveLength(4);
    }
  });

  it('accepts every built-in sound as valid', () => {
    expect(() => createCelebrationResolver({ sounds: { ...builtinSounds } })).not.toThrow();
  });
});

describe('safeSrc', () => {
  it('blocks script schemes for images and audio', () => {
    for (const kind of ['image', 'audio'] as const) {
      expect(safeSrc('javascript:alert(1)', kind)).toBe('');
      expect(safeSrc('  JaVa\nScRiPt:x', kind)).toBe('');
      expect(safeSrc('vbscript:x', kind)).toBe('');
      expect(safeSrc('app://sound.ogg', kind)).toBe('app://sound.ogg');
      expect(safeSrc('/a.mp3', kind)).toBe('/a.mp3');
    }
  });

  it('allows only the matching data: type', () => {
    expect(safeSrc('data:image/png;base64,AA')).toBe('data:image/png;base64,AA');
    expect(safeSrc('data:audio/wav;base64,AA')).toBe('');
    expect(safeSrc('data:audio/wav;base64,AA', 'audio')).toBe('data:audio/wav;base64,AA');
    expect(safeSrc('data:image/png;base64,AA', 'audio')).toBe('');
    expect(safeSrc('data:text/html,<b>', 'audio')).toBe('');
  });
});

describe('sound registry forms', () => {
  it('accepts { src } objects and rejects unsafe ones', () => {
    const r = createCelebrationResolver({
      sounds: { a: { src: '/a.ogg' } },
      presets: { p: { sound: 'a' } },
    });
    expect(r.resolve({ code: 'x', celebration: 'p' }).sound).toEqual({ src: '/a.ogg' });
    expect(() => createCelebrationResolver({ sounds: { a: { src: 'javascript:x' } } })).toThrow(
      /sounds\.a: unsafe URL/,
    );
  });
});

describe('progress popups', () => {
  it('are off by default and on with true, at 25/50/75%, quiet, for 3 seconds', () => {
    const r = createCelebrationResolver({ default: { progress: true, position: 'bottom' } });
    expect(r.usesProgress()).toBe(true);
    expect(r.resolve({ code: 'a' }).progress).toEqual({
      at: [25, 50, 75],
      every: null,
      position: 'bottom',
      duration: 3000,
      sound: null,
      title: 'Achievement progress',
    });
  });

  it('take every-N steps or custom marks, per achievement, and can be switched off again', () => {
    const r = createCelebrationResolver({
      default: { progress: { at: [50] } },
      overrides: {
        todo_5: {
          progress: {
            every: 1,
            position: 'top',
            sound: 'pop',
            title: 'Keep going',
            duration: 1500,
          },
        },
        big: { progress: false },
      },
    });
    expect(r.resolve({ code: 'x' }).progress).toMatchObject({ at: [50], every: null });
    expect(r.resolve({ code: 'todo_5' }).progress).toEqual({
      at: null,
      every: 1,
      position: 'top',
      duration: 1500,
      sound: builtinSounds.pop,
      title: 'Keep going',
    });
    expect(r.resolve({ code: 'big' }).progress).toBeNull();
  });

  it('usesProgress sees progress set on any layer', () => {
    expect(createCelebrationResolver({ rarity: { 3: { progress: true } } }).usesProgress()).toBe(
      true,
    );
    expect(
      createCelebrationResolver({ categories: { c: { progress: { every: 2 } } } }).usesProgress(),
    ).toBe(true);
    expect(createCelebrationResolver({ presets: { p: { layout: 'modal' } } }).usesProgress()).toBe(
      false,
    );
  });

  it('validates the progress options', () => {
    const bad = (progress: unknown, msg: RegExp) =>
      expect(() => createCelebrationResolver({ default: { progress: progress as never } })).toThrow(
        msg,
      );
    bad('yes', /progress must be true, false or an object/);
    bad({ at: [] }, /progress.at/);
    bad({ at: [0] }, /progress.at/);
    bad({ at: [100] }, /progress.at/);
    bad({ every: 0 }, /progress.every/);
    bad({ every: 1.5 }, /progress.every/);
    bad({ position: 'middle' }, /progress.position/);
    bad({ duration: -1 }, /progress.duration/);
    bad({ sound: 'nope' }, /progress: unknown sound 'nope'/);
    bad({ title: '' }, /progress.title/);
    bad({ step: 1 }, /progress: unknown option 'step'/);
  });
});

describe('animation', () => {
  const spring = 'cubic-bezier(.2,1.4,.4,1)';

  it('defaults to the current motion: toasts slide down a little, dialogs pop', () => {
    const r = createCelebrationResolver();
    expect(r.resolve({ code: 'a', celebration: 'modal' }).animation).toEqual({
      enter: 'pop',
      exit: 'none',
      duration: 350,
      easing: spring,
      distance: 0,
    });
    expect(r.resolve({ code: 'a', celebration: 'epic' }).animation.enter).toBe('pop');
  });

  it('merges animation field by field across layers, and names spring', () => {
    const r = createCelebrationResolver({
      default: { animation: { enter: 'fade', duration: 400 } },
      presets: { big: { layout: 'modal', animation: { enter: 'bounce', easing: 'spring' } } },
      overrides: { a: { animation: { exit: 'slide' } } },
    });
    expect(r.resolve({ code: 'a', celebration: 'big' }).animation).toEqual({
      enter: 'bounce',
      exit: 'slide',
      duration: 400,
      easing: spring,
      distance: 0,
    });
    expect(r.resolve({ code: 'b' }).animation).toMatchObject({
      enter: 'fade',
      duration: 400,
      distance: 8,
    });
  });

  it('accepts a cubic-bezier easing', () => {
    const r = createCelebrationResolver({
      default: { animation: { easing: 'cubic-bezier(0.3, -0.5, 0.7, 1.5)' } },
    });
    expect(r.resolve(subject).animation.easing).toBe('cubic-bezier(0.3, -0.5, 0.7, 1.5)');
  });

  it('checks every animation field', () => {
    const bad = (animation: unknown, re: RegExp) =>
      expect(() =>
        createCelebrationResolver({ default: { animation } as CelebrationSpec }),
      ).toThrow(re);
    bad({ enter: 'zoom' }, /default.animation.enter must be one of/);
    bad({ exit: 'spin' }, /default.animation.exit must be one of/);
    bad({ duration: 5000 }, /default.animation.duration must be/);
    bad({ distance: -1 }, /default.animation.distance must be/);
    bad({ easing: 'wobbly' }, /default.animation.easing must be/);
    bad({ easing: 'cubic-bezier(2, 0, 0, 1)' }, /default.animation.easing must be/);
    bad({ easing: 'cubic-bezier(0,0,1);x' }, /default.animation.easing must be/);
    bad({ speed: 1 }, /default.animation: unknown option 'speed'/);
    bad('fade', /default.animation must be an object/);
  });
});
