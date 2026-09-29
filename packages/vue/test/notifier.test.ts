// @vitest-environment jsdom
import { createCelebrationResolver } from '@badgetrip/assets';
import { type Engine, defineAchievements, observe, rules } from '@badgetrip/core';
import { makeTestEngine } from '@badgetrip/testing';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { UnlockNotifier, createBadgetrip, useBadgetrip, useUnlocks } from '../src/index.js';

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
  vi.restoreAllMocks();
});

function app(e: Engine, render: () => ReturnType<typeof h>) {
  let api!: Engine;
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useBadgetrip();
        return render;
      },
    }),
    { global: { plugins: [createBadgetrip(e)] } },
  );
  return { wrapper, api: () => api };
}

describe('<UnlockNotifier>', () => {
  it('mounts one overlay, celebrates unlocks, and removes it on unmount', async () => {
    const { wrapper, api } = app(engine(), () => h(UnlockNotifier));
    expect(hosts()).toHaveLength(1);
    await api().emit(ev('a'));
    await vi.waitFor(() => expect(names()).toEqual(['First']));
    wrapper.unmount();
    expect(hosts()).toHaveLength(0);
  });

  it('updates sound in place and re-creates when the resolver changes', async () => {
    const sound = ref(false);
    const resolver = ref(createCelebrationResolver());
    const { wrapper } = app(engine(), () =>
      h(UnlockNotifier, { sound: sound.value, celebrations: resolver.value }),
    );
    const host = hosts()[0];
    sound.value = true;
    await nextTick();
    expect(hosts()[0]).toBe(host);
    resolver.value = createCelebrationResolver();
    await nextTick();
    expect(hosts()).toHaveLength(1);
    expect(hosts()[0]).not.toBe(host);
    wrapper.unmount();
    expect(hosts()).toHaveLength(0);
  });
});

describe('useUnlocks', () => {
  it('queues unlocks with their celebration, skipping quiet ones, filtered by actor', async () => {
    let out!: ReturnType<typeof useUnlocks>;
    const e = engine();
    const w = mount(
      defineComponent({
        setup() {
          out = useUnlocks({ actor: 'u' });
          return () => null;
        },
      }),
      { global: { plugins: [createBadgetrip(e)] } },
    );
    const o = observe(e);
    await o.engine.emit(ev('a', 'win', 'someone-else'));
    await o.engine.emit(ev('b', 'hush'));
    await o.engine.emit(ev('c', 'win'));
    await o.engine.emit(ev('d', 'boom'));
    await vi.waitFor(() => expect(out.queue.value).toHaveLength(2));
    expect(out.queue.value.map((q) => [q.view.code, q.celebration.layout])).toEqual([
      ['first', 'toast'],
      ['big', 'fullscreen'],
    ]);
    out.dismiss();
    expect(out.queue.value.map((q) => q.view.code)).toEqual(['big']);
    out.clear();
    expect(out.queue.value).toEqual([]);
    w.unmount();
    await o.engine.emit(ev('e', 'win', 'u2'));
    await o.engine.emit(ev('f', 'boom', 'u'));
    await new Promise((r) => setTimeout(r, 10));
    expect(out.queue.value).toEqual([]);
  });
});

describe('review fixes', () => {
  it('keeps the overlay and its toasts across parent re-renders with inline props', async () => {
    const tick = ref(0);
    const { api, wrapper } = app(engine(), () =>
      h('div', [
        String(tick.value),
        h(UnlockNotifier, {
          labels: { close: 'Close' },
          actor: (a: string) => a === 'u',
          onError: () => {},
        }),
      ]),
    );
    const host = hosts()[0];
    await api().emit(ev('a'));
    await vi.waitFor(() => expect(names()).toEqual(['First']));
    tick.value++;
    await nextTick();
    tick.value++;
    await nextTick();
    expect(hosts()[0]).toBe(host);
    expect(names()).toEqual(['First']);
    wrapper.unmount();
  });

  it('turns sound on in place: the next unlock plays', async () => {
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
    const sound = ref(false);
    const { api, wrapper } = app(engine(), () => h(UnlockNotifier, { sound: sound.value }));
    await api().emit(ev('a'));
    await vi.waitFor(() => expect(names()).toEqual(['First']));
    expect(created).not.toHaveBeenCalled();
    sound.value = true;
    await nextTick();
    await api().emit(ev('b', 'boom'));
    await vi.waitFor(() => expect(created).toHaveBeenCalledOnce());
    wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it('useUnlocks follows a reactive actor and clears the queue when it changes', async () => {
    let out!: ReturnType<typeof useUnlocks>;
    const actor = ref('u');
    const e = engine();
    mount(
      defineComponent({
        setup() {
          out = useUnlocks({ actor });
          return () => null;
        },
      }),
      { global: { plugins: [createBadgetrip(e)] } },
    );
    const o = observe(e);
    await o.engine.emit(ev('a', 'win', 'u'));
    await vi.waitFor(() => expect(out.queue.value).toHaveLength(1));
    actor.value = 'v';
    await nextTick();
    expect(out.queue.value).toEqual([]);
    await o.engine.emit(ev('b', 'win', 'u'));
    await o.engine.emit(ev('c', 'win', 'v'));
    await vi.waitFor(() => expect(out.queue.value).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 10));
    expect(out.queue.value).toHaveLength(1);
  });
});
