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
5. **"Seekhein: Voice AI, Automation, CRM & AI Employees" / "Practical
   training se apna AI career shuru karein"** — 2-line course-content blurb
   (added per feedback), sitting between the punch tag and the CTA
6. **WhatsApp Karein — 0302-1202000** — the CTA, with the number itself now
   noticeably larger (46×scale vs the earlier 32×scale) so it's the most
   readable line on the CTA bar

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
- `public/ads/gohighlevel-summer-of-ai-bold-pk/summer_of_ai_animated_whatsapp_status.mp4` — animated version of the WhatsApp Status creative (1080x1920, ~8s, H.264/AAC)
- `public/ads/gohighlevel-summer-of-ai-bold-pk/images/google_ads_horizontal_1200x628.png` — 1.91:1 horizontal image for Google Ads Performance Max / Display asset groups

### Animated version

Same content and layout as `whatsapp_status_1080x1920.png`, animated into an
~8s video: each element (kicker, headline lines, the "+ Rs 1000 Gift" pop,
the punch tag, the course-content lines, the WhatsApp CTA) slides/fades in
in sequence, then the punch tag keeps a gentle wiggle and the CTA bar a
slow pulse for the remainder of the clip so it doesn't go static. Built by
recording a CSS-keyframe-animated HTML page with Playwright's video
capture (`recordVideo`), then converting the raw `.webm` to `.mp4` with a
system ffmpeg (Playwright's own bundled ffmpeg is stripped down and can't
encode H.264/AAC).

### Google Ads horizontal image

`horizontal.html` / `render_horizontal.js` produce a simplified 1200x628
version for Google's "Add at least 1 horizontal image" requirement
(Performance Max / Display asset groups). It drops the punch tag,
course-content lines, and disclosure that the social formats carry — those
render separately as the asset group's Headlines/Long headline/Descriptions
fields, so the image only needs the brand, hook, and WhatsApp CTA to stay
readable at a glance.

## ⚠️ Before you post these

1. **"Course Joining Motivation" is now an explicit promise on the
   creative** — make sure whatever you deliver over WhatsApp (the 30-day
   training, encouragement, etc.) actually matches what someone would
   expect from that phrase.
2. **"Voice AI, Automation, CRM & AI Employees" is now a specific curriculum
   claim** — make sure the actual training covers these, since it's on the
   creative now, not just implied.
3. **Rs 1000 Gift + payout details are not spelled out on the image** —
   same as the previous version, you explain JazzCash/EasyPaisa/etc. and
   verify sign-ups yourself over WhatsApp.
4. **Affiliate link still isn't on the image** — add your tracked link in
   the caption/bio wherever you post these.

## Regenerating the images

```bash
npm install playwright
npx playwright install chromium
node render.js   # writes images/*.png
```

Copy the results into `../../public/ads/gohighlevel-summer-of-ai-bold-pk/images/`.

## Regenerating the animated video

Requires a system ffmpeg with libx264 + aac support in addition to
Playwright (e.g. `apt-get install ffmpeg` — Playwright's own bundled
ffmpeg only supports webm/vp8 and can't produce this output):

```bash
npm install playwright
npx playwright install chromium
node record.js     # records anim.html, writes video_raw/*.webm
./convert.sh        # converts to the final mp4 in public/ads/.../
```

Edit `anim.html` to change copy, timing, or animation style — it's the
same content as `template.js`'s WhatsApp Status output but with CSS
`@keyframes` added per element and hardcoded to 1080x1920 (no `scale`
parameter, since it isn't reused across formats).

## Files

- `template.js` — diagonal split-background template; takes `{width, height, scale}`, scales every size/spacing value by `scale`
- `render.js` — renders all 3 static formats via Playwright screenshots
- `anim.html` — animated (CSS keyframes) version of the WhatsApp Status creative
- `record.js` — records `anim.html` to a `.webm` via Playwright's video capture
- `convert.sh` — converts the recorded `.webm` to the final `.mp4` via ffmpeg
- `horizontal.html` — simplified 1200x628 layout for the Google Ads horizontal image requirement
- `render_horizontal.js` — renders `horizontal.html` via Playwright screenshot
