-- ─────────────────────────────────────────────────────────────────────────────
-- Security: what happened, which devices are signed in, a second factor, and
-- webhook deliveries that may only count once.
--
-- ── The audit trail ──
--
-- There was no record of a sign-in, a failed one, a password change or a
-- removed user. "Who changed this?" had no answer, and neither did "has
-- anyone been trying my password?". One row per event: who, what, from where.
-- `detail` is a short sentence for a person to read — never a password, a
-- token, a key or a message body. Kept 180 days by housekeeping.
--
-- ── Sessions a person can see ──
--
-- A session was a token and an expiry. Listing "where am I signed in" and
-- signing the others out needs to know what each one is: the device it came
-- from, how it signed in, when it was last used. `last_seen_at` is written at
-- most every ten minutes, so reading a session does not become a write on
-- every request.
--
-- ── A second factor ──
--
-- A time-based one-time code (the six digits in an authenticator app).
-- `totp_secret` is encrypted with the install secret, like every other
-- credential here; `totp_enabled_at` is null until a code has been proved,
-- so a half-finished set-up never locks anybody out.
--
-- `email_verified_at`: an account made with a password never proved its
-- address. The first time a code or Google sign-in does, a password set by
-- somebody else before them is cleared (see completeSignIn).
--
-- ── Webhooks that can only be counted once ──
--
-- Creem signs the body and nothing else, so a captured delivery is valid for
-- ever. The storefront is safe because an order only moves while pending; the
-- operator's own billing status had no such guard, so a replayed "paid" could
-- reactivate a cancelled subscription. Each delivery's event id is recorded,
-- and one already seen is acknowledged and ignored.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_audit_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL,
  actor_email TEXT NOT NULL DEFAULT '',
  account_id  TEXT,
  kind        TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  ip          TEXT NOT NULL DEFAULT '',
  ua          TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_crm_audit_actor ON crm_audit_events (actor_email, at);
CREATE INDEX IF NOT EXISTS idx_crm_audit_account ON crm_audit_events (account_id, at);
CREATE INDEX IF NOT EXISTS idx_crm_audit_at ON crm_audit_events (at);

ALTER TABLE crm_sessions ADD COLUMN ip TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_sessions ADD COLUMN ua TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_sessions ADD COLUMN method TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_sessions ADD COLUMN last_seen_at TEXT;

ALTER TABLE crm_users ADD COLUMN totp_secret TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_users ADD COLUMN totp_enabled_at TEXT;
ALTER TABLE crm_users ADD COLUMN email_verified_at TEXT;

CREATE TABLE IF NOT EXISTS crm_webhook_events (
  id         TEXT PRIMARY KEY,
  source     TEXT NOT NULL,
  created_at TEXT NOT NULL
);
