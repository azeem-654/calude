-- The short company name in a published page's address: /s/<brand>/<page>
-- (routes/published.ts). One account per name, first come: without this, a
-- second account could publish under somebody else's name and the visitor
-- would have no way to tell. crm_public_pages.slug now holds "brand/page" for
-- pages published under a name; older pages keep their one-part slug.
CREATE TABLE IF NOT EXISTS crm_page_brands (
  brand TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_page_brands_account ON crm_page_brands (account_id);
