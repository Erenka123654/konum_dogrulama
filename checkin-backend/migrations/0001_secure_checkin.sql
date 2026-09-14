-- Existing checkins remain untouched and are not treated as verified records.
CREATE TABLE IF NOT EXISTS staff (
 id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
 password_hash TEXT NOT NULL, salt TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('admin','staff')),
 active INTEGER NOT NULL DEFAULT 1, must_change INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES staff(id), expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS challenges (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES staff(id), session_hash TEXT NOT NULL,
 location_id TEXT NOT NULL, action TEXT NOT NULL CHECK(action IN ('in','out')),
 nonce TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS challenges_expiry ON challenges(expires_at);
CREATE TABLE IF NOT EXISTS verified_checkins (
 id TEXT PRIMARY KEY, challenge_id TEXT NOT NULL UNIQUE REFERENCES challenges(id),
 user_id TEXT NOT NULL REFERENCES staff(id), location_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('in','out')), created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS verified_checkins_user ON verified_checkins(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS rate_limits (
 bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
