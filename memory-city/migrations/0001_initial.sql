PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cities (
  id TEXT PRIMARY KEY,
  edit_token_hash TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'My Memory City',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  city_id TEXT NOT NULL,
  title TEXT NOT NULL,
  source_text TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  city_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  district TEXT NOT NULL CHECK (district IN ('concepts', 'skills', 'evidence', 'questions')),
  depth INTEGER NOT NULL CHECK (depth BETWEEN 1 AND 5),
  created_at TEXT NOT NULL,
  FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  city_id TEXT NOT NULL,
  source_node_id TEXT NOT NULL,
  target_node_id TEXT NOT NULL,
  relationship TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('related', 'supports', 'questions', 'applies')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
  FOREIGN KEY (source_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (target_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
  UNIQUE (city_id, source_node_id, target_node_id)
);

CREATE INDEX IF NOT EXISTS idx_entries_city_created ON entries(city_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nodes_city_created ON nodes(city_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_edges_city ON edges(city_id);
