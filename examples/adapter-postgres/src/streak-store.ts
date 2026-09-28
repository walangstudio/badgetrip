import type { StreakStore } from '@walangstudio/badgetrip-core';
import type { Pool } from 'pg';

const UNDEFINED_KEY = '';

export function pgStreakStore(pool: Pool): StreakStore {
  return {
    async get(
      actor: string,
      code: string,
      key?: string,
    ): Promise<{ current: number; best: number; lastTick: number }> {
      const k = key ?? UNDEFINED_KEY;
      const result = await pool.query(
        `SELECT current, best, last_tick FROM streaks WHERE actor = $1 AND code = $2 AND key = $3`,
        [actor, code, k],
      );
      if (result.rows.length === 0) return { current: 0, best: 0, lastTick: 0 };
      const row = result.rows[0];
      return {
        current: Number(row.current),
        best: Number(row.best),
        lastTick: Number(row.last_tick),
      };
    },

    async tick(
      actor: string,
      code: string,
      key: string | undefined,
      at: number,
    ): Promise<{ current: number; best: number }> {
      const k = key ?? UNDEFINED_KEY;
      const result = await pool.query(
        `INSERT INTO streaks (actor, code, key, current, best, last_tick)
         VALUES ($1, $2, $3, 1, 1, $4)
         ON CONFLICT (actor, code, key) DO UPDATE
           SET current   = streaks.current + 1,
               best      = GREATEST(streaks.best, streaks.current + 1),
               last_tick = EXCLUDED.last_tick
         RETURNING current, best`,
        [actor, code, k, at],
      );
      const row = result.rows[0];
      return { current: Number(row.current), best: Number(row.best) };
    },

    async reset(actor: string, code: string, key: string | undefined, at: number): Promise<number> {
      const k = key ?? UNDEFINED_KEY;
      await pool.query(
        `INSERT INTO streaks (actor, code, key, current, best, last_tick)
         VALUES ($1, $2, $3, 0, 0, $4)
         ON CONFLICT (actor, code, key) DO NOTHING`,
        [actor, code, k, at],
      );
      // FOR UPDATE in the sub-select locks the row, so a concurrent reset/tick waits and
      // prev.current is re-read after it commits. A plain self-join would return a stale value.
      const result = await pool.query(
        `UPDATE streaks s
         SET current = 0, last_tick = $4
         FROM (SELECT actor, code, key, current FROM streaks
               WHERE actor = $1 AND code = $2 AND key = $3 FOR UPDATE) prev
         WHERE s.actor = prev.actor AND s.code = prev.code AND s.key = prev.key
         RETURNING prev.current`,
        [actor, code, k, at],
      );
      return Number(result.rows[0]?.current ?? 0);
    },

    async topByCurrentSum(code: string, limit: number) {
      const result = await pool.query(
        `SELECT actor, SUM(current) AS value FROM streaks WHERE code = $1
         GROUP BY actor HAVING SUM(current) > 0
         ORDER BY value DESC, actor ASC LIMIT $2`,
        [code, limit],
      );
      return result.rows.map((r) => ({
        actor: r.actor as string,
        value: Number(r.value),
      }));
    },

    async statsAcrossKeys(actor: string, code: string) {
      const result = await pool.query(
        `SELECT COALESCE(MAX(current), 0) AS max_current, COALESCE(MAX(best), 0) AS max_best
         FROM streaks WHERE actor = $1 AND code = $2`,
        [actor, code],
      );
      const row = result.rows[0];
      return {
        maxCurrent: Number(row.max_current),
        maxBest: Number(row.max_best),
      };
    },
  };
}
