-- ─────────────────────────────────────────────────────────────────────────────
-- The operator's strategy call (routes/strategyCall.ts, lib/strategyCall.ts).
--
-- Not a workspace's booking page: prospects from the public sites book a call
-- with the install owner. Its settings are one row read and written only by
-- the install owner, and its bookings never appear in any workspace.
--
-- Additive only: two new tables, nothing existing is altered, so rolling the
-- Worker back leaves them unused rather than broken.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_strategy_settings (
  id          TEXT PRIMARY KEY,            -- always 'default'
  settings    TEXT NOT NULL,               -- cleanSettings() output, JSON
  updated_by  TEXT NOT NULL DEFAULT '',
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS crm_strategy_calls (
  id            TEXT PRIMARY KEY,          -- random, never sequential
  -- SHA-256 of the guest's manage key; the key itself is only ever in their email
  key_hash      TEXT NOT NULL,
  -- the browser's submit id: a retried or double-clicked submit finds this row
  idem_key      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'confirmed',   -- confirmed | cancelled | completed | no_show
  slot_date     TEXT NOT NULL,             -- owner's wall clock
  slot_time     TEXT NOT NULL,
  start_ms      INTEGER NOT NULL,          -- the instant, UTC ms
  end_ms        INTEGER NOT NULL,
  duration      INTEGER NOT NULL,
  host_tz       TEXT NOT NULL,
  visitor_tz    TEXT NOT NULL DEFAULT '',
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  company       TEXT NOT NULL DEFAULT '',
  website       TEXT NOT NULL DEFAULT '',
  industry      TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  answers       TEXT NOT NULL DEFAULT '{}',  -- {questionId: answer} plus the labels asked, frozen
  meeting_type  TEXT NOT NULL DEFAULT '',
  source_site   TEXT NOT NULL DEFAULT 'main',
  source        TEXT NOT NULL DEFAULT '{}',  -- utm, click ids, referrer
  internal_note TEXT NOT NULL DEFAULT '',    -- owner only, never in a public answer
  history       TEXT NOT NULL DEFAULT '[]',  -- [{at, by, what, from?, to?}]
  notify        TEXT NOT NULL DEFAULT '{}',  -- {guest, owner, reminder}: sent | failed: … | not_configured | off
  reminded_at   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_strategy_idem ON crm_strategy_calls(idem_key);
-- Two confirmed calls can never start at the same instant, whatever reaches the
-- database first. Overlaps between different starts are refused by the
-- conditional INSERT in the route, which SQLite runs as one statement.
CREATE UNIQUE INDEX IF NOT EXISTS idx_strategy_slot ON crm_strategy_calls(start_ms) WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS idx_strategy_date ON crm_strategy_calls(slot_date, status);
