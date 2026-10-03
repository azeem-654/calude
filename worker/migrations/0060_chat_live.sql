-- ─────────────────────────────────────────────────────────────────────────────
-- Live chat: who is waiting, what is unread, and pictures in the thread.
--
-- ── Three stamps on a conversation, rather than counting messages ──
--
-- Polling every few seconds has to be cheap, so the questions it asks are
-- answered by columns on the conversation row instead of by scanning the
-- thread each time:
--
--  * `last_visitor_at`   — the visitor's latest message. Compared with
--    `agent_seen_at` it is "unread"; the count is only worked out for the
--    rows where that comparison already says there is something.
--  * `agent_seen_at`     — when somebody at the business last had the thread
--    open (or replied). Per conversation, not per person: a shared inbox is
--    read by the team, and "Sam has seen it" is what the next person needs.
--  * `needs_human_since` — the moment a visitor started waiting for a person:
--    they wrote to a conversation a person has taken over, or the assistant
--    handed over / could not answer / was given a picture it cannot see.
--    Cleared when a person replies or gives it back to the assistant. Its
--    minimum is "the longest wait", which is what the dashboard shows.
--
-- `updated_at` is bumped by every message from now on (the assistant's and the
-- system's too), so "what changed since" is one indexed range read.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE crm_conversations ADD COLUMN last_visitor_at TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_conversations ADD COLUMN agent_seen_at TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_conversations ADD COLUMN needs_human_since TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_conv_acct_updated ON crm_conversations (account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_conv_waiting ON crm_conversations (account_id, needs_human_since)
  WHERE needs_human_since != '';

-- Everything already in an inbox counts as read on the day this ships. A
-- deploy that lit every old conversation up as unread would teach people the
-- dot means nothing.
UPDATE crm_conversations SET
  last_visitor_at = COALESCE((SELECT max(m.created_at) FROM crm_conversation_messages m
                              WHERE m.conversation_id = crm_conversations.id AND m.role = 'visitor'), ''),
  agent_seen_at = last_at;

-- But somebody genuinely waiting on a person now is still waiting after it.
UPDATE crm_conversations SET needs_human_since = last_visitor_at
WHERE status = 'open' AND handled_by = 'human' AND last_visitor_at != ''
  AND last_visitor_at > COALESCE((SELECT max(m.created_at) FROM crm_conversation_messages m
                                  WHERE m.conversation_id = crm_conversations.id
                                    AND m.role = 'agent' AND m.internal = 0), '');

-- What a message carries besides its words: JSON [{id, mime, size, w, h}].
ALTER TABLE crm_conversation_messages ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]';

-- ── Pictures sent in a chat ──
--
-- Held in D1 for now because this deployment has no R2 bucket bound. That is
-- acceptable only because of the caps the routes enforce: images only (sniffed
-- from the bytes, never the declared type), at most 1.5 MB after the browser
-- has shrunk them, and a handful per conversation per ten minutes. D1 refuses a
-- row over 2 MB, so the cap is also what keeps an insert from failing. Moving
-- to R2 later means changing where `bytes` is read and written, nothing else:
-- every reader goes through the two `file` actions.
CREATE TABLE IF NOT EXISTS crm_chat_files (
  id              TEXT PRIMARY KEY,
  account_id      TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  message_id      TEXT NOT NULL DEFAULT '',
  -- visitor | agent. Who put it there, for the record and for the visitor's
  -- side, which may read only files on non-internal messages.
  uploaded_by     TEXT NOT NULL,
  mime            TEXT NOT NULL,
  size            INTEGER NOT NULL,
  width           INTEGER NOT NULL DEFAULT 0,
  height          INTEGER NOT NULL DEFAULT 0,
  bytes           BLOB NOT NULL,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chatfile_conv ON crm_chat_files (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chatfile_acct ON crm_chat_files (account_id);
