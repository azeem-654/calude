-- ─────────────────────────────────────────────────────────────────────────────
-- The affiliate program: 40% of every subscription payment from a customer an
-- affiliate referred, for as long as that customer keeps paying.
--
-- ── What is recorded, and what is not ──
--
-- An affiliate is a signed-in account that joined (crm_affiliates). A referral
-- is one account that signed up through an affiliate's link (crm_referrals,
-- one per referred account — the first link wins, and nobody refers
-- themselves). A commission is one subscription payment that a referred
-- account actually made, at the rate in force (crm_commissions) — written by
-- the billing webhook, once per processor event, never by a browser.
--
-- No money moves here. Commissions are held for 30 days (refund window), then
-- shown as payable; the install owner pays affiliates themselves and marks
-- each one paid or void on the Affiliates screen. A program that paid out
-- automatically would be moving money on a webhook's say-so.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_affiliates (
  email         TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'active',
  payout_note   TEXT NOT NULL DEFAULT '',
  terms_version TEXT NOT NULL DEFAULT '',
  clicks        INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS crm_referrals (
  referred_email TEXT PRIMARY KEY,
  code           TEXT NOT NULL,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON crm_referrals (code);

CREATE TABLE IF NOT EXISTS crm_commissions (
  id             TEXT PRIMARY KEY,           -- '<processor>:<event id>' — one per payment
  code           TEXT NOT NULL,
  referred_email TEXT NOT NULL,
  account_id     TEXT,
  base_cents     INTEGER NOT NULL,           -- what the customer paid
  rate_pct       INTEGER NOT NULL,           -- 40, recorded with the row
  amount_cents   INTEGER NOT NULL,           -- what the affiliate earned
  currency       TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',  -- pending | paid | void
  payable_at     TEXT NOT NULL,              -- created_at + 30 days
  paid_at        TEXT,
  note           TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_commissions_code ON crm_commissions (code, created_at);
