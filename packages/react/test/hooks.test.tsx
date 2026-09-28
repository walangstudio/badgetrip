// @vitest-environment jsdom
import {
  type Engine,
  createEngine,
  memoryAchievementStore,
  memoryEventStore,
  memoryScoreStore,
  memoryStreakStore,
} from '@badgetrip/core';
import {
  BadgetripProvider,
  useAchievements,
  useBadgetrip,
  useEscalator,
  useLeaderboard,
  useScore,
  useStreak,
  useTier,
} from '@badgetrip/react';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { Component, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

// React and jsdom log expected render errors; keep test output clean.
const quietConsole = () => vi.spyOn(console, 'error').mockImplementation(() => {});
afterEach(() => {
  vi.restoreAllMocks();
});

function wrapper(engine: Engine) {
  return ({ children }: { children: ReactNode }) => (
    <BadgetripProvider engine={engine}>{children}</BadgetripProvider>
  );
}

describe('@badgetrip/react hooks', () => {
  it('useScore reflects the live score and updates after emit', async () => {
    const engine = makeEngine();
    const { result } = renderHook(
      () => ({ score: useScore('u1', 'honor'), engine: useBadgetrip() }),
      { wrapper: wrapper(engine) },
    );
    expect(result.current.score).toBe(0);
    await act(async () => {
      await result.current.engine.emit({
        id: 'a',
        actor: 'u1',
        type: 'win',
        ts: 0,
        payload: {},
      });
    });
    await waitFor(() => expect(result.current.score).toBe(2));
  });

  it('useAchievements updates when a badge unlocks', async () => {
    const engine = makeEngine();
    const { result } = renderHook(() => ({ list: useAchievements('u1'), engine: useBadgetrip() }), {
      wrapper: wrapper(engine),
    });
    expect(result.current.list).toEqual([]);
    await act(async () => {
      await result.current.engine.emit({
        id: 'a',
        actor: 'u1',
        type: 'win',
        ts: 0,
        payload: {},
      });
    });
    await waitFor(() => expect(result.current.list.map((a) => a.code)).toEqual(['first_win']));
  });

  it('useTier resolves the current tier', async () => {
    const engine = makeEngine();
    const { result } = renderHook(() => ({ tier: useTier('u1', 'rank'), engine: useBadgetrip() }), {
      wrapper: wrapper(engine),
    });
    await act(async () => {
      await result.current.engine.emit({
        id: 'a',
        actor: 'u1',
        type: 'win',
        ts: 0,
        payload: {},
      });
    });
    await waitFor(() => expect(result.current.tier?.current).toBe('bronze'));
  });

  it('useLeaderboard, useStreak and useEscalator update after emit', async () => {
    const engine = makeEngine();
    const { result } = renderHook(
      () => ({
        board: useLeaderboard('top'),
        streak: useStreak('u1', 'daily'),
        heat: useEscalator('u1', 'heat'),
        engine: useBadgetrip(),
      }),
      { wrapper: wrapper(engine) },
    );
    await act(async () => {
      await result.current.engine.emit({
        id: 'a',
        actor: 'u1',
        type: 'win',
        ts: 0,
        payload: {},
      });
    });
    await waitFor(() => {
      expect(result.current.board).toEqual([{ actor: 'u1', value: 2 }]);
      expect(result.current.streak.current).toBe(1);
      expect(result.current.heat).toBe(1);
    });
  });

  it('replay and seed re-render subscribers', async () => {
    const engine = makeEngine();
    const { result } = renderHook(
      () => ({ score: useScore('u1', 'honor'), engine: useBadgetrip() }),
      { wrapper: wrapper(engine) },
    );
    await act(async () => {
      await result.current.engine.replay([
        { id: 'a', actor: 'u1', type: 'win', ts: 0, payload: {} },
      ]);
    });
    await waitFor(() => expect(result.current.score).toBe(2));
    await act(async () => {
      await result.current.engine.seed({
        scores: [{ actor: 'u1', score: 'honor', value: 10 }],
      });
    });
    await waitFor(() => expect(result.current.score).toBe(12));
  });

  it('re-queries when the provider engine is swapped', async () => {
    const a = makeEngine();
    const b = makeEngine();
    await b.emit({ id: 'x', actor: 'u1', type: 'win', ts: 0, payload: {} });
    let current = a;
    const { result, rerender } = renderHook(() => useScore('u1', 'honor'), {
      wrapper: ({ children }: { children: ReactNode }) => <Swap>{children}</Swap>,
    });
    function Swap({ children }: { children: ReactNode }) {
      return <BadgetripProvider engine={current}>{children}</BadgetripProvider>;
    }
    await waitFor(() => expect(result.current).toBe(0));
    current = b;
    rerender();
    await waitFor(() => expect(result.current).toBe(2));
  });

  it('a rejected query reaches the nearest error boundary', async () => {
    quietConsole();
    const engine = makeEngine();
    const view = render(
      <BadgetripProvider engine={engine}>
        <Boundary>
          <BoardProbe code="missing" />
        </Boundary>
      </BadgetripProvider>,
    );
    await waitFor(() => expect(view.getByText(/unknown leaderboard: missing/)).toBeTruthy());
  });

  it('throws outside a provider', () => {
    quietConsole();
    expect(() => render(<HookProbe />)).toThrow(/BadgetripProvider/);
  });
});

function HookProbe() {
  useScore('u1', 'honor');
  return null;
}

function BoardProbe({ code }: { code: string }) {
  useLeaderboard(code);
  return null;
}

class Boundary extends Component<{ children: ReactNode }, { error?: Error }> {
  override state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    return this.state.error ? <p>{this.state.error.message}</p> : this.props.children;
  }
}

describe('stale results', () => {
  it('applies only the latest request when responses arrive out of order', async () => {
    const base = makeEngine();
    const pending = new Map<string, (v: number) => void>();
    const engine: Engine = {
      ...base,
      score: (actor) => new Promise<number>((resolve) => pending.set(actor, resolve)),
    };
    const { result, rerender } = renderHook(({ actor }) => useScore(actor, 'honor'), {
      initialProps: { actor: 'slow' },
      wrapper: wrapper(engine),
    });
    rerender({ actor: 'fast' });
    await waitFor(() => expect(pending.has('fast')).toBe(true));
    await act(async () => pending.get('fast')?.(7));
    await act(async () => pending.get('slow')?.(99));
    expect(result.current).toBe(7);
  });
});
