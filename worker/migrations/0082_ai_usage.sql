-- ─────────────────────────────────────────────────────────────────────────────
-- What the AI is used for, per day (lib/aiUsage.ts).
--
-- Google gives an API key no way to ask how much of its free tier is left, so
-- the Worker counts every call it makes as it makes it — server routes and the
-- browser's through /api/ai.php — with the provider's own token counts. One
-- row per day × provider × key × model × module × workspace, added to in
-- place. `key_fp` is the key's fingerprint (lib/aiPool.ts), never the key;
-- 'own' for a workspace's own key, which is kept out of the install's totals.
-- `limited` counts 429s: how the dashboard shows a free limit being hit.
-- Rows older than ~100 days are deleted as new ones are written.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_ai_usage (
  day         TEXT NOT NULL,
  provider    TEXT NOT NULL,
  key_fp      TEXT NOT NULL DEFAULT '',
  model       TEXT NOT NULL,
  module      TEXT NOT NULL DEFAULT 'general',
  account_id  TEXT NOT NULL DEFAULT '',
  requests    INTEGER NOT NULL DEFAULT 0,
  ok          INTEGER NOT NULL DEFAULT 0,
  limited     INTEGER NOT NULL DEFAULT 0,
  tokens_in   INTEGER NOT NULL DEFAULT 0,
  tokens_out  INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT,
  PRIMARY KEY (day, provider, key_fp, model, module, account_id)
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_account ON crm_ai_usage (account_id, day);
CREATE INDEX IF NOT EXISTS idx_ai_usage_key ON crm_ai_usage (day, provider, key_fp);
