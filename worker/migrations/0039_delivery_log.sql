-- ─────────────────────────────────────────────────────────────────────────────
-- Who was actually sent what, and what happened.
--
-- ── Why this did not exist and had to ──
--
-- Sends were recorded on the enrolment: a `history` array inside a JSON blob in
-- the browser-owned key/value store. That is enough to stop a sequence sending
-- the same step twice, and it is useless for the question somebody actually
-- asks — "did Rita get the email?" You cannot filter it, cannot search it by
-- address, and it disappears into whichever contact record happens to hold it.
--
-- So every send writes a row here, server-side, at the moment it is attempted.
--
-- ── Why it is a row per attempt and not per recipient ──
--
-- A retry, a bounce and a later resend are three different events about one
-- address, and collapsing them to a status column loses the one thing a person
-- wants when mail is going missing: the order things happened in and what the
-- server said each time.
--
-- ── Why it is not in the blob ──
--
-- The blob is written by the browser and pushed whole. A cron writing sends
-- into it while somebody has the app open loses them on the next push — the
-- same trap the engagement captures were designed around. This table is only
-- ever written by the server and only ever read by the app.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_delivery_log (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,

  -- email | sms. One table for both, because "did it arrive" is the same
  -- question and two tables would answer it two ways.
  channel       TEXT NOT NULL DEFAULT 'email',

  -- What it belonged to. A sequence step, a campaign, or a one-off — kept as
  -- loose ids rather than foreign keys, because a campaign deleted next month
  -- must not take the evidence of what it sent with it.
  source        TEXT NOT NULL DEFAULT '',   -- sequence | campaign | engagement | manual
  source_id     TEXT NOT NULL DEFAULT '',
  source_name   TEXT NOT NULL DEFAULT '',
  step_index    INTEGER NOT NULL DEFAULT 0,

  contact_id    TEXT NOT NULL DEFAULT '',
  recipient     TEXT NOT NULL,              -- the address or number it went to
  subject       TEXT NOT NULL DEFAULT '',

  -- sent | failed | suppressed. `suppressed` is somebody's own opt-out and is
  -- not a fault to chase — naming it separately is what stops it being counted
  -- as a delivery problem.
  status        TEXT NOT NULL,
  -- What the server said, verbatim, when it refused. The single most useful
  -- field on this table when mail stops arriving.
  detail        TEXT NOT NULL DEFAULT '',
  -- Which mailbox it went out through, so a pool can be told apart.
  sent_from     TEXT NOT NULL DEFAULT '',

  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_delivery_acct ON crm_delivery_log (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_source ON crm_delivery_log (account_id, source_id, created_at DESC);
-- Answering "did this address get anything" without scanning the workspace.
CREATE INDEX IF NOT EXISTS idx_delivery_recipient ON crm_delivery_log (account_id, recipient);
