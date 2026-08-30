-- ─────────────────────────────────────────────────────────────────────────────
-- Seed mailboxes for inbox placement testing.
--
-- Every other deliverability number describes what the *sending* server did.
-- Placement answers the one that matters — when the message reaches Gmail or
-- Outlook, does it land in the inbox or in spam? — and the only way to know is
-- to look inside a mailbox over IMAP.
--
-- These credentials used to live in a guarded PHP file shared by the whole
-- install, so every agency user on the box read and wrote the same set. Here
-- each row belongs to the account that created it, and the password is
-- encrypted at rest with AES-GCM the same way a customer's mailbox password is
-- — reversible, because IMAP needs the real password, but useless from a
-- database dump alone.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_placement_seeds (
  owner_email TEXT NOT NULL,                     -- crm_users.email
  id          TEXT NOT NULL,                     -- caller's own id for the seed
  email       TEXT NOT NULL,
  host        TEXT NOT NULL,
  port        INTEGER NOT NULL DEFAULT 993,
  encryption  TEXT NOT NULL DEFAULT 'ssl',       -- ssl | tls | none
  username    TEXT NOT NULL,
  password    TEXT NOT NULL DEFAULT '',          -- encrypted
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (owner_email, id)
);
CREATE INDEX IF NOT EXISTS idx_crm_seeds_owner ON crm_placement_seeds (owner_email);
