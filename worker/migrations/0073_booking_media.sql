-- The booking page's own pictures and clip: the host's photo, the logo, and a
-- short video. Served at /api/booking-media.php?k=<random key>, like a
-- widget's photo, so the address names no workspace and cannot be walked.
--
-- One of each kind per workspace: a new upload replaces the old, and the old
-- address stops answering. Pictures (PNG/JPEG, checked by their bytes) are
-- kept here as base64; a clip is too large for a row, so it lives in the R2
-- bucket bound as VIDEO under `booking/<workspace>/…` and only its key is here.
CREATE TABLE IF NOT EXISTS crm_booking_media (
  key        TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  kind       TEXT NOT NULL,          -- photo | logo | video
  mime       TEXT NOT NULL,
  data       TEXT,                   -- base64, pictures only
  r2_key     TEXT,                   -- the clip's object, video only
  bytes      INTEGER NOT NULL DEFAULT 0,
  width      INTEGER,
  height     INTEGER,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_media_kind ON crm_booking_media (account_id, kind);
