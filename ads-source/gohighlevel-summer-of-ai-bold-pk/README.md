# GoHighLevel "Summer of AI" — bold Pakistan-market version (diagonal split)

Diagonal two-tone split (deep blue/purple over a fiery red-orange wedge)
with big, bold, **left-aligned stacked headline text** — dynamic,
sale-banner-style layout.

**Latest iteration: money-first, card-friction removed, course presented
as a bolded bonus (not labeled "optional"), new training time.** Previous
versions led with "Free AI Skills Seekhein" as the headline; this version
restructures the hierarchy around the Rs 1000 payout, per the reasoning
that the card requirement is the actual drop-off point for most people,
not lack of interest:

1. **"Sign Up Karein / Rs 1000 Cash Instantly!"** — headline, money leads
2. **"Card nahi? NayaPay Free Virtual Card use karein"** — directly answers
   the #1 real objection (no debit/credit card) instead of leaving it
   implicit
3. **"Abhi Hasil Karein!"** — red punch-tag urgency line (unchanged)
4. **"Bonus: *Voice AI, Automation, CRM & AI Employees* seekhein Free" /
   "Monday-Friday, shaam 6:30-7:30 baje, Zoom par"** — the course content
   itself is now bolded and named (not just "AI Skills Training"), framed
   as a bonus rather than labeled "optional," and the time changed from
   10-11 PM to 6:30-7:30 PM
5. **WhatsApp Karein — 0320-0045364** — CTA number

## ⚠️ Read this before running it — the actual risk here

**Verify GoHighLevel's affiliate program terms allow this before spending
real budget on it.** Most SaaS affiliate programs explicitly prohibit
incentivized/cash-back signups, and "here's how to get a virtual card just
to pass the card gate" makes the sign-up-then-abandon pattern look more
deliberate, not less, from GoHighLevel's side. The downside is commission
clawback and account termination — which would end this channel
retroactively, including payouts already promised to people who signed up
in good faith. This is a business-continuity risk, not just a compliance
footnote — worth 10 minutes reading their actual terms.

Text sizes use a `scale` multiplier per format (1.08 / 1.38 / 1.85 for
Facebook / Instagram / WhatsApp Status) so the bigger canvases get
proportionally bigger, bolder type instead of empty space.

## Output

- `public/ads/gohighlevel-summer-of-ai-bold-pk/images/facebook_1080x1080.png`
- `public/ads/gohighlevel-summer-of-ai-bold-pk/images/instagram_1080x1350.png`
- `public/ads/gohighlevel-summer-of-ai-bold-pk/images/whatsapp_status_1080x1920.png`
- `public/ads/gohighlevel-summer-of-ai-bold-pk/summer_of_ai_animated_whatsapp_status.mp4` — animated version of the WhatsApp Status creative (1080x1920, ~8s, H.264/AAC)
- `public/ads/gohighlevel-summer-of-ai-bold-pk/gohighlevel_summer_of_ai_square.mp4` — same ad, 1:1 (1080x1080), for Meta's "Square" placement variant
- `public/ads/gohighlevel-summer-of-ai-bold-pk/gohighlevel_summer_of_ai_horizontal.mp4` — same ad, 16:9 (1920x1080), for Meta's "Horizontal" placement variant
- `public/ads/gohighlevel-summer-of-ai-bold-pk/images/google_ads_horizontal_1200x628.png` — 1.91:1 horizontal image for Google Ads Performance Max / Display asset groups

### Animated versions (3 aspect ratios)

Same content, ~8s each, all built by recording a CSS-keyframe-animated
HTML page with Playwright's video capture (`recordVideo`), then converting
the raw `.webm` to `.mp4` with a system ffmpeg (Playwright's own bundled
ffmpeg is stripped down and can't encode H.264/AAC):

- **9:16** (`anim.html` → `summer_of_ai_animated_whatsapp_status.mp4`) — the
  original, vertical stacking, 3-word headline reveal (matches
  `whatsapp_status_1080x1920.png`)
- **1:1** (`anim_square.html` → `gohighlevel_summer_of_ai_square.mp4`) —
  same vertical-stack layout as the 9:16 version but sized down to match
  the proven `facebook_1080x1080.png` static layout, with keyframes added
- **16:9** (`anim_horizontal.html` → `gohighlevel_summer_of_ai_horizontal.mp4`)
  — a different layout: left-aligned text column (brand, kicker, headline,
  NayaPay line, punch tag, bonus lines) with the diagonal wedge and
  WhatsApp CTA on the right, mirroring `horizontal.html`'s static Google
  Ads layout but with room for the punch tag and full bonus block since
  1080px of height gives more room than that asset's 628px

Meta explicitly recommends providing dedicated Square and Horizontal video
assets rather than relying on auto-crop from the vertical original — a
naive crop of the 9:16 version would cut off the WhatsApp CTA and course
content, which is why these are separate hand-built layouts, not just a
resized version of `anim.html`.

### Google Ads horizontal image

`horizontal.html` / `render_horizontal.js` produce a simplified 1200x628
version for Google's "Add at least 1 horizontal image" requirement
(Performance Max / Display asset groups). It drops the punch tag,
course-content lines, and disclosure that the social formats carry — those
render separately as the asset group's Headlines/Long headline/Descriptions
fields, so the image only needs the brand, hook, and WhatsApp CTA to stay
readable at a glance.

## ⚠️ Other things to check before you post these

1. **"NayaPay Free Virtual Card" is now a specific instruction, not a
   vague mention** — confirm the actual steps in NayaPay's app still work
   the way you expect before sending people down that path; if the flow
   changes on NayaPay's end, this creative goes stale.
2. **Rs 1000 payout details are not spelled out on the image** — you
   explain JazzCash/EasyPaisa/etc. and verify sign-ups yourself over
   WhatsApp.
3. **Affiliate link still isn't on the image** — add your tracked link in
   the caption/bio wherever you post these.
4. **The training is now optional in wording, but you still need it to be
   real** — if someone does opt in, the Monday-Friday Zoom sessions still
   need to actually happen.

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

## Regenerating the square + horizontal videos

Same ffmpeg requirement as above:

```bash
npm install playwright
npx playwright install chromium
node record_extra_formats.js     # records anim_square.html + anim_horizontal.html
./convert_extra_formats.sh        # converts both to public/ads/.../
```

## Files

- `template.js` — diagonal split-background template; takes `{width, height, scale}`, scales every size/spacing value by `scale`
- `render.js` — renders all 3 static formats via Playwright screenshots
- `anim.html` — animated (CSS keyframes) version of the WhatsApp Status creative (9:16)
- `record.js` / `convert.sh` — records `anim.html` and converts it to the final 9:16 `.mp4`
- `anim_square.html` / `anim_horizontal.html` — animated 1:1 and 16:9 versions
- `record_extra_formats.js` / `convert_extra_formats.sh` — records and converts both of those
- `horizontal.html` — simplified 1200x628 static layout for the Google Ads horizontal image requirement
- `render_horizontal.js` — renders `horizontal.html` via Playwright screenshot
