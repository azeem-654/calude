-- Reusable designs kept by the Design Studio (2026-11). The first kind is a
-- thumbnail theme (lib/design/thumbThemes.ts): the design's own fields, the
-- logo's place and the headline's length — never a flattened picture, never
-- a video's words. One workspace's themes are read only by that workspace.
CREATE TABLE IF NOT EXISTS crm_design_themes (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'thumbnail',
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  -- {design, logo, words}
  config      TEXT NOT NULL DEFAULT '{}',
  source      TEXT NOT NULL DEFAULT 'library',
  created_by  TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_design_themes_account ON crm_design_themes(account_id, kind, updated_at);
