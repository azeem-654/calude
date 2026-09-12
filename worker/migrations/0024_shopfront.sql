-- ─────────────────────────────────────────────────────────────────────────────
-- A shop somebody can actually run.
--
-- What was here was the minimum needed to prove a stranger could pay: a name, a
-- price, a status. A real catalogue needs the things every shop shows and every
-- shopkeeper tracks — a picture, a price it used to be, how many are left — and
-- a shop needs to look like something rather than like a list on white.
--
-- Everything below is nullable or defaulted, so every row that already exists
-- stays valid and simply has none of it.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Products ──

-- A picture. Stored as a URL rather than bytes: D1 rows are not where images
-- belong, and a shop's photos are already hosted somewhere by the time anybody
-- is selling. A data: URI also fits, which is what the uploader in the app
-- produces for a small image.
ALTER TABLE crm_products ADD COLUMN image_url TEXT NOT NULL DEFAULT '';

-- What it used to cost. Shown struck through next to the price, and only when
-- it is genuinely higher — a "was" price that was never charged is the oldest
-- trick in retail and illegal in a good many places.
ALTER TABLE crm_products ADD COLUMN compare_at_cents INTEGER NOT NULL DEFAULT 0;

-- How many are left, and whether to care. Most of what this app's customers
-- sell is a service with no stock at all, so tracking is off unless asked for:
-- a boiler service that says "out of stock" because nobody set a number is
-- worse than one that never mentions stock.
ALTER TABLE crm_products ADD COLUMN inventory INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crm_products ADD COLUMN track_inventory INTEGER NOT NULL DEFAULT 0;

-- Grouping, for a shop with more than a handful of things.
ALTER TABLE crm_products ADD COLUMN category TEXT NOT NULL DEFAULT '';

-- Where it sits in the shop. Lowest first, then newest — so a shopkeeper can
-- put the thing they actually want to sell at the top.
ALTER TABLE crm_products ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_products_sort ON crm_products (account_id, status, sort_order);

-- ── Shops ──

-- Which look. The storefront was one hardcoded layout; a shop selling jewellery
-- and a shop selling scaffolding should not be the same page. See
-- src/components/Shop/themes.ts for what each one is.
ALTER TABLE crm_shops ADD COLUMN template TEXT NOT NULL DEFAULT 'classic';

-- The picture across the top, and the line over it.
ALTER TABLE crm_shops ADD COLUMN hero_image TEXT NOT NULL DEFAULT '';

-- What a buyer needs to know before they hand over money, and what they will
-- ask afterwards. Empty means the section is not shown at all rather than
-- shown with placeholder text nobody wrote.
ALTER TABLE crm_shops ADD COLUMN shipping_note TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_shops ADD COLUMN returns_note TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_shops ADD COLUMN contact_email TEXT NOT NULL DEFAULT '';
