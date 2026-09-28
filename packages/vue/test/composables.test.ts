import { flushPromises, mount } from '@vue/test-utils';
// @vitest-environment jsdom
import {
  type Engine,
  createEngine,
  memoryAchievementStore,
  memoryEventStore,
  memoryScoreStore,
  memoryStreakStore,
} from '@walangstudio/badgetrip-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import {
  createBadgetrip,
  provideBadgetrip,
  useAchievementCatalog,
  useAchievementProgress,
  useAchievements,
  useBadgetrip,
  useEscalator,
  useLeaderboard,
  useScore,
  useStreak,
  useTier,
} from '../src/index.js';

function makeEngine(): Engine {
  return createEngine({
    events: memoryEventStore(),
    scores: memoryScoreStore(),
    achievements: memoryAchievementStore(),
    streaks: memoryStreakStore(),
    clock: { now: () => 0 },
    definitions: {
      scores: ['honor'],
      points: [{ on: 'win', score: 'honor', delta: 2 }],
      tiers: [
        {
          code: 'rank',
          score: 'honor',
          thresholds: [{ name: 'bronze', at: 2 }],
        },
      ],
      leaderboards: [{ code: 'top', score: 'honor', window: 'all-time', limit: 5 }],
      streaks: [
        {
          code: 'daily',
          resetEvents: ['miss'],
          tickEvents: ['win'],
          scoping: 'per-actor',
        },
      ],
      escalators: [
        {
          code: 'heat',
          triggerEvents: ['win'],
          resetEvents: ['miss'],
          min: 0,
          max: 3,
          step: 1,
        },
      ],
      achievements: [
        {
          code: 'first_win',
          name: 'First Win',
          description: '',
          rarity: 1,
          rule: { kind: 'count', eventType: 'win', gte: 1 },
        },
      ],
    },
  });
}

const win = (id: string, actor = 'u1') => ({
  id,
  actor,
  type: 'win',
  ts: 0,
  payload: {},
});

function withSetup<T>(engine: Engine, setup: () => T, errorHandler?: (err: unknown) => void) {
  let out!: T & { engine: Engine };
  const wrapper = mount(
    defineComponent({
      setup() {
        out = { ...setup(), engine: useBadgetrip() };
        return () => null;
      },
    }),
    {
      global: {
        plugins: [createBadgetrip(engine)],
        config: errorHandler ? { errorHandler } : {},
      },
    },
  );
  return { out, wrapper };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('@walangstudio/badgetrip-vue composables', () => {
  it('every composable updates after emit', async () => {
    const { out } = withSetup(makeEngine(), () => ({
      score: useScore('u1', 'honor'),
      list: useAchievements('u1'),
      catalog: useAchievementCatalog('u1'),
      progress: useAchievementProgress('u1', 'first_win'),
      board: useLeaderboard('top'),
      streak: useStreak('u1', 'daily'),
      tier: useTier('u1', 'rank'),
      heat: useEscalator('u1', 'heat'),
    }));
    expect(out.score.data.value).toBe(0);
    await flushPromises();
    expect(out.catalog.data.value.map((a) => a.unlocked)).toEqual([false]);

    await out.engine.emit(win('a'));
    await flushPromises();
    expect(out.score.data.value).toBe(2);
    expect(out.list.data.value.map((a) => a.code)).toEqual(['first_win']);
    expect(out.catalog.data.value.map((a) => a.unlocked)).toEqual([true]);
    expect(out.progress.data.value.percent).toBe(100);
    expect(out.board.data.value).toEqual([{ actor: 'u1', value: 2 }]);
    expect(out.streak.data.value.current).toBe(1);
    expect(out.tier.data.value?.current).toBe('bronze');
    expect(out.heat.data.value).toBe(1);
  });

  it('replay and seed notify', async () => {
    const { out } = withSetup(makeEngine(), () => useScore('u1', 'honor'));
    await out.engine.replay([win('a')]);
    await flushPromises();
    expect(out.data.value).toBe(2);
    await out.engine.seed({
      scores: [{ actor: 'u1', score: 'honor', value: 10 }],
    });
    await flushPromises();
    expect(out.data.value).toBe(12);
  });

  it('re-queries when a reactive arg changes', async () => {
    const engine = makeEngine();
    await engine.emit(win('a', 'u2'));
    const actor = ref('u1');
    const { out } = withSetup(engine, () => ({
      ref: useScore(actor, 'honor'),
      getter: useScore(() => actor.value, 'honor'),
    }));
    await flushPromises();
    expect([out.ref.data.value, out.getter.data.value]).toEqual([0, 0]);
    actor.value = 'u2';
    await flushPromises();
    expect([out.ref.data.value, out.getter.data.value]).toEqual([2, 2]);
  });

  it('applies only the latest request when responses arrive out of order', async () => {
    const base = makeEngine();
    const pending = new Map<string, (v: number) => void>();
    const engine: Engine = {
      ...base,
      score: (actor) => new Promise<number>((resolve) => pending.set(actor, resolve)),
    };
    const actor = ref('slow');
    const { out } = withSetup(engine, () => useScore(actor, 'honor'));
    await nextTick();
    actor.value = 'fast';
    await nextTick();
    pending.get('fast')?.(7);
    await flushPromises();
    pending.get('slow')?.(99);
    await flushPromises();
    expect(out.data.value).toBe(7);
  });

  it('exposes a rejected query on error and forwards it to app.config.errorHandler', async () => {
    const handler = vi.fn();
    const { out } = withSetup(makeEngine(), () => useLeaderboard('missing'), handler);
    await flushPromises();
    expect((out.error.value as Error).message).toBe('unknown leaderboard: missing');
    expect(handler).toHaveBeenCalledWith(out.error.value, expect.anything(), expect.any(String));
    expect(out.data.value).toEqual([]);
  });

  it('stops re-querying once unmounted', async () => {
    const engine = makeEngine();
    const spy = vi.spyOn(engine, 'score');
    const { out, wrapper } = withSetup(engine, () => useScore('u1', 'honor'));
    await flushPromises();
    const calls = spy.mock.calls.length;
    wrapper.unmount();
    await out.engine.emit(win('a'));
    await flushPromises();
    expect(spy.mock.calls.length).toBe(calls);
  });

  it('provideBadgetrip scopes an engine to a subtree', async () => {
    const engine = makeEngine();
    await engine.emit(win('a'));
    let score!: ReturnType<typeof useScore>;
    const Child = defineComponent({
      setup() {
        score = useScore('u1', 'honor');
        return () => null;
      },
    });
    mount(
      defineComponent({
        setup() {
          provideBadgetrip(engine);
          return () => h(Child);
        },
      }),
    );
    await flushPromises();
    expect(score.data.value).toBe(2);
  });

  it('throws a clear error without the plugin', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Probe = defineComponent({
      setup() {
        useScore('u1', 'honor');
        return () => null;
      },
    });
    expect(() => mount(Probe)).toThrow(/createBadgetrip/);
  });
});
