import { type TierDef, evalTier } from '@walangstudio/badgetrip-core';
import { makeTestEngine } from '@walangstudio/badgetrip-testing';
import { describe, expect, it } from 'vitest';

const shameTier: TierDef = {
  code: 'shame_tier',
  score: 'shame',
  thresholds: [
    { name: 'bronze', at: 1 },
    { name: 'silver', at: 20 },
    { name: 'gold', at: 100 },
  ],
};

describe('evalTier', () => {
  it('returns null current below the first threshold', () => {
    expect(evalTier(shameTier, 0)).toEqual({
      current: null,
      next: 'bronze',
      remaining: 1,
      value: 0,
    });
  });

  it('reports current tier and remaining to next', () => {
    expect(evalTier(shameTier, 20)).toEqual({
      current: 'silver',
      next: 'gold',
      remaining: 80,
      value: 20,
    });
  });

  it('caps at the top tier with zero remaining', () => {
    expect(evalTier(shameTier, 150)).toEqual({
      current: 'gold',
      next: null,
      remaining: 0,
      value: 150,
    });
  });

  it('is order-independent on thresholds', () => {
    const shuffled: TierDef = {
      ...shameTier,
      thresholds: [...shameTier.thresholds].reverse(),
    };
    expect(evalTier(shuffled, 20)).toMatchObject({
      current: 'silver',
      next: 'gold',
    });
  });
});

describe('engine.tier', () => {
  it('reads the live score and resolves the tier', async () => {
    const { engine } = makeTestEngine({
      scores: ['shame'],
      points: [{ on: 'oops', score: 'shame', delta: 25 }],
      tiers: [shameTier],
    });
    await engine.emit({
      id: 'a',
      actor: 'u1',
      type: 'oops',
      ts: 0,
      payload: {},
    });
    expect(await engine.tier('u1', 'shame_tier')).toMatchObject({
      current: 'silver',
      next: 'gold',
    });
  });
});

describe('evalTier edge cases', () => {
  it('a threshold at 0 is reached by a zero score', () => {
    const t: TierDef = {
      code: 't',
      score: 's',
      thresholds: [{ name: 'starter', at: 0 }],
    };
    expect(evalTier(t, 0)).toEqual({
      current: 'starter',
      next: null,
      remaining: 0,
      value: 0,
    });
  });

  it('negative scores sit below the first threshold', () => {
    expect(evalTier(shameTier, -5)).toMatchObject({
      current: null,
      next: 'bronze',
      remaining: 6,
    });
  });

  it('an empty threshold list has no tiers', () => {
    const t: TierDef = { code: 't', score: 's', thresholds: [] };
    expect(evalTier(t, 50)).toEqual({
      current: null,
      next: null,
      remaining: 0,
      value: 50,
    });
  });

  it('unsorted thresholds are sorted before evaluation', () => {
    const t: TierDef = {
      ...shameTier,
      thresholds: [...shameTier.thresholds].reverse(),
    };
    expect(evalTier(t, 25)).toMatchObject({ current: 'silver', next: 'gold' });
  });
});
