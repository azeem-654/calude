-- ─────────────────────────────────────────────────────────────────────────────
-- Three things the app could not answer for itself.
--
--   1. "Start this campaign on Tuesday." The sequence engine sends to whoever
--      is enrolled; nothing ever enrolled anybody on a date. So a campaign
--      written on Friday sat as a draft until a human remembered it.
--
--   2. "Did the schedule run?" The cron logged its work to console and nothing
--      else, which means the answer lived in a Cloudflare log the customer
--      cannot read. "My campaign never went out" had no answer at all.
--
--   3. "How many sub-accounts may this agency have?" The allowance was checked
--      in the browser, which is a courtesy, not a limit — the plan boundary
--      has to be somewhere the customer cannot edit.
-- ─────────────────────────────────────────────────────────────────────────────

-- A campaign told to start on its own.
--
-- One row per scheduled start. The tick picks up anything due, enrols the
-- audience it names and turns the sequence on; the same tick's sending pass
-- then carries it, so a schedule due at 9:00 goes out at 9:00 rather than on
-- whatever tick somebody next opens the app.
CREATE TABLE IF NOT EXISTS crm_schedules (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL,
  -- 'sequence_start' today. Named rather than assumed so the tick can grow
  -- another kind without a second table.
  kind        TEXT NOT NULL,
  -- The sequence this starts.
  ref_id      TEXT NOT NULL,
  label       TEXT NOT NULL DEFAULT '',
  start_at    TEXT NOT NULL,
  -- Who to enrol, as JSON: {"status":["lead"],"tags":["London"],"limit":500}.
  -- An empty object means everybody with an email address.
  audience    TEXT NOT NULL DEFAULT '{}',
  -- 'pending' | 'done' | 'failed' | 'cancelled'
  status      TEXT NOT NULL DEFAULT 'pending',
  -- What happened, in words: "enrolled 34 contacts", or why not.
  detail      TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  ran_at      TEXT
);

-- The tick's index. It asks one question every five minutes — "what is pending
-- and due?" — and this is the answer without reading the table.
CREATE INDEX IF NOT EXISTS idx_crm_schedules_due ON crm_schedules (status, start_at);
CREATE INDEX IF NOT EXISTS idx_crm_schedules_account ON crm_schedules (account_id, start_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- What the schedule actually did, kept where the customer can see it.
--
-- One row per tick. Small on purpose: this is a health readout, not an audit
-- log, and a row every five minutes is 105,000 a year if nothing prunes it —
-- so the tick keeps the most recent few days and drops the rest.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_ticks (
  id         TEXT PRIMARY KEY,
  at         TEXT NOT NULL,
  ms         INTEGER NOT NULL DEFAULT 0,
  accounts   INTEGER NOT NULL DEFAULT 0,
  sent       INTEGER NOT NULL DEFAULT 0,
  failed     INTEGER NOT NULL DEFAULT 0,
  -- Schedules that started on this tick.
  started    INTEGER NOT NULL DEFAULT 0,
  -- JSON: [{"accountId":"…","text":"…"}]. Tagged by workspace so a customer
  -- reading their own automation health sees their own failures and nobody
  -- else's.
  notes      TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_crm_ticks_at ON crm_ticks (at);

-- ─────────────────────────────────────────────────────────────────────────────
-- What an agency has paid for.
--
-- The browser has always known the plans; it cannot be the one enforcing them.
-- A row here is the authority, and its absence is a decision too: the install's
-- original owner is unlimited, and anybody who signed up since gets the entry
-- plan until something — Stripe, or the operator — says otherwise.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_plans (
  owner_email  TEXT PRIMARY KEY,
  -- 'starter' | 'pro' | 'agency', matching the client's PLANS list.
  plan_id      TEXT NOT NULL,
  -- How many workspaces beyond their own. -1 is unlimited. Denormalised from
  -- the plan on purpose: an operator can grant one customer more without
  -- inventing a plan, and a later change to a plan's limit does not silently
  -- move a boundary somebody is already living inside.
  resell_limit INTEGER NOT NULL,
  -- 'stripe' | 'manual' | 'default'
  source       TEXT NOT NULL DEFAULT 'manual',
  updated_at   TEXT NOT NULL
);
