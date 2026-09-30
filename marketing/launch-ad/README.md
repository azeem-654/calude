# Launch ad — "Describe it. AI builds it."

The 7-day-free-trial product ad, as code. It is not part of the app build
(nothing under `src/` or `worker/` imports it). It lives here so the ad can be
re-rendered when the product or the offer changes, instead of being redrawn.

## What it is

`index.html` + `app.js` draw a 1080×1920 stage. **Every frame is a pure function
of time**: `window.render(t)` paints second `t`, so a capture is frame-exact and
a cutdown is only a different list of times. There are no CSS animations or
timers to drift.

The UI is rebuilt from the product's own parts rather than invented:

| In the ad | Taken from |
|---|---|
| Shield mark and gradient | `src/components/shared/Logo.tsx` |
| The bot (blink, gaze, antenna, visor scan) | `src/components/Autopilot/AutopilotBot.tsx` |
| Palette, node colours | `src/components/Autopilot/theme.ts` (`T`, `NODE_TONE`) |
| Icons | lucide (the set the app uses) |
| Trust scene wording | `docs/SECURITY.md` §7 only — nothing from §8 |

Every screen carries a **DEMO WORKSPACE** chip; the numbers are demo values,
not customer results. Social assets are shown as **Ready to publish**, never as
published: the app does not post to social networks directly.

## Timeline (master, 55.8 s)

| s | Scene | Line on screen | VO |
|---|---|---|---|
| 0–4.4 | Ten tools collapse into the shield; zoom through its hole | Your business shouldn't need 10 different tools. / Bring it all to one place. | Running a business shouldn't mean running ten different tools. Meet Protected Central. |
| 3.9–11.4 | AI Autopilot: prompt typed, Build with AI, four build steps, bot | Tell AI what you want. / Protected Central builds the system. | Tell AI what you want to accomplish, and Autopilot helps turn it into intelligent workflows. |
| 11–17.4 | Three workflows running: pulses, Waiting → Processing → Completed | AI agents + real workflows. / Working while you work. | AI agents work. Workflows move. |
| 17–22.4 | CRM: counters, pipeline cards move, Qualified → Opportunity | Know every lead. Every deal. Every next step. | Find and manage leads. |
| 22–27.4 | Campaign sequence: Sent, Wait, Scheduled, Queued, Running | Campaigns that don't stop at Send. | Build campaigns. Automate follow-up. |
| 27–33.4 | Content Studio: blog + image jobs, three creatives, Ready to publish | Content moves from idea to finished asset. | Create content. |
| 33–38.4 | Appointments, support ticket triage, Google Meet, activity feed | Sales. Marketing. Content. Support. / Connected. | Manage appointments. Support customers. |
| 38–43.4 | Dashboard | See what's happening. / See what's next. | And see what's happening across your business, from one central workspace. |
| 43–47.4 | Trust | Your business. Your workspace. / Privacy and protection built into the experience. | Your team stays in control. |
| 47–52.4 | Whole product, modules, bot | One intelligent workspace. / Protected Central | This is Protected Central. Describe it. AI builds it. |
| 52–55.8 | CTA | Start your 7-Day Free Trial · TRY PROTECTED CENTRAL FREE · ProtectedCentral.com | Start your seven-day free trial today. |

Key text and action sit inside y 440–1480, the centre 1080×1080, so the 1:1 and
4:5 crops lose nothing. The 16:9 file is a pillarboxed reformat; a true 16:9
layout means changing the window geometry in `app.js`, not cropping.

Cutdowns are cut from the master at scene beats (`cuts.mjs`), each with its own
music, SFX and VO mix.

## Rendering

Needs Playwright's Chromium, `npm i ffmpeg-static @fontsource-variable/inter lucide-static`
in a scratch directory with these files, `inter.woff2` copied from the font
package, and an `icons.js` built from lucide (see the icon list in `app.js`).

```bash
python3 -m http.server 8765 &                       # the page loads fonts/icons over http
node capture.mjs stills 2.5 9.9 30.9                # review frames → stills/
node capture.mjs sfx                                 # sound cues → sfx.json
node capture.mjs video master_silent.mp4 30 '[[0,55.8]]'
node cuts.mjs                                        # mix_c30.json, mix_c15.json
node mix.mjs mix_master.json master_audio.wav && ./loud.sh master_audio.wav master_norm.wav
```

Voiceover: Piper (`piper-tts`) with `en_US-ryan-high`, lines in `lines.json`,
start times in `vo_master.json`. It is a neural placeholder for timing and
review — **record the final read with a human voice** before paid media.
Music is synthesised in `mix.mjs` (120 BPM, A minor, Am–F–C–G), so there is no
licence to clear; swap in a licensed track for the paid version if you prefer.

## Before this ad runs

- **The 7-day trial exists** (2026-09-30): every sign-up gets 7 days with no
  card (`worker/src/lib/trial.ts`). Do not also put a trial on the processor's
  price — that would make it 14.
- The full master plays on the home page as its second section
  (`src/components/Site/LaunchFilm.tsx`, files in `public/site/launch/`,
  WebM and MP4, 16:9 and 1:1). Re-encode those when the master changes.
- Re-check any screen that has changed since 2026-09-30 against the app.
