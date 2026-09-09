-- ─────────────────────────────────────────────────────────────────────────────
-- SMS: credentials on the server, and a record of who told us to stop.
--
-- The Twilio send itself already worked (`handleSmsSend` in routes/misc.ts) —
-- but it took the Account SID and auth token out of the *request body*, and the
-- only place they were kept was localStorage under `crm_sms`. Two consequences,
-- and the second is the one that mattered: the credentials sat in a browser in
-- plain text, and nothing that runs without a browser could send at all. The
-- cron could not send an SMS step because it had nowhere to read a token from.
--
-- Same treatment as the mailbox: encrypted at rest with the install secret,
-- never returned to a browser, resolved server-side by workspace.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_sms_config (
  account_id    TEXT PRIMARY KEY,

  provider      TEXT NOT NULL DEFAULT 'twilio',
  account_sid   TEXT NOT NULL DEFAULT '',      -- encrypted
  auth_token    TEXT NOT NULL DEFAULT '',      -- encrypted
  from_number   TEXT NOT NULL DEFAULT '',      -- E.164, e.g. +15551234567

  -- What the last real check found, so the settings screen can show a state
  -- rather than "unknown", and a number that stopped working is visible before
  -- a campaign discovers it.
  verified_at   TEXT,
  last_error    TEXT NOT NULL DEFAULT '',

  updated_at    TEXT NOT NULL
);

-- ── Who has told us to stop ──
--
-- Not a nicety. Under the TCPA an opt-out has to be honoured, and a carrier
-- that sees us keep messaging somebody who replied STOP will filter the number
-- for everyone. Twilio intercepts STOP on its own for most numbers, but it does
-- so silently — the app would carry on queueing messages that are never
-- delivered, count them as sent, and report a reply rate against an audience
-- that never received anything.
--
-- So it is recorded here and checked before every send. The number is stored as
-- given in E.164; `source` says how we learned, because a person who asked a
-- human to remove them deserves the same treatment as one who texted STOP.
CREATE TABLE IF NOT EXISTS crm_sms_optouts (
  account_id  TEXT NOT NULL,
  phone       TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'reply',   -- reply | manual | carrier
  at          TEXT NOT NULL,
  PRIMARY KEY (account_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_sms_optouts_account ON crm_sms_optouts (account_id);
