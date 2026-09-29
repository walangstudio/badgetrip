import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
// @vitest-environment jsdom
import { createCelebrationResolver } from '@walangstudio/badgetrip-assets';
import { type Engine, defineAchievements, observe, rules } from '@walangstudio/badgetrip-core';
import {
  BadgetripProvider,
  UnlockNotifier,
  useBadgetrip,
  useUnlocks,
} from '@walangstudio/badgetrip-react';
import { makeTestEngine } from '@walangstudio/badgetrip-testing';
import { type ReactNode, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const engine = () =>
  makeTestEngine({
    achievements: defineAchievements({
      first: { name: 'First', description: '', when: rules.count('win', 1) },
      shh: { name: 'Shh', description: '', celebration: 'quiet', when: rules.count('hush', 1) },
      big: { name: 'Big', description: '', celebration: 'epic', when: rules.count('boom', 1) },
    }),
  }).engine;
const ev = (id: string, type = 'win', actor = 'u') => ({ id, actor, type, ts: 0, payload: {} });
const hosts = () => document.querySelectorAll('[data-badgetrip-notifier]');
const names = () =>
  [...((hosts()[0] as HTMLElement | undefined)?.shadowRoot?.querySelectorAll('.name') ?? [])].map(
    (n) => n.textContent,
  );

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Emit({ onReady }: { onReady: (e: ReturnType<typeof useBadgetrip>) => void }) {
  onReady(useBadgetrip());
  return null;
}

describe('<UnlockNotifier>', () => {
  it('mounts one overlay inside the provider, celebrates unlocks, and removes it on unmount', async () => {
    let api!: ReturnType<typeof useBadgetrip>;
    const view = render(
      <StrictMode>
        <BadgetripProvider engine={engine()}>
          <UnlockNotifier />
          <Emit
            onReady={(e) => {
              api = e;
            }}
          />
        </BadgetripProvider>
      </StrictMode>,
    );
    expect(hosts()).toHaveLength(1);
    await act(async () => {
      await api.emit(ev('a'));
    });
    await waitFor(() => expect(names()).toEqual(['First']));
    view.unmount();
    expect(hosts()).toHaveLength(0);
  });

  it('changes sound settings without re-creating the overlay', async () => {
    const created = vi.fn();
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'running';
        currentTime = 0;
        destination = {};
        constructor() {
          created();
        }
        resume = () => Promise.resolve();
        close = () => Promise.resolve();
        createOscillator = () => ({
          type: '',
          frequency: { setValueAtTime() {} },
          connect() {},
          start() {},
          stop() {},
        });
        createGain = () => ({
          gain: {
            setValueAtTime() {},
            linearRampToValueAtTime() {},
            exponentialRampToValueAtTime() {},
          },
          connect() {},
        });
      },
    );
    const e = engine();
    let api!: ReturnType<typeof useBadgetrip>;
    const tree = (sound: boolean) => (
      <BadgetripProvider engine={e}>
        <UnlockNotifier sound={sound} />
        <Emit
          onReady={(x) => {
            api = x;
          }}
        />
      </BadgetripProvider>
    );
    const view = render(tree(false));
    const host = hosts()[0];
    await act(async () => {
      await api.emit(ev('a'));
    });
    await waitFor(() => expect(names()).toEqual(['First']));
    expect(created).not.toHaveBeenCalled();
    view.rerender(tree(true));
    expect(hosts()[0]).toBe(host);
    await act(async () => {
      await api.emit(ev('b', 'boom'));
    });
    await waitFor(() => expect(created).toHaveBeenCalledOnce());
  });

  it('re-creates the overlay when the resolver changes', () => {
    const e = engine();
    const tree = (c: ReturnType<typeof createCelebrationResolver>) => (
      <BadgetripProvider engine={e}>
        <UnlockNotifier celebrations={c} />
      </BadgetripProvider>
    );
    const view = render(tree(createCelebrationResolver()));
    const host = hosts()[0];
    view.rerender(tree(createCelebrationResolver()));
    expect(hosts()).toHaveLength(1);
    expect(hosts()[0]).not.toBe(host);
  });
});

describe('useUnlocks', () => {
  const wrapper =
    (e: Engine) =>
    ({ children }: { children: ReactNode }) => (
      <BadgetripProvider engine={e}>{children}</BadgetripProvider>
    );

  it('queues unlocks with their celebration, skipping quiet ones, and filters by actor', async () => {
    const { result } = renderHook(
      () => ({ unlocks: useUnlocks({ actor: 'u' }), engine: useBadgetrip() }),
      { wrapper: wrapper(engine()) },
    );
    await act(async () => {
      await result.current.engine.emit(ev('a', 'win', 'someone-else'));
      await result.current.engine.emit(ev('b', 'hush'));
      await result.current.engine.emit(ev('c', 'win'));
      await result.current.engine.emit(ev('d', 'boom'));
    });
    await waitFor(() => expect(result.current.unlocks.queue).toHaveLength(2));
    const [first, big] = result.current.unlocks.queue;
    expect(first?.view.code).toBe('first');
    expect(first?.celebration.layout).toBe('toast');
    expect(big?.celebration.layout).toBe('fullscreen');
    act(() => result.current.unlocks.dismiss());
    expect(result.current.unlocks.queue.map((q) => q.view.code)).toEqual(['big']);
    act(() => result.current.unlocks.clear());
    expect(result.current.unlocks.queue).toEqual([]);
  });

  it('subscribes once under StrictMode', async () => {
    const { result } = renderHook(() => ({ unlocks: useUnlocks(), engine: useBadgetrip() }), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <StrictMode>
          <BadgetripProvider engine={engine()}>{children}</BadgetripProvider>
        </StrictMode>
      ),
    });
    await act(async () => {
      await result.current.engine.emit(ev('a'));
    });
    await waitFor(() => expect(result.current.unlocks.queue).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.unlocks.queue).toHaveLength(1);
  });
});

describe('<UnlockNotifier> function props', () => {
  const toastOnly = createCelebrationResolver({ presets: { epic: { layout: 'toast' } } });

  it('reads the latest actor predicate, onError and labels.more without re-mounting', async () => {
    const e = engine();
    let api!: ReturnType<typeof useBadgetrip>;
    const errorsA = vi.fn();
    const errorsB = vi.fn();
    const tree = (allowed: string, onError: (err: unknown) => void) => (
      <BadgetripProvider engine={e}>
        <UnlockNotifier
          celebrations={toastOnly}
          actor={(a) => a === allowed}
          onError={onError}
          maxVisible={1}
          maxQueue={0}
          labels={{ more: (n) => `${allowed}: ${n} more` }}
        />
        <Emit
          onReady={(x) => {
            api = x;
          }}
        />
      </BadgetripProvider>
    );
    const view = render(tree('a', errorsA));
    const host = hosts()[0];
    view.rerender(tree('b', errorsB));
    expect(hosts()[0]).toBe(host);
    const toastNames = () =>
      [...((host as HTMLElement).shadowRoot?.querySelectorAll('.toast .name') ?? [])].map(
        (n) => n.textContent,
      );
    await act(async () => {
      await api.emit(ev('1', 'win', 'a'));
      await api.emit(ev('2', 'win', 'b'));
      await api.emit(ev('3', 'boom', 'b'));
    });
    await waitFor(() => expect(toastNames()).toEqual(['First']));
    ((host as HTMLElement).shadowRoot?.querySelector('.toast button') as HTMLButtonElement).click();
    expect(toastNames()).toEqual(['b: 1 more']);
    vi.spyOn(observe(e).engine, 'catalog').mockRejectedValueOnce(new Error('db down'));
    await act(async () => {
      await api.emit(ev('4', 'win', 'b2'));
      await api.emit(ev('5', 'hush', 'b'));
    });
    await waitFor(() => expect(errorsB).toHaveBeenCalledWith(new Error('db down')));
    expect(errorsA).not.toHaveBeenCalled();
  });
});

describe('useUnlocks actor switch', () => {
  it('clears the queue when the actor changes', async () => {
    const e = engine();
    const { result, rerender } = renderHook(({ actor }) => useUnlocks({ actor }), {
      initialProps: { actor: 'u' },
      wrapper: ({ children }: { children: ReactNode }) => (
        <BadgetripProvider engine={e}>{children}</BadgetripProvider>
      ),
    });
    await act(async () => {
      await observe(e).engine.emit(ev('a', 'win', 'u'));
    });
    await waitFor(() => expect(result.current.queue).toHaveLength(1));
    rerender({ actor: 'v' });
    expect(result.current.queue).toEqual([]);
  });
});
