-- ─────────────────────────────────────────────────────────────────────────────
-- The whole server-side store, on D1.
--
-- Freehostia had two of these: a MySQL `crm_data` table when one was
-- configured, and otherwise a set of guarded PHP files under api/data/ holding
-- users, sessions, bookings and tracking. The file store existed because shared
-- hosting has nowhere safe to put a database and no guarantee .htaccess is
-- honoured. Neither problem exists here, so both collapse into one D1 database.
-- ─────────────────────────────────────────────────────────────────────────────

-- The generic per-account key/value store the app syncs into. Same shape the
-- MySQL table had, so the client-side code that reads and writes it is
-- unchanged.
CREATE TABLE IF NOT EXISTS crm_data (
  account_id TEXT NOT NULL,
  k          TEXT NOT NULL,
  v          TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (account_id, k)
);
CREATE INDEX IF NOT EXISTS idx_crm_data_account ON crm_data (account_id);

-- Accounts. `hash` is PBKDF2-HMAC-SHA256 rather than the bcrypt PHP used:
-- Workers have WebCrypto natively and no bcrypt, and inventing a WASM
-- dependency for one function is worse than using the primitive the platform
-- actually ships. The format records its own parameters so the cost can be
-- raised later without stranding existing rows.
CREATE TABLE IF NOT EXISTS crm_users (
  email      TEXT PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT '',
  role       TEXT NOT NULL DEFAULT 'client',
  account_id TEXT,
  hash       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Sessions. Rows are deleted on sign-out and swept on expiry, so this never
-- becomes an unbounded log of every login that ever happened.
CREATE TABLE IF NOT EXISTS crm_sessions (
  token      TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_sessions_email ON crm_sessions (email);
CREATE INDEX IF NOT EXISTS idx_crm_sessions_exp   ON crm_sessions (expires_at);

-- Open and click events behind api/track.php. One row per event rather than a
-- counter, so a campaign's opens can be traced to a time and a recipient
-- instead of only totalled.
CREATE TABLE IF NOT EXISTS crm_track (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,          -- 'open' | 'click'
  email_id   TEXT NOT NULL,
  url        TEXT,                   -- clicks only
  at         TEXT NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_crm_track_email ON crm_track (email_id);

-- Opt-outs, fed by the one-click unsubscribe endpoint. `campaign_id` is kept
-- so a customer can see which message somebody left from.
CREATE TABLE IF NOT EXISTS crm_unsubscribes (
  email       TEXT PRIMARY KEY,
  campaign_id TEXT,
  at          TEXT NOT NULL
);

-- Public booking pages and their guest bookings.
--
-- On Freehostia every one of these lived under the single literal account id
-- '__booking__', so in a multi-tenant install the last workspace to open
-- Scheduling silently overwrote every other one's booking page, credentials
-- and guest list. Here the account owns the row.
CREATE TABLE IF NOT EXISTS crm_booking_config (
  account_id TEXT PRIMARY KEY,
  slug       TEXT UNIQUE,
  public     TEXT NOT NULL DEFAULT '{}',   -- served to visitors
  private    TEXT NOT NULL DEFAULT '{}',   -- SMTP/Twilio; never returned
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_booking_slug ON crm_booking_config (slug);

CREATE TABLE IF NOT EXISTS crm_bookings (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  manage_key TEXT NOT NULL,      -- lets a guest manage their own booking
  slot_date  TEXT NOT NULL,
  slot_time  TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'confirmed',
  data       TEXT NOT NULL,      -- guest details, notes, timezone, event type
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_bookings_acct ON crm_bookings (account_id, slot_date);

-- Small singleton values that used to be their own guarded files: the
-- unsubscribe signing key, install markers, and so on.
CREATE TABLE IF NOT EXISTS crm_meta (
  k          TEXT PRIMARY KEY,
  v          TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
