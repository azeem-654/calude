# Launch film — 16:9, about three minutes

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

## How it is built

`film.js` is assembled from `../launch-ad/app.js` — its maths, brand pieces
(logo, bot, icons) and seven of its product scenes (Autopilot prompt, running
workflows, CRM, campaigns, content, appointments, dashboard, and the module
sidebar) carried over **verbatim** — plus what was drawn for this frame:

- `place(scene, a, b)` moves a scene written for the short ad to a new slot and
  slows it to fit; its render keeps its own clock and its sounds move with it.
- The left column (`copy(a, b, {kick, lines, sub, bullets})`) says what each
  scene is. `~word` is blue, `^word` is lime.
- New scenes: the blueprint (questions, workflows, edit by sentence), a workflow
  canvas with an AI agent's step settings, the template gallery (the real
  names; 33 templates), guardrails and approvals, AI replies, websites and
  funnels, live help, agencies/white label, and **What shipped** — sixteen real
  releases from September 2026 with their dates, and the month's count (128,
  `git log --since=2026-09-01 --until=2026-10-01 origin/main | wc -l`).
- Intro, trust (wording from docs/SECURITY.md §7 only), lockup and the offer
  are re-laid for the wide frame.

Every screen carries **DEMO WORKSPACE**; numbers are demo values. Update
`SHIPPED` and the 128 from the history before re-rendering in a later month —
the scene is only worth showing while it is true.

## Timeline (178.6 s)

| s | Scene | VO |
|---|---|---|
| 0–6.4 | Ten tools → one | Running a business shouldn't mean running ten different tools. Meet Protected Central. |
| 6–16 | AI Autopilot: describe it | Tell AI what you want… / Autopilot understands your business… |
| 15.6–27.6 | Blueprint | Before anything runs, you see the whole plan as a blueprint… |
| 27.2–39.2 | Canvas + AI agent settings | Every workflow is drawn step by step. AI agents read your website… |
| 38.8–47.8 | Workflows running | Then the server runs them every five minutes… |
| 47.4–54.4 | Template gallery | Or start from thirty-three ready-made workflows. |
| 54–63 | Guardrails & approvals | Anything that sends waits for your approval… |
| 62.6–71.6 | AI replies | When a lead replies, AI drafts the answer… |
| 71.2–79.2 | CRM & pipeline | Every lead, every deal, and every next step… |
| 78.8–86.8 | Campaigns | Campaigns and follow-up that don't stop at send. |
| 86.4–94.4 | Content Studio | Posts, articles and emails… |
| 94–102 | Websites & funnels | Websites and funnels from real templates… |
| 101.6–109.6 | Appointments & support | Appointments, tickets and support conversations, connected. |
| 109.2–117.2 | Live help | …share their screen with you, in one click. |
| 116.8–124.8 | Dashboard | See what's happening… and what's next. |
| 124.4–132.4 | Agencies | Run it for every client… under your brand. |
| 132–154 | What shipped | Protected Central never stands still. 128 updates in September… |
| 153.6–160.6 | Trust | Your business. Your workspace. Your team stays in control. |
| 160.2–168.3 | One workspace + lockup | One intelligent workspace. This is Protected Central. |
| 167.9–178.6 | Offer | Describe it. AI builds it. Start your seven-day free trial today. |

## Rendering

Same kit as `../launch-ad` (Playwright's Chromium, `ffmpeg-static`,
`@fontsource-variable/inter`, `lucide-static`, Piper with `en_US-ryan-high`),
with `icons.js` built from every icon name `film.js` uses.

```bash
python3 -m http.server 8766 &
node capture.mjs stills 10 22 33      # review frames
node capture.mjs sfx                  # sound cues → sfx.json
node capture.mjs video film_silent.mp4 30
# VO: each line of lines.json through piper → vo/<id>.wav (length_scale 0.97)
node mixcfg.mjs && node ../launch-ad/mix.mjs mix_film.json film_audio.wav && ../launch-ad/loud.sh film_audio.wav film_audio_norm.wav
```

The voice is a neural placeholder for timing — record a human read before
paid media. The music is synthesised (`mix.mjs`), so there is nothing to clear.
