# Launch film — 16:9, about five and a half minutes (v4, 5:31)

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

## v4: AI Prospecting, and the scenes it needed

Two scenes after "Many projects", each checked against the code:

| Scene | What is real | Kept honest by |
|---|---|---|
| AI Prospecting | One sentence → the four stages (directories, websites, address checks, mailbox verification), counted figures, every row time-stamped (AiResults.tsx); ticked rows added to an Autopilot project (AddTo.tsx) | Invented businesses on `.example` addresses, DEMO WORKSPACE; mailbox "Verified" needs the owner's verifier, which the site says |
| Every day, on Autopilot | A project's Prospects tab (ProjectProspects.tsx): status, today's count of the daily number, 30-day chart, rotation, step log; cold outreach 20 at a time waiting for approval (autopilotPlan.ts); the opt-in page and the `sms opt-in` tag that starts the texting workflow (smsOptin.ts) | Texts are shown only after the box is ticked — the film never implies texting strangers |

The searches change trade and town while the first scene runs (realtors,
dentists, law firms, gyms), and the trade chips name a dozen more, because
whoever is watching looks for their own customers in it. "Recently shipped"
gained the October releases (checked against `git log origin/staging`).

The kit is no longer kept anywhere: rebuild it in a scratch directory with
`npm i ffmpeg-static @fontsource-variable/inter lucide-static`,
`pip install piper-tts`, the `en_US-ryan-high` voice from
huggingface.co/rhasspy/piper-voices, `inter.woff2` copied from the font
package, and `icons.js` written from every quoted lucide name in film.js:

```js
// mkicons.mjs — width/height set to 100% so each icon fills its 1em .ico box
for (const n of quotedNames(film.js)) if (exists(`node_modules/lucide-static/icons/${n}.svg`)) out[n] = svg(n);
fs.writeFileSync('icons.js', `window.ICONS = ${JSON.stringify(out)};`);
```

Piper 1.8 reads the line on stdin: `echo "$text" | piper -m en_US-ryan-high.onnx
--length-scale 0.88 --noise-scale 0.72 --noise-w-scale 0.9 --sentence-silence 0.12 -f vo/<id>.wav`.

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

The MP4 must stay under Cloudflare's 25 MiB per file: two-pass H.264 at
~540 kb/s for 4:55. It is now only the fallback (see below); the WebM is gone.

## The stream: quality follows the connection

One 1080p file played well on a good line and stopped every few seconds on a
slow one. The site plays an HLS ladder instead (`public/site/launch/hls/`),
and `LaunchFilm.tsx` lets the player step between rungs as it measures the
line — Safari natively, everything else with hls.js:

| Rung | Average | Busiest 4 s |
|---|---|---|
| 1080p | ~690 kb/s | ~1.14 Mb/s |
| 720p | ~490 kb/s | ~830 kb/s |
| 480p | ~320 kb/s | ~500 kb/s |
| 360p | ~230 kb/s | ~320 kb/s |

Every rung has a keyframe every 4 s in the same place (`-force_key_frames`,
no scene-cut keyframes), and segments are 4 s, so a switch can happen at any
segment boundary without a stall.

```bash
./hls.sh                 # from the master → hls/{1080,720,480,360}/ (index.m3u8 + s###.ts)
node hlsmaster.mjs       # → hls/master.m3u8, BANDWIDTH measured from the segments
cp -r hls/* ../../public/site/launch/hls/
```

### Checking the switching

Playwright's Chromium has no H.264, so `abr-check.mjs` swaps the ladder for a
VP9 copy of its first 130 s (same rungs, same 4 s segments, fMP4) copied into
`dist/site/launch/hlstest/`, then throttles the line in DevTools: fast, then
450 kb/s, then fast again. On 2026-10-02 it fetched 1080p, stepped
1080 → 720 → 480 within ten seconds of the line dropping and played on
without a stall, and climbed back to 1080p when the line recovered.

```bash
for r in 1080:900k 720:500k 480:250k 360:120k; do …libvpx-vp9 -deadline realtime -cpu-used 8 -t 130
  -g 120 -f hls -hls_time 4 -hls_segment_type fmp4 hlstest/<rung>/index.m3u8; done
VITE_BASE=/ npm run build && cp -r hlstest dist/site/launch/ && npx wrangler dev --local
node abr-check.mjs       # ABR OK
```

The voice is a neural voice, not a person — record a human read before paid
media. The music is synthesised (`mix.mjs`), so there is nothing to clear.

## Paid-social cut-downs (`ads.mjs`, 2026-10-05)

`node ads.mjs [cut…]` in the kit directory makes, from the v4 master:

| Cut | What it is | Shapes |
|---|---|---|
| `15s_autopilot` | hook → "tell AI what you want" → trial card | 9:16, 4:5, 1:1, 16:9 |
| `15s_prospecting` | "Need more customers? Say who you sell to" → trial card | 9:16, 4:5, 1:1, 16:9 |
| `30s` | hook → Autopilot → Prospecting → trial card | 9:16, 4:5, 1:1, 16:9 |
| `60s` | adds the build, the server running it, and the whole Prospecting story | 9:16, 4:5, 1:1, 16:9 |
| `full` | the whole film re-laid for phones (the 16:9 master is the original) | 9:16, 4:5 |

Ranges are whole voice lines, starting just after each scene's 0.45 s
cross-fade. In 9:16, 4:5 and 1:1 a product scene is **re-laid, not cropped**:
the film's own words (left) stacked above its product window (right), each
feathered into a canvas made from the frame's own background. 9:16 keeps the
words below the top 14% where Reels and Stories draw their own rows. Title
and end cards are kept whole. The audio is re-mixed from the same voice files,
cues and music (`mix.mjs`), so no word is cut. Every cut comes with an `.srt`
of the voice, to upload as captions; most feed video plays without sound.

## The phone version — 9:16 for the site (`vertical.mjs`, 2026-10-08)

The site played the 16:9 film as wide as a phone, a small band in a tall
screen. Phones (≤760px) now get `public/site/launch/hls-9x16/` (1080×1920,
720×1280, 480×854; 4-second segments) and `launch-9x16.mp4` (720×1280, the
fallback, under the 25 MiB a Worker serves) with `poster-9x16.jpg`; the
desktop keeps the 16:9 film. The layout is ads.mjs's `full` cut — the film's
words stacked above its product window, title and end cards whole — made from
the published 16:9 MP4 with its own sound, so the captions still line up and
nothing is re-mixed. (The kit's `icons.js` and voice files are not in the
repository, so the film itself cannot be re-rendered from here; this works from
the published copy.)

```bash
node vertical.mjs <path to ffmpeg> ../../public/site/launch/launch-16x9.mp4 <outdir>
node vertical.mjs <ffmpeg> <src> <outdir> --still 1.5 60 325   # frames to check the layout
```

**Square pixels, checked (2026-10-08).** The first 9:16, 4:5 and 1:1 renders
— the site's phone film and every paid-social cut — played as smeared
horizontal streaks on phones. The pixels were right; the stream said each
pixel was 512:27 wide (SAR), because the background is a 100-px strip of the
frame scaled to the canvas and `scale` keeps a picture's display shape by
writing a SAR, which the overlay inherited. A frame grabbed with ffmpeg shows
the stored pixels and looked perfect; a player honours the SAR. Both scripts
now end the graph with `setsar=1` and refuse to finish (`assertShape`) unless
every output is its intended size with square pixels. The files already
delivered were repaired without re-encoding (`-c copy -bsf:v
h264_metadata=sample_aspect_ratio=1/1 -aspect 9:16`). To see a file as a
player will: `ffmpeg -i f.mp4 -frames:v 1 -vf "scale=iw*sar:ih" check.jpg`.
