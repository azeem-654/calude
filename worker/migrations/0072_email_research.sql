-- Researched emails: what a prospect's own website said, written into the
-- opening of the email sent to them (lib/prospectResearch.ts). One row per
-- workspace and address, reused for 30 days so a five-email sequence reads
-- the site once. `opener` and `challenge` empty with a `note` = nothing true
-- and specific was found; the email then goes out as the template wrote it.
CREATE TABLE IF NOT EXISTS crm_email_research (
  account_id TEXT NOT NULL,
  email      TEXT NOT NULL,
  site       TEXT NOT NULL DEFAULT '',
  opener     TEXT NOT NULL DEFAULT '',
  challenge  TEXT NOT NULL DEFAULT '',
  note       TEXT NOT NULL DEFAULT '',
  made_at    TEXT NOT NULL,
  PRIMARY KEY (account_id, email)
);
