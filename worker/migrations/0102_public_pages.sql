-- Websites and funnels on the open web (audit H3/H4, 2026-11-16).
--
-- "Published" was a flag in the account's synced storage and nothing else:
-- /preview/<id> reads the browser's own copy, so a visitor without a session
-- met the sign-in screen. Publishing now copies the site or funnel, read on
-- the server from the account's stored `crm_websites` / `crm_funnels` (never
-- from the request), into this table, and /s/<slug> serves that copy to
-- anybody. A copy rather than a pointer into crm_data: an edit in the builder
-- must not reach the public until the owner presses "Publish changes", and a
-- public read must not parse a workspace's whole storage blob.
--
-- `account_id` is the storage workspace (storageWorkspace(), so the reserved
-- `__agency__` bucket stays per agency). Closing a workspace deletes these rows
-- with every other crm_* table that has an account_id (lib/closeWorkspace.ts).
CREATE TABLE IF NOT EXISTS crm_public_pages (
  slug         TEXT PRIMARY KEY,            -- the address: /s/<slug>, unique across the install
  account_id   TEXT NOT NULL,
  kind         TEXT NOT NULL,               -- 'site' | 'funnel'
  item_id      TEXT NOT NULL,               -- the Website / Funnel id in the account's storage
  name         TEXT NOT NULL,
  pages        TEXT NOT NULL,               -- JSON FunnelStep[] as published
  seo          TEXT NOT NULL DEFAULT '{}',  -- JSON { title, description, keywords, image }
  views        INTEGER NOT NULL DEFAULT 0,  -- public page loads, counted by the Worker
  published_at TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
-- One address per site or funnel: republishing keeps its slug.
CREATE UNIQUE INDEX IF NOT EXISTS idx_public_pages_item ON crm_public_pages (account_id, kind, item_id);
