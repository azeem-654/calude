-- ─────────────────────────────────────────────────────────────────────────────
-- Blog Automation's WordPress sites, one row per target on its Publish screen.
--
-- ── Why this is not crm_publish_targets ──
--
-- That table is Autopilot's single destination per workspace (unique on
-- account_id, kind). The Publish screen lets a business workspace keep more
-- than one site, and each is named by the id the browser gave it (`tgt-…`).
-- Folding them into one row would make connecting a second site overwrite
-- the first site's password — and Autopilot's — without anybody noticing.
--
-- `id` is the browser's target id and a primary key across every tenant, so a
-- write is scoped to the account (`ON CONFLICT … WHERE account_id = …`) and a
-- foreign id is refused before anything is read.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_blog_publish_targets (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  site_url      TEXT NOT NULL DEFAULT '',
  username      TEXT NOT NULL DEFAULT '',

  -- Encrypted with `installSecret`, never returned to a browser — not even a
  -- masked tail.
  app_password  TEXT NOT NULL DEFAULT '',

  -- Who WordPress said we are when the credentials were last proved, and when.
  connected_as  TEXT NOT NULL DEFAULT '',
  verified_at   TEXT,
  last_error    TEXT NOT NULL DEFAULT '',

  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blog_publish_targets_account
  ON crm_blog_publish_targets (account_id);
