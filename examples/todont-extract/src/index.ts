/**
 * Migration showcase: todont's real gamification, running on badgetrip.
 *
 * todont's history is not event-sourced - only current totals exist. So the path is
 * "snapshot-and-go": import current state via engine.seed(), then emit events from now
 * on. Those events are what used to be SQL triggers + pg_cron ticks.
 *
 * This script exercises the three primitives todont pushed into badgetrip (all generic):
 *   group-count (serial_offender), todBetween (night_owl), streak-sum board (cleanest),
 * plus the emitter responsibilities badgetrip deliberately leaves to the app.
 */
import {
  type Event,
  createEngine,
  fixedClock,
  memoryAchievementStore,
  memoryEventStore,
  memoryScoreStore,
  memoryStreakStore,
} from '@badgetrip/core';
import { definitions } from './badges.js';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const now = 30 * DAY;

const engine = createEngine({
  events: memoryEventStore(),
  scores: memoryScoreStore(),
  achievements: memoryAchievementStore(),
  streaks: memoryStreakStore(),
  clock: fixedClock(now),
  definitions,
});

let seq = 0;
const id = () => `e${(seq++).toString().padStart(4, '0')}`;

function log(label: string, r: Awaited<ReturnType<typeof engine.emit>>) {
  const parts: string[] = [];
  if (r.scoreDeltas.length) parts.push(r.scoreDeltas.map((d) => `${d.score}+${d.delta}`).join(' '));
  if (r.streakChanges.length)
    parts.push(r.streakChanges.map((s) => `streak ${s.from}->${s.to}`).join(' '));
  if (r.escalations.length)
    parts.push(r.escalations.map((x) => `sev ${x.from}->${x.to}`).join(' '));
  if (r.unlocked.length) parts.push(`🏅 ${r.unlocked.join(',')}`);
  if (parts.length) console.log(`  ${label}: ${parts.join(' | ')}`);
}

/**
 * The app's confession emitter. shame = the TODONT's CURRENT severity, so we read the
 * escalator first and stamp it into the payload; the same event then bumps severity for
 * next time (escalator triggerEvents includes 'confession.posted').
 */
async function confess(actor: string, todontId: string, ts = now) {
  const severity = await engine.escalator(actor, 'severity', todontId);
  return engine.emit({
    id: id(),
    actor,
    type: 'confession.posted',
    ts,
    payload: { todont_id: todontId, severity },
  });
}

/** The nightly honor/streak tick. The cron emits one per active TODONT (visibility weight). */
async function dayClean(actor: string, todontId: string, weight: number, ts = now) {
  return engine.emit({
    id: id(),
    actor,
    type: 'day.clean',
    ts,
    payload: { todont_id: todontId, weight },
  });
}

// ── 1. Import mara's existing todont state (incl. the backfilled early_adopter badge) ──
await engine.seed({
  scores: [
    { actor: 'mara', score: 'shame', value: 18 },
    { actor: 'mara', score: 'honor', value: 40 },
  ],
  achievements: [
    { actor: 'mara', code: 'first_confession', at: 0 },
    { actor: 'mara', code: 'early_adopter', at: 0 },
  ],
  streaks: [
    {
      actor: 'mara',
      code: 'clean',
      key: 't_solo',
      current: 6,
      best: 6,
      lastTick: now - DAY,
    },
  ],
});
console.log(
  'seeded mara →',
  await engine.score('mara', 'shame'),
  'shame,',
  await engine.score('mara', 'honor'),
  'honor',
);

// ── 2. serial_offender: rex confesses 10× on the SAME todont (group-count + escalator) ──
console.log('\nrex hammers one todont:');
for (let i = 0; i < 10; i++)
  log(`confess #${i + 1}`, await confess('rex', 't_42', 29 * DAY + 12 * HOUR + i));

// ── 3. mara's nightly clean tick pushes her best streak to 7 → clean_week (of:'best') ──
console.log('\nmara stays clean another night (public todont, +3 honor):');
log('day.clean', await dayClean('mara', 't_solo', 3));

// ── 4. night_owl: a confession in the 00:00–04:00 window (todBetween) ──
console.log('\nmara confesses at 2am:');
log('confess', await confess('mara', 't_night', 2 * HOUR));

// ── 5. Other users, so the leaderboards mean something ──
for (let i = 0; i < 3; i++) await confess('leo', `t_leo${i}`, 28 * DAY + 12 * HOUR + i);
await dayClean('ivy', 't_a', 3); // build ivy a big clean-sum across two todonts
for (let i = 0; i < 19; i++) await dayClean('ivy', 't_a', 3, now);
for (let i = 0; i < 5; i++) await dayClean('ivy', 't_b', 2, now);

// ── 6. Query current state - this replaces lib/tiers.ts and the leaderboard queries ──
console.log('\n── mara ──');
console.log('shame tier:', await engine.tier('mara', 'shame_tier'));
console.log('honor tier:', await engine.tier('mara', 'honor_tier'));
console.log('clean streak (t_solo):', await engine.streak('mara', 'clean', 't_solo'));
console.log('badges:', (await engine.achievements('mara')).map((a) => a.code).join(', '));

console.log('\n── rex ──');
console.log('t_42 severity (capped at 5):', await engine.escalator('rex', 'severity', 't_42'));
console.log(
  'shame:',
  await engine.score('rex', 'shame'),
  '| badges:',
  (await engine.achievements('rex')).map((a) => a.code).join(', '),
);

console.log('\n── leaderboards ──');
console.log('honest (weekly confessions):', await engine.leaderboard('honest'));
console.log('cleanest (sum of clean streaks):', await engine.leaderboard('cleanest'));
