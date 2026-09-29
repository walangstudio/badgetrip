import type { Event } from '@walangstudio/badgetrip-core';
import {
  AchievementBadge,
  UnlockNotifier,
  useAchievementCatalog,
  useBadgetrip,
  useLeaderboard,
  useScore,
  useStreak,
  useTier,
} from '@walangstudio/badgetrip-react';
import { useState } from 'react';
import { ACTOR, celebrations } from './engine.js';

let seq = 0;
const id = () => `evt_${(seq++).toString().padStart(6, '0')}`;
const fans = ['ann', 'ben', 'cara', 'dan', 'evy'];

export function App() {
  const engine = useBadgetrip();
  const shame = useScore(ACTOR, 'shame');
  const honor = useScore(ACTOR, 'honor');
  const tier = useTier(ACTOR, 'shame_tier');
  const streak = useStreak(ACTOR, 'daily_clean');
  const achievements = useAchievementCatalog(ACTOR);
  const points = achievements.reduce((n, a) => n + (a.unlocked ? a.points : 0), 0);
  const board = useLeaderboard('honor_board');
  const [sound, setSound] = useState(false);

  const emit = (type: string, payload: Record<string, unknown> = {}) => {
    const e: Event = { id: id(), actor: ACTOR, type, ts: Date.now(), payload };
    void engine.emit(e);
  };

  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        maxWidth: 640,
        margin: '2rem auto',
        padding: '0 1rem',
      }}
    >
      <h1>badgetrip demo</h1>
      <UnlockNotifier actor={ACTOR} celebrations={celebrations} sound={sound} />
      <label style={{ display: 'block', marginBottom: '1rem' }}>
        <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /> sound
      </label>

      <section
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem 2rem',
          whiteSpace: 'nowrap',
        }}
      >
        <div>
          <strong>shame</strong>: {shame}{' '}
          {tier?.current
            ? `(${tier.current}${tier.next ? ` → ${tier.next} in ${tier.remaining}` : ''})`
            : '(unranked)'}
        </div>
        <div>
          <strong>honor</strong>: {honor}
        </div>
        <div>
          <strong>streak</strong>: {streak.current} (best {streak.best})
        </div>
      </section>

      <section
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          margin: '1rem 0',
        }}
      >
        <button type="button" onClick={() => emit('todont.created')}>
          create todont
        </button>
        <button type="button" onClick={() => emit('confession.posted', { severity: 3 })}>
          confess (sev 3)
        </button>
        <button
          type="button"
          onClick={() => emit('reaction.received', { from: fans[seq % fans.length] })}
        >
          get reaction
        </button>
        <button type="button" onClick={() => emit('day.clean')}>
          clean day
        </button>
        <button type="button" onClick={() => emit('day.dirty')}>
          slip up
        </button>
      </section>

      <section>
        <h2>achievements ({points} pts)</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: '1rem',
          }}
        >
          {achievements.map((a) => (
            <AchievementBadge key={a.code} achievement={a} />
          ))}
        </div>
      </section>

      <section>
        <h2>honor leaderboard</h2>
        {board.length === 0 ? (
          <p>No honor yet. Get a reaction to join the board.</p>
        ) : (
          <ol>
            {board.map((row) => (
              <li key={row.actor}>
                {row.actor}: {row.value}
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
