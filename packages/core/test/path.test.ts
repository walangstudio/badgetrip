import { getPath, matchFilter } from '@badgetrip/core';
import { describe, expect, it } from 'vitest';

describe('getPath', () => {
  it('reads nested paths', () => {
    expect(getPath({ a: { b: { c: 7 } } }, 'a.b.c')).toBe(7);
  });
  it('returns undefined for missing segments', () => {
    expect(getPath({ a: 1 }, 'a.b.c')).toBeUndefined();
    expect(getPath(null, 'a')).toBeUndefined();
  });
  it('returns the root for an empty path', () => {
    expect(getPath(42, '')).toBe(42);
  });
});

describe('matchFilter', () => {
  const e = { type: 'x', payload: { n: 5, tag: 'red', flag: true } };
  it('= and !=', () => {
    expect(matchFilter(e, { path: 'payload.tag', op: '=', value: 'red' })).toBe(true);
    expect(matchFilter(e, { path: 'payload.tag', op: '!=', value: 'blue' })).toBe(true);
  });
  it('> and < only compare numbers', () => {
    expect(matchFilter(e, { path: 'payload.n', op: '>', value: 4 })).toBe(true);
    expect(matchFilter(e, { path: 'payload.n', op: '<', value: 4 })).toBe(false);
    expect(matchFilter(e, { path: 'payload.tag', op: '>', value: 4 })).toBe(false);
  });
  it('in checks membership', () => {
    expect(
      matchFilter(e, {
        path: 'payload.tag',
        op: 'in',
        value: ['red', 'green'],
      }),
    ).toBe(true);
    expect(matchFilter(e, { path: 'payload.tag', op: 'in', value: ['blue'] })).toBe(false);
  });
});

describe('matchFilter strictness', () => {
  const e = { payload: { n: 5, list: ['a'] } };
  it('= does not coerce between number and string', () => {
    expect(matchFilter(e, { path: 'payload.n', op: '=', value: '5' })).toBe(false);
  });
  it('in with a non-array value never matches', () => {
    expect(matchFilter(e, { path: 'payload.n', op: 'in', value: 5 })).toBe(false);
  });
  it('reads array elements by index', () => {
    expect(getPath(e, 'payload.list.0')).toBe('a');
  });
});
