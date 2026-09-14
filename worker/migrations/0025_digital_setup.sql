-- ─────────────────────────────────────────────────────────────────────────────
-- Digital Business Setup: one payment, and the whole presence appears.
--
-- A customer types "ABC Roofing", picks abcroofing.com, pays once, and gets a
-- registered domain, DNS, mailboxes, a live site and a workspace — without ever
-- learning the name of whoever the domain was actually bought from.
--
-- ── Why a job ledger and not a function ──
--
-- Six things have to happen in order, five of them against a third party, and
-- any one of them can fail on its own. Done as one function, a mailbox failure
-- after a successful registration leaves a customer charged for a domain
-- nobody can find, and no record of how far it got. So each step is a row: it
-- knows what it was for, whether it ran, what went wrong, and how many times it
-- has been tried. The runner picks up whatever is unfinished, which makes a
-- retry the same code path as a first attempt.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── What the customer pays ──
--
-- Deliberately separate from anything a provider says. The operator sets these
-- and can change them at any moment without a provider knowing or caring; a
-- price already quoted on an order is copied onto the order, so changing a
-- markup never rewrites what somebody has already agreed to pay.
--
-- There is no wholesale column here on purpose. Cost belongs to the purchase
-- record, where it is one specific figure a provider actually charged, not to
-- a price list where it would be a guess that leaks margin if it ever reached
-- a browser.
CREATE TABLE IF NOT EXISTS crm_retail_prices (
  -- 'domain' for a TLD, 'service' for email/hosting/crm/content
  kind        TEXT NOT NULL,
  -- 'com', 'net', 'org' … or 'email', 'hosting', 'crm', 'content'
  code        TEXT NOT NULL,

  -- What the customer sees. Yearly for domains, monthly for services, in the
  -- smallest currency unit so nothing is ever a float.
  retail_cents INTEGER NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL DEFAULT 'USD',

  -- Only used when retail_cents is 0: a percentage on top of whatever the
  -- provider quotes, so a TLD nobody has priced by hand still sells at a
  -- sensible margin rather than at cost or not at all.
  markup_pct   INTEGER NOT NULL DEFAULT 100,

  label        TEXT NOT NULL DEFAULT '',
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (kind, code)
);

-- ── One purchase ──
CREATE TABLE IF NOT EXISTS crm_setup_orders (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL,

  -- The Autopilot project this was bought for, so provisioning can hand over
  -- to the content engine when it finishes. Empty until the project exists.
  project_id   TEXT NOT NULL DEFAULT '',

  domain       TEXT NOT NULL,

  -- JSON: {email: n, hosting: bool, crm: bool, mailboxes: ["hello","sales"]}
  options      TEXT NOT NULL DEFAULT '{}',

  -- What was quoted, frozen at the moment of checkout. A later price change
  -- must never alter an order somebody already agreed to.
  lines        TEXT NOT NULL DEFAULT '[]',
  total_cents  INTEGER NOT NULL DEFAULT 0,
  monthly_cents INTEGER NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL DEFAULT 'USD',

  -- draft | awaiting_payment | paid | running | done | failed
  status       TEXT NOT NULL DEFAULT 'draft',

  -- The processor's own id for the checkout, so a webhook can find this row.
  checkout_ref TEXT NOT NULL DEFAULT '',

  contact_email TEXT NOT NULL DEFAULT '',
  company_name  TEXT NOT NULL DEFAULT '',
  last_error   TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  paid_at      TEXT,
  finished_at  TEXT,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_setup_orders_account ON crm_setup_orders (account_id);
CREATE INDEX IF NOT EXISTS idx_setup_orders_status  ON crm_setup_orders (status);
CREATE INDEX IF NOT EXISTS idx_setup_orders_ref     ON crm_setup_orders (checkout_ref);

-- ── The steps of one order ──
--
-- `seq` fixes the order rather than the runner remembering it: DNS before
-- mailboxes because a mailbox on a domain with no MX records is an address
-- that silently loses mail, and the website last because it is the only step
-- that is merely embarrassing rather than broken when it is late.
CREATE TABLE IF NOT EXISTS crm_setup_steps (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL,
  account_id  TEXT NOT NULL,
  seq         INTEGER NOT NULL,

  -- domain | dns | mailboxes | website | workspace | welcome | handoff
  step        TEXT NOT NULL,

  -- pending | running | done | failed | skipped
  status      TEXT NOT NULL DEFAULT 'pending',

  -- Counted so a step that fails for ever stops being retried and starts being
  -- somebody's problem, rather than hammering a provider once a tick until the
  -- heat death of the universe.
  attempts    INTEGER NOT NULL DEFAULT 0,

  -- What the customer is shown. Never a provider's wording — their errors name
  -- them, and half of them are in Dutch.
  label       TEXT NOT NULL DEFAULT '',
  -- What happened, in our words, for the customer.
  detail      TEXT NOT NULL DEFAULT '',
  -- What actually happened, verbatim, for the owner's admin view only.
  last_error  TEXT NOT NULL DEFAULT '',

  started_at  TEXT,
  finished_at TEXT,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_setup_steps_order ON crm_setup_steps (order_id, seq);
CREATE INDEX IF NOT EXISTS idx_setup_steps_open  ON crm_setup_steps (status) WHERE status IN ('pending','running');

-- ── Domains this install has actually bought, and for whom ──
--
-- The registrar knows this too, and asking it every time would be both slow and
-- a way to leak which provider is behind the curtain into every screen that
-- lists a domain. Kept locally, with the provider's own id so a later call can
-- address the right record.
CREATE TABLE IF NOT EXISTS crm_owned_domains (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  domain        TEXT NOT NULL,

  provider      TEXT NOT NULL DEFAULT '',
  provider_id   TEXT NOT NULL DEFAULT '',
  -- The registrar's contact handle this was bought under.
  owner_handle  TEXT NOT NULL DEFAULT '',

  -- active | pending | failed
  status        TEXT NOT NULL DEFAULT 'pending',

  -- What it cost us, for the operator's own books. Never returned to a browser
  -- outside the owner's admin view.
  cost_cents    INTEGER NOT NULL DEFAULT 0,
  -- What the customer paid.
  retail_cents  INTEGER NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'USD',

  expires_at    TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_owned_domains_name ON crm_owned_domains (domain);
CREATE INDEX IF NOT EXISTS idx_owned_domains_account ON crm_owned_domains (account_id);

-- ── Sensible opening prices ──
--
-- Every one of these is a starting point the owner is expected to change, not a
-- recommendation. They exist so the first customer through the wizard sees a
-- price rather than an empty list, and so a screen that has to render a total
-- never has to invent one.
INSERT OR IGNORE INTO crm_retail_prices (kind, code, retail_cents, currency, markup_pct, label, updated_at) VALUES
  ('domain',  'com',     1900, 'USD', 100, '.com domain',          datetime('now')),
  ('domain',  'net',     2200, 'USD', 100, '.net domain',          datetime('now')),
  ('domain',  'org',     2200, 'USD', 100, '.org domain',          datetime('now')),
  ('domain',  'co',      3200, 'USD', 100, '.co domain',           datetime('now')),
  ('domain',  'io',      4900, 'USD', 100, '.io domain',           datetime('now')),
  ('domain',  'biz',     2400, 'USD', 100, '.biz domain',          datetime('now')),
  ('domain',  'online',  2900, 'USD', 100, '.online domain',       datetime('now')),
  ('domain',  'shop',    2900, 'USD', 100, '.shop domain',         datetime('now')),
  ('service', 'email',    400, 'USD',   0, 'Business email, per mailbox per month', datetime('now')),
  ('service', 'hosting',  900, 'USD',   0, 'Website hosting, per month',            datetime('now')),
  ('service', 'crm',     2900, 'USD',   0, 'CRM workspace, per month',              datetime('now')),
  ('service', 'content',    0, 'USD',   0, 'AI Autopilot Content Engine',           datetime('now'));
