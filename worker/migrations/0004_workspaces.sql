-- ─────────────────────────────────────────────────────────────────────────────
-- Who owns a workspace.
--
-- Until now nobody did, and nothing needed to: "agency" meant the one person
-- who set the install up, so `canAccess` could say
--
--     if (user.role === 'agency') return true;
--
-- and be right. Every workspace belonged to the only agency there was.
--
-- Public sign-up breaks that in the worst way. Each person who registers is an
-- agency in their own right — they run their own client sub-accounts — so under
-- the old rule the first stranger to sign up could read and write every other
-- customer's contacts, campaigns and mailboxes by asking for their workspace id.
-- That is not a hole to fix after launch; it is the reason this table exists
-- before sign-up ships at all.
--
-- The rule is now: an agency may touch a workspace it owns, and claims an
-- unowned one on first touch. Claiming is what keeps the existing install
-- working without a data migration — there is nothing to migrate here anyway,
-- as the only account on it has not written a row yet — while making every
-- subsequent workspace belong to exactly one person from the moment it is used.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_workspaces (
  account_id  TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_crm_workspaces_owner ON crm_workspaces (owner_email);

-- Any workspace that already holds data belongs to the account that has been
-- the only one able to write it. A no-op on an install with no data, and the
-- difference between working and locked out on one that has some.
INSERT OR IGNORE INTO crm_workspaces (account_id, owner_email, created_at)
SELECT DISTINCT d.account_id,
       (SELECT u.email FROM crm_users u WHERE u.role = 'agency' ORDER BY u.created_at LIMIT 1),
       datetime('now')
FROM crm_data d
WHERE (SELECT COUNT(*) FROM crm_users WHERE role = 'agency') = 1;

-- Sign-up is open to the public, so it needs a brake. One row per attempt from
-- one address; the handler counts recent ones and refuses past a threshold.
-- Swept by the same tick that sweeps sessions, so this cannot grow without end.
CREATE TABLE IF NOT EXISTS crm_signup_attempts (
  ip         TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_crm_signup_attempts ON crm_signup_attempts (ip, created_at);
