-- ─────────────────────────────────────────────────────────────────────────────
-- Resellers charging their own clients, at their own price, into their own
-- account.
--
-- A third pot of money, beside the two in CLAUDE.md, and kept as separate:
--   crm_install_providers   the operator billing subscribers for the app
--   crm_storefront          a subscriber's shop charging its buyers
--   crm_reseller_billing    a reseller billing *their* clients for the
--                           workspaces they run for them
-- The reseller connects their own Stripe or Creem; their clients pay them;
-- the operator never holds this money, and the price is the reseller's to set.
-- Each reseller's webhook has its own address (`hook_id`), so one reseller's
-- processor can only ever speak about that reseller's own clients.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_reseller_billing (
  owner_email  TEXT PRIMARY KEY,
  provider     TEXT NOT NULL DEFAULT 'stripe',
  credentials  TEXT NOT NULL DEFAULT '',     -- encrypted {key, webhookSecret}
  provider_ref TEXT NOT NULL DEFAULT '',
  hook_id      TEXT NOT NULL UNIQUE,
  status       TEXT NOT NULL DEFAULT 'unknown',
  last_error   TEXT NOT NULL DEFAULT '',
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS crm_reseller_clients (
  account_id   TEXT PRIMARY KEY,
  owner_email  TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'USD',
  status       TEXT NOT NULL DEFAULT 'none',  -- none | checkout_sent | active | past_due | cancelled
  last_paid_at TEXT,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reseller_clients_owner ON crm_reseller_clients (owner_email);
