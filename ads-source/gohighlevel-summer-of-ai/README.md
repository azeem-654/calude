# GoHighLevel "Summer of AI" — Rs 1000 + 30-day training offer

Three static image ads promoting a GoHighLevel AI free trial, themed around
GoHighLevel's own "Summer of AI" campaign page, with a personal affiliate
incentive layered on top: an instant Rs 1000 mobile-wallet/bank transfer plus
30 days of live 1-hour AI training, claimed via WhatsApp.

## Output

- `public/ads/gohighlevel-summer-of-ai/images/facebook_1080x1080.png` — square, Facebook feed
- `public/ads/gohighlevel-summer-of-ai/images/instagram_1080x1350.png` — 4:5 portrait, Instagram feed
- `public/ads/gohighlevel-summer-of-ai/images/whatsapp_status_1080x1920.png` — 9:16, WhatsApp/IG/FB Status

All three share the same copy and gradient hero styled after the "Summer of
AI" page (blue → purple banner, "Ask AI? FREE." headline), just reflowed per
aspect ratio.

## ⚠️ Before you post these

1. **Affiliate link isn't on the image.** These are static images, so there's
   nowhere to click — you must add your tracked GoHighLevel affiliate link in
   the post caption / bio link / WhatsApp message yourself wherever you share
   these.
2. **Rs 1000 + daily 10–11 PM training is a real commitment, not a mockup.**
   Every viewer who messages the WhatsApp number expects: (a) an instant
   payout to their JazzCash/EasyPaisa/NayaPay/SadaPay/bank on verified
   sign-up, and (b) you personally showing up live every night for 30 days.
   Make sure you can actually deliver both at scale before running paid
   traffic to this — a missed payout or a skipped training night on an
   *advertised, specific* promise is the kind of thing that generates refund
   disputes and platform complaints, not just an annoyed customer.
3. **Phone number is baked into the images** (0320-0045364, WhatsApp). If
   that number ever changes, or if you want to run this on a shared/team
   account, you'll need to re-render (see below).
4. **"$100,000 challenge" mention** in the disclosure refers to GoHighLevel's
   own promotion shown on their Summer of AI page — it's intentionally kept
   separate from your personal Rs 1000 bonus so viewers don't confuse the
   two. Double-check GoHighLevel's current terms/eligibility for that
   contest before implying anyone can enter it.
5. **Verify against the live page** — this was built from a screenshot of
   gohighlevel.com's Summer of AI page provided in chat, not a live fetch, so
   re-check feature claims (Voice AI, 24/7 AI Team, etc.) against the current
   site before running as paid ads.

## Regenerating

Requires Node.js and `playwright` (with Chromium installed):

```bash
npm install playwright
npx playwright install chromium
node render.js   # writes images/*.png
```

Copy the results into `../../public/ads/gohighlevel-summer-of-ai/images/`.

## Files

- `content.js` — the shared copy block (feature chips, offer card, WhatsApp CTA, disclosure) — edit this to change wording, the phone number, or the bonus amount
- `template.js` — HTML/CSS generator; takes `{width, height, heroHeight, compact, expanded}` per format
- `render.js` — renders all 3 formats via Playwright screenshots
