UPDATE cities
SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+180 days')
WHERE expires_at IS NULL;

CREATE TABLE IF NOT EXISTS vector_cleanup_jobs (
  id TEXT PRIMARY KEY,
  city_id TEXT NOT NULL,
  entry_id TEXT NOT NULL UNIQUE,
  vector_ids TEXT NOT NULL,
  created_at TEXT NOT NULL,
  available_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);

CREATE INDEX IF NOT EXISTS idx_vector_cleanup_jobs_available
  ON vector_cleanup_jobs(available_at);
