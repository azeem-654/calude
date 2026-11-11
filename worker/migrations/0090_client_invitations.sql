-- A-1: a client login is an invitation, not an account.
--
-- create_user once wrote a client row into crm_users for any address an agency
-- typed. When that address's real owner later proved their mailbox (a code, or
-- Google), they were signed straight into the agency's workspace — and their
-- own sign-up with a password was refused, because the address was "taken".
-- An invitation lives here instead, and becomes a client login only when the
-- invitee has proved the mailbox and pressed Join.
CREATE TABLE IF NOT EXISTS crm_invitations (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  account_id  TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  invited_by  TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  accepted_at TEXT,
  UNIQUE (email, account_id)
);
CREATE INDEX IF NOT EXISTS idx_crm_invitations_email ON crm_invitations (email);
