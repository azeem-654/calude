# GoHighLevel "Summer of AI" — bold Pakistan-market version (poster style)

A minimal, poster-style ad for a Pakistani audience: one focal composition
instead of a stacked list of sections, hitting only 3 points —

1. **"AI Skills Seekhein — Bilkul FREE!"** — the headline, learn AI skills for free
2. **Rs 1000 INSTANT** — a glowing circular badge, the money hook
3. **WhatsApp Karein — 0320-0045364** — the single call to action

Everything else from the earlier, more detailed version (feature chips,
the 4-bullet offer list, the urgency bar, the long disclosure paragraph)
was cut in favor of fewer, bigger elements — per feedback to change the
style and lead with main points instead of detail.

## Output

- `public/ads/gohighlevel-summer-of-ai-bold-pk/images/facebook_1080x1080.png`
- `public/ads/gohighlevel-summer-of-ai-bold-pk/images/instagram_1080x1350.png`
- `public/ads/gohighlevel-summer-of-ai-bold-pk/images/whatsapp_status_1080x1920.png`

Single full-bleed gradient background (no separate hero/body sections),
centered composition, one scale factor per format so type and the badge
size up for the taller Instagram/WhatsApp Status canvases instead of just
leaving empty space.

## ⚠️ Before you post these

1. **The 30-day training / JazzCash-EasyPaisa-NayaPay-SadaPay/bank-transfer
   details are gone from the image** — they're still the real commitment
   behind "Rs 1000 INSTANT," just no longer spelled out on the creative
   itself. Say the specifics yourself once someone messages you on
   WhatsApp, and make sure you can still deliver them (instant payout +
   showing up for training) at whatever volume this drives.
2. **Affiliate link still isn't on the image** — add your tracked link in
   the caption/bio wherever you post these; the only in-image CTA is the
   WhatsApp number.
3. **No fake scarcity was added.** If you want real urgency (e.g. "first 50
   sign-ups only"), only add it if it's true and you'll actually enforce it.

## Regenerating

```bash
npm install playwright
npx playwright install chromium
node render.js   # writes images/*.png
```

Copy the results into `../../public/ads/gohighlevel-summer-of-ai-bold-pk/images/`.

## Files

- `template.js` — single-composition poster template; takes `{width, height, scale}` and scales every size/spacing value by `scale`
- `render.js` — renders all 3 formats via Playwright screenshots (scale: 1 / 1.12 / 1.62 for Facebook / Instagram / WhatsApp Status)
