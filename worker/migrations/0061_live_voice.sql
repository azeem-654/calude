-- ─────────────────────────────────────────────────────────────────────────────
-- Live help, part two: a voice call without a screen, and a face on the widget.
--
-- ── A call is a session with no picture ──
--
-- "Call us now" in the widget is the same handshake as screen sharing — one
-- description each way, through crm_live_sessions, then browser to browser —
-- with a microphone instead of a screen. So it is a `kind` on the same table
-- rather than a second table: the business side, the sweep, the tenancy rules
-- and the security tests are the ones that already hold for screen sharing.
-- Every session before this was a screen share, which is what the default says.
--
-- It is an in-browser voice call. No telephone number is involved and nothing
-- here may call it a phone call.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE crm_live_sessions ADD COLUMN kind TEXT NOT NULL DEFAULT 'screen';

-- ── Somebody is there to answer ──
--
-- The widget's "online" dot, and whether "Call us now" can honestly say a
-- person may pick up. Written by the business side's incoming-call check,
-- which only runs while a signed-in page of that workspace is open and
-- visible — so "seen in the last two minutes" means a person is looking, not
-- that a tab was left open on a laptop overnight. One row per workspace,
-- rewritten at most once a minute.
CREATE TABLE IF NOT EXISTS crm_live_presence (
  account_id TEXT PRIMARY KEY,
  seen_at    TEXT NOT NULL
);

-- ── The face and name on a widget ──
--
-- Who the visitor is talking to: "Azeem", with a photo. Set per widget in
-- Customer Engagement → Widgets. The name is plain text on the widget row; the
-- photo is kept apart (below) so listing widgets does not drag every picture
-- along with it.
ALTER TABLE crm_widgets ADD COLUMN agent_name TEXT NOT NULL DEFAULT '';
-- The random key the photo is served under, '' for none. A new picture gets a
-- new key, so the public address changes with it and no cache shows the old one.
ALTER TABLE crm_widgets ADD COLUMN agent_avatar_key TEXT NOT NULL DEFAULT '';

-- The photo itself. Public by design — it is drawn on somebody else's website
-- — so it is served at /api/widget-avatar.php?k=<key>, where the key is random
-- and names nothing else: not the widget, not the workspace. Only PNG and JPEG,
-- recognised by their first bytes rather than by what the upload said it was,
-- at most 256 pixels a side and a small size cap (routes/engagement.ts).
CREATE TABLE IF NOT EXISTS crm_widget_avatars (
  key        TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  widget_id  TEXT NOT NULL,
  mime       TEXT NOT NULL,
  data       TEXT NOT NULL,          -- base64
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_widget_avatar_widget ON crm_widget_avatars (account_id, widget_id);
