# GoHighLevel "Summer of AI" — bold Pakistan-market version (diagonal split)

Third iteration of this ad. Style changed again per feedback ("change the
ad view") to a diagonal two-tone split (deep blue/purple over a fiery
red-orange wedge) with big, bold, **left-aligned stacked headline text**
instead of the earlier centered circular badge — a more dynamic,
sale-banner-style layout, still hitting only the main points:

1. **"FREE AI Skills Seekhein"** — headline
2. **"+ Rs 1000 Gift"** — money hook, in yellow
3. **"+ Course Joining Motivation bhi!"** — the specific phrase requested
4. **"Abhi Hasil Karein!"** — red punch-tag urgency line
5. **WhatsApp Karein — 0320-0045364** — the CTA

Text sizes were bumped further per "make text more big more bold" — each
format uses a different `scale` multiplier (1.08 / 1.38 / 1.85 for
Facebook / Instagram / WhatsApp Status) so the bigger canvases get
proportionally bigger, bolder type instead of empty space. At the largest
scale (WhatsApp Status) "FREE AI Skills" wraps to two lines, which is
expected and still reads fine.

## Output

- `public/ads/gohighlevel-summer-of-ai-bold-pk/images/facebook_1080x1080.png`
- `public/ads/gohighlevel-summer-of-ai-bold-pk/images/instagram_1080x1350.png`
- `public/ads/gohighlevel-summer-of-ai-bold-pk/images/whatsapp_status_1080x1920.png`

## ⚠️ Before you post these

1. **"Course Joining Motivation" is now an explicit promise on the
   creative** — make sure whatever you deliver over WhatsApp (the 30-day
   training, encouragement, etc.) actually matches what someone would
   expect from that phrase.
2. **Rs 1000 Gift + payout details are not spelled out on the image** —
   same as the previous version, you explain JazzCash/EasyPaisa/etc. and
   verify sign-ups yourself over WhatsApp.
3. **Affiliate link still isn't on the image** — add your tracked link in
   the caption/bio wherever you post these.

## Regenerating

```bash
npm install playwright
npx playwright install chromium
node render.js   # writes images/*.png
```

Copy the results into `../../public/ads/gohighlevel-summer-of-ai-bold-pk/images/`.

## Files

- `template.js` — diagonal split-background template; takes `{width, height, scale}`, scales every size/spacing value by `scale`
- `render.js` — renders all 3 formats via Playwright screenshots
