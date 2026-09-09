-- ─────────────────────────────────────────────────────────────────────────────
-- Buying domains and mailboxes for a customer, rather than asking them to.
--
-- infra.ts already registers domains, writes DNS and creates mailboxes — all
-- against credentials the customer connected themselves. That is the honest
-- default and it stays. What it cannot do is the thing that makes this product
-- feel automatic: a plumber who has never heard of a registrar signs up, and
-- twenty minutes later has a domain, four mailboxes and SPF set up, without
-- opening an account anywhere.
--
-- ── What "managed" actually means, and what it does not ──
--
-- It means the *operator's* registrar account is used and the cost is recorded
-- against the customer's workspace. It does not mean the software has a
-- registrar relationship: somebody has to sign a reseller agreement, hold the
-- account, and carry the chargebacks. Until an operator connects install-level
-- credentials below, managed mode can buy nothing — and says so plainly rather
-- than failing at the moment a customer presses the button.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── The operator's own provider accounts ──
--
-- Deliberately not in crm_providers. That table is keyed by workspace and is
-- the customer's own connections; mixing the two would mean one bad query
-- charging a purchase to somebody else's registrar. Different table, different
-- shape, and only the install owner may write to it.
CREATE TABLE IF NOT EXISTS crm_install_providers (
  kind        TEXT NOT NULL,        -- registrar | dns | mailbox
  provider    TEXT NOT NULL,        -- porkbun | cloudflare | migadu …
  credentials TEXT NOT NULL,        -- encrypted JSON, same as crm_providers
  status      TEXT NOT NULL DEFAULT 'unknown',
  last_error  TEXT NOT NULL DEFAULT '',
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (kind)
);

-- ── What was bought, for whom, and what it cost ──
--
-- Every managed purchase, recorded at the moment it happens. This is the row a
-- customer is billed from and the row an operator answers "why is there a
-- charge on my card" from, so the price is stored as the provider quoted it
-- rather than recomputed later from a price list that may have changed.
--
-- `workspace_cost` is what we charge and `provider_cost` is what it cost us,
-- kept apart on purpose: a margin that is implicit in one number cannot be
-- reported on, refunded correctly, or explained.
CREATE TABLE IF NOT EXISTS crm_managed_purchases (
  id             TEXT PRIMARY KEY,
  account_id     TEXT NOT NULL,

  kind           TEXT NOT NULL,     -- domain | mailbox | phone_number
  item           TEXT NOT NULL,     -- the domain, the address, the number
  provider       TEXT NOT NULL,

  provider_cost  REAL NOT NULL DEFAULT 0,
  workspace_cost REAL NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL DEFAULT 'USD',

  -- ok | failed | refunded
  status         TEXT NOT NULL DEFAULT 'ok',
  detail         TEXT NOT NULL DEFAULT '',

  -- When it needs paying for again. Null for things that do not renew.
  renews_at      TEXT,
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_managed_purchases_account
  ON crm_managed_purchases (account_id, created_at DESC);

-- ── Which way this workspace buys ──
--
-- 'byo' is the default and always will be: it spends nobody's money without an
-- account they already control. A workspace only becomes 'managed' when the
-- customer chooses it.
ALTER TABLE crm_autopilot ADD COLUMN purchase_mode TEXT NOT NULL DEFAULT 'byo';

-- What a sending pool should look like for this workspace, as JSON:
-- {"domains": 2, "mailboxesPerDomain": 3}. Empty means Autopilot has not been
-- asked to build one.
ALTER TABLE crm_autopilot ADD COLUMN pool_target TEXT NOT NULL DEFAULT '{}';
