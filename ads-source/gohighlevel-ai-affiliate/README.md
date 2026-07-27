# GoHighLevel AI — affiliate ad + offer page

Generates a 30s, 1920x1080 (16:9) MP4 video ad and a matching landing page
promoting a GoHighLevel AI free trial with a "$25 Amazon gift card" sign-up
bonus for a GoHighLevel affiliate.

## Output

- `public/ads/gohighlevel-ai-affiliate/gohighlevel_ai_affiliate_ad_16x9.mp4` — the rendered ad
- `public/ads/gohighlevel-ai-affiliate/index.html` — offer/landing page embedding the video

## ⚠️ Placeholders you must replace before publishing

This was generated without live access to `gohighlevel.com/ai` (the site was
blocked by this sandbox's network policy), so the on-screen copy uses generic,
well-known GoHighLevel AI positioning rather than the current page's exact
wording. Before using this ad, update:

1. **Affiliate link** — every CTA currently points to the plain
   `https://www.gohighlevel.com/ai` URL. Replace with your actual tracked
   affiliate/referral link (in `scenes.js` scene `05_cta`, and in
   `index.html`'s `<a class="cta-btn">` and video description).
2. **Gift card amount & fulfillment** — the "$25 Amazon gift card" is a
   placeholder. Decide the real amount and, importantly, *how you will
   actually fulfill it* (manual verification + purchase, a giveaway tool,
   etc.) — nothing here automates sending gift cards.
3. **Feature claims** — the 3 bullet points in scene `03_features` are
   generic (AI employees, CRM/funnels/automations, marketing/reputation/
   payments). Verify against the current live page and adjust if their
   product messaging has changed.
4. **Legal/compliance** — an FTC-style affiliate disclosure and an
   "not sponsored/endorsed by Amazon" disclaimer are already included in both
   the video and landing page, but review them against current FTC
   guidance and Amazon's trademark/branding guidelines before running this
   as a paid or public ad.

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

## Files

- `scenes.js` — scene copy + durations (edit this to change the script)
- `scene.html` — shared HTML/CSS template each scene's copy is injected into
- `render.js` — screenshots each scene to `frames/*.png` via Playwright
- `build_video.sh` — ffmpeg pipeline: per-scene zoom/fade clips → concat → final MP4
