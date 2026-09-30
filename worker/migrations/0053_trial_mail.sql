-- ─────────────────────────────────────────────────────────────────────────────
-- Onboarding emails on days 1, 3 and 5 of a trial, and the owner's daily
-- digest of sign-ups (lib/trialMail.ts).
--
-- One row per person per step. A row is written as 'sent' only after the mail
-- server accepted the message, as 'skipped' when a later step overtook it (a
-- person who first qualifies on day 4 is sent day 3, not days 1 and 3 in the
-- same minute), and as 'failed' with a count when the send did not go — which
-- is retried, a limited number of times, rather than marked done.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_trial_nudges (
  email      TEXT NOT NULL,
  step       INTEGER NOT NULL,
  status     TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  detail     TEXT NOT NULL DEFAULT '',
  at         TEXT NOT NULL,
  PRIMARY KEY (email, step)
);
CREATE INDEX IF NOT EXISTS idx_crm_trial_nudges_at ON crm_trial_nudges (at);

-- Somebody who pressed "stop these emails". Kept on the person rather than in
-- the nudge table so it outlives any change to which steps exist.
ALTER TABLE crm_users ADD COLUMN nudges_off_at TEXT;
