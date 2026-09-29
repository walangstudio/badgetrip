import { type SoundAsset, type Tone, safeSrc } from '@walangstudio/badgetrip-assets';

type Ctx = AudioContext;
type CtxCtor = new () => Ctx;

const noop = () => {};

/**
 * Plays celebration sounds. Browsers keep audio suspended until the user interacts
 * with the page, so `arm()` resumes the context on the next pointer or key press.
 * Every failure is swallowed: a blocked sound must never break the page.
 */
export function createPlayer() {
  let ctx: Ctx | undefined;
  let armed = false;
  const context = (): Ctx | undefined => {
    if (ctx) return ctx;
    const g = globalThis as { AudioContext?: CtxCtor; webkitAudioContext?: CtxCtor };
    const C = g.AudioContext ?? g.webkitAudioContext;
    if (!C) return undefined;
    try {
      ctx = new C();
    } catch {
      return undefined;
    }
    return ctx;
  };
  const wake = () => {
    context()?.resume().catch(noop);
  };
  const disarm = () => {
    if (!armed) return;
    armed = false;
    document.removeEventListener('pointerdown', wake, true);
    document.removeEventListener('keydown', wake, true);
  };

  const tones = (c: Ctx, sound: { tones: Tone[] }, volume: number) => {
    const start = c.currentTime + 0.01;
    for (const t of sound.tones) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      const t0 = start + t.at;
      osc.type = t.wave ?? 'sine';
      osc.frequency.setValueAtTime(t.freq, t0);
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime((t.gain ?? 0.5) * volume, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + t.dur);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + t.dur + 0.05);
    }
  };

  return {
    /** Resume audio on the next user gesture. Call when sound is turned on. */
    arm() {
      if (armed || typeof document === 'undefined') return;
      armed = true;
      document.addEventListener('pointerdown', wake, true);
      document.addEventListener('keydown', wake, true);
    },
    disarm,
    play(sound: SoundAsset, volume: number) {
      try {
        if ('src' in sound) {
          const src = safeSrc(sound.src, 'audio');
          if (!src || typeof Audio === 'undefined') return;
          const a = new Audio(src);
          a.volume = volume;
          a.play()?.catch(noop);
          return;
        }
        const c = context();
        if (!c) return;
        // A suspended context stays suspended until a user gesture, and a resume()
        // would hold this sound until then. Drop it instead; later sounds will play.
        if (c.state === 'running') tones(c, sound, volume);
        else c.resume().catch(noop);
      } catch {
        // Audio is decoration; never let it throw into the app.
      }
    },
    dispose() {
      disarm();
      ctx?.close().catch(noop);
      ctx = undefined;
    },
  };
}

export type Player = ReturnType<typeof createPlayer>;
