# Video reviews — what to offer, and the rules that keep it safe (2026-11-21)

Goal: short customer videos (60–120 seconds) we may post on YouTube, the site
and the AppSumo listing's media. The incentive buys **the time to record an
honest video**, never a positive one.

## Three rules first

1. **Never ask for a positive review, and never pay more for one.** The reward
   is the same whatever they say; we may choose not to *publish* a video, but
   the reward is still given once it meets the brief (length, sound, their
   real business). Paying only for praise is a fake review in the FTC's eyes
   (US, 16 CFR Part 465, in force since Oct 2024; fines per violation).
2. **The video says it was rewarded.** One line on screen or in the
   description: *"Protected Central gave me a free month for recording this."*
   YouTube also asks for its "includes paid promotion" box to be ticked.
3. **Not for AppSumo's own reviews.** AppSumo does not allow incentives for
   ratings on its listing. Offer the reward for a **YouTube video testimonial**
   only, and ask for AppSumo reviews separately, with no reward attached.

Get written permission (a tick box on the submission form) to use their name,
face, business name and video in ads and on YouTube, for as long as we like,
with the right to ask us to take it down.

## What to offer

### Subscribers (monthly plans)

| Offer | Why it works |
|---|---|
| **One month free** for a video that meets the brief (recommended) | Easy to understand, costs us one month's margin, and they stay a customer through it |
| **+1 month for a second video** after 90 days ("what changed since") | Before/after videos convert best |
| Optional: a feature on our site with a link to their business | Free promotion for them; costs nothing |

### AppSumo lifetime-deal buyers

A free month means nothing to someone who never pays monthly. Offer things
that cost us little but are worth a lot to them:

| Offer | Cost to us | Notes |
|---|---|---|
| **+1 business workspace on their deal, permanently** (recommended) | Low — it is unused capacity until they use it | Needs a per-account allowance override (see below) |
| **+500 AI credits a month for 12 months** | AI spend, metered | Same override, time-limited |
| **A 30-minute done-with-you setup call** | An hour of your time | Great for buyers who are stuck — the video often follows naturally |
| **Featured as a case study** on protectedcentral.com with their link | None | Good for agencies |

Pick **one** headline offer per audience so the ask is simple:
*"Record a 1–2 minute honest video about how you use Protected Central and get
a month free (or, on the AppSumo deal, an extra business workspace for good)."*

## The brief to send them

- 60–120 seconds, landscape, their face on camera, quiet room, phone is fine.
- Answer three questions: what the business does; what they used before and what was hard; what Protected Central does for them now (a real example).
- Say once that they received the reward.
- Do not read a script we wrote. Do not mention competitors by name.

## What needs building (none of it is built yet)

- A short "Send us a video" form (upload or a YouTube/Drive link, the
  permission tick box, which reward) — Media Center already stores files.
- Granting the reward: a free month is a billing credit (`routes/billing.ts`);
  an extra workspace or credits for a deal holder needs a **per-account
  allowance override** — allowances live only in `worker/src/lib/allowances.ts`,
  so the override has to be read there, never hard-coded elsewhere.
- An owner screen to review submissions, mark "meets the brief", and release
  the reward once.

Ask a session to build these when you want to launch the programme.
