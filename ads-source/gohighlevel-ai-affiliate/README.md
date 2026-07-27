# GoHighLevel AI — affiliate ad + offer page

Generates a 30s 1920x1080 (16:9) MP4 video ad, a single 1080x1080 static image
ad, a 5-card 1080x1080 carousel ad, and a matching landing page — all
promoting a GoHighLevel AI free trial with a "$25 Amazon gift card" sign-up
bonus for a GoHighLevel affiliate. All four share the same dark navy/teal
visual language and copy so they read as one campaign.

## Output

- `public/ads/gohighlevel-ai-affiliate/gohighlevel_ai_affiliate_ad_16x9.mp4` — the video ad
- `public/ads/gohighlevel-ai-affiliate/images/single_image_ad.png` — single-image ad (1080x1080)
- `public/ads/gohighlevel-ai-affiliate/images/carousel_0{1-5}_*.png` — 5-card carousel ad (1080x1080 each)
- `public/ads/gohighlevel-ai-affiliate/index.html` — offer/landing page embedding all of the above

## ⚠️ Placeholders you must replace before publishing

This was generated without live access to `gohighlevel.com/ai` (the site was
blocked by this sandbox's network policy), so the on-screen copy uses generic,
well-known GoHighLevel AI positioning rather than the current page's exact
wording. Before using this ad, update:

1. **Affiliate link** — every CTA currently points to the plain
   `https://www.gohighlevel.com/ai` URL. Replace with your actual tracked
   affiliate/referral link (in `scenes.js` scene `05_cta`, `carousel.js` card
   `05_cta`, `single_ad.js`, and in `index.html`'s `<a class="cta-btn">`).
2. **Gift card amount & fulfillment** — the "$25 Amazon gift card" is a
   placeholder, repeated across the video, both image ads, and the landing
   page. Decide the real amount and, importantly, *how you will actually
   fulfill it* (manual verification + purchase, a giveaway tool, etc.) —
   nothing here automates sending gift cards.
3. **Feature claims** — the 3 bullet points in scene `03_features` /
   carousel card `03_features` are generic (AI employees, CRM/funnels/
   automations, marketing/reputation/payments). Verify against the current
   live page and adjust if their product messaging has changed.
4. **Legal/compliance** — an FTC-style affiliate disclosure and a
   "not sponsored/endorsed by Amazon" disclaimer are already included on the
   video, both image ads, and landing page, but review them against current
   FTC guidance and Amazon's trademark/branding guidelines before running
   this as a paid or public ad.

## Regenerating the video

Requires Node.js, `playwright` (with Chromium installed), and `ffmpeg`
(with libx264 + aac support) on your machine.

```bash
npm install playwright
npx playwright install chromium
node render.js          # renders frames/*.png from scenes.js + scene.html
./build_video.sh         # composites frames into the final MP4
```

`build_video.sh` writes the final file to `../../public/ads/gohighlevel-ai-affiliate/`
via ffmpeg's zoompan (Ken Burns) + fade transitions, then muxes in a silent
AAC audio track for player/platform compatibility. Edit `scenes.js` to change
copy, timing, or add/remove scenes.

## Regenerating the image ads

Same `playwright` dependency as above, no ffmpeg needed:

```bash
npm install playwright
npx playwright install chromium
node render_images.js   # writes images/single_image_ad.png and images/carousel_*.png
```

Copy the results into `../../public/ads/gohighlevel-ai-affiliate/images/`.
Edit `single_ad.js` for the single-image ad's copy, or `carousel.js` (an
array of card objects) to change the carousel's copy, order, or card count.

## Files

- `scenes.js` / `scene.html` / `render.js` / `build_video.sh` — the 16:9 video pipeline (see above)
- `single_ad.js` — copy for the single 1080x1080 image ad
- `carousel.js` — copy for each of the 5 carousel cards (1080x1080)
- `square.html` — shared HTML/CSS template the image ads are rendered from
- `render_images.js` — screenshots the single ad + carousel cards to `images/*.png` via Playwright
