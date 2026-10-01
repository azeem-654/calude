# Launch film — 16:9, about five minutes (v3, 4:56)

The long product film on protectedcentral.com (`public/site/launch/launch-16x9.*`).
It is not part of the app build. It lives here so it can be re-rendered when the
product or the offer changes, instead of being redrawn.

## Why it is its own film

The first version on the site was the 9:16 launch ad (`../launch-ad`) reformatted
to 16:9: its centre square, with blurred copies of itself filling the sides. The
owner asked for the full frame, and for a longer film that shows every major
module with AI automation first. So this one is **drawn for 16:9**: the product
window on the right (960×800 at 860,140), the words on the left, nothing cropped.
Phones get the same file, as wide as the screen.

## v2: the voice sets the clock

v1 laid its lines on a timeline drawn first, so the narration waited for the
pictures — two and three seconds of nothing between scenes. The owner asked for
no pauses and a livelier read, so in v2:

- **`lines.json`** is `[id, scene, text]`. Each line is rendered by Piper, then
  **`timing.mjs`** measures every WAV and lays them end to end (0.16 s between
  lines of a scene, 0.24 s between scenes), writing `timing.js` — the slot each
  scene occupies (`NT`) and its words (`NC`) — and `vo.json`.
- Every scene is drawn against nominal times (`T` in film.js) and then moved
  into its slot with **`place(scene, a, b)`** at the bottom of film.js; the
  scene's render keeps its own clock, and its sounds, cursor and toasts move
  with it (`at(scene, t)`). Change a line, re-run Piper and `timing.mjs`, and
  the film re-times itself.

## What it shows, and what it must not

Every screen carries **DEMO WORKSPACE**. The scenes added in v2 were each
checked against the code before they were drawn:

| Scene | What is real | Kept honest by |
|---|---|---|
| Your shop on Autopilot | Shop orders, `chase_payment`, `thank_buyers` (autopilotPlan.ts); payment on the seller's own processor | The money is shown on the customer's **own Stripe app**, on a phone outside the window — the app has no balance screen. "Example figures" on screen. |
| Many projects | 19 project solutions; each starts from a prompt or voice; Reports → **Revenue by project** (RevenueByProject.tsx), drawn in its own palette | "Example figures" on screen; the stacked bars are the real report's shape, the numbers are an example |
| Blog & SEO | Month plan, the nine checks (blogWriter.ts, by their own names), WordPress | — |
| AI Shorts | Upload → clips with captions, hashtags and a virality score (Gemini) | Shows an uploaded video, not a YouTube link (which gives sample clips) |
| Template gallery | 65 templates (17 websites, 48 funnels), real names and categories | — |
| Reputation | Email review requests (Google/Facebook/Yelp/Trustpilot), AI reply drafts | The review is labelled **an example review**; the film never claims live review monitoring, which is sample data in the app |
| Resell / white label | `resell.ts`: own price, own Stripe/Creem, payment link | Labelled example prices |
| Affiliate | `affiliate.ts`: 40%, for as long as they pay, 30-day hold | Stats consistent with the table; "Example figures"; the hold is stated |

The voice never promises income. It says what the product does — sells,
follows up, thanks buyers — and that the money goes to the customer's account.

The "always improving" scene says **130–150 updates every month**. That is
September's pace — 142 commits reached `staging` in the twenty days the history
covered (`git log --since=2026-09-01 --until=2026-10-01 origin/staging | wc -l`).
Re-count before re-rendering and change the line and the counter if the pace
has dropped; update `SHIPPED` with the newest real releases.

## v3: safe for a wide window

The site fills a wide, short window by cropping the film up to 11% top and
bottom (`object-fit: cover`, site.css). So nothing that matters sits in the
outer 11% (119px) of the frame: the opening title, the trust heading and the
offer were moved inward, and the toast was raised. A small
"protectedcentral.com · 7-day free trial" tag sits in the lower left through
every product scene (`renderLowerThird`) — most people watch part of an ad.

## Rendering

Same kit as `../launch-ad` (Playwright's Chromium, `ffmpeg-static`,
`@fontsource-variable/inter`, `lucide-static`, Piper with `en_US-ryan-high`),
with `icons.js` built from every quoted name in `film.js` that is a lucide icon.

```bash
# voice: length 0.88, noise 0.72, noise-w 0.9, 0.12 s between sentences
for each [id, , text] in lines.json: piper -m en_US-ryan-high.onnx --length-scale 0.88 --noise-scale 0.72 --noise-w 0.9 --sentence-silence 0.12 -f vo/<id>.wav
node timing.mjs vo                     # → timing.js, vo.json
python3 -m http.server 8766 &
node capture.mjs stills 60 152 205     # review frames
node capture.mjs sfx                   # sound cues → sfx.json
node capture.mjs video part0.mp4 30 0 2209 &   # …in four ranges, in parallel, then concat
node mixcfg.mjs && node ../launch-ad/mix.mjs mix_film.json film_audio.wav && ../launch-ad/loud.sh film_audio.wav film_audio_norm.wav
node captions.mjs > ../../public/site/launch/captions.vtt
```

The web files must stay under Cloudflare's 25 MiB per file: two-pass H.264 at
~540 kb/s and VP9 at ~480 kb/s for 4:55.

The voice is a neural voice, not a person — record a human read before paid
media. The music is synthesised (`mix.mjs`), so there is nothing to clear.
