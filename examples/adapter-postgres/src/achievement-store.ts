import type { AchievementStore } from '@badgetrip/core';
import type { Pool } from 'pg';

export function pgAchievementStore(pool: Pool): AchievementStore {
  return {
    async award(actor: string, code: string, at: number): Promise<boolean> {
      const result = await pool.query(
        `INSERT INTO achievements (actor, code, at)
         VALUES ($1, $2, $3)
         ON CONFLICT (actor, code) DO NOTHING`,
        [actor, code, at],
      );
      return (result.rowCount ?? 0) > 0;
    },

    async list(actor: string): Promise<{ code: string; at: number }[]> {
      const result = await pool.query(`SELECT code, at FROM achievements WHERE actor = $1`, [
        actor,
      ]);
      return result.rows.map((r) => ({
        code: r.code as string,
        at: Number(r.at),
      }));
    },

    async has(actor: string, code: string): Promise<boolean> {
      const result = await pool.query(`SELECT 1 FROM achievements WHERE actor = $1 AND code = $2`, [
        actor,
        code,
      ]);
      return result.rows.length > 0;
    },
  };
}
