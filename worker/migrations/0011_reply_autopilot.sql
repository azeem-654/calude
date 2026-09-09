-- ─────────────────────────────────────────────────────────────────────────────
-- Replies that keep working when the laptop is shut.
--
-- The drafting already exists and is good: draftEmailReply in src/lib/gemini.ts,
-- rules per mailbox, a company voice, auto-send or draft. What it cannot do is
-- run. The loop lives in Conversations.tsx and polls every sixty seconds *while
-- the page is open*, and the Gemini key is in the browser's localStorage — so a
-- customer who closes their laptop stops answering leads, which is the exact
-- opposite of what this product promises.
--
-- Moving it to the cron needs two things the server does not have yet: a key it
-- can use, and a memory of which messages it has already dealt with.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_ai_config (
  account_id  TEXT PRIMARY KEY,

  provider    TEXT NOT NULL DEFAULT 'gemini',
  api_key     TEXT NOT NULL DEFAULT '',      -- encrypted, same as a mailbox password

  -- What the last real call found, so the settings screen can show a state
  -- rather than "unknown".
  verified_at TEXT,
  last_error  TEXT NOT NULL DEFAULT '',

  updated_at  TEXT NOT NULL
);

-- ── What has already been dealt with ──
--
-- IMAP UIDs are unique per folder, not globally, so the key is the mailbox and
-- the uid together. Without this the tick would re-read the same inbox every
-- five minutes and answer the same message for ever — the failure mode being a
-- customer receiving three hundred identical replies overnight, which is worse
-- than never replying at all.
--
-- `outcome` records what was decided, not only that it was seen: 'replied',
-- 'drafted', 'held' (waiting for a person), 'ignored' (no rule matched), or
-- 'stopped' (they asked us to leave them alone).
CREATE TABLE IF NOT EXISTS crm_reply_seen (
  account_id  TEXT NOT NULL,
  mailbox_id  TEXT NOT NULL,
  -- TEXT, not INTEGER. imap.ts hands back the UID as a string, and a UIDVALIDITY
  -- reset or a server that uses non-numeric identifiers would quietly become 0
  -- on the way in — which would collapse every message onto one row and make the
  -- tick think it had already answered mail it had never seen.
  uid         TEXT NOT NULL,
  outcome     TEXT NOT NULL DEFAULT 'ignored',
  at          TEXT NOT NULL,
  PRIMARY KEY (account_id, mailbox_id, uid)
);

CREATE INDEX IF NOT EXISTS idx_reply_seen_account ON crm_reply_seen (account_id, at DESC);

-- ── Replies waiting for a person ──
--
-- A drafted reply has to live somewhere until it is approved or discarded. It
-- is not an autopilot action — those are decisions, this is a piece of writing
-- with a recipient — and it needs the whole body kept so the person approving
-- can read exactly what would go out. Approving something you cannot see is not
-- approval.
CREATE TABLE IF NOT EXISTS crm_reply_drafts (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL,
  mailbox_id   TEXT NOT NULL,
  uid          TEXT NOT NULL,

  to_email     TEXT NOT NULL,
  to_name      TEXT NOT NULL DEFAULT '',
  in_subject   TEXT NOT NULL DEFAULT '',
  in_body      TEXT NOT NULL DEFAULT '',

  subject      TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL DEFAULT '',
  confidence   INTEGER NOT NULL DEFAULT 0,
  needs_human  INTEGER NOT NULL DEFAULT 0,

  -- Which rule fired, and why this is waiting rather than gone.
  rule_name    TEXT NOT NULL DEFAULT '',
  because      TEXT NOT NULL DEFAULT '',

  -- waiting | sent | discarded | failed
  status       TEXT NOT NULL DEFAULT 'waiting',
  detail       TEXT NOT NULL DEFAULT '',

  created_at   TEXT NOT NULL,
  acted_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_reply_drafts_account
  ON crm_reply_drafts (account_id, status, created_at DESC);
