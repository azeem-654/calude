-- ─────────────────────────────────────────────────────────────────────────────
-- Taking money for a customer's own products.
--
-- ── The mistake this schema exists to prevent ──
--
-- There is already a Stripe key on this deployment: STRIPE_SECRET_KEY, a Worker
-- secret, the operator's own account. It bills customers for their subscription
-- to this app, and it is the obvious thing to reach for when adding a checkout.
--
-- Reaching for it would be a serious error. A plumber selling a £400 boiler
-- service through their storefront must be paid by their buyer, into *their*
-- account. Routing that through the operator's key would deposit every
-- customer's trading revenue into the operator's Stripe balance — which is
-- somebody else's money, held without agreement, and in most jurisdictions
-- money transmission.
--
-- So the storefront uses a key the customer connects themselves, kept here,
-- encrypted, per workspace. Their buyer pays them directly and nothing touches
-- the operator's account. Stripe Connect would be the other honest answer, and
-- it needs a platform agreement and an onboarding flow that do not exist yet;
-- this does not pretend to be it.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_storefront (
  account_id      TEXT PRIMARY KEY,

  -- The customer's own Stripe secret key, encrypted. Never returned to a
  -- browser, never accepted from one on a charge — only on the save that
  -- stores it.
  stripe_key      TEXT NOT NULL DEFAULT '',

  -- Their endpoint signing secret, so a webhook claiming an order was paid can
  -- be checked. Without it an unauthenticated POST could mark anything paid,
  -- which is the whole reason the column is here rather than optional in code.
  webhook_secret  TEXT NOT NULL DEFAULT '',

  -- Where a buyer lands after paying, and after cancelling. Stored because
  -- Stripe requires absolute URLs and the right one depends on the customer's
  -- own site, not on ours.
  success_url     TEXT NOT NULL DEFAULT '',
  cancel_url      TEXT NOT NULL DEFAULT '',

  currency        TEXT NOT NULL DEFAULT 'USD',

  verified_at     TEXT,
  last_error      TEXT NOT NULL DEFAULT '',
  updated_at      TEXT NOT NULL
);

-- ── Tying a Stripe session back to an order ──
--
-- The webhook arrives with a session id and nothing else we chose. Without this
-- there is no way to know which order was paid, and matching on amount or email
-- would mark the wrong one the first time somebody buys the same thing twice.
ALTER TABLE crm_orders ADD COLUMN stripe_session TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_orders_session ON crm_orders (stripe_session);
