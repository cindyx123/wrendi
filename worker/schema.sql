-- ─── Wrendi D1 Schema ─────────────────────────────────────────────────────────
-- Run: npx wrangler d1 execute wrendi-db --file=worker/schema.sql --remote

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  is_admin   INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  last_login TEXT
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  type       TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used       INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id      TEXT PRIMARY KEY,
  name         TEXT DEFAULT '',
  email        TEXT DEFAULT '',
  phone        TEXT DEFAULT '',
  location     TEXT DEFAULT '',
  linkedin     TEXT DEFAULT '',
  portfolio    TEXT DEFAULT '',
  target_role  TEXT DEFAULT '',
  salary_range TEXT DEFAULT '',
  work_auth    TEXT DEFAULT '',
  work_mode    TEXT DEFAULT 'Remote',
  resume_text  TEXT DEFAULT '',
  resume_r2key TEXT DEFAULT '',
  skills       TEXT DEFAULT '',
  updated_at   TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS jobs (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  title           TEXT DEFAULT '',
  company         TEXT DEFAULT '',
  location        TEXT DEFAULT '',
  portal          TEXT DEFAULT '',
  portal_name     TEXT DEFAULT '',
  url             TEXT DEFAULT '',
  jd              TEXT DEFAULT '',
  status          TEXT DEFAULT 'new',
  ats_score       INTEGER,
  tailored_resume TEXT DEFAULT '',
  cover_letter    TEXT DEFAULT '',
  flags           TEXT DEFAULT '[]',
  notes           TEXT DEFAULT '',
  date_added      TEXT DEFAULT (datetime('now')),
  date_applied    TEXT,
  updated_at      TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_jobs_user    ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status  ON jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_updated ON jobs(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS application_stages (
  id         TEXT PRIMARY KEY,
  job_id     TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  stage      TEXT NOT NULL,
  notes      TEXT DEFAULT '',
  date       TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (job_id)  REFERENCES jobs(id)  ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Analytics ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_events (
  id         TEXT PRIMARY KEY,
  user_id    TEXT,
  event      TEXT NOT NULL,
  properties TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_event   ON analytics_events(event);
CREATE INDEX IF NOT EXISTS idx_events_user    ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_created ON analytics_events(created_at DESC);

-- ── Auth rate limiting ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limits (
  key        TEXT PRIMARY KEY,
  count      INTEGER DEFAULT 1,
  window_end TEXT NOT NULL
);

-- ── Saved job alert searches ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_searches (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  label      TEXT DEFAULT '',
  query      TEXT NOT NULL,
  location   TEXT DEFAULT '',
  frequency  TEXT DEFAULT 'daily',
  active     INTEGER DEFAULT 1,
  last_run   TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_searches_user ON saved_searches(user_id);

-- ── Alert send history (prevents re-sending same job) ─────────────────────────
CREATE TABLE IF NOT EXISTS alert_history (
  id        TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL,
  search_id TEXT NOT NULL,
  job_id    TEXT NOT NULL,
  sent_at   TEXT DEFAULT (datetime('now')),
  UNIQUE(search_id, job_id)
);
CREATE INDEX IF NOT EXISTS idx_alert_history_search ON alert_history(search_id);

-- ── Interview prep ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interview_prep (
  id           TEXT PRIMARY KEY,
  job_id       TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  questions    TEXT DEFAULT '[]',
  generated_at TEXT,
  updated_at   TEXT DEFAULT (datetime('now')),
  UNIQUE(job_id, user_id),
  FOREIGN KEY (job_id)  REFERENCES jobs(id)  ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
