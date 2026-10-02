-- More than one AI key, tried in order (lib/aiPool.ts).
--
-- One key is one quota and one point of failure: when Google rate-limits it,
-- runs out its daily quota or refuses it, every customer's writing stops at
-- once. The owner can now add backup keys (Settings → Platform services →
-- AI keys); a call that fails on one key for a reason that is the key's — a
-- limit, a refusal, Google being down for it — is made again on the next.

-- The backups themselves. The main key stays where it always was (the owner's
-- AI Engine, or the installation key); these are tried after it, by position.
CREATE TABLE IF NOT EXISTS crm_ai_keys (
  id          TEXT PRIMARY KEY,
  position    INTEGER NOT NULL,
  label       TEXT NOT NULL DEFAULT '',
  -- encryptSecret(installSecret, key). Never returned to a browser.
  credentials TEXT NOT NULL,
  -- First 16 hex of SHA-256(key): matches health rows and spots a duplicate
  -- without decrypting every stored key.
  fp          TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_ai_keys_fp ON crm_ai_keys (fp);

-- How each key in the pool is doing, by fingerprint — for every key the pool
-- uses, the main one included, so the owner sees which one is failing.
-- `cooldown_until`: a key that just failed is moved to the back until then,
-- rather than being asked first, and failing first, on every call.
CREATE TABLE IF NOT EXISTS crm_ai_key_health (
  fp             TEXT PRIMARY KEY,
  last_ok_at     TEXT,
  last_failed_at TEXT,
  last_error     TEXT NOT NULL DEFAULT '',
  cooldown_until TEXT,
  fail_count     INTEGER NOT NULL DEFAULT 0
);
