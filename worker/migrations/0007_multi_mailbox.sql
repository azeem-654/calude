-- ─────────────────────────────────────────────────────────────────────────────
-- More than one mailbox per workspace.
--
-- crm_mailboxes is keyed `account_id TEXT PRIMARY KEY` — one row per workspace,
-- enforced by the database. That is why the settings screen had no "add another
-- mailbox" button: there was nowhere to put a second one. A support address and
-- a sales address could not both exist, and neither could a separate sending
-- domain.
--
-- ── Why a new table rather than altering the old one ──
--
-- The deploy applies migrations *before* it publishes the Worker, deliberately:
-- a Worker must never reach production expecting a column its database does not
-- have. The cost of that ordering is a window — a minute or two — where the new
-- schema is live and the *old* Worker code is still serving. Renaming or
-- reshaping crm_mailboxes would take every send and every inbox sync down for
-- the length of that window.
--
-- So crm_mailboxes is left exactly as it is. The old code keeps reading it and
-- keeps working; the new code reads this table. Once the new Worker has been
-- live for a while, dropping the old table is a one-line migration of its own.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_mailbox_accounts (
  id              TEXT PRIMARY KEY,
  account_id      TEXT NOT NULL,

  -- What the customer calls it: "Support", "Sales", "Billing". Shown in the
  -- unified inbox so a thread can say which mailbox it arrived on.
  label           TEXT NOT NULL DEFAULT '',

  -- Campaigns, sequences and the cron send from exactly one mailbox per
  -- workspace. Without a flag that choice would be implicit — whichever row
  -- happened to come back first — and a customer adding a second mailbox would
  -- silently change where their marketing came from.
  is_primary      INTEGER NOT NULL DEFAULT 0,

  -- Sending
  smtp_host       TEXT NOT NULL DEFAULT '',
  smtp_port       INTEGER NOT NULL DEFAULT 587,
  smtp_encryption TEXT NOT NULL DEFAULT 'tls',   -- tls | ssl | none
  smtp_username   TEXT NOT NULL DEFAULT '',
  smtp_password   TEXT NOT NULL DEFAULT '',      -- encrypted
  from_name       TEXT NOT NULL DEFAULT '',
  from_email      TEXT NOT NULL DEFAULT '',
  reply_to        TEXT NOT NULL DEFAULT '',

  -- Receiving
  imap_host       TEXT NOT NULL DEFAULT '',
  imap_port       INTEGER NOT NULL DEFAULT 993,
  imap_encryption TEXT NOT NULL DEFAULT 'ssl',
  imap_username   TEXT NOT NULL DEFAULT '',
  imap_password   TEXT NOT NULL DEFAULT '',      -- encrypted
  imap_folder     TEXT NOT NULL DEFAULT 'INBOX',

  -- A provider's HTTPS API instead of their own SMTP server.
  provider        TEXT NOT NULL DEFAULT 'smtp',  -- smtp | brevo | resend | …
  provider_key    TEXT NOT NULL DEFAULT '',      -- encrypted
  provider_secret TEXT NOT NULL DEFAULT '',      -- encrypted (Mailjet)
  provider_domain TEXT NOT NULL DEFAULT '',      -- Mailgun
  provider_url    TEXT NOT NULL DEFAULT '',      -- ActiveCampaign

  -- ── Verification, kept apart for the two directions ──
  --
  -- One `verified_at` for a whole mailbox could not answer the question people
  -- actually ask, which is "can I send?" and "can I receive?" — separately.
  -- Sending through Resend while receiving over IMAP at a different host is
  -- ordinary, and either half can break on its own. A single flag turned a
  -- working outbox amber because the inbox password had expired.
  out_verified_at   TEXT,
  out_verified_port INTEGER,
  out_last_error    TEXT NOT NULL DEFAULT '',
  in_verified_at    TEXT,
  in_last_error     TEXT NOT NULL DEFAULT '',

  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mailbox_accounts_account
  ON crm_mailbox_accounts (account_id);

-- One primary per workspace, enforced here rather than trusted to the code that
-- writes it. A partial unique index is the only way to say "at most one row
-- where is_primary = 1, per account" in SQLite.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mailbox_accounts_one_primary
  ON crm_mailbox_accounts (account_id) WHERE is_primary = 1;

-- ── Carry the existing mailboxes over ──
--
-- Every workspace that already had one keeps it, as its primary, with its
-- credentials and its last verification result intact. `verified_at` described
-- the SMTP test, so it becomes the outgoing state; there was never a separate
-- incoming result to carry, and inventing one would claim an inbox had been
-- checked when it had not.
--
-- 'mb-' || account_id gives a stable id: re-running this migration cannot
-- produce a duplicate, and INSERT OR IGNORE makes it a no-op the second time.
INSERT OR IGNORE INTO crm_mailbox_accounts (
  id, account_id, label, is_primary,
  smtp_host, smtp_port, smtp_encryption, smtp_username, smtp_password,
  from_name, from_email, reply_to,
  imap_host, imap_port, imap_encryption, imap_username, imap_password, imap_folder,
  provider, provider_key, provider_secret, provider_domain, provider_url,
  out_verified_at, out_verified_port, out_last_error,
  created_at, updated_at
)
SELECT
  'mb-' || account_id, account_id, '', 1,
  smtp_host, smtp_port, smtp_encryption, smtp_username, smtp_password,
  from_name, from_email, reply_to,
  imap_host, imap_port, imap_encryption, imap_username, imap_password, imap_folder,
  provider, provider_key, provider_secret, provider_domain, provider_url,
  verified_at, verified_port, last_error,
  updated_at, updated_at
FROM crm_mailboxes;
