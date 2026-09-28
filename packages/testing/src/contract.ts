import type { Event, Stores } from '@badgetrip/core';
import { beforeEach, describe, expect, it } from 'vitest';

type StoreFactory = () => Stores | Promise<Stores>;

const ev = (p: Partial<Event> & Pick<Event, 'id' | 'actor' | 'type'>): Event => ({
  ts: 0,
  payload: {},
  ...p,
});

/**
 * Behavioral conformance suite for a badgetrip store implementation. Call it from a
 * vitest test file, passing a factory that returns FRESH, EMPTY stores each time
 * (a DB-backed factory should migrate + truncate). If this passes, your stores are
 * a drop-in replacement for the in-memory reference.
 *
 *   import { runStoreContract } from '@badgetrip/testing';
 *   runStoreContract(() => myStores());
 */
export function runStoreContract(factory: StoreFactory): void {
  describe('badgetrip store contract', () => {
    let s: Stores;
    beforeEach(async () => {
      s = await factory();
    });

    describe('EventStore', () => {
      it('append is idempotent by id and reports whether it inserted', async () => {
        expect(await s.events.append(ev({ id: 'a', actor: 'u', type: 't', ts: 1 }))).toBe(true);
        expect(await s.events.append(ev({ id: 'a', actor: 'u', type: 't', ts: 1 }))).toBe(false);
        expect(await s.events.count({ actor: 'u', type: 't' })).toBe(1);
      });

      it('a duplicate id with different content keeps the first event', async () => {
        await s.events.append(ev({ id: 'a', actor: 'u', type: 't', ts: 1 }));
        expect(await s.events.append(ev({ id: 'a', actor: 'v', type: 'x', ts: 2 }))).toBe(false);
        const out: Event[] = [];
        for await (const e of s.events.read({})) out.push(e);
        expect(out.map((e) => [e.actor, e.type])).toEqual([['u', 't']]);
      });

      it('concurrent appends of one id insert exactly once', async () => {
        const e = ev({ id: 'c', actor: 'u', type: 't', ts: 1 });
        const results = await Promise.all([1, 2, 3, 4].map(() => s.events.append(e)));
        expect(results.filter(Boolean)).toHaveLength(1);
        expect(await s.events.count({ actor: 'u', type: 't' })).toBe(1);
      });

      it('count is 0 for an unknown actor', async () => {
        expect(await s.events.count({ actor: 'nobody', type: 't' })).toBe(0);
      });

      it('read yields ascending ts regardless of append order', async () => {
        await s.events.append(ev({ id: 'c', actor: 'u', type: 't', ts: 300 }));
        await s.events.append(ev({ id: 'a', actor: 'u', type: 't', ts: 100 }));
        await s.events.append(ev({ id: 'b', actor: 'u', type: 't', ts: 200 }));
        const ids: string[] = [];
        for await (const e of s.events.read({ actor: 'u' })) ids.push(e.id);
        expect(ids).toEqual(['a', 'b', 'c']);
      });

      it('read filters by actor, type, and inclusive since', async () => {
        await s.events.append(ev({ id: '1', actor: 'alice', type: 'x', ts: 10 }));
        await s.events.append(ev({ id: '2', actor: 'bob', type: 'x', ts: 20 }));
        await s.events.append(ev({ id: '3', actor: 'alice', type: 'y', ts: 30 }));
        await s.events.append(ev({ id: '4', actor: 'alice', type: 'x', ts: 40 }));
        const ids: string[] = [];
        for await (const e of s.events.read({
          actor: 'alice',
          type: 'x',
          since: 40,
        }))
          ids.push(e.id);
        expect(ids).toEqual(['4']);
      });

      it('read combines since and limit', async () => {
        for (const n of [1, 2, 3, 4]) {
          await s.events.append(ev({ id: `e${n}`, actor: 'u', type: 't', ts: n }));
        }
        const ids: string[] = [];
        for await (const e of s.events.read({ since: 2, limit: 2 })) ids.push(e.id);
        expect(ids).toEqual(['e2', 'e3']);
      });

      it('read respects limit', async () => {
        for (const n of [1, 2, 3, 4]) {
          await s.events.append(ev({ id: `e${n}`, actor: 'u', type: 't', ts: n }));
        }
        const ids: string[] = [];
        for await (const e of s.events.read({ actor: 'u', limit: 2 })) ids.push(e.id);
        expect(ids).toEqual(['e1', 'e2']);
      });

      it('count honours a where filter', async () => {
        await s.events.append(ev({ id: '1', actor: 'u', type: 'a', ts: 1, payload: { sev: 5 } }));
        await s.events.append(ev({ id: '2', actor: 'u', type: 'a', ts: 2, payload: { sev: 1 } }));
        const n = await s.events.count({
          actor: 'u',
          type: 'a',
          where: { path: 'payload.sev', op: '>', value: 3 },
        });
        expect(n).toBe(1);
      });

      it('tolerates an event with a missing payload', async () => {
        await s.events.append({
          id: 'np',
          actor: 'u',
          type: 't',
          ts: 1,
        } as unknown as Event);
        const out: Event[] = [];
        for await (const e of s.events.read({ actor: 'u' })) out.push(e);
        expect(out).toHaveLength(1);
        expect(out[0]?.payload ?? {}).toEqual({});
      });

      it('maxGroupSize returns the largest group, honouring where (optional)', async (ctx) => {
        if (!s.events.maxGroupSize) return ctx.skip();
        await s.events.append(
          ev({
            id: '1',
            actor: 'u',
            type: 'c',
            ts: 1,
            payload: { t: 'A', big: true },
          }),
        );
        await s.events.append(
          ev({
            id: '2',
            actor: 'u',
            type: 'c',
            ts: 2,
            payload: { t: 'A', big: true },
          }),
        );
        await s.events.append(
          ev({
            id: '3',
            actor: 'u',
            type: 'c',
            ts: 3,
            payload: { t: 'A', big: false },
          }),
        );
        await s.events.append(
          ev({
            id: '4',
            actor: 'u',
            type: 'c',
            ts: 4,
            payload: { t: 'B', big: true },
          }),
        );
        expect(
          await s.events.maxGroupSize({
            actor: 'u',
            type: 'c',
            by: 'payload.t',
          }),
        ).toBe(3);
        expect(
          await s.events.maxGroupSize({
            actor: 'u',
            type: 'c',
            by: 'payload.t',
            where: { path: 'payload.big', op: '=', value: true },
          }),
        ).toBe(2);
        await s.events.append(ev({ id: '5', actor: 'u', type: 'c', ts: 5, payload: {} }));
        expect(
          await s.events.maxGroupSize({
            actor: 'u',
            type: 'c',
            by: 'payload.t',
          }),
        ).toBe(3);
        expect(
          await s.events.maxGroupSize({
            actor: 'nobody',
            type: 'c',
            by: 'payload.t',
          }),
        ).toBe(0);
      });
    });

    describe('ScoreStore', () => {
      it('get returns 0 for an unknown actor/score', async () => {
        expect(await s.scores.get('nobody', 'pts')).toBe(0);
      });

      it('apply accumulates and returns the new total', async () => {
        expect(
          await s.scores.apply({
            actor: 'u',
            score: 'pts',
            delta: 3,
            reason: 'r',
            ts: 0,
          }),
        ).toBe(3);
        expect(
          await s.scores.apply({
            actor: 'u',
            score: 'pts',
            delta: 4,
            reason: 'r',
            ts: 0,
          }),
        ).toBe(7);
        expect(await s.scores.get('u', 'pts')).toBe(7);
      });

      it('top ranks all-time descending, tie-break by actor', async () => {
        await s.scores.apply({
          actor: 'alice',
          score: 'h',
          delta: 5,
          reason: 'r',
          ts: 0,
        });
        await s.scores.apply({
          actor: 'bob',
          score: 'h',
          delta: 9,
          reason: 'r',
          ts: 0,
        });
        await s.scores.apply({
          actor: 'carol',
          score: 'h',
          delta: 9,
          reason: 'r',
          ts: 0,
        });
        expect(await s.scores.top('h', 2)).toEqual([
          { actor: 'bob', value: 9 },
          { actor: 'carol', value: 9 },
        ]);
      });

      it('top with a rolling window only counts deltas since the cutoff', async () => {
        await s.scores.apply({
          actor: 'x',
          score: 'w',
          delta: 5,
          reason: 'r',
          ts: 50,
        });
        await s.scores.apply({
          actor: 'x',
          score: 'w',
          delta: 10,
          reason: 'r',
          ts: 100,
        });
        expect(await s.scores.top('w', 10, { since: 75 })).toEqual([{ actor: 'x', value: 10 }]);
      });

      it('top window since is inclusive at an exact delta ts', async () => {
        await s.scores.apply({
          actor: 'x',
          score: 'w',
          delta: 5,
          reason: 'r',
          ts: 50,
        });
        await s.scores.apply({
          actor: 'x',
          score: 'w',
          delta: 10,
          reason: 'r',
          ts: 100,
        });
        expect(await s.scores.top('w', 10, { since: 100 })).toEqual([{ actor: 'x', value: 10 }]);
      });

      it('top windowed ranking breaks ties by actor and counts negative deltas', async () => {
        await s.scores.apply({
          actor: 'bob',
          score: 'w',
          delta: 4,
          reason: 'r',
          ts: 10,
        });
        await s.scores.apply({
          actor: 'amy',
          score: 'w',
          delta: 6,
          reason: 'r',
          ts: 10,
        });
        await s.scores.apply({
          actor: 'amy',
          score: 'w',
          delta: -2,
          reason: 'r',
          ts: 20,
        });
        expect(await s.scores.top('w', 10, { since: 0 })).toEqual([
          { actor: 'amy', value: 4 },
          { actor: 'bob', value: 4 },
        ]);
      });

      it('top caps at limit and tolerates a limit beyond the population', async () => {
        await s.scores.apply({
          actor: 'a',
          score: 'p',
          delta: 1,
          reason: 'r',
          ts: 0,
        });
        await s.scores.apply({
          actor: 'b',
          score: 'p',
          delta: 2,
          reason: 'r',
          ts: 0,
        });
        expect(await s.scores.top('p', 1)).toEqual([{ actor: 'b', value: 2 }]);
        expect(await s.scores.top('p', 100)).toHaveLength(2);
        expect(await s.scores.top('unknown', 5)).toEqual([]);
      });

      it('concurrent applies do not lose updates', async () => {
        await Promise.all(
          [1, 2, 3, 4, 5].map(() =>
            s.scores.apply({
              actor: 'u',
              score: 'c',
              delta: 1,
              reason: 'r',
              ts: 0,
            }),
          ),
        );
        expect(await s.scores.get('u', 'c')).toBe(5);
      });
    });

    describe('AchievementStore', () => {
      it('award is idempotent and has/list reflect it', async () => {
        expect(await s.achievements.award('u', 'badge', 1)).toBe(true);
        expect(await s.achievements.award('u', 'badge', 2)).toBe(false);
        expect(await s.achievements.has('u', 'badge')).toBe(true);
        expect(await s.achievements.has('u', 'other')).toBe(false);
        expect(await s.achievements.list('u')).toEqual([{ code: 'badge', at: 1 }]);
        expect(await s.achievements.list('nobody')).toEqual([]);
      });

      it('concurrent awards of one badge succeed exactly once', async () => {
        const results = await Promise.all([1, 2, 3].map((n) => s.achievements.award('u', 'b', n)));
        expect(results.filter(Boolean)).toHaveLength(1);
        expect(await s.achievements.list('u')).toHaveLength(1);
      });
    });

    describe('StreakStore', () => {
      it('get returns zeros for an unknown streak', async () => {
        expect(await s.streaks.get('u', 'd')).toEqual({
          current: 0,
          best: 0,
          lastTick: 0,
        });
      });

      it('tick increments current and tracks best; reset keeps best and returns the previous current', async () => {
        await s.streaks.tick('u', 'd', undefined, 1);
        expect(await s.streaks.tick('u', 'd', undefined, 2)).toEqual({
          current: 2,
          best: 2,
        });
        expect(await s.streaks.reset('u', 'd', undefined, 3)).toBe(2);
        expect(await s.streaks.get('u', 'd')).toEqual({
          current: 0,
          best: 2,
          lastTick: 3,
        });
        expect(await s.streaks.reset('u', 'd', undefined, 4)).toBe(0);
      });

      it('scopes by key independently', async () => {
        await s.streaks.tick('u', 'item', 'sword', 1);
        await s.streaks.tick('u', 'item', 'sword', 2);
        await s.streaks.tick('u', 'item', 'shield', 1);
        expect((await s.streaks.get('u', 'item', 'sword')).current).toBe(2);
        expect((await s.streaks.get('u', 'item', 'shield')).current).toBe(1);
        expect((await s.streaks.get('u', 'item')).current).toBe(0);
      });

      it('reset on an unknown streak returns 0 and leaves zeros with the reset time', async () => {
        expect(await s.streaks.reset('u', 'fresh', undefined, 7)).toBe(0);
        expect(await s.streaks.get('u', 'fresh')).toEqual({
          current: 0,
          best: 0,
          lastTick: 7,
        });
      });

      it('concurrent ticks do not lose updates and each reports a distinct current', async () => {
        const rs = await Promise.all(
          [1, 2, 3, 4].map((n) => s.streaks.tick('u', 'c', undefined, n)),
        );
        expect(rs.map((r) => r.current).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
        expect((await s.streaks.get('u', 'c')).current).toBe(4);
      });

      it('concurrent resets report the previous current exactly once', async () => {
        for (const n of [1, 2, 3]) await s.streaks.tick('u', 'r', undefined, n);
        const prev = await Promise.all([4, 5].map((n) => s.streaks.reset('u', 'r', undefined, n)));
        expect(prev.sort((a, b) => a - b)).toEqual([0, 3]);
        expect(await s.streaks.get('u', 'r')).toMatchObject({
          current: 0,
          best: 3,
        });
      });

      it('topByCurrentSum sums current across keys, descending, tie-break by actor (optional)', async (ctx) => {
        if (!s.streaks.topByCurrentSum) return ctx.skip();
        await s.streaks.tick('alice', 'clean', 'A', 1);
        await s.streaks.tick('alice', 'clean', 'A', 2);
        await s.streaks.tick('alice', 'clean', 'B', 1);
        await s.streaks.tick('bob', 'clean', 'X', 1);
        await s.streaks.tick('carol', 'clean', 'Y', 1);
        expect(await s.streaks.topByCurrentSum('clean', 10)).toEqual([
          { actor: 'alice', value: 3 },
          { actor: 'bob', value: 1 },
          { actor: 'carol', value: 1 },
        ]);
        expect(await s.streaks.topByCurrentSum('clean', 1)).toEqual([{ actor: 'alice', value: 3 }]);
      });

      it('topByCurrentSum omits actors whose sum is 0 (optional)', async (ctx) => {
        if (!s.streaks.topByCurrentSum) return ctx.skip();
        await s.streaks.tick('alice', 'clean', 'A', 1);
        await s.streaks.tick('bob', 'clean', 'X', 1);
        await s.streaks.reset('bob', 'clean', 'X', 2);
        expect(await s.streaks.topByCurrentSum('clean', 10)).toEqual([
          { actor: 'alice', value: 1 },
        ]);
      });

      it('statsAcrossKeys reports max current and best over an actor keys (optional)', async (ctx) => {
        if (!s.streaks.statsAcrossKeys) return ctx.skip();
        await s.streaks.tick('u', 'clean', 'A', 1);
        await s.streaks.tick('u', 'clean', 'A', 2);
        await s.streaks.tick('u', 'clean', 'A', 3); // A: current 3, best 3
        await s.streaks.reset('u', 'clean', 'A', 4); // A: current 0, best 3
        await s.streaks.tick('u', 'clean', 'B', 5); // B: current 1, best 1
        expect(await s.streaks.statsAcrossKeys('u', 'clean')).toEqual({
          maxCurrent: 1,
          maxBest: 3,
        });
        expect(await s.streaks.statsAcrossKeys('nobody', 'clean')).toEqual({
          maxCurrent: 0,
          maxBest: 0,
        });
      });
    });
  });
}
