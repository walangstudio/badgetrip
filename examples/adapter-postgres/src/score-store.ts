import type { ScoreDelta, ScoreStore } from '@badgetrip/core';
import type { Pool } from 'pg';

export function pgScoreStore(pool: Pool): ScoreStore {
  return {
    async get(actor: string, score: string): Promise<number> {
      const result = await pool.query(
        `SELECT value FROM score_totals WHERE actor = $1 AND score = $2`,
        [actor, score],
      );
      if (result.rows.length === 0) return 0;
      return Number(result.rows[0].value);
    },

    async apply(delta: ScoreDelta): Promise<number> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        await client.query(
          `INSERT INTO score_deltas (actor, score, delta, ts) VALUES ($1, $2, $3, $4)`,
          [delta.actor, delta.score, delta.delta, delta.ts],
        );

        const result = await client.query(
          `INSERT INTO score_totals (actor, score, value)
           VALUES ($1, $2, $3)
           ON CONFLICT (actor, score) DO UPDATE SET value = score_totals.value + EXCLUDED.value
           RETURNING value`,
          [delta.actor, delta.score, delta.delta],
        );

        await client.query('COMMIT');
        return Number(result.rows[0].value);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    async top(
      score: string,
      limit: number,
      window?: { since: number },
    ): Promise<{ actor: string; value: number }[]> {
      if (window) {
        const result = await pool.query(
          `SELECT actor, SUM(delta) AS value
           FROM score_deltas
           WHERE score = $1 AND ts >= $2
           GROUP BY actor
           ORDER BY value DESC, actor ASC
           LIMIT $3`,
          [score, window.since, limit],
        );
        return result.rows.map((r) => ({
          actor: r.actor as string,
          value: Number(r.value),
        }));
      }

      const result = await pool.query(
        `SELECT actor, value
         FROM score_totals
         WHERE score = $1
         ORDER BY value DESC, actor ASC
         LIMIT $2`,
        [score, limit],
      );
      return result.rows.map((r) => ({
        actor: r.actor as string,
        value: Number(r.value),
      }));
    },
  };
}
