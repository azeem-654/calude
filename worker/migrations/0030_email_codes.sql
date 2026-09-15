-- ─────────────────────────────────────────────────────────────────────────────
-- Signing in with a code sent to your email.
--
-- ── Why not "Sign in with Google" ──
--
-- Because Google will not let a product do it without verification. Their own
-- rule: an app in Production publishing status needs OAuth verification, and an
-- unverified app carries a permanent hundred-user lifetime cap that cannot be
-- reset. Review is weeks. Facebook needs App Review and business verification;
-- Apple needs a paid developer account. Every one of them is the approval queue
-- this install was explicitly trying to avoid.
--
-- An emailed code needs none of it. No third-party account, no client id, no
-- consent screen, no cap — and it works for somebody with a Gmail address, an
-- Outlook address or their own domain, which "Sign in with Google" does not.
--
-- ── What makes a six-digit code safe ──
--
-- Six digits is a million possibilities, which is not much on its own. Three
-- things make it enough, and all three are load-bearing:
--
--   1. It is dead ten minutes after it is made.
--   2. Five wrong guesses kill it — the attempts counter here, not a rate limit
--      somewhere else that could be bypassed by asking for a new code.
--   3. Asking for codes is itself limited, so an attacker cannot mint a
--      thousand live codes and play the birthday problem against them.
--
-- The code is stored hashed. A database someone reads is a database of codes
-- that have already expired, not a list of live keys to somebody's account.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_login_codes (
  -- SHA-256 of the code plus the address it was issued for. Keyed on the hash
  -- so a lookup cannot be done without already knowing the code.
  code_hash   TEXT PRIMARY KEY,

  email       TEXT NOT NULL,

  -- Wrong guesses so far. The code dies at five, whatever the clock says.
  attempts    INTEGER NOT NULL DEFAULT 0,

  -- Unix seconds, matching crm_sessions so the sweep can treat them alike.
  expires_at  INTEGER NOT NULL,

  -- Set the moment it is spent. A code is good exactly once: without this, a
  -- code sitting in an inbox is a spare key for ten minutes rather than a
  -- single use.
  used_at     TEXT,

  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_codes_email ON crm_login_codes (email, created_at);
CREATE INDEX IF NOT EXISTS idx_login_codes_expiry ON crm_login_codes (expires_at);
