# GoHighLevel "Summer of AI" — bold Pakistan-market version

A louder, higher-urgency remix of `../gohighlevel-summer-of-ai/`, written in
Roman Urdu/English mixed copy for a Pakistani audience. Leads with **"AI
Skills Seekhein — Bilkul FREE!"** (learn AI skills for free / build a
career), with the Rs 1000 instant transfer kept as a bold, high-contrast
secondary hook (red "INSTANT" tag, corner ribbon, glowing number) rather
than the headline itself — per the request to make skills the major message
while keeping the money hook visually loud.

Visual changes vs. the original version: a red/orange urgency bar across
the top, a diagonal "FREE Rs 1000" ribbon badge, a highlighted "Seekhein AI
Skills" chip, an "INSTANT" tag next to the Rs 1000 figure, and a 4th offer
bullet tying AI skills to freelancing/job/business outcomes — all things
that read as high-urgency, aspirational value in Pakistani social ad
creative (Daraz/Jazz/Telenor-style banners) without inventing fake scarcity
numbers.

## Output

- `public/ads/gohighlevel-summer-of-ai-bold-pk/images/facebook_1080x1080.png`
- `public/ads/gohighlevel-summer-of-ai-bold-pk/images/instagram_1080x1350.png`
- `public/ads/gohighlevel-summer-of-ai-bold-pk/images/whatsapp_status_1080x1920.png`

## ⚠️ Before you post these

Same commitments as the original version apply (see
`../gohighlevel-summer-of-ai/README.md`), plus:

1. **No fake scarcity was added on purpose.** Real Pakistani ad creative
   often uses "only 50 spots left" style urgency — that was deliberately
   left out here because it wasn't true information you gave me. If you add
   a real cap (e.g. "first 50 sign-ups only"), make sure it's actually true
   and actually enforced — advertising a limit you don't honor is the kind
   of thing that gets ads reported.
2. **"AI Skills" is now the headline promise**, so the 30-day training
   needs to actually teach the features listed (Voice AI, Automation, CRM,
   AI Employees) at a level people would call "skills," not just a signup
   walkthrough — expectations will be higher than the money-first version.
3. **Affiliate link is still not on the image** — add your tracked link in
   the caption/bio/WhatsApp message wherever you post these.

## Regenerating

```bash
npm install playwright
npx playwright install chromium
node render.js   # writes images/*.png
```

Copy the results into `../../public/ads/gohighlevel-summer-of-ai-bold-pk/images/`.

## Files

- `content.js` — Roman Urdu/English copy (feature chips, offer bullets, WhatsApp CTA, disclosure)
- `template.js` — HTML/CSS generator, extends the base template with an urgency bar, ribbon badge, and glowing offer number
- `render.js` — renders all 3 formats via Playwright screenshots
