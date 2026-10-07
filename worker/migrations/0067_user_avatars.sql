-- A person's own photo, shown in the top bar and the dashboard's welcome.
-- Keyed by the person (email), not by a workspace: it is the same face in
-- every workspace they open. Served at /api/user-avatar.php?k=<random key>,
-- like a widget's photo, so the address names nobody.
CREATE TABLE IF NOT EXISTS crm_user_avatars (
  key        TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  mime       TEXT NOT NULL,
  data       TEXT NOT NULL,          -- base64
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_avatar_email ON crm_user_avatars (user_email);
