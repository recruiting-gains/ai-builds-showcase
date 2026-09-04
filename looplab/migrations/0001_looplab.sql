-- Runs reserve a full 20-call experiment before inference. Limits are enforced
-- inside SQLite, so concurrent Workers cannot overbook the allowance.
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  session_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  quota_day TEXT NOT NULL,
  prompt_a TEXT NOT NULL,
  prompt_b TEXT NOT NULL,
  model TEXT NOT NULL,
  corpus_version TEXT NOT NULL,
  corpus_hash TEXT NOT NULL,
  UNIQUE (session_hash, idempotency_key)
);
CREATE INDEX runs_quota_day ON runs(quota_day);
CREATE INDEX runs_session_day ON runs(session_hash, quota_day);

-- Parenthesized CASE expressions also work with D1's remote SQL splitter.
-- https://github.com/cloudflare/workers-sdk/issues/4727
CREATE TRIGGER reserve_run BEFORE INSERT ON runs BEGIN
  SELECT (CASE WHEN (SELECT COUNT(*) FROM runs WHERE quota_day = NEW.quota_day) >= 100
    THEN RAISE(ABORT, 'DAILY_RUN_LIMIT') END);
  SELECT (CASE WHEN (SELECT COUNT(*) FROM runs WHERE session_hash = NEW.session_hash AND quota_day = NEW.quota_day) >= 4
    THEN RAISE(ABORT, 'SESSION_RUN_LIMIT') END);
END;

-- A separate attempt budget handles runs that cross midnight: at most 2,000
-- model-call reservations on any UTC day, including incomplete older runs.
CREATE TABLE daily_attempts (
  quota_day TEXT PRIMARY KEY,
  calls INTEGER NOT NULL DEFAULT 0 CHECK (calls BETWEEN 0 AND 2000)
);
CREATE TABLE steps (
  run_id TEXT NOT NULL REFERENCES runs(id),
  case_index INTEGER NOT NULL CHECK (case_index BETWEEN 0 AND 9),
  status TEXT NOT NULL CHECK (status IN ('pending', 'done')),
  lease_token TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  quota_day TEXT NOT NULL,
  result_a TEXT,
  result_b TEXT,
  PRIMARY KEY (run_id, case_index),
  CHECK ((status = 'pending' AND result_a IS NULL AND result_b IS NULL)
    OR (status = 'done' AND result_a IS NOT NULL AND result_b IS NOT NULL))
);
CREATE TRIGGER reserve_attempts AFTER INSERT ON steps BEGIN
  INSERT INTO daily_attempts(quota_day, calls) VALUES (NEW.quota_day, 0)
    ON CONFLICT(quota_day) DO NOTHING;
  SELECT (CASE WHEN (SELECT calls FROM daily_attempts WHERE quota_day = NEW.quota_day) > 1998
    THEN RAISE(ABORT, 'DAILY_ATTEMPT_LIMIT') END);
  UPDATE daily_attempts SET calls = calls + 2 WHERE quota_day = NEW.quota_day;
END;
