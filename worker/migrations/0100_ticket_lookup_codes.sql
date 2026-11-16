-- ─────────────────────────────────────────────────────────────────────────────
-- "Check ticket status" by email, for somebody who is not signed in
-- (owner, 2026-11-15: "instead of asking a reference number, it may ask the
-- email").
--
-- An email address alone is not proof: anybody who knows yours could read
-- your support conversations. So the widget asks for the address, mails a
-- six-digit code to it, and lists that address's tickets only for the code —
-- the same three locks as crm_login_codes (0030): dead after fifteen
-- minutes, dead after five wrong guesses, asking for codes rate limited.
-- Stored hashed, per workspace: a code for one business's help button opens
-- nothing at another's.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_ticket_lookup_codes (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL,
  email       TEXT NOT NULL,
  -- SHA-256 of account, address and code.
  code_hash   TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  -- Unix seconds.
  expires_at  INTEGER NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ticket_lookup_email ON crm_ticket_lookup_codes (account_id, email, created_at);
CREATE INDEX IF NOT EXISTS idx_ticket_lookup_expiry ON crm_ticket_lookup_codes (expires_at);
