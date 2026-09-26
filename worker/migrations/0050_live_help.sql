-- ─────────────────────────────────────────────────────────────────────────────
-- Live help: somebody shares their screen, and a person here watches it and
-- talks them through it.
--
-- ── What the server does, and what it deliberately does not ──
--
-- The picture never touches this Worker or this database. It goes browser to
-- browser over WebRTC; what is stored here is the handshake — the two session
-- descriptions (SDP) each browser writes to say "this is how to reach me" — and
-- who asked, who joined and when it ended. So there is nothing here to leak
-- about what was on anybody's screen, and nothing to delete afterwards.
--
-- The handshake is exchanged whole, not candidate by candidate: each side waits
-- for its own network addresses, then posts one description. That is two
-- writes per session rather than a stream of them, which is what makes a
-- polled database a reasonable place to put it. A slower first connection (a
-- second or two) was the price, and a support call can afford it.
--
-- ── Tenancy ──
--
-- The same bargain as a chat conversation. A session belongs to the workspace
-- behind the widget it was started from; the sharer proves it is them with
-- `share_key`, returned once, and the business side reads it only through a
-- session checked against `account_id`.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_live_sessions (
  id              TEXT PRIMARY KEY,
  account_id      TEXT NOT NULL,
  widget_id       TEXT NOT NULL DEFAULT '',
  conversation_id TEXT NOT NULL DEFAULT '',
  person_id       TEXT NOT NULL DEFAULT '',

  -- What they typed. Self-asserted on a public widget and shown as such.
  name            TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL DEFAULT '',
  topic           TEXT NOT NULL DEFAULT '',
  page_url        TEXT NOT NULL DEFAULT '',

  -- Filled only when the request came from a signed-in page on this install's
  -- own origin, from the session cookie — never from anything in the body. It
  -- is what lets the person answering trust "this is the customer on workspace
  -- X" rather than "somebody who typed that address".
  verified_email  TEXT NOT NULL DEFAULT '',
  verified_account TEXT NOT NULL DEFAULT '',

  -- waiting → live → ended. `ended_reason`: 'sharer' | 'agent' | 'expired' |
  -- 'left' (their page stopped asking) |
  -- 'failed' — said on the screen, because "they left" and "it never
  -- connected" call for different next steps.
  status          TEXT NOT NULL DEFAULT 'waiting',
  ended_reason    TEXT NOT NULL DEFAULT '',

  share_key       TEXT NOT NULL,
  offer           TEXT NOT NULL DEFAULT '',
  answer          TEXT NOT NULL DEFAULT '',
  -- What the sharer's browser last said about the connection: 'new',
  -- 'connecting', 'connected', 'failed'. A direct connection some networks
  -- refuse is the one failure the person answering can do something about
  -- (offer a Google Meet), so it is reported rather than inferred.
  sharer_state    TEXT NOT NULL DEFAULT 'new',

  agent_email     TEXT NOT NULL DEFAULT '',
  agent_name      TEXT NOT NULL DEFAULT '',
  -- A Google Meet made for this session, when the direct route was not enough.
  meet_url        TEXT NOT NULL DEFAULT '',

  -- When the sharer's page last asked about this session. Only the sharer
  -- writes it, so it answers "are they still there" — a tab closed mid-call
  -- sends nothing, and without this the session would sit "live" on the
  -- other screen with nobody at the far end.
  seen_at         TEXT NOT NULL,

  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  joined_at       TEXT,
  ended_at        TEXT
);

CREATE INDEX IF NOT EXISTS idx_live_acct ON crm_live_sessions (account_id, status, created_at DESC);

-- ── The help button inside Protected Central itself ──
--
-- Protected Central answers its own customers with the same widget every
-- customer puts on their own website — no second support system. This marks
-- which of the install owner's widgets is the round button in the app's
-- corner. On anybody else's workspace it is stored and ignored: the app shows
-- the install owner's button, never a tenant's.
ALTER TABLE crm_widgets ADD COLUMN in_app INTEGER NOT NULL DEFAULT 0;
