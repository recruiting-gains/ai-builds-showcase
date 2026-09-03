ALTER TABLE cities ADD COLUMN state TEXT NOT NULL DEFAULT 'active'
  CHECK (state IN ('active', 'deleting'));

ALTER TABLE cities ADD COLUMN expires_at TEXT;

UPDATE cities
SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+180 days')
WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cities_expiry_state
  ON cities(expires_at, state);

ALTER TABLE entries ADD COLUMN operation_id TEXT;

UPDATE entries
SET operation_id = id
WHERE operation_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_city_operation
  ON entries(city_id, operation_id);

CREATE TRIGGER IF NOT EXISTS enforce_city_entry_limit
BEFORE INSERT ON entries
WHEN (SELECT COUNT(*) FROM entries WHERE city_id = NEW.city_id) >= 16
BEGIN
  SELECT RAISE(ABORT, 'city entry limit reached');
END;

CREATE TRIGGER IF NOT EXISTS enforce_city_node_limit
BEFORE INSERT ON nodes
WHEN (SELECT COUNT(*) FROM nodes WHERE city_id = NEW.city_id) >= 96
BEGIN
  SELECT RAISE(ABORT, 'city node limit reached');
END;
