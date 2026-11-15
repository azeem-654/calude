-- More than one booking page per workspace (the owner's brief, 2026-11-15).
--
-- `crm_booking_config` holds one page per account, keyed by the account, and
-- every business workspace a customer made shared it — so the AI Autopilot
-- wizard setting up "a roofing company in Texas" showed, and then rewrote,
-- whatever page the account already had for another business. A business
-- workspace (crm_projects) now gets its own page here, and may have several.
--
-- The account's own page stays where it was: every reader of
-- crm_booking_config (merge fields, the chat widget, reminders) keeps working,
-- and an address is unique across both tables (checked in routes/booking.ts,
-- since SQLite cannot hold one constraint over two tables). The private side
-- (automation switches) stays the account's: one owner, one mailbox.
CREATE TABLE IF NOT EXISTS crm_booking_pages (
  id         TEXT PRIMARY KEY,            -- bp-…, made by the browser that started it
  account_id TEXT NOT NULL,
  project_id TEXT,                        -- the business workspace it belongs to; NULL = not yet built
  slug       TEXT NOT NULL UNIQUE,
  public     TEXT NOT NULL DEFAULT '{}',  -- served to visitors, cleaned like the account's page
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_booking_pages_acct ON crm_booking_pages (account_id, project_id);

-- Pictures were one per kind per account, and a new upload deleted the old
-- file: the new page's logo would have broken the account page's logo. Each
-- page now holds its own ('' = the account's page).
ALTER TABLE crm_booking_media ADD COLUMN page_id TEXT NOT NULL DEFAULT '';
DROP INDEX IF EXISTS idx_booking_media_kind;
CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_media_kind_page ON crm_booking_media (account_id, kind, page_id);
