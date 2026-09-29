import type { Celebration } from '@badgetrip/assets';

type Burst = NonNullable<Celebration['confetti']>;

const frame = (cb: (t: number) => void): number =>
  globalThis.requestAnimationFrame
    ? globalThis.requestAnimationFrame(cb)
    : (setTimeout(() => cb(Date.now()), 16) as unknown as number);
const cancel = (id: number) =>
  globalThis.cancelAnimationFrame ? globalThis.cancelAnimationFrame(id) : clearTimeout(id);

/**
 * A screen-wide confetti burst on a canvas that ignores the pointer. Returns a stop
 * function. Does nothing where 2D canvas is unavailable.
 */
export function startConfetti(
  parent: Node,
  burst: Burst,
  zIndex: number,
  onEnd: () => void = () => {},
): () => void {
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d');
  if (!g) return () => {};
  const dpr = globalThis.devicePixelRatio || 1;
  const w = globalThis.innerWidth || 800;
  const h = globalThis.innerHeight || 600;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.setAttribute('part', 'confetti');
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: String(zIndex + 1),
  });
  parent.appendChild(canvas);
  g.scale(dpr, dpr);

  const bits = Array.from({ length: burst.particles }, (_, i) => ({
    x: Math.random() * w,
    y: -20 - Math.random() * h * 0.5,
    vx: (Math.random() - 0.5) * 4,
    vy: 2 + Math.random() * 4,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    size: 6 + Math.random() * 6,
    color: burst.colors[i % burst.colors.length] as string,
  }));

  let id = 0;
  let begin = 0;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancel(id);
    canvas.remove();
    // Release the backing store now rather than whenever the canvas is collected.
    canvas.width = 0;
    canvas.height = 0;
    onEnd();
  };
  const tick = (t: number) => {
    if (stopped) return;
    if (!begin) begin = t;
    const elapsed = t - begin;
    g.clearRect(0, 0, w, h);
    // Fade out over the last third so the burst never ends abruptly.
    g.globalAlpha = Math.max(0, Math.min(1, (burst.duration - elapsed) / (burst.duration / 3)));
    for (const b of bits) {
      b.x += b.vx;
      b.y += b.vy;
      b.vy += 0.05;
      b.r += b.vr;
      g.save();
      g.translate(b.x, b.y);
      g.rotate(b.r);
      g.fillStyle = b.color;
      g.fillRect(-b.size / 2, -b.size / 4, b.size, b.size / 2);
      g.restore();
    }
    if (elapsed >= burst.duration) stop();
    else id = frame(tick);
  };
  id = frame(tick);
  return stop;
}
