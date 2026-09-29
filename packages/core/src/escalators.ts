import { getPath } from './path.js';
import type { EscalatorDef, Event, EventStore } from './types.js';

function applyDecay(
  def: EscalatorDef,
  value: number,
  from: number | undefined,
  to: number,
): number {
  if (!def.decay || from === undefined) return value;
  const elapsed = to - from;
  if (elapsed <= 0) return value;
  const steps = Math.floor(elapsed / def.decay.every);
  if (steps <= 0) return value;
  return Math.max(def.min, value - steps * def.decay.by);
}

/**
 * Fold the escalator's trigger/reset events for (actor, keyValue) up to `upTo`,
 * applying time decay between events. Event-sourced: no escalator state is stored.
 */
export async function evalEscalator(
  def: EscalatorDef,
  actor: string,
  keyValue: string,
  events: EventStore,
  upTo: number,
  excludeId?: string,
): Promise<number> {
  const types = new Set([...def.triggerEvents, ...def.resetEvents]);
  const relevant: Event[] = [];
  for (const type of types) {
    for await (const e of events.read({ actor, type })) {
      if (e.ts > upTo) continue;
      if (excludeId && e.id === excludeId) continue;
      if (def.key && String(getPath(e, def.key) ?? '') !== keyValue) continue;
      relevant.push(e);
    }
  }
  relevant.sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  let value = def.min;
  let lastTs: number | undefined;
  for (const e of relevant) {
    value = applyDecay(def, value, lastTs, e.ts);
    if (def.resetEvents.includes(e.type)) {
      value = def.min;
    } else if (def.triggerEvents.includes(e.type)) {
      value = Math.min(def.max, value + def.step);
    }
    lastTs = e.ts;
  }
  return applyDecay(def, value, lastTs, upTo);
}
