-- A workspace's white-label branding, on the server (routes/whitelabel.ts).
-- Until now it lived only in the browser that set it (crm_subaccounts), so a
-- reseller's other devices showed our name, and the copy behind their sign-in
-- address (crm_domain_branding) was taken once, at claim time, and never
-- updated. This row is the one source; every address the workspace owns is
-- re-copied from it whenever it changes.
CREATE TABLE IF NOT EXISTS crm_workspace_branding (
  account_id TEXT PRIMARY KEY,
  app_name TEXT NOT NULL DEFAULT '',
  logo_url TEXT NOT NULL DEFAULT '',
  login_headline TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
