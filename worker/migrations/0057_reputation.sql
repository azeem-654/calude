-- ─────────────────────────────────────────────────────────────────────────────
-- Reputation, read from Google rather than made up in the browser.
--
-- The Reviews screen used to seed eight invented reviews, invent another every
-- twenty to forty seconds, and compare the business with three invented
-- competitors. The Google key it asked for was stored in plain text in crm_data
-- and never used. These tables are what replaced that:
--
--   crm_review_sources      which Google place a workspace is, and how to ask
--   crm_gbp_connections     the owner's Google Business Profile, if connected
--   crm_reviews             every review actually read, once
--   crm_review_competitors  places the customer chose to compare against
--
-- Credentials (a workspace's own Places key, GBP tokens) are encrypted with the
-- install secret and never returned to a browser.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_review_sources (
  account_id        TEXT PRIMARY KEY,
  place_id          TEXT NOT NULL DEFAULT '',
  place_name        TEXT NOT NULL DEFAULT '',
  maps_url          TEXT NOT NULL DEFAULT '',
  -- The workspace's own Places key, encrypted; '' means "use the install's".
  places_key        TEXT NOT NULL DEFAULT '',
  -- Stamped when a check with that key succeeded; cleared when the key changes.
  key_verified_at   TEXT,
  auto_check        INTEGER NOT NULL DEFAULT 1,
  last_checked_at   TEXT,
  last_error        TEXT NOT NULL DEFAULT '',
  rating            REAL,
  review_count      INTEGER,
  competitors_at    TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_review_sources_due ON crm_review_sources (auto_check, last_checked_at);

-- One Business Profile connection per workspace.
--
-- `pending_state` holds `<nonce>|<sig>` while somebody is on Google's consent
-- screen, with `pending_email` naming who asked; the callback must match both
-- and the value is cleared the moment it is used. It is a column of its own
-- (unlike crm_calendar_connections, which borrows access_token) because a
-- workspace that reconnects is already connected, and overwriting the live
-- token with a nonce would break it for the thirty seconds it takes to consent
-- — or for good, if they never come back.
CREATE TABLE IF NOT EXISTS crm_gbp_connections (
  account_id      TEXT PRIMARY KEY,
  owner_email     TEXT NOT NULL DEFAULT '',
  refresh_token   TEXT NOT NULL DEFAULT '',
  access_token    TEXT NOT NULL DEFAULT '',
  expires_at      TEXT,
  account_name    TEXT NOT NULL DEFAULT '',   -- accounts/123
  location_name   TEXT NOT NULL DEFAULT '',   -- locations/456
  location_title  TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'none',  -- none | connected | error
  last_error      TEXT NOT NULL DEFAULT '',
  pending_email   TEXT NOT NULL DEFAULT '',
  pending_state   TEXT NOT NULL DEFAULT '',
  pending_at      TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- `id` is random and a primary key across every tenant, so every statement
-- that names one also names the account (CLAUDE.md, "an upsert by id is
-- scoped"). The natural key is (account, source, ext_id): reading the same
-- review twice is a no-op, which is what makes a check safe to repeat.
CREATE TABLE IF NOT EXISTS crm_reviews (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  source        TEXT NOT NULL,              -- google_places | google_business
  ext_id        TEXT NOT NULL,
  platform      TEXT NOT NULL DEFAULT 'google',
  author        TEXT NOT NULL DEFAULT '',
  author_photo  TEXT NOT NULL DEFAULT '',
  rating        INTEGER NOT NULL DEFAULT 0,
  content       TEXT NOT NULL DEFAULT '',
  review_time   TEXT,
  link          TEXT NOT NULL DEFAULT '',
  reply         TEXT NOT NULL DEFAULT '',
  reply_time    TEXT,
  reply_state   TEXT NOT NULL DEFAULT 'none',  -- none | draft | posted | posted_elsewhere
  draft         TEXT NOT NULL DEFAULT '',
  attention     INTEGER NOT NULL DEFAULT 0,
  note          TEXT NOT NULL DEFAULT '',
  auto          INTEGER NOT NULL DEFAULT 0,    -- posted by an auto-response rule
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (account_id, source, ext_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_account_time ON crm_reviews (account_id, review_time);

CREATE TABLE IF NOT EXISTS crm_review_competitors (
  account_id    TEXT NOT NULL,
  place_id      TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  rating        REAL,
  review_count  INTEGER,
  maps_url      TEXT NOT NULL DEFAULT '',
  last_error    TEXT NOT NULL DEFAULT '',
  updated_at    TEXT NOT NULL,
  UNIQUE (account_id, place_id)
);
