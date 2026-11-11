-- Protron's conversations, kept on the server so they follow a person to
-- another device (they lived only in one browser's localStorage before).
--
-- One row per person per workspace: the same split the browser key used, so
-- an agency switching between clients never sees one client's chat in
-- another's. `turns` is the conversation as the panel shows it (JSON, the
-- newest 60, capped at 200 KB by the route); `prefs` is what follows a person
-- (speak, voice, proactive help, their business) — never where the launcher
-- sits, which belongs to the screen it was dragged on.
--
-- `account_id` is what closeWorkspace finds tables by, so closing a workspace
-- removes its conversations with everything else; a member who deletes their
-- account has theirs removed by user_email (routes/security.ts).
CREATE TABLE IF NOT EXISTS crm_protron_threads (
  account_id  TEXT NOT NULL,
  user_email  TEXT NOT NULL,
  turns       TEXT NOT NULL DEFAULT '[]',
  prefs       TEXT NOT NULL DEFAULT '{}',
  updated_at  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, user_email)
);
CREATE INDEX IF NOT EXISTS idx_protron_threads_user ON crm_protron_threads (user_email);
