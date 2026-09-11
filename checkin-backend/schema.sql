-- Check-in kayıtları tablosu
CREATE TABLE IF NOT EXISTS checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_name TEXT NOT NULL,
  location_id TEXT NOT NULL,
  source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_checkins_location ON checkins(location_id);
CREATE INDEX IF NOT EXISTS idx_checkins_created ON checkins(created_at);
