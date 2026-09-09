-- ─────────────────────────────────────────────────────────────────────────────
-- Commerce: something to sell, and a record of having sold it.
--
-- The rest of this app assumes a business that already exists — a plumber with
-- customers, a consultant with a service. The other half of what this product
-- promises is the person who has no idea yet: they sign up, the app suggests
-- what they could sell, and then sells it.
--
-- ── Being straight about the size of this ──
--
-- Services reuse almost everything already built: contacts, campaigns, booking,
-- reviews. Commerce reuses almost none of it. There is no product in this
-- codebase, no cart, no order, no checkout and no supplier — and a storefront
-- and real supplier integrations are a great deal more work than these tables.
--
-- What is here is the foundation those need and the part that stands on its own:
-- the ideas, and somewhere for products and orders to live. A storefront that
-- takes money is deliberately not pretended at. An order row that no customer
-- can create is a table waiting for a feature; a checkout that looks like it
-- works and does not is a customer who thinks they have been paid.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── What somebody could sell ──
--
-- Kept as a record rather than a chat reply, because the whole point is to come
-- back to it: a person with no business idea does not decide in one sitting, and
-- the shortlist they liked on Tuesday should still be there on Friday.
CREATE TABLE IF NOT EXISTS crm_business_ideas (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL,

  title        TEXT NOT NULL,
  summary      TEXT NOT NULL DEFAULT '',

  -- Who it is for and what it solves. Separate columns because "a candle shop"
  -- is not an idea — "candles for people who cannot burn scented ones" is.
  audience     TEXT NOT NULL DEFAULT '',
  problem      TEXT NOT NULL DEFAULT '',

  -- Rough monthly figures, as the model estimated them. Stored as given and
  -- labelled as estimates everywhere they are shown: a number invented by a
  -- language model and displayed like a forecast is how somebody spends money
  -- they do not have.
  est_startup  REAL NOT NULL DEFAULT 0,
  est_monthly  REAL NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL DEFAULT 'USD',

  -- suggested | shortlisted | chosen | dismissed
  status       TEXT NOT NULL DEFAULT 'suggested',

  -- Why it was suggested, in the model's own words. Same rule as everywhere
  -- else in Autopilot: a claim a person can disagree with beats an assertion.
  because      TEXT NOT NULL DEFAULT '',

  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_business_ideas_account
  ON crm_business_ideas (account_id, status, created_at DESC);

-- ── Products ──
--
-- Deliberately thin. Everything a real catalogue eventually needs — variants,
-- options, images, tax classes — is absent because guessing at that shape
-- before a single product has been sold produces columns nobody fills in.
CREATE TABLE IF NOT EXISTS crm_products (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL,

  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  sku          TEXT NOT NULL DEFAULT '',

  -- Minor units — pence, cents. A price kept as a float is a price that
  -- eventually shows 19.989999999999998 on somebody's invoice.
  price_cents  INTEGER NOT NULL DEFAULT 0,
  cost_cents   INTEGER NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL DEFAULT 'USD',

  -- Where it comes from. 'own' means the customer makes or holds it; anything
  -- else names a supplier this product is fulfilled through.
  source       TEXT NOT NULL DEFAULT 'own',
  supplier_ref TEXT NOT NULL DEFAULT '',

  -- draft | active | archived. Draft is the default: a product Autopilot
  -- suggested is not a product the customer has agreed to sell.
  status       TEXT NOT NULL DEFAULT 'draft',

  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_account
  ON crm_products (account_id, status, created_at DESC);

-- ── Orders ──
--
-- No checkout writes to this yet, and that is stated rather than hidden. It
-- exists so the model is settled before a storefront is built on top of it, and
-- so an order taken by hand — over the phone, which is how most small businesses
-- actually start — has somewhere to go.
CREATE TABLE IF NOT EXISTS crm_orders (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL,

  contact_id   TEXT NOT NULL DEFAULT '',
  email        TEXT NOT NULL DEFAULT '',

  -- The lines, as JSON: [{productId, name, qty, priceCents}]. A separate table
  -- would be tidier and is not worth it until something queries across lines.
  items        TEXT NOT NULL DEFAULT '[]',

  total_cents  INTEGER NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL DEFAULT 'USD',

  -- pending | paid | fulfilled | cancelled | refunded
  status       TEXT NOT NULL DEFAULT 'pending',

  -- How it arrived. 'manual' until a storefront exists to say otherwise, which
  -- keeps the honest answer visible in the data rather than only in a comment.
  channel      TEXT NOT NULL DEFAULT 'manual',

  placed_at    TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_account
  ON crm_orders (account_id, status, placed_at DESC);
