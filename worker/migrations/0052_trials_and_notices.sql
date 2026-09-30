-- ─────────────────────────────────────────────────────────────────────────────
-- The 7-day free trial, and the install owner talking to the people on it.
--
-- trial_ends_at is set when an account is created by signing up (lib/trial.ts).
-- Rows that already exist keep NULL, which means "predates trials" and is never
-- ended — access somebody already had is not taken away by a new feature.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE crm_users ADD COLUMN trial_ends_at TEXT;

-- A message from the install owner to one customer, shown inside the app until
-- they close it, and optionally emailed as well. `link` is where its button
-- goes (a kickoff-call booking page, most often); it is checked to be http(s)
-- on the way in, because it is rendered as a link in somebody else's session.
CREATE TABLE IF NOT EXISTS crm_notices (
  id           TEXT PRIMARY KEY,
  to_email     TEXT NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL DEFAULT '',
  link         TEXT NOT NULL DEFAULT '',
  link_label   TEXT NOT NULL DEFAULT '',
  -- 'sent' | 'failed' | 'skipped' — the email copy, if one was asked for.
  emailed      TEXT NOT NULL DEFAULT 'skipped',
  created_at   TEXT NOT NULL,
  read_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_crm_notices_to ON crm_notices (to_email, read_at);
