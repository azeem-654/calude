-- ─────────────────────────────────────────────────────────────────────────────
-- Revenue by project: when an order's money arrived, and which project earned it.
--
-- An order had `placed_at` and `updated_at` and nothing that said when it was
-- paid. `updated_at` moves on every later edit — a parcel marked fulfilled a
-- week on, a chase stamp, a refund — so a chart drawn from it would move last
-- month's sale into this week the first time somebody shipped it. `paid_at` is
-- written once, at the moment the order first becomes paid, and never again.
--
-- `project_id` is the project credited at checkout, and `project_via` says on
-- what evidence ('link' — the buyer arrived on the project's own shop link;
-- 'shop' — the shop belongs to the project; 'products' — every line is a
-- product of the project). The rule itself lives in worker/src/lib/revenue.ts.
-- Frozen onto the order for the same reason the price is: a shop moved to
-- another project next month must not rewrite which project made last month's
-- sales. Orders with no stamp (everything before this migration, and manual
-- orders) are attributed when the report is read, by the same rule.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE crm_orders ADD COLUMN paid_at TEXT;
ALTER TABLE crm_orders ADD COLUMN project_id TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_orders ADD COLUMN project_via TEXT NOT NULL DEFAULT '';

-- The best evidence there is for history. For an order that was paid and never
-- touched again this is exact; for one edited afterwards it is late. It is not
-- invented: it is the last moment the row is known to have been in that state.
UPDATE crm_orders SET paid_at = updated_at
 WHERE paid_at IS NULL AND status IN ('paid', 'fulfilled', 'refunded');

CREATE INDEX IF NOT EXISTS idx_orders_paid ON crm_orders (account_id, paid_at);
