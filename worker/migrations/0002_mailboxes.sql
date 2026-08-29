-- ─────────────────────────────────────────────────────────────────────────────
-- Each customer's own mail server.
--
-- Until now these credentials lived in the customer's browser and were sent to
-- the API on every single send. Three things follow from that, and the third is
-- the one that matters: the settings vanish if they clear their browser, the
-- password is on the wire constantly, and — because the server never holds it —
-- nothing can send while nobody has the app open. A campaign scheduled for 9am
-- Tuesday only went out if that customer happened to have a tab open at 9am
-- Tuesday.
--
-- One row per workspace. Passwords are encrypted at rest with AES-GCM (see
-- crypto.ts): reversible, because SMTP needs the real password to authenticate,
-- but useless from a database dump alone.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_mailboxes (
  account_id      TEXT PRIMARY KEY,

  -- Sending
  smtp_host       TEXT NOT NULL DEFAULT '',
  smtp_port       INTEGER NOT NULL DEFAULT 587,
  smtp_encryption TEXT NOT NULL DEFAULT 'tls',   -- tls | ssl | none
  smtp_username   TEXT NOT NULL DEFAULT '',
  smtp_password   TEXT NOT NULL DEFAULT '',      -- encrypted
  from_name       TEXT NOT NULL DEFAULT '',
  from_email      TEXT NOT NULL DEFAULT '',
  reply_to        TEXT NOT NULL DEFAULT '',

  -- Receiving. Optional: plenty of customers only ever send.
  imap_host       TEXT NOT NULL DEFAULT '',
  imap_port       INTEGER NOT NULL DEFAULT 993,
  imap_encryption TEXT NOT NULL DEFAULT 'ssl',
  imap_username   TEXT NOT NULL DEFAULT '',
  imap_password   TEXT NOT NULL DEFAULT '',      -- encrypted
  imap_folder     TEXT NOT NULL DEFAULT 'INBOX',

  -- A customer may prefer a provider's HTTPS API to their own SMTP server.
  -- Same row, because it answers the same question: how does this workspace
  -- send mail?
  provider        TEXT NOT NULL DEFAULT 'smtp',  -- smtp | brevo | resend | …
  provider_key    TEXT NOT NULL DEFAULT '',      -- encrypted
  provider_secret TEXT NOT NULL DEFAULT '',      -- encrypted (Mailjet)
  provider_domain TEXT NOT NULL DEFAULT '',      -- Mailgun
  provider_url    TEXT NOT NULL DEFAULT '',      -- ActiveCampaign

  -- What the last connection test actually found, so the UI can show a real
  -- state rather than "unknown" — and so a mailbox that silently stopped
  -- working is visible before a campaign discovers it.
  verified_at     TEXT,
  verified_port   INTEGER,
  last_error      TEXT NOT NULL DEFAULT '',

  updated_at      TEXT NOT NULL
);
