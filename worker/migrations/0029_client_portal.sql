-- ─────────────────────────────────────────────────────────────────────────────
-- A read-only report a reseller can hand to their own client.
--
-- ── Why a link and not a login ──
--
-- The obvious design is an account for the client with reduced permissions.
-- That means passwords, resets, invitations, a second permission model beside
-- the one that already exists, and a new way for somebody to end up seeing a
-- workspace they should not. All of it to answer one question: "how is my
-- project going?"
--
-- A signed, revocable link answers that question and cannot do anything else.
-- It is also what every agency reporting tool in the world does, because it is
-- what clients will actually use — a login they check once a month is a login
-- they have lost the password to.
--
-- ── What makes the token safe ──
--
-- It is the primary key and it is the whole credential, so it has to be long
-- enough that guessing is not a strategy: 32 bytes of crypto randomness, base32,
-- which is more entropy than a password anybody would choose. It can be turned
-- off without deleting it, so a reseller who shared it with the wrong person has
-- a one-click answer rather than a conversation.
--
-- ── What it is scoped to ──
--
-- One **portfolio**, not one workspace. A reseller's client should see their own
-- project and not the four others in the same workspace — and scoping to the
-- workspace would have made that a filter somebody could forget rather than a
-- fact about the row.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_client_portals (
  -- The token itself. The URL is /p/<token>.
  token        TEXT PRIMARY KEY,

  account_id   TEXT NOT NULL,
  -- The one client this link may show. Never a workspace-wide view.
  portfolio_id TEXT NOT NULL,

  -- What the reseller calls it in their own list: "Aqua Plumbing monthly".
  label        TEXT NOT NULL DEFAULT '',

  -- Off without being deleted, so revoking is instant and reversible.
  enabled      INTEGER NOT NULL DEFAULT 1,

  -- Optional. Null means it does not expire, which is the common case for an
  -- ongoing client and a deliberate choice rather than an oversight.
  expires_at   TEXT,

  -- So a reseller can see whether the client ever actually opened it. Useful,
  -- and the only thing this table learns about the viewer — no addresses, no
  -- user agents, nothing that turns a report link into an analytics product.
  last_viewed_at TEXT,
  views        INTEGER NOT NULL DEFAULT 0,

  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_client_portals_account ON crm_client_portals (account_id);
CREATE INDEX IF NOT EXISTS idx_client_portals_portfolio ON crm_client_portals (portfolio_id);
