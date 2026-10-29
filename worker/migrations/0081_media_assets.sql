-- ─────────────────────────────────────────────────────────────────────────────
-- Pictures kept in the Media Center: finished graphics exported from the
-- Graphics Designer, and pictures a customer uploads to use in a design.
--
-- ── Why a table and not a list in the browser's synced records ──
--
-- The designs themselves live in `crm_social_posts`, which is synced whole and
-- refused over 2 MB; a single exported PNG is often more than that. So the
-- bytes go to the same R2 bucket Video Studio uses, under the workspace's own
-- prefix (`v/<workspace>/media/<id>/`) — which also means they count toward
-- the workspace's video-storage allowance, as every file there does — and this
-- row says what each one is. Every read is `WHERE account_id = ?`.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_media_assets (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL,
  -- graphic: a finished design exported here. upload: a picture to design with.
  kind         TEXT NOT NULL DEFAULT 'graphic',
  name         TEXT NOT NULL DEFAULT '',
  r2_key       TEXT NOT NULL,
  mime         TEXT NOT NULL DEFAULT 'image/png',
  bytes        INTEGER NOT NULL DEFAULT 0,
  width        INTEGER NOT NULL DEFAULT 0,
  height       INTEGER NOT NULL DEFAULT 0,
  -- The design it was exported from (a crm_social_posts id), when there is one.
  design_id    TEXT NOT NULL DEFAULT '',
  -- Where a picture came from and on what terms, as JSON: {origin, credit, license, licenseUrl}.
  source       TEXT NOT NULL DEFAULT '{}',
  created_by   TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_assets_acct ON crm_media_assets (account_id, created_at DESC);
