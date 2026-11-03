-- ─────────────────────────────────────────────────────────────────────────────
-- Email on a customer's own domain, hosted here (lib/hostedMail.ts).
--
-- A domain is a zone on the operator's Cloudflare account; Email Routing's
-- catch-all hands every message to the Worker, which stores it here. Each
-- address is also a crm_mailbox_accounts row (provider 'hosted'), so the
-- inbox, campaigns and replies use it like any other mailbox. `domain` and
-- `address` are unique install-wide: one workspace per domain.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_hosted_domains (
  id             TEXT PRIMARY KEY,
  account_id     TEXT NOT NULL,
  domain         TEXT NOT NULL UNIQUE,
  zone_id        TEXT NOT NULL,
  nameservers    TEXT NOT NULL DEFAULT '[]',
  zone_status    TEXT NOT NULL DEFAULT 'pending',   -- Cloudflare's: pending until the nameservers move, then active
  routing_status TEXT NOT NULL DEFAULT 'off',       -- off | pending | on
  send_provider  TEXT NOT NULL DEFAULT '',          -- resend | brevo
  send_ref       TEXT NOT NULL DEFAULT '',          -- the provider's id for the domain
  send_status    TEXT NOT NULL DEFAULT 'not_started', -- not_started | pending | verified | failed | no_provider
  last_error     TEXT NOT NULL DEFAULT '',
  checked_at     TEXT,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hosted_domains_account ON crm_hosted_domains (account_id);

CREATE TABLE IF NOT EXISTS crm_hosted_addresses (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL,
  domain_id   TEXT NOT NULL,
  address     TEXT NOT NULL UNIQUE,
  mailbox_id  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hosted_addresses_account ON crm_hosted_addresses (account_id);

-- The text of each message (trimmed to 200 KB); the raw message, attachments
-- and all, is in R2 under raw_key when the bucket is bound.
CREATE TABLE IF NOT EXISTS crm_hosted_messages (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL,
  domain_id    TEXT NOT NULL,
  address_id   TEXT NOT NULL,
  mailbox_id   TEXT NOT NULL,
  message_id   TEXT NOT NULL DEFAULT '',
  from_addr    TEXT NOT NULL DEFAULT '',
  from_name    TEXT NOT NULL DEFAULT '',
  to_addr      TEXT NOT NULL DEFAULT '',
  subject      TEXT NOT NULL DEFAULT '',
  sent_at      TEXT NOT NULL DEFAULT '',
  snippet      TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL DEFAULT '',
  body_type    TEXT NOT NULL DEFAULT 'TEXT',
  attachments  TEXT NOT NULL DEFAULT '[]',
  raw_key      TEXT NOT NULL DEFAULT '',
  size         INTEGER NOT NULL DEFAULT 0,
  seen         INTEGER NOT NULL DEFAULT 0,
  received_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hosted_messages_mailbox ON crm_hosted_messages (mailbox_id, received_at);
CREATE INDEX IF NOT EXISTS idx_hosted_messages_account ON crm_hosted_messages (account_id, received_at);
