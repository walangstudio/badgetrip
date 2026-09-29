/** One synthesized note. `at` and `dur` are seconds; `gain` is 0-1. */
export type Tone = {
  freq: number;
  at: number;
  dur: number;
  wave?: 'sine' | 'square' | 'triangle' | 'sawtooth';
  gain?: number;
};

/** A sound: notes synthesized with Web Audio, or a file URL. */
export type SoundAsset = { tones: Tone[] } | { src: string };

const note = (freq: number, at: number, dur: number, wave: Tone['wave'], gain: number): Tone => ({
  freq,
  at,
  dur,
  wave,
  gain,
});

/** Built-in sounds, synthesized at play time. No audio files ship with badgetrip. */
export const builtinSounds = {
  chime: {
    tones: [note(880, 0, 0.35, 'sine', 0.5), note(1318.51, 0.12, 0.6, 'sine', 0.4)],
  },
  fanfare: {
    tones: [
      note(523.25, 0, 0.14, 'triangle', 0.5),
      note(659.25, 0.14, 0.14, 'triangle', 0.5),
      note(783.99, 0.28, 0.14, 'triangle', 0.5),
      note(1046.5, 0.42, 0.7, 'triangle', 0.6),
      note(1318.51, 0.42, 0.7, 'sine', 0.25),
    ],
  },
  sparkle: {
    tones: [
      note(1567.98, 0, 0.12, 'sine', 0.35),
      note(2093, 0.08, 0.12, 'sine', 0.3),
      note(2637.02, 0.16, 0.3, 'sine', 0.25),
    ],
  },
  pop: {
    tones: [note(660, 0, 0.08, 'square', 0.25), note(990, 0.05, 0.12, 'sine', 0.3)],
  },
} satisfies Record<string, { tones: Tone[] }>;

for (const s of Object.values(builtinSounds)) {
  for (const t of s.tones) Object.freeze(t);
  Object.freeze(s.tones);
  Object.freeze(s);
}
Object.freeze(builtinSounds);

export type BuiltinSound = keyof typeof builtinSounds;
