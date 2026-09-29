# badgetrip - Rules

Rules are declarative predicates over the event stream and its projections. They are JSON-friendly objects - storable, sendable over the wire, and configurable at runtime. The engine evaluates each `AchievementDef.rule` after every `emit`, granting the achievement the first time the rule returns `true`.

## Path convention

All dotted paths in rules and filters are **event-relative**. The engine passes the full `Event` object as the root when resolving a path.

| Path | Resolves to |
|---|---|
| `actor` | `event.actor` |
| `type` | `event.type` |
| `ts` | `event.ts` |
| `payload.severity` | `event.payload.severity` |
| `payload.from_user` | `event.payload.from_user` |
| `payload.todont_id` | `event.payload.todont_id` |

There is no `event.` prefix - the object is the event itself. Payload fields always require the `payload.` prefix.

## Filter

A `Filter` is a single predicate applied to a path on the event:

```ts
type Filter = {
  path: string;
  op: '=' | '!=' | '>' | '<' | 'in';
  value: unknown;
};
```

| Op | Semantics |
|---|---|
| `=` | strict equality |
| `!=` | strict inequality |
| `>` | numeric greater-than; both sides must be numbers or returns false |
| `<` | numeric less-than; both sides must be numbers or returns false |
| `in` | `value` must be an array; returns true if the path value is in it |

`>` and `<` only compare numbers. Passing a string path with `>` always returns false.

Filters appear in:
- `PointRule.where` - guards whether the point rule fires
- `Rule` (kind `count`) `.where` - narrows which events are counted
- `EventStore.count` opts

## Rule kinds

### `count`

```ts
{ kind: 'count'; eventType: string; gte: number; where?: Filter; todBetween?: [number, number] }
```

True when the actor has at least `gte` events of `eventType`, optionally matching `where`.

`todBetween` adds a **time-of-day** window: only events whose offset from day start
(`event.ts - dayBoundary(event.ts)`, in ms) falls in `[start, end)` are counted. Unlike
`first-of-day`, this counts ANY matching event in the window, not just the day's first.

```ts
// "Posted 10 confessions"
{ kind: 'count', eventType: 'confession.posted', gte: 10 }

// "Posted 3 high-severity confessions"
{
  kind: 'count',
  eventType: 'confession.posted',
  gte: 3,
  where: { path: 'payload.severity', op: '>', value: 3 },
}

// "Confessed at all between midnight and 4am" (any such event, not just the first)
{ kind: 'count', eventType: 'confession.posted', gte: 1, todBetween: [0, 4 * 3600 * 1000] }
```

---

### `score`

```ts
{ kind: 'score'; score: string; gte: number }
```

True when the actor's named score total is at least `gte`.

```ts
// "Reached 100 honor points"
{ kind: 'score', score: 'honor', gte: 100 }
```

---

### `streak`

```ts
{ kind: 'streak'; streak: string; gte: number; key?: string; of?: 'current' | 'best'; anyKey?: boolean }
```

True when the chosen streak counter is at least `gte`. By default it reads
`StreakStore.get(actor, streak, key).current`.

- `of: 'best'` thresholds the lifetime best instead of the live counter - so the
  achievement still fires for someone whose streak has since reset (and on `seed`).
- `key` targets one per-actor-per-key streak (e.g. a specific todont).
- `anyKey: true` (per-actor-per-key streaks) is satisfied when ANY key meets the threshold
  - the max across keys. Requires a `StreakStore` that implements the optional
  `statsAcrossKeys`; the engine throws a clear error if it doesn't.

```ts
// "Maintained a 7-day clean streak" (per-actor streak)
{ kind: 'streak', streak: 'daily_clean', gte: 7 }

// "Kept one specific todont clean for 30 days"
{ kind: 'streak', streak: 'todont_clean', gte: 30, key: 'some_todont_id' }

// "Hit a 7-day clean streak on ANY todont, ever" (per-actor-per-key)
{ kind: 'streak', streak: 'todont_clean', gte: 7, of: 'best', anyKey: true }
```

---

### `unique`

```ts
{ kind: 'unique'; eventType: string; by: string; gte: number }
```

Reads all events of `eventType` for the actor, extracts the value at `by` from each, and counts distinct values. True when the distinct count is at least `gte`.

The `by` path is event-relative. Payload fields need the `payload.` prefix.

```ts
// "Received reactions from at least 10 different users"
{ kind: 'unique', eventType: 'reaction.received', by: 'payload.from_user', gte: 10 }
```

---

### `group-count`

```ts
{ kind: 'group-count'; eventType: string; by: string; gte: number; where?: Filter }
```

True when **some single group** has at least `gte` events. Events of `eventType` (optionally
matching `where`) are grouped by the value at the `by` path; the rule fires when the largest
group reaches `gte`. This is the "N events sharing a key" predicate - distinct from `count`
(per-actor total) and `unique` (number of distinct keys).

By default the engine folds the event stream in memory. A store may implement the optional
`EventStore.maxGroupSize` to push the grouping down (e.g. to SQL); the engine uses it when present.

```ts
// "Confessed 10 times on the SAME todont"
{ kind: 'group-count', eventType: 'confession.posted', by: 'payload.todont_id', gte: 10 }
```

---

### `first-of-day`

```ts
{ kind: 'first-of-day'; eventType: string; between?: [number, number] }
```

True when the current event is the actor's earliest event of `eventType` on the same calendar day (as defined by `dayBoundary`). If `between` is set, the time-of-day offset from day start must satisfy `between[0] <= tod < between[1]` (values in ms).

```ts
// "First confession of the day"
{ kind: 'first-of-day', eventType: 'confession.posted' }

// "First confession posted between midnight and 4am"
{ kind: 'first-of-day', eventType: 'confession.posted', between: [0, 4 * 3600 * 1000] }
```

This rule fires at most once per actor per day for a given event type.

---

### `rank`

```ts
{ kind: 'rank'; leaderboard: string; eq: number }
```

True when the actor is at exactly rank `eq` (1-indexed) on the named leaderboard at the time of evaluation.

```ts
// "Reached #1 on the weekly honor leaderboard"
{ kind: 'rank', leaderboard: 'weekly_honor', eq: 1 }
```

Rank is evaluated against the live leaderboard state. Because leaderboards are dynamic, this achievement can be won and then become stale (but achievement grant is permanent - `AchievementStore.award` returns false on subsequent attempts).

---

### `all`

```ts
{ kind: 'all'; rules: Rule[] }
```

True when every sub-rule is true. Short-circuits on the first false.

```ts
{
  kind: 'all',
  rules: [
    { kind: 'count', eventType: 'reaction.received', gte: 50 },
    { kind: 'unique', eventType: 'reaction.received', by: 'payload.from_user', gte: 10 },
  ],
}
```

---

### `any`

```ts
{ kind: 'any'; rules: Rule[] }
```

True when at least one sub-rule is true. Short-circuits on the first true.

```ts
{
  kind: 'any',
  rules: [
    { kind: 'score', score: 'honor', gte: 500 },
    { kind: 'count', eventType: 'confession.posted', gte: 100 },
  ],
}
```

## Worked examples

### Night Owl

Award when the actor posts their first confession of the day between midnight and 4am.

```ts
const nightOwl: AchievementDef = {
  code: 'night_owl',
  name: 'After Dark',
  description: 'Confessed between midnight and 4am',
  rarity: 2,
  rule: {
    kind: 'first-of-day',
    eventType: 'confession.posted',
    between: [0, 4 * 3600 * 1000],
  },
};
```

The engine calls `dayBoundary(event.ts)` to find the day start, then checks that the current event is the earliest `confession.posted` for the actor on that day, and that its time-of-day offset is within `[0, 14400000)`.

### Crowd Favorite

Award when the actor has received at least 50 reactions, from at least 10 distinct users.

```ts
const crowdFavorite: AchievementDef = {
  code: 'crowd_favorite',
  name: 'Crowd Favorite',
  description: 'Received 50 reactions from at least 10 different users',
  rarity: 3,
  rule: {
    kind: 'all',
    rules: [
      { kind: 'count', eventType: 'reaction.received', gte: 50 },
      { kind: 'unique', eventType: 'reaction.received', by: 'payload.from_user', gte: 10 },
    ],
  },
};
```

Both sub-rules must pass. The `count` rule counts total events; the `unique` rule counts distinct `payload.from_user` values across those events. A single prolific sender does not satisfy `unique`.

## PointRule

`PointRule` is not a `Rule` - it is a separate config type that maps events to score changes. It appears in `Definitions.points`, not inside an `AchievementDef`.

```ts
type PointRule = {
  on: string;           // event type to match
  score: string;        // score name to modify
  delta: number | { path: string };  // fixed amount, or event-relative path to a number
  where?: Filter;       // optional guard
};
```

When `delta` is `{ path: 'payload.severity' }`, the engine reads that value from the event at emit time. If the value is not a finite `number` (strings like `"3"` and booleans included), the rule is skipped - no coercion. A resolved `0` is skipped too, so it produces no `ScoreDelta`.

```ts
// Award shame equal to the confession's severity field
{ on: 'confession.posted', score: 'shame', delta: { path: 'payload.severity' } }

// Award 5 honor for every reaction received
{ on: 'reaction.received', score: 'honor', delta: 5 }
```
