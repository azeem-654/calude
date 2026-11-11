-- S-2: a text's delivery is known, not assumed.
--
-- A text was logged "sent" the moment Twilio accepted it, and nothing changed
-- afterwards — an unreachable number, a carrier block or a landline all read
-- as delivered. Twilio's id for the message is now kept, and its signed status
-- callback (/api/sms-status-webhook.php) moves the row to delivered,
-- undelivered or failed.
ALTER TABLE crm_delivery_log ADD COLUMN provider_ref TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_delivery_provider_ref ON crm_delivery_log (provider_ref);
