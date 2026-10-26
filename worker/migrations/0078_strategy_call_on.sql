-- Strategy Call Booking switched on (2026-10-26), at the owner's request.
--
-- The default in lib/strategyCall.ts is now "taking bookings", which covers an
-- install that never saved the settings. This covers one that did, while it
-- was still off: the owner asked for it on and had not chosen otherwise since
-- the feature shipped the same day. Every other setting saved is kept.
UPDATE crm_strategy_settings
   SET settings = json_set(settings, '$.enabled', json('true')),
       updated_by = 'migration 0078',
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE id = 'default'
   AND json_valid(settings)
   AND json_extract(settings, '$.enabled') IS NOT 1;
