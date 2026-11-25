-- "Report a problem" → a fix (2026-11-25, lib/problemFix.ts). Every report a
-- signed-in customer sends from the app becomes one row here beside its
-- ticket. The install owner is asked (push, in-app alert, email) whether to
-- start fixing it; a yes hands it to a Claude Code cloud session through the
-- owner's scheduled task's API trigger, and that session reports back here.
--
-- status: waiting  — reported, the owner has not answered
--         fixing   — the owner said yes and the session was started
--         ready    — the session finished; the fix is on testing, not live yet
--         fixed    — live; the customer has been told (told_at)
--         declined — the owner said no; the ticket is answered by a person
--         failed   — the session could not be started, or said it could not fix it
CREATE TABLE IF NOT EXISTS crm_problem_fixes (
  id             TEXT PRIMARY KEY,
  ticket_id      TEXT NOT NULL DEFAULT '',
  reference      TEXT NOT NULL DEFAULT '',
  email          TEXT NOT NULL,
  name           TEXT NOT NULL DEFAULT '',
  account_id     TEXT NOT NULL DEFAULT '',
  page           TEXT NOT NULL DEFAULT '',
  description    TEXT NOT NULL,
  pictures       INTEGER NOT NULL DEFAULT 0,
  has_audio      INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'waiting',
  ship           TEXT NOT NULL DEFAULT '',      -- live | testing, chosen with the yes
  approve_hash   TEXT NOT NULL DEFAULT '',      -- the email button's secret, hashed
  reply_code     TEXT NOT NULL DEFAULT '',      -- in the ask email's subject; a "yes" reply must quote it
  agent_hash     TEXT NOT NULL DEFAULT '',      -- the session's key for this report, hashed
  session_url    TEXT NOT NULL DEFAULT '',
  note           TEXT NOT NULL DEFAULT '',      -- what the session said it found or changed
  error          TEXT NOT NULL DEFAULT '',
  digested_at    TEXT,
  decided_at     TEXT,
  sent_at        TEXT,
  fixed_at       TEXT,
  told_at        TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_problem_fixes_status ON crm_problem_fixes (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_problem_fixes_email ON crm_problem_fixes (email, created_at DESC);

-- The customer's voice note, if they recorded one. Kept in D1 like chat
-- pictures (no R2 binding on every install); ≤ 1.5 MB, so about two minutes.
CREATE TABLE IF NOT EXISTS crm_problem_audio (
  fix_id         TEXT PRIMARY KEY,
  mime           TEXT NOT NULL,
  bytes          BLOB NOT NULL,
  created_at     TEXT NOT NULL
);
