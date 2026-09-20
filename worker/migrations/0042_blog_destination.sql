-- ─────────────────────────────────────────────────────────────────────────────
-- Where a blog post goes when nobody is there to press publish.
--
-- ── Why this table has to exist ──
--
-- Publishing to WordPress already works, and the credentials for it live in
-- `crm_blog_targets` — a browser key. That is fine for a person pressing a
-- button and useless for a cron: a scheduled run has no browser to read them
-- from, which is the same wall the mailbox hit and has the same answer.
--
-- So a destination Autopilot may publish to on its own is stored here, on the
-- server, with its password encrypted at rest by the same install secret every
-- other credential uses. The browser's own targets are left alone: somebody
-- publishing by hand keeps working exactly as before.
--
-- ── Why it is separate rather than a column on the project ──
--
-- A workspace has one website far more often than one per project, and two
-- projects publishing to the same blog is the normal case for an agency
-- running a client's content. Hanging it off a project would mean copying the
-- password once per project, and a credential stored twice is a credential
-- revoked once.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_publish_targets (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,

  -- Only 'wordpress' today. A column rather than an assumption, so the second
  -- one is a row and a branch in one function rather than a migration.
  kind          TEXT NOT NULL DEFAULT 'wordpress',

  site_url      TEXT NOT NULL DEFAULT '',
  username      TEXT NOT NULL DEFAULT '',

  -- Encrypted with `installSecret`, and never returned to a browser. Not even
  -- a masked tail: four characters of an application password is enough to
  -- confirm a guess, and no screen needs them to say "connected".
  app_password  TEXT NOT NULL DEFAULT '',

  -- Whether the credentials have been proved to work, and when.
  --
  -- Cleared on every edit. Carrying a green tick across a changed password
  -- shows a state somebody would trust and only discover at the moment a post
  -- silently fails to publish.
  verified_at   TEXT,
  last_error    TEXT NOT NULL DEFAULT '',

  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- One destination per workspace for now. A unique index rather than a check in
-- code, because "save" is reachable from more than one place and the database
-- is the only thing that cannot forget.
CREATE UNIQUE INDEX IF NOT EXISTS idx_publish_target_account
  ON crm_publish_targets (account_id, kind);
