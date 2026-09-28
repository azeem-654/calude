-- ─────────────────────────────────────────────────────────────────────────────
-- Screens that asked for something they do not show.
--
-- When a refused request names the form field to fix and that field is not on
-- the screen, the browser reports it here (src/services/fieldGuard.ts). One row
-- per (endpoint, field, screen), counted, so a dead end a hundred customers hit
-- is one line with a hundred on it rather than a hundred lines.
--
-- Nothing personal: the endpoint, the field's name, the screen's path, the
-- server's own sentence, and which workspace saw it first. Only the install
-- owner can read it (routes/uireport.ts).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_ui_reports (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL DEFAULT 'dead_end',
  api         TEXT NOT NULL,
  field       TEXT NOT NULL,
  path        TEXT NOT NULL,
  message     TEXT NOT NULL DEFAULT '',
  account_id  TEXT,
  first_at    TEXT NOT NULL,
  last_at     TEXT NOT NULL,
  hits        INTEGER NOT NULL DEFAULT 1,
  UNIQUE (kind, api, field, path)
);
CREATE INDEX IF NOT EXISTS idx_ui_reports_last ON crm_ui_reports (last_at DESC);
