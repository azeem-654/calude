-- Email verification and named-people lookup for AI Prospecting
-- (worker/src/lib/emailVerify.ts).
--
-- crm_email_checks: one verdict per address, shared by every workspace. A
-- verdict is a fact about an address, not about whoever asked, and keeping one
-- means the owner's verifier credits are not spent twice on the same inbox.
-- `level` says how far the check went: 'basic' is syntax, domain and mail
-- server (free, ours); 'mailbox' is the connected verifier's answer.
CREATE TABLE IF NOT EXISTS crm_email_checks (
  email      TEXT PRIMARY KEY,
  status     TEXT NOT NULL,            -- 'valid' | 'domain_ok' | 'risky' | 'invalid' | 'unknown'
  reason     TEXT NOT NULL DEFAULT '', -- short code: 'no_mx', 'catch_all', 'disposable', …
  level      TEXT NOT NULL,            -- 'basic' | 'mailbox'
  provider   TEXT NOT NULL DEFAULT '', -- '' for basic, else 'hunter' | 'zerobounce' | 'millionverifier'
  flags      TEXT NOT NULL DEFAULT '', -- comma list: role, free, disposable, catch_all
  checked_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- What the web says about a domain's people (Hunter's domain search), cached
-- so a second look at the same business costs nothing.
CREATE TABLE IF NOT EXISTS crm_email_finds (
  domain     TEXT PRIMARY KEY,
  payload    TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

-- Spending on the owner's verifier key, per workspace, per day and per month.
-- `period` is 'd:YYYY-MM-DD' or 'm:YYYY-MM' (UTC); `kind` 'verify' | 'find'.
CREATE TABLE IF NOT EXISTS crm_verifier_usage (
  period     TEXT NOT NULL,
  account_id TEXT NOT NULL,
  kind       TEXT NOT NULL,
  n          INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (period, account_id, kind)
);
