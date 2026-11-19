-- What a connected address shows (2026-11-19, owner).
--
-- Until now every address in crm_custom_domains was a reseller's branded
-- sign-in. The owner wants a customer's own domain to be able to show their
-- published website instead: abcplumbing.com → their home page,
-- abcplumbing.com/free-quote → that page. `serves` picks which; `site_brand`
-- is the short name their pages are published under (crm_page_brands), checked
-- to be theirs when it is set. Existing rows keep showing the sign-in.
ALTER TABLE crm_custom_domains ADD COLUMN serves TEXT NOT NULL DEFAULT 'signin';
ALTER TABLE crm_custom_domains ADD COLUMN site_brand TEXT NOT NULL DEFAULT '';
