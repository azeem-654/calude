-- The owner's support desk (2026-11-25): reminders about unread replies,
-- emails to customers by plan, who is online, direct messages and call offers,
-- and access to a customer's workspace — with their permission, or read-only
-- and logged. lib/supportDesk.ts, routes/supportDesk.ts, lib/unreadNudge.ts.

-- When the visitor last had the chat open and in front of them (widget poll
-- with `seen`), and when the reminder about an unread reply last went.
ALTER TABLE crm_conversations ADD COLUMN visitor_seen_at TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_conversations ADD COLUMN unread_nudged_at TEXT NOT NULL DEFAULT '';
-- The same for tickets: when the customer last opened it (Check ticket status).
ALTER TABLE crm_tickets ADD COLUMN customer_seen_at TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_tickets ADD COLUMN unread_nudged_at TEXT NOT NULL DEFAULT '';
-- Per workspace: email a visitor about a reply they have not read. NULL is the
-- default — on for the install owner's own support, off for everybody else's
-- until they switch it on (their visitors, their mailbox, their choice).
ALTER TABLE crm_engage_settings ADD COLUMN nudge_unread INTEGER;

-- In-app messages grow a kind: 'notice' (as before), 'direct' (a message from
-- support that can be answered; `conversation_id` is the thread in the owner's
-- support inbox), 'call' (an offer of a call; `link` is the meeting), 'access'
-- (a request to open their workspace; `ref` is the crm_support_access id).
ALTER TABLE crm_notices ADD COLUMN kind TEXT NOT NULL DEFAULT 'notice';
ALTER TABLE crm_notices ADD COLUMN conversation_id TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_notices ADD COLUMN ref TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_notices ADD COLUMN answer TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_notices ADD COLUMN answered_at TEXT;

-- Signed-in people with a page of the app open: one row each, rewritten by a
-- heartbeat at most once a minute while a page is visible.
CREATE TABLE IF NOT EXISTS crm_user_presence (
  email        TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL DEFAULT '',
  path         TEXT NOT NULL DEFAULT '',
  app          TEXT NOT NULL DEFAULT 'web',
  visit_at     TEXT NOT NULL,      -- when this visit began (a gap of 30 min starts a new one)
  last_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_presence_last ON crm_user_presence (last_at DESC);

-- The owner's emails to their own customers, by plan. `audience` is a JSON
-- list of segments ('trial', 'ended', 'paid', 'appsumo', 'other').
CREATE TABLE IF NOT EXISTS crm_support_broadcasts (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL DEFAULT 'update',   -- update | marketing
  subject      TEXT NOT NULL,
  body         TEXT NOT NULL DEFAULT '',
  link         TEXT NOT NULL DEFAULT '',
  link_label   TEXT NOT NULL DEFAULT '',
  audience     TEXT NOT NULL DEFAULT '[]',
  in_app       INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'queued',   -- queued | sending | done | cancelled
  total        INTEGER NOT NULL DEFAULT 0,
  created_by   TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  finished_at  TEXT
);
CREATE TABLE IF NOT EXISTS crm_support_broadcast_recipients (
  broadcast_id TEXT NOT NULL,
  email        TEXT NOT NULL,
  name         TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'queued',   -- queued | sent | failed | skipped
  error        TEXT NOT NULL DEFAULT '',
  tries        INTEGER NOT NULL DEFAULT 0,
  at           TEXT,
  PRIMARY KEY (broadcast_id, email)
);
CREATE INDEX IF NOT EXISTS idx_bcast_rcpt_status ON crm_support_broadcast_recipients (status, broadcast_id);

-- Customers who said no to the owner's marketing emails (updates still go).
CREATE TABLE IF NOT EXISTS crm_customer_optouts (
  email        TEXT PRIMARY KEY,
  at           TEXT NOT NULL
);

-- The owner inside a customer's workspaces. mode 'assist' is the customer's
-- permission, for `hours`, covering every workspace `customer_email` owns:
-- pending → active (approved) → expired | ended (owner) | revoked (customer),
-- or declined. mode 'review' is a read-only look, logged with its reason; it
-- grants nothing and is written already 'ended'. `token_hash` is the approve/
-- decline link's secret, hashed; `end_mailed` stops the "access ended" email
-- going twice.
CREATE TABLE IF NOT EXISTS crm_support_access (
  id             TEXT PRIMARY KEY,
  customer_email TEXT NOT NULL,
  account_id     TEXT NOT NULL DEFAULT '',
  mode           TEXT NOT NULL DEFAULT 'assist',
  hours          INTEGER NOT NULL DEFAULT 1,
  reason         TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'pending',
  requested_by   TEXT NOT NULL DEFAULT '',
  token_hash     TEXT NOT NULL DEFAULT '',
  requested_at   TEXT NOT NULL,
  decided_at     TEXT,
  expires_at     TEXT,
  ended_at       TEXT,
  end_mailed     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_support_access_cust ON crm_support_access (customer_email, status);
CREATE INDEX IF NOT EXISTS idx_support_access_status ON crm_support_access (status, expires_at);

-- Things the owner should hear about at their desk or on their phone, read by
-- their open app (support-desk.php `pulse`) after a cursor.
CREATE TABLE IF NOT EXISTS crm_owner_alerts (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,          -- customer.online | customer.reply | call.accepted | call.declined | access.approved | access.declined | access.revoked
  email        TEXT NOT NULL DEFAULT '',
  summary      TEXT NOT NULL DEFAULT '',
  route        TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_owner_alerts_at ON crm_owner_alerts (created_at);
