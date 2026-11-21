-- Protron's messages to a customer, in the help button's live chat (owner,
-- 2026-11-21): what AI Autopilot did, what is waiting for their yes, what the
-- campaign watch noticed, and the questions it asks about the business —
-- written on the server by the cron (lib/protronFeed.ts), so they are there
-- when the customer next signs in, and read by /api/protron-feed.php.
--
-- One row per message. `role` is 'protron' or 'you' (the customer's reply).
-- `actions` is a JSON list the widget draws as buttons, e.g.
--   [{"type":"approve","actionId":"…"}] or [{"type":"open","path":"/autopilot","label":"…"}]
-- An approve button acts on crm_autopilot_actions through the same rule as the
-- Autopilot screen (awaiting → pending), re-checked against the account.
-- `ref` keeps the cron from writing the same message twice (one per waiting
-- action, one per campaign finding per day, one question per business a week).
CREATE TABLE IF NOT EXISTS crm_protron_messages (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL,
  project_id  TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL DEFAULT 'protron',
  kind        TEXT NOT NULL DEFAULT 'note',   -- waiting | progress | watch | ask | reply | summary | note
  body        TEXT NOT NULL,
  actions     TEXT NOT NULL DEFAULT '[]',
  ref         TEXT NOT NULL DEFAULT '',
  -- What wrote it, for the record (src/types/provenance.ts): 'protron-feed'.
  source      TEXT NOT NULL DEFAULT 'protron-feed',
  created_at  TEXT NOT NULL,
  read_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_protron_msg_account ON crm_protron_messages (account_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_protron_msg_ref ON crm_protron_messages (account_id, ref) WHERE ref != '';
