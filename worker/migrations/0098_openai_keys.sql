-- The owner's OpenAI keys (routes/aikeys.ts, lib/openai.ts).
--
-- Kept apart from crm_ai_keys on purpose: that table is the pool every AI
-- call walks with Gemini-shaped requests (lib/aiPool.ts), and an OpenAI key
-- there would be asked Gemini's API and fail on every call. These are used
-- only where OpenAI is asked directly — today, transcribing voice messages.
-- Pasted many at a time (the owner holds them in bulk); each is proved with
-- OpenAI before it is kept, encrypted with the install secret, never sent
-- back to a browser. `fp` is a hash, so the same key is not stored twice.
CREATE TABLE IF NOT EXISTS crm_openai_keys (
  id              TEXT PRIMARY KEY,
  position        INTEGER NOT NULL DEFAULT 0,
  label           TEXT NOT NULL DEFAULT '',
  credentials     TEXT NOT NULL,
  fp              TEXT NOT NULL UNIQUE,
  created_at      TEXT NOT NULL,
  last_ok_at      TEXT,
  last_failed_at  TEXT,
  last_error      TEXT NOT NULL DEFAULT '',
  resting_until   TEXT
);
CREATE INDEX IF NOT EXISTS idx_openai_keys_position ON crm_openai_keys (position, created_at);
