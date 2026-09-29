import type { Filter } from './types.js';

/** Read a dotted path from a value. Returns undefined if any segment is missing. */
export function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  let cur: unknown = obj;
  for (const seg of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** Evaluate a filter against a target object (typically an Event). */
export function matchFilter(target: unknown, filter: Filter): boolean {
  const v = getPath(target, filter.path);
  switch (filter.op) {
    case '=':
      return v === filter.value;
    case '!=':
      return v !== filter.value;
    case '>':
      return typeof v === 'number' && typeof filter.value === 'number' && v > filter.value;
    case '<':
      return typeof v === 'number' && typeof filter.value === 'number' && v < filter.value;
    case 'in':
      return Array.isArray(filter.value) && filter.value.includes(v);
  }
}
