-- M-5: a refund or dispute finds the payment it reverses.
--
-- `charge.refunded` named only what the checkout's own metadata carried, so a
-- refunded storefront payment (whose charge had none) stayed "paid", and no
-- commission was ever voided: an affiliate kept 40% of money the customer got
-- back. The processor's id for the money itself (a Stripe payment intent) is
-- now stored when the payment lands, and the reversal is matched on it.
ALTER TABLE crm_commissions ADD COLUMN payment_ref TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_commissions ADD COLUMN invoice_ref TEXT NOT NULL DEFAULT '';
-- Why a commission was voided, or — for one already paid out — that it is to
-- be deducted from the next payout (the affiliate terms allow that).
ALTER TABLE crm_commissions ADD COLUMN void_reason TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_crm_commissions_payment ON crm_commissions (payment_ref);
CREATE INDEX IF NOT EXISTS idx_crm_commissions_invoice ON crm_commissions (invoice_ref);

ALTER TABLE crm_orders ADD COLUMN payment_ref TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_crm_orders_payment ON crm_orders (account_id, payment_ref);
