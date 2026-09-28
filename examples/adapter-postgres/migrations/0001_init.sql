CREATE TABLE IF NOT EXISTS events (
  id      TEXT PRIMARY KEY,
  actor   TEXT NOT NULL,
  type    TEXT NOT NULL,
  ts      BIGINT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  seq     BIGSERIAL NOT NULL
);

CREATE INDEX IF NOT EXISTS events_actor_type_ts ON events (actor, type, ts);

CREATE TABLE IF NOT EXISTS score_deltas (
  id    BIGSERIAL PRIMARY KEY,
  actor TEXT NOT NULL,
  score TEXT NOT NULL,
  delta DOUBLE PRECISION NOT NULL,
  ts    BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS score_deltas_score_ts ON score_deltas (score, ts);

CREATE TABLE IF NOT EXISTS score_totals (
  actor TEXT NOT NULL,
  score TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL DEFAULT 0,
  PRIMARY KEY (actor, score)
);

CREATE TABLE IF NOT EXISTS achievements (
  actor TEXT NOT NULL,
  code  TEXT NOT NULL,
  at    BIGINT NOT NULL,
  PRIMARY KEY (actor, code)
);

CREATE TABLE IF NOT EXISTS streaks (
  actor      TEXT NOT NULL,
  code       TEXT NOT NULL,
  key        TEXT NOT NULL DEFAULT '',
  current    INTEGER NOT NULL DEFAULT 0,
  best       INTEGER NOT NULL DEFAULT 0,
  last_tick  BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (actor, code, key)
);
