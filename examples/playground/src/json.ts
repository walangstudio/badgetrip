/** The offset a JSON.parse message points at: Chrome says "position N", Firefox "line L column C". */
function reportedAt(message: string, text: string): number | undefined {
  const pos = /position (\d+)/.exec(message);
  if (pos) return Number(pos[1]);
  const lc = /line (\d+) column (\d+)/.exec(message);
  if (!lc) return undefined;
  const lines = text.split('\n').slice(0, Number(lc[1]) - 1);
  return lines.reduce((n, l) => n + l.length + 1, 0) + Number(lc[2]) - 1;
}

/**
 * Where JSON.parse gives up, even when the browser's message doesn't say. A prefix that is
 * fine so far only fails at its own end; the shortest one failing earlier ends on the mistake.
 */
export function jsonErrorAt(text: string): number {
  const fineSoFar = (n: number) => {
    const prefix = text.slice(0, n);
    try {
      JSON.parse(prefix);
      return true;
    } catch (err) {
      const msg = (err as Error).message;
      const at = reportedAt(msg, prefix);
      return at === undefined ? /end of|EOF/i.test(msg) : at >= prefix.trimEnd().length;
    }
  };
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (fineSoFar(mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
