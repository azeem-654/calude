-- ─────────────────────────────────────────────────────────────────────────────
-- White label: a reseller's clients sign in at the reseller's own address.
--
-- ── Two tiers, because only one of them works without an upgrade ──
--
-- A **subdomain** of this deployment — agency.protectedcentral.com — needs
-- nothing beyond a wildcard route. Cloudflare's universal certificate already
-- covers one level of subdomain, so there is no certificate to issue, nothing
-- to verify, and it works the moment the row exists.
--
-- A **custom domain** — app.theiragency.com — is a different problem. Serving
-- somebody else's hostname over HTTPS means holding a certificate for it, and
-- that means Cloudflare for SaaS: a paid product, an API call per hostname, and
-- a DNS record the customer has to add before any of it resolves. The app does
-- not pretend otherwise; a custom domain sits in `pending` and says exactly what
-- is missing until it genuinely works.
--
-- ── Why the hostname is the primary key ──
--
-- Because a hostname resolves to exactly one workspace, and the lookup that
-- matters happens before anybody has signed in: a visitor arrives at an address
-- and the app must decide whose branding to paint before it knows who they are.
-- That query has to be a single indexed read on an untrusted string.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_custom_domains (
  -- Lower-cased, no port, no trailing dot. Normalised on the way in, because
  -- the value arriving from a browser's Host header is not.
  hostname     TEXT PRIMARY KEY,

  account_id   TEXT NOT NULL,

  -- 'subdomain' — a name under this deployment, live immediately.
  -- 'custom'    — the reseller's own domain, needs a certificate.
  kind         TEXT NOT NULL DEFAULT 'subdomain',

  -- pending | verifying | active | failed
  --
  -- A subdomain goes straight to active. A custom domain cannot: it has to wait
  -- for the customer's DNS and for a certificate, and showing it as live before
  -- both is how somebody hands a broken link to their own client.
  status       TEXT NOT NULL DEFAULT 'pending',

  -- What Cloudflare calls this custom hostname, needed to ask after it later.
  provider_id  TEXT NOT NULL DEFAULT '',

  -- What the customer must put in their DNS, as the provider worded it. Stored
  -- rather than recomputed so the screen can show it without a round trip, and
  -- so it does not change under somebody mid-way through copying it.
  dns_target   TEXT NOT NULL DEFAULT '',
  dns_txt_name TEXT NOT NULL DEFAULT '',
  dns_txt_value TEXT NOT NULL DEFAULT '',

  -- The provider's own words when it went wrong. Owner and workspace owner
  -- only; never rendered to a visitor.
  last_error   TEXT NOT NULL DEFAULT '',

  checked_at   TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_custom_domains_account ON crm_custom_domains (account_id);
CREATE INDEX IF NOT EXISTS idx_custom_domains_status ON crm_custom_domains (status);

-- ── What a visitor sees before they sign in ──
--
-- Deliberately a copy, not a join to the workspace's own branding.
--
-- Branding lives in the workspace's synced storage, which is a blob written by
-- a browser. The hostname lookup happens for an anonymous visitor on every cold
-- load, and joining it to a blob somebody else can rewrite means an unauthorised
-- read of customer data on the hottest path in the app. Copying the three
-- fields that a login screen actually paints keeps that query trivial and keeps
-- everything else out of reach.
CREATE TABLE IF NOT EXISTS crm_domain_branding (
  hostname      TEXT PRIMARY KEY,
  app_name      TEXT NOT NULL DEFAULT '',
  logo_url      TEXT NOT NULL DEFAULT '',
  accent        TEXT NOT NULL DEFAULT '',
  login_headline TEXT NOT NULL DEFAULT '',
  updated_at    TEXT NOT NULL
);
