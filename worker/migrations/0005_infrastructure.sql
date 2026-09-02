-- ─────────────────────────────────────────────────────────────────────────────
-- The infrastructure a workspace runs on: who registers its domains, who hosts
-- its DNS, who creates its mailboxes.
--
-- Each of those is a third party with an API and a credential, and the
-- credential is the whole reason this is a table rather than a settings blob:
-- it is a key that can spend money and change where a domain points, so it is
-- encrypted at rest with the same AES-GCM install secret the customer's mailbox
-- password already uses, and it never goes back to the browser.
--
-- One row per (workspace, kind). A workspace has at most one registrar, one DNS
-- host and one mail provider at a time; connecting a second replaces the first
-- rather than leaving two sets of credentials with no way to say which is live.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_providers (
  account_id  TEXT NOT NULL,
  -- 'registrar' | 'dns' | 'mailbox'
  kind        TEXT NOT NULL,
  -- 'cloudflare' | 'namecheap' | 'porkbun' | 'google' | 'microsoft' | …
  provider    TEXT NOT NULL,
  -- Encrypted. A JSON object whose shape is the provider's business.
  credentials TEXT NOT NULL,
  -- What the last connection test said, and when. Stored so the settings screen
  -- can show the truth without re-testing on every render.
  status      TEXT NOT NULL DEFAULT 'untested',
  status_note TEXT NOT NULL DEFAULT '',
  checked_at  TEXT,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (account_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_crm_providers_account ON crm_providers (account_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- What has actually been provisioned, and by which run.
--
-- Every domain bought, DNS record written and mailbox created lands here. Not
-- for display — the provider is the source of truth for what exists — but so
-- the app can answer "did we do this, when, and did it work", which is the
-- question that matters when an automated run half-finishes. Without it a
-- retry cannot tell a step it already completed from one it never reached.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_provisioned (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL,
  -- 'domain' | 'dns_record' | 'mailbox'
  kind        TEXT NOT NULL,
  -- The thing itself: a domain name, a record name, an address.
  subject     TEXT NOT NULL,
  provider    TEXT NOT NULL DEFAULT '',
  -- 'ok' | 'failed'
  outcome     TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_crm_provisioned_account ON crm_provisioned (account_id, kind);
