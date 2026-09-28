import { matchFilter } from '@badgetrip/core';
import type { Event, EventStore, Filter } from '@badgetrip/core';
import type { Pool } from 'pg';

export function pgEventStore(pool: Pool): EventStore {
  return {
    async append(event: Event): Promise<boolean> {
      const result = await pool.query(
        `INSERT INTO events (id, actor, type, ts, payload)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [event.id, event.actor, event.type, event.ts, JSON.stringify(event.payload ?? {})],
      );
      return (result.rowCount ?? 0) > 0;
    },

    async *read(opts: {
      actor?: string;
      type?: string;
      since?: number;
      limit?: number;
    }): AsyncIterable<Event> {
      // TODO: replace with cursor-based streaming for large result sets
      const conditions: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (opts.actor !== undefined) {
        conditions.push(`actor = $${idx++}`);
        params.push(opts.actor);
      }
      if (opts.type !== undefined) {
        conditions.push(`type = $${idx++}`);
        params.push(opts.type);
      }
      if (opts.since !== undefined) {
        conditions.push(`ts >= $${idx++}`);
        params.push(opts.since);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const limitClause = opts.limit !== undefined ? `LIMIT $${idx++}` : '';
      if (opts.limit !== undefined) params.push(opts.limit);

      const sql = `SELECT id, actor, type, ts, payload FROM events ${where} ORDER BY ts ASC, seq ASC ${limitClause}`;
      const result = await pool.query(sql, params);

      for (const row of result.rows) {
        yield {
          id: row.id as string,
          actor: row.actor as string,
          type: row.type as string,
          ts: Number(row.ts),
          payload: (typeof row.payload === 'string'
            ? JSON.parse(row.payload)
            : row.payload) as Record<string, unknown>,
        };
      }
    },

    async count(opts: {
      actor: string;
      type: string;
      where?: Filter;
    }): Promise<number> {
      const result = await pool.query(
        `SELECT id, actor, type, ts, payload FROM events WHERE actor = $1 AND type = $2`,
        [opts.actor, opts.type],
      );

      if (!opts.where) return result.rows.length;

      let n = 0;
      for (const row of result.rows) {
        const event: Event = {
          id: row.id as string,
          actor: row.actor as string,
          type: row.type as string,
          ts: Number(row.ts),
          payload: (typeof row.payload === 'string'
            ? JSON.parse(row.payload)
            : row.payload) as Record<string, unknown>,
        };
        if (matchFilter(event, opts.where)) n++;
      }
      return n;
    },
  };
}
