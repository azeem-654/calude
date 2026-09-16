-- ─────────────────────────────────────────────────────────────────────────────
-- The three things every shop platform has that this one did not.
--
-- Variants, discount codes and shipping rules are available on every Shopify
-- plan — they are not the advanced tier, they are the floor. Without variants
-- you cannot sell a t-shirt; without a discount code the email campaigns this
-- product is built around have nothing to carry; and a free-text "shipping
-- note" is a sentence, not a price a checkout can add up.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Variants ────────────────────────────────────────────────────────────────
--
-- A product row keeps its own price and inventory and goes on meaning "the
-- default", so every existing product keeps working untouched. A product with
-- variants sells through them instead: the row's price becomes the "from"
-- price shown on a listing, and the buyer picks one of these.
--
-- Options live as JSON on the product rather than as a table of their own.
-- Shopify allows three and nobody queries across them; a `crm_product_options`
-- table would be three rows joined back on every read for no benefit.
CREATE TABLE IF NOT EXISTS crm_product_variants (
  id            TEXT PRIMARY KEY,
  product_id    TEXT NOT NULL,
  account_id    TEXT NOT NULL,

  -- What the buyer sees on the button: "Large / Blue".
  title         TEXT NOT NULL,
  sku           TEXT NOT NULL DEFAULT '',

  -- Its own price, because a large costs more than a small often enough that
  -- inheriting the product's would be wrong more than it is right.
  price_cents   INTEGER NOT NULL DEFAULT 0,
  compare_at_cents INTEGER NOT NULL DEFAULT 0,

  -- Its own stock. One number on the product is the bug that oversells the
  -- large and leaves the small on the shelf.
  inventory     INTEGER NOT NULL DEFAULT 0,

  image_url     TEXT NOT NULL DEFAULT '',
  position      INTEGER NOT NULL DEFAULT 0,

  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_variants_product
  ON crm_product_variants (product_id, position);
CREATE INDEX IF NOT EXISTS idx_variants_account
  ON crm_product_variants (account_id);

-- The option names and their values, as [{name, values[]}]. '[]' means this
-- product has no variants and sells as itself, which is most of them.
ALTER TABLE crm_products ADD COLUMN options TEXT NOT NULL DEFAULT '[]';

-- Extra pictures, as a JSON array of URLs. The first image stays in
-- `image_url` so nothing that reads a product today has to change.
ALTER TABLE crm_products ADD COLUMN images TEXT NOT NULL DEFAULT '[]';

-- ── Discount codes ──────────────────────────────────────────────────────────
--
-- `code` is the primary key *with* the account, because two workspaces both
-- wanting SAVE10 is the normal case and one of them being refused would be
-- absurd. Uppercased on save so a buyer typing save10 is not told it is wrong.
CREATE TABLE IF NOT EXISTS crm_discounts (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  code          TEXT NOT NULL,

  -- percent | fixed
  kind          TEXT NOT NULL DEFAULT 'percent',
  -- Percent as whole points (10 = 10%), fixed as minor units.
  value         INTEGER NOT NULL DEFAULT 0,

  -- Below this the code does not apply. 0 means no floor.
  min_spend_cents INTEGER NOT NULL DEFAULT 0,

  -- Both optional. Null means no start and no end.
  starts_at     TEXT,
  ends_at       TEXT,

  -- 0 means unlimited. `used_count` is incremented when an order is *paid*,
  -- not when the code is typed — a code that reserved itself on every failed
  -- checkout would burn its own limit.
  usage_limit   INTEGER NOT NULL DEFAULT 0,
  used_count    INTEGER NOT NULL DEFAULT 0,

  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_discounts_code
  ON crm_discounts (account_id, code);

-- ── Shipping ────────────────────────────────────────────────────────────────
--
-- Deliberately not live carrier rates. Those need weights, dimensions, a
-- carrier account and a negotiated contract, and getting one wrong charges a
-- real buyer the wrong amount. What is here is what a small shop actually
-- uses: a flat rate, free over a threshold, and different numbers for
-- different places.
CREATE TABLE IF NOT EXISTS crm_shipping_rates (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,

  name          TEXT NOT NULL,
  -- Comma-separated ISO country codes, or '' for everywhere else. The empty
  -- one is the fallback, so a shop always has an answer for a country nobody
  -- thought about.
  countries     TEXT NOT NULL DEFAULT '',

  -- flat | free_over
  kind          TEXT NOT NULL DEFAULT 'flat',
  amount_cents  INTEGER NOT NULL DEFAULT 0,
  -- For free_over: the basket total above which it costs nothing.
  threshold_cents INTEGER NOT NULL DEFAULT 0,

  position      INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shipping_account
  ON crm_shipping_rates (account_id, position);

-- What an order actually paid, kept on the order rather than recomputed.
-- A rate or a code changed next week must not alter what last week's receipt
-- says — the same reasoning that freezes a price onto an order.
ALTER TABLE crm_orders ADD COLUMN discount_code TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_orders ADD COLUMN discount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crm_orders ADD COLUMN shipping_cents INTEGER NOT NULL DEFAULT 0;
