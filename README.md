# Protected Central — multi-tenant marketing CRM

> **Every step, in the open.**

The name, the motto and the mark are set in three places and nowhere else:
`activeBranding()` in `src/services/tenancy.ts` is the product name every screen
reads, `public/favicon.svg` is the browser tab, and `src/components/shared/Logo.tsx`
is the same mark for the nav, the login screen and the marketing header. A
sub-account that sets its own `branding.appName` still overrides all of it —
that is what the white-label layer is for.

The mark is a shield with its centre cut out: "protected" and "central" in one
figure. The hole is not styling — it is what keeps the icon legible at the 16px
a browser tab actually renders.


A GoHighLevel-style CRM SaaS built with **React + TypeScript + Vite**, running on
one Cloudflare Worker deployed by GitHub Actions. An agency owns isolated client
sub-accounts; every module below is tenant-scoped.

Two hostnames, one Worker and one bundle:

| | |
|---|---|
| [protectedcentral.com](https://protectedcentral.com) | the public marketing site — what it is, and two ways in |
| [app.protectedcentral.com](https://app.protectedcentral.com) | the product: the login, and everything behind it |

See [The two sites](#the-two-sites).

## Modules

| Module | What it does |
|---|---|
| Dashboard | Customer-journey overview, KPI ticker, live activity, growth forecast, **Content Pipeline widget** |
| Contacts | **Command center**: health score, lifecycle stages, next-best-action, unified cross-module timeline, custom fields, CSV import |
| Pipelines | Kanban deal boards with subtasks, checklists, automations, WIP limits |
| Marketing | Email/SMS campaigns, multi-step sequences, automations |
| Funnels & Websites | Template library (53), block-based builder, live preview, lead capture into CRM |
| Scheduling | Calendly-grade booking: event types, timezone slots, ics, reschedule/cancel, email + SMS reminders |
| Social Creator | Canva-grade design editor: templates, snap guides, shortcuts, stock photos, effects |
| AI Shorts | Long-video → shorts: captions, hooks, reframe, B-roll, dubbing, script-to-video, music, intro/outro |
| Social Automation | **One video → a whole campaign**: clips, per-platform posts, a 4-email sequence, SMS, a blog article and a landing page, then an assisted publish run |
| Reputation | Review inbox and reply workflows |
| Agency | Sub-account management, plans, usage, white-label branding |

## AI Company Onboarding Wizard

New company accounts are greeted by a 6-step wizard (`src/components/Onboarding/OnboardingWizard.tsx`)
that configures the entire workspace:

1. **Business profile** — company, industry, description, audience, brand voice/color, business hours. Validated and sanitized.
2. **Goals & sales process** — growth goals, monthly lead target, industry-prefilled pipeline stages (editable).
3. **Channels** — email, SMS, socials, video, blog, reviews, booking, funnels; each activates the matching module.
4. **Contacts** — CSV upload/paste with fuzzy column mapping, validation, dedupe, custom fields and **AI segmentation** (Hot Lead / SMS-Ready / Email-Ready / B2B / B2C) + auto welcome-campaign drafts.
5. **12-month plan** — theme/focus/holidays/ideas per month via Gemini, with a deterministic smart-template fallback so no API key is required. Fully editable.
6. **Review & launch** — summary of everything, then one click applies it all: brand kit, business hours, sales pipeline, lead-magnet funnel, website + 3 SEO blog posts, per-service booking pages with reminders, and a **90-Day Launch Plan** task board (30–50 tasks in 4 phases).

## Contacts — the command center

`src/services/contactIntelligence.ts` derives everything below from data the CRM
already holds (activities, deals, appointments, tasks). It is deterministic and
rule-based, so it works offline with no API key and every number can be explained.

- **Health score (0–100)** from four weighted signals — engagement (90-day
  opens/clicks/forms/calls), recency, pipeline progress and reachability. The ring
  opens a breakdown showing each component's contribution, so the score is
  inspectable rather than a black box.
- **Lifecycle stages** — Subscriber → Lead → MQL → SQL → Opportunity → Customer →
  Evangelist. The system infers the stage the behaviour supports and offers it as a
  suggestion; setting it explicitly is one click and is written to the timeline.
- **Next best action** — ranked, reasoned suggestions ("They clicked a link 1 day
  ago, which is the strongest intent signal you have"), each routing to the right
  tool. Rules cover overdue tasks, opens without clicks, open deals with no meeting,
  never-emailed contacts, and 30/60-day silence.
- **Unified timeline** — activities, notes, tasks, appointments and deal stage
  changes merged chronologically, filterable by type and exportable to text.
- **Cross-module summary** — open deals and pipeline value, appointments, and
  emails sent, read live from the Pipelines and Scheduling modules.
- **List view** — health bar and lifecycle stage as sortable columns, plus a
  lifecycle filter; clicking any row opens the command center.

### Email from the contact profile

`src/services/contactEmail.ts` plus the Worker's `api/track.php` route make the Email tab a
working outbound channel rather than a log viewer.

- **Compose and send** through whichever provider is configured in Settings →
  Email & SMS (SMTP, Mailtrap, Resend, ActiveCampaign). Eight starter templates,
  merge tokens (`{{firstName}}`, `{{company}}`, …) inserted at the cursor,
  attachments, and AI-generated subject lines when a Gemini key is present.
- **Scheduling** — pick a future date/time and the email is queued as `scheduled`.
  A background job on the dashboard sends anything whose time has come.
- **Real open and click tracking.** Outbound HTML is instrumented with a 1×1
  tracking pixel and rewritten links before it leaves. `api/track.php` records
  each hit as a row in D1's `crm_track`, then `syncTracking()`
  folds the events back into history — status advances sent → opened → clicked,
  with open counts, click counts and the exact URLs clicked. The click
  redirector only accepts `http(s)` targets, so it can't be used as an open
  redirect. If the endpoint isn't reachable, history simply stays as it is.
- **Engagement stats** — open rate, click rate and replies for this contact,
  each shown against the account-wide average so a number has context, plus an
  overall email-health band.
- **Sequences** — enrol the contact in any sequence built in Marketing, then
  skip a step, pause, resume or remove them. Every action is written to the
  enrolment history. A dashboard job sends due steps and stops the sequence
  when the contact replies.
- **Threaded history** — expandable per message with attachments, tracking
  detail and a "Log a reply" action that records the inbound message and marks
  the thread replied.

### Deals from the contact profile

`src/services/contactDeals.ts` treats deals from the contact's side. Deals live
inside `pipeline.stages[].deals`, so every helper here is pure — it takes the
pipeline array and returns a new one, and the caller persists through
`updatePipeline`. That keeps the contact profile and the pipeline board looking
at exactly the same data.

- **Every deal in one place** — across all pipelines, matched by contact id,
  email or name, with open deals first. Create, edit, delete, mark won, mark
  lost with a reason, and reopen, all without leaving the profile.
- **One-click stage moves.** Each open deal shows its pipeline's stages as
  chips; clicking one moves the deal there and **runs the same automation
  engine the kanban board uses** (`runAutomations`), so a rule like
  "when moved to Proposal Sent → set priority urgent, add a Hot label" fires
  identically from either surface and lands in the shared automation log.
- **Explainable win probability.** A forecast from four factors — stage
  position, contact health, momentum (days sitting in the current stage) and
  whether the expected close date has already slipped. Click the percentage to
  see each factor's contribution. The summary strip's weighted forecast is
  value × probability across open deals.
- **Behaviour triggers** — rules that fire on what the *contact* did rather
  than what happened to the deal: a link click or booked meeting advances the
  deal a stage, a pricing/demo form raises the win probability floor, a call
  raises it less. They run as a background job on the dashboard, are toggleable
  per rule, and fire at most once per (rule, deal, activity) so reloading is
  safe. **They never advance a deal into the final stage** — that column is the
  win column, and closing a deal stays a human decision.
- **In the contact list** — a Deals column (open value, open/won/lost counts,
  weighted forecast in the tooltip) and a Pipeline column showing which stages
  the contact's open deals sit in. Both sort. Select contacts and
  "Move deals to stage…" bulk-moves every open deal they own, skipping deals
  that belong to a different pipeline rather than relocating them somewhere the
  stage id doesn't exist.

### Scheduling from the contact profile

`src/services/contactScheduling.ts` books meetings against the **same
availability rules the public booking page enforces** — weekly hours, daily
limit, buffers, minimum notice and the rolling window — so an internal booking
can never double-book against a public one, and vice versa.

- **Both clocks, always.** Appointments store owner-timezone wall clock plus
  the owner's and the contact's IANA zones. Slot buttons show your time with
  theirs in brackets, and cards show both. The contact's zone is taken from
  their record, else guessed from their phone's dialling code — and a guess is
  **labelled as a guess** rather than presented as fact. One dropdown corrects it.
- **Book, reschedule, cancel, close out.** Rescheduling records where the
  meeting came from and rebuilds its reminder; cancelling takes a reason and
  clears pending reminders. Meetings whose end time has passed surface under
  "Needs closing out" so nothing quietly rots in the calendar as `scheduled`.
- **Real calendar files.** Every meeting exports a valid `.ics` (importable
  anywhere) and offers a Google Calendar "add event" link — no OAuth, no
  connector to configure.
- **Reminders that actually send.** A dashboard background job emails any
  reminder whose time has arrived through the configured provider, stamps it
  sent so it can't repeat, and logs it to the contact's timeline. Reminders
  for meetings that already started are skipped rather than sent late.
- **Post-meeting follow-up** — toggleable rules that run once per meeting after
  you mark it completed or a no-show: a thank-you email, a follow-up task two
  days out, an optional deal advance (off by default), and a re-book task for
  no-shows. The deal advance obeys the same rule as the behaviour triggers: it
  never moves a deal into the final stage.
- **Show rate** — completed vs no-show, alongside upcoming and cancelled counts.

### Lists, dedupe, ownership and the team feed

- **Smart lists** (`src/services/contactLists.ts`) are saved rules re-evaluated
  every time you open them, so they never go stale. Rules can reach past the
  contact record into derived data — health score, lifecycle stage, open-deal
  value, email open rate, days since last activity — which turns
  "engaged leads with an open deal who have never been emailed" into one saved
  segment instead of a manual sweep. The rule builder shows the live match
  count as you type. Five starter segments are one click away.
- **Static lists** are hand-curated: select rows and "Add to list…".
  Deleting a contact removes it from every static list, so a list can never
  point at a record that no longer exists.
- **Dedupe** (`src/services/contactMerge.ts`) groups likely duplicates by
  email (100% confidence), normalised phone number (85%) and name-at-company
  (60%, flagged as weaker evidence to check first). The merge wizard shows
  every field the records disagree on before anything is written, and defaults
  the surviving record to the most complete one.
  **Merging never orphans anything**: tags, notes, tasks and timeline entries
  are combined rather than replaced; blank fields on the survivor are filled
  from the duplicate; and every deal, meeting, email and list membership
  pointing at the removed record is re-pointed at the survivor *before* it is
  deleted.
- **Ownership** — an Owner column, an owner filter (including "My contacts"
  and "Unassigned"), and bulk assignment. Roles gate what the UI offers:
  agency users can act on anything; client users can fully manage the contacts
  they own but not someone else's, and merging is withheld from them because
  it destroys records across owners. Denials explain themselves in the tooltip
  rather than just going grey.
- **Team feed** — recent activity across every contact with a per-owner
  workload read, filterable by owner. The per-contact timeline answers "what
  happened to this person"; this answers "what has the team been doing".

### Permissions are enforced on the server

The same rules live in two places that have to agree:

| | |
|---|---|
| `src/services/contactPermissions.ts` | what the interface offers |
| `worker/src/routes/data.ts` | what the database accepts |

Every write reaches the server through `api/data.php`, which is the only path
to the account store, so the guard sits at the choke point. Before anything is
written it diffs the incoming contact array against the stored one and refuses
the request if it touches a record the caller may not touch:

- A client user may edit or delete only records they own, or unowned ones.
- Reassigning a record away from its owner needs the reassign capability *on
  the record as it stands*, so nobody can hand themselves someone else's contact.
- New records created by a non-agency user are stamped with them as owner, so
  every record has someone accountable for it.
- No non-agency user can clear a whole core key (`crm_contacts`,
  `crm_pipelines`, `crm_appointments`, …) in one request.
- Agency users are unrestricted within the workspaces they can access.

When the server refuses a write it returns its own copy of the data along with
the reason. `serverData.ts` writes that copy back, `AppContext` pulls it into
React state, and the user sees *"Blocked: "Cara Lin" is owned by other@a.com and
cannot be edited by you."* — so a change that did not save never sits on screen
looking like it did.

The UI reads its capability matrix from `api/data.php?action=caps` rather than
deciding alone, so what a button offers is what the server will accept.
**Settings → Team & Permissions** shows that matrix, manages team members and
their roles, and states plainly whether enforcement is live.

**The one caveat that remains:** enforcement requires the cloud database to be
connected (Agency → Cloud Database). Running local-only, there is no server to
enforce anything and the same screen says so rather than implying a guarantee
that isn't there.

## Funnel & Website Builder

A single template library (`src/components/shared/pageTemplates.ts`) is the source
of truth for ready-made page content, so **what you preview is exactly what gets
created** — previously each wizard produced pages with `blocks: []`, which is why
new funnels and websites opened empty.

- **53 templates** across Lead Capture, Sales Pages, Landing Pages, Event Pages,
  Thank You Pages, Full Websites and Seasonal — each with its own hero copy,
  industry tag, page count and popularity rating.
- **Live previews, not screenshots.** Thumbnails render the real page through the
  shared `BlockRender` and CSS-scale it, so they can never drift out of date and
  need no screenshot pipeline. Hover scrolls the full page; clicking opens a
  full-screen preview with **desktop/mobile toggle** and a page switcher.
- **Use this template** clones the pages into a new funnel/website and drops you
  straight into the builder with everything populated and editable.
- **Preview that works**: `/preview-funnel/:id` and `/preview/:siteId` render live
  from app state, so edits show up on the next preview. Both builders have a
  *Live preview* button that saves first and opens the rendered page in a new tab.
- **Forms capture real leads** — submitting on a funnel preview creates a CRM
  contact (tagged with the funnel name) and increments the funnel's conversions,
  which the card's Analytics view reports.

Builder features already in place: drag-and-drop blocks with drop zones, a
properties panel per block, page add/delete/rename/reorder, undo/redo, device
widths, and gradient presets.

### Not included (needs infrastructure this deployment doesn't have)

The Worker and D1 cover the server side, but there is still no object store
and no image pipeline. So these are deliberately **not** implemented rather
than faked: S3/Cloudinary uploads (images are stored as data URLs), serving a
customer's own custom domain for a published site, and server-side screenshot
generation.

Everything else here is server-backed: **email open/click tracking**
(`api/track.php`), **permission enforcement** (in `api/data.php`, the only path
to the account store), **scheduled sending** (a cron trigger, so a campaign no
longer needs an open tab), and **Stripe checkout**. None of it needs an
installer — `wrangler d1 migrations apply` is the whole of setup, and the
deploy runs it.

## Email Deliverability engine

Keeping mail out of spam is split between the two places that can actually do
the work:

| | |
|---|---|
| `src/services/deliverability.ts` | everything decidable from data we already hold — syntax, suppression, content scanning, reputation, volume and timing advice. Instant, offline. |
| `api/deliverability.php` (the Worker) | the checks a browser physically cannot make — DNS for SPF/DKIM/DMARC/MX, DNSBL blacklist queries, SMTP mailbox probes, and any paid verification API. |

### Authentication

**Settings → Email Deliverability** looks up your sending domain's live records
and judges them, rather than only reporting them: two SPF records is an error
(the spec allows one), `+all` is an error, over ten DNS lookups is an error, a
DKIM key with an empty `p=` is revoked, `p=none` DMARC is monitoring rather than
protecting. Each verdict says what to change.

The record generator produces the TXT records to publish, with the SPF mechanism
matched to whichever provider you actually send through, plus step-by-step
instructions for Cloudflare, GoDaddy, Namecheap and Google Domains.

### List hygiene and suppression

Addresses are checked for syntax, a real mail server, disposable domains, role
accounts (`info@`, `sales@`) and spam-trap patterns. Contacts carry an **email
health** column — Valid, Risky, Invalid, Unchecked — which sorts and filters, and
**One-click clean** removes everything undeliverable.

The suppression list is enforced at `sendToContact()`, the single point every
outbound email passes through, so no caller can forget it. A permanent rejection
(550, "user unknown", and similar) is recorded as a hard bounce and the address
is suppressed on the spot — the next attempt never reaches the provider.

### Reputation, content and pre-send

Sender score is computed from mail this workspace actually sent: delivery 40,
bounce rate 25, complaints 20, engagement 15 — each returned with its reasoning
rather than asserted. The composer scores drafts against a real spam ruleset
while you type and names both the phrase and the fix. `preSendCheck()` gates a
campaign on suppression, list health, thresholds and today's safe volume, which
follows a warmup ramp for new senders.

### Verification provider (optional)

ZeroBounce or Kickbox can be connected in Settings. The key is held **on the
server**, encrypted, and never returned to the browser — the UI can only report
whether one is present. Without a key everything above still works;
the provider adds mailbox-level certainty that DNS alone cannot give.

### Warmup and per-provider throttling

`src/services/warmup.ts` plus **Settings → Email Deliverability → Warmup & providers**.

- **The ramp is a ceiling, not a chart.** It starts at your chosen daily volume
  and doubles roughly every four days, and `warmupGate()` is called inside
  `sendToContact()` — so a send past the day's allowance is refused with the
  reason, not merely discouraged. It halves itself automatically when bounces
  or complaints go above target.
- **Per-provider throttling from measured outcomes.** Recipients are bucketed by
  provider (Google, Microsoft, Yahoo/AOL, Apple, business), and each bucket's
  health comes from the last 30 days of our own mail. A 4xx deferral halves that
  provider's rate; permanent rejections at volume pause it for 24 hours;
  recovery is gradual, in 15% steps, because snapping back to full speed is what
  caused the deferral. A throttle is a *fraction of the day*, so one provider
  slowing down never starves the others.
- **Seed mailboxes.** Add addresses you own at each provider; warmup sends real
  messages to them on the ramp's schedule and you record where each landed. That
  inbox-placement rate is the only measurement that says whether mail is
  actually reaching inboxes.
- **Sending identities.** Track each domain or dedicated IP and check its
  authentication and blacklist status independently.

Three bugs the tests caught and that are worth knowing about, because they are
the kind that would silently ruin a warmup: an equal per-provider split gave
every provider a zero allowance on early ramp days (so nothing could send); a
single deferral was treated as a blockage and paused a provider for a day; and
emails *we* refused were being fed back as provider failures, throttling a
provider for our own caution. All three are fixed and covered by tests.

### Bulk verification and inbox placement

`src/services/verifyQueue.ts` plus the Worker's `api/placement.php` route handle the two
slow jobs.

- **Bulk verification** runs as a durable queue, not an in-memory loop: the job
  lives in storage, each pass takes 50 addresses, and closing the tab loses
  nothing. It can be paused and resumed, and results are applied per batch — so
  stopping half way still leaves the work done so far recorded as contact
  health, with anything undeliverable suppressed. The dashboard advances it in
  the background when the settings screen is closed.
- **Inbox placement** is the only number in this module that says where a
  message *ended up* rather than what the sending server did. It emails a
  marked message to your seed mailboxes, then reads those mailboxes over IMAP
  and reports inbox, spam or not delivered per provider. Spam folders are found
  by reading the folder list and matching, because Gmail uses `[Gmail]/Spam`,
  Outlook uses `Junk Email` and cPanel uses `INBOX.spam`.
- **Seed mailbox credentials are stored server-side**, encrypted with AES-GCM
  in `crm_placement_seeds`, and never returned to the browser — the UI can only
  see whether a password is present. Each seed belongs to the account that
  created it. Use app passwords, and prefer mailboxes that exist only for this.
- A mailbox that cannot be opened is reported as such, rather than as a message
  that did not arrive: "could not look" and "not there" are different answers,
  and conflating them would report a perfectly delivered campaign as missing.

### Alerts and the help centre

`src/services/deliverabilityAlerts.ts` watches the numbers the rest of the
module reports and speaks up when one crosses a line: complaints above 0.3%,
bounces above 5%, sender score below your minimum, a blacklist listing, inbox
placement under 60%, or a single provider rejecting far more than the rest.

Two rules keep it worth reading. **Every alert says what to do** — a reading is
not an alert. And **a condition fires once per day**: a standing problem is one
problem, not one per page load.

In-app alerts always record. Email and SMS are optional and default to
critical-only. SMS is queued for the configured provider rather than sent from
the browser, because reaching Twilio directly would mean shipping the token to
the client.

**Settings → Email Deliverability → Alerts & help** also holds the help centre:
eight guides written for someone who does not know what SPF is and should not
have to, each saying what the thing is, why it matters, and what to do — in
that order. The warmup guide states plainly what a warmup network is and why
this app does not have one.

### What is not built, and why

A **third-party warmup network** — the pool of other people's mailboxes that
send, open and reply to each other — is a paid service (Mailreach, Warmbox,
Instantly). It cannot be fabricated, so it is not pretended. What is built is
self-hosted warmup: a real ramp enforced on every send, real per-provider
throttling driven by measured results, and real messages to seed mailboxes you
own. What is absent is the simulated conversation network, and the panel says so
on screen rather than implying otherwise. **SMTP mailbox probes** need outbound port 25, which most
shared hosts block; the endpoint probes for it once and the UI says plainly
whether this host can do it.

## Social Automation

One video in, a multi-platform campaign out. Upload a file or paste a YouTube
link, choose the destinations, and the module writes everything: short clips
ranked by virality, a post for each placement fitted to that platform's own
limits, a four-email sequence, SMS, a blog article and a landing page.

### How it works

1. **Wizard** — source, campaign goal, destinations, audience segments.
2. **Analysis** — with a Gemini API key the video is watched; without one a
   deterministic analyser reads the title, description and goal instead. The
   card says which happened, and no campaign is blocked for want of a key.
3. **Generation** — clips, then a post per placement, then the CRM's own
   channels. Every caption is fitted to that placement's caption limit and
   hashtag band, so nothing is written that the platform would reject.
4. **Review** — edit any piece with the limit enforced as you type; deep links
   open the richer editors (AI Shorts, Social Creator, Marketing, Websites).
5. **Schedule** — each destination is spread across its own best hours in your
   local time, one post per slot.
6. **Publish** — an assisted run, one post at a time.

### Publishing: how it really works

**There is no browser automation here, and there cannot be.** A page served
from this app cannot read or write anything inside an `instagram.com` tab —
the same-origin policy is the boundary that stops any website driving your
logged-in sessions. It also cannot read another site's cookies, so it cannot
detect whether you are signed in. Puppeteer and Playwright are Node libraries;
they drive a browser they launch themselves, which has none of your sessions.
Anything advertising "auto-fill and click Post" from a web page is either a
browser extension or a false claim. Automating these platforms also breaks
their terms of service and gets real accounts suspended.

What the module does instead — which covers most of the work — is pick the best
available handoff per placement:

| Route | Placements | What happens |
|---|---|---|
| **Prefill URL** | X, LinkedIn feed, Facebook feed, Pinterest | The platform's own documented share endpoint opens its composer with your text already in the box |
| **Web Share** | Instagram, TikTok, Facebook Reels/Stories | `navigator.share` hands the caption and media to the native app (mobile, and some desktop browsers) |
| **Manual** | YouTube, LinkedIn newsletter | Caption copied to your clipboard, media downloaded, composer opened |

You press Post. The app records what you tell it — it never claims to have
detected a live post, because it cannot.

### No setup required

There are no browser automation dependencies to install. The publish run needs
only that you are signed in to each platform in the same browser, and that
pop-ups are allowed for this site (each post opens one tab).

Optional: a **Gemini API key** in Settings → AI turns text-only analysis into
real video analysis. Everything works without it, less well.

### If you want true unattended posting

That needs the platforms' official APIs — Meta Graph, YouTube Data, TikTok
Content Posting, LinkedIn Marketing. Each requires an app review by the
platform before it will post on a user's behalf. That is a real path and the
data model already supports it: `PublishJob` carries the status, attempts and
permalink an API integration would fill in. It is not shipped because app
review takes weeks per platform, not because of a technical gap.

### Retries

A post marked as failed can be retried from the campaign dashboard. Attempts
are capped at three; past that the post keeps its caption and its place in the
plan but needs a person to look at it, rather than being retried forever.

## The marketing site

Fourteen sections, one viewport each, driven by scroll position rather than by
a scroll container per section (`useScrollScene.ts`).

Seven of them are a module of the app, and each shows **two close-ups** rather
than one whole window. That distinction is the whole point: a 1240px screen
shrunk into a column renders at about 0.26x, which shows that a screen exists
and nothing about what it does. The close-ups are cut from the running app at
560–620px and shown at ~470px — roughly 0.8x, close enough to read the numbers.
`scripts/site-shots.mjs` holds the clip regions in document pixels against a
fixed 1240x800 viewport, so changing that viewport invalidates them.

The views are a **collage**: overlapping a little, leaning opposite ways, the
hovered one coming to the front. On a phone they stack, each nudged the other
way, with the image shown at its own width and cropped by the frame so the
pixels stay 1:1. Both stay on screen at every size — an earlier swipe row put
everything after the first view behind a gesture nothing announced.

### Contrast and opacity

Two separate reasons the text was hard to read, both measured rather than
judged:

- `--text-mute` — every paragraph and caption — was **4.35:1** against the
  paper, under the 4.5:1 floor, and `--text-faint` was 2.36:1. They are 7.79:1
  and 4.76:1 now. Cards no longer name their own colours: on the dark bands the
  hardcoded `var(--text)` title measured **1.03:1** against its own background,
  which is not hard to read, it is invisible.
- The staggered entry never finished. Each line's fade ran from `-0.42 + k*0.07`
  to `0.06 + k*0.07`, so at `t = 0` — where a scene rests while you read it —
  the fifth line sat at 21% opacity and the seventh at zero. The whole staircase
  now lands by `t = -0.09`.

Each view carries a caption naming the function it shows, a sheen that crosses
it every few seconds and a live dot, all offset per view so a row never animates
in unison. All of it is removed under `prefers-reduced-motion`.

### Re-taking the pictures

```bash
node scripts/site-shots.mjs
```

It boots the app against a seeded workspace, captures every region, encodes the
WebP in the same Chromium, and writes `public/site/shots.json` with each view's
real dimensions so the page can reserve space before the image arrives.

The seed is part of the product's honesty here. Photographing a module with
nothing in it puts an empty table under a headline about what the table does, so
the workspace is seeded with campaigns, deals that are actually *won* with a
recent closing date, and meetings on the days the calendar's week grid shows.
Each of those was a real defect found by looking at the crop: an empty Marketing
screen, "Revenue won $0" beside a $113k pipeline, and a ruled but empty diary.

## The two sites

`protectedcentral.com` is a marketing page and nothing else. `app.protectedcentral.com`
is the product. They are the same Worker and the same JavaScript bundle, and the
split is made at runtime from the hostname — `src/services/hosts.ts` is the only
place that knows the two names.

| On | A visitor gets | Sign in / Sign up goes to |
|---|---|---|
| `protectedcentral.com`, `www.` | the marketing site, at every path | `https://app.protectedcentral.com/login` |
| `app.protectedcentral.com` | the login form, then the app | the router, no origin hop |
| localhost, previews, `*.workers.dev` | the marketing site at `/`, the login at `/login` | the router, no origin hop |

The third row is what keeps the thing developable: nothing about the split is
baked in at build time, so one artefact serves all three cases and a local
`npm run dev` never bounces anyone to production.

Sessions belong to the app's origin, so there is no session to find on the apex
and nothing to sign out of there. The marketing page therefore renders for
everyone, always, with no auth check in front of it.

### Making a hostname live

Both names are attached to the `crmpro` Worker as *custom domains* at the
account level. Attaching is a one-off — it is not part of a deploy, and the
deploy token deliberately has no permissions over the zone:

```bash
CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… npm run domains
```

`scripts/attach-domains.mjs` looks the zone up by name and attaches
`protectedcentral.com` and `www.protectedcentral.com`, and it is safe to re-run.
The token for it needs **Zone → Zone: Read** and **Zone → Workers Routes: Edit**
on top of what the deploy uses. Cloudflare manages the DNS for a custom domain
itself, so there is no A record to add; if a hostname is refused, something else
is usually already serving that name — a Pages project, or an A record left over
from the old host — and has to be removed first.

There are two other ways to run it, neither of which needs a token in a
terminal:

**From GitHub Actions** — the token is already a repository secret, so
**Actions → "Attach domains to the Worker" → Run workflow** does the same thing
with nothing to paste. It is manual-only, for the same reason the deploy does
not do it.

**By hand in the dashboard** — **Workers & Pages → crmpro → Settings → Domains
& Routes → Add custom domain**.

Whichever way it is run, the token needs **Zone → Zone: Read** added to it
first, to look the zone up by name; attaching is otherwise an account-level
call and does not need anything on the zone. Adding a name that still has an A
or CNAME record on it *also* needs **Zone → DNS: Edit**, because a Worker
cannot take a hostname another record already answers for — delete the record
and Cloudflare manages that name itself.

Two things the script had to learn the hard way. Its liveness check is the
account rather than `/user/tokens/verify`: a token created as *account-owned*,
which is what the dashboard hands you now, is not a user credential and that
endpoint calls it invalid while every account call it is scoped for succeeds.
And `fetch` in Node ignores `HTTPS_PROXY` unless you set `NODE_USE_ENV_PROXY=1`
— irrelevant on a CI runner, but the difference between working and a bare 403
behind a corporate proxy.

## Deployment and server-side state

Pushing to `main` in `azeem-654/calude` runs `.github/workflows/deploy.yml` on
**Node 22**: `npm ci` → both typechecks → `npm run build` with `VITE_BASE=/` →
apply any new D1 migrations → `npx wrangler deploy`. The Node version is not a
preference — wrangler 4.127 refuses to start below 22, and while the workflow
pinned 20 every run built the app and then fell over on the first wrangler
command, so nothing shipped at all. Migrations run before the deploy on
purpose: a Worker expecting a column its database does not have yet is a broken
deploy, and this ordering makes that impossible.

Nothing is uploaded anywhere. One Cloudflare Worker (`crmpro`) serves the
marketing site, the built app and every `/api/*` route, and it answers on both
**https://protectedcentral.com** and **https://app.protectedcentral.com**. See
[The two sites](#the-two-sites) for which is which.

Two GitHub secrets drive it: `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit, D1:
Edit, Account Settings: Read) and `CLOUDFLARE_ACCOUNT_ID`.

The custom domains are attached at the account level rather than declared in
`wrangler.jsonc`. Declaring them makes every deploy call the *zone* route API,
which is a separate permission, and fails the run even when the code published
fine. `npm run domains` attaches one that is missing.

### Where the state lives

All of it is in one D1 database, `crmpro`, created by `worker/migrations/`:

| Table | What it holds |
|---|---|
| `crm_data` | the per-account key/value store the app syncs into |
| `crm_users`, `crm_sessions` | accounts and their live sessions |
| `crm_mailboxes` | each customer's own SMTP/IMAP settings, password encrypted with AES-GCM |
| `crm_track`, `crm_unsubscribes` | open/click events and opt-outs |
| `crm_booking_config`, `crm_bookings` | public booking pages and guest bookings |
| `crm_meta` | signing keys and other singletons |

Passwords are PBKDF2-HMAC-SHA256 at 100,000 iterations — the ceiling the
Workers runtime will accept; it refuses higher counts outright. The format
records its own parameters, so the cost can be raised later without stranding
existing rows.

There are no files on a host, no `config.php`, no `.htaccess`, and no installer
to run: `wrangler d1 migrations apply` is the whole of setup, and the deploy
does it.


## 12-Month Content Pipeline

The plan is stored **month-by-month** (`crm_onboarding` key, `ContentMonth[]` in
`src/types/onboarding.ts`). Each month carries its own lifecycle:

```
PLAN_GENERATED ──generate──▶ GENERATING ──done──▶ AWAITING_APPROVAL ──approve──▶ PUBLISHED
                                                        ▲                            │
                                                        └────────── rollback ────────┘
```

- **Month 1 generates immediately** after launch, as a background job (resumes after reload). Later months generate on demand.
- A month's package: 5 emails, 4 SMS, a 12-post 30-day social calendar, and 4 short-video scripts — Gemini-written when a key is configured, personalized smart templates otherwise. Everything is sanitized and editable in the review screen.
- **Approving** publishes for real: an active email sequence + SMS flow in Marketing and editable, scheduled designs in Social Creator. Record IDs are kept in `publishedRefs`.
- **Rollback** deletes those records and returns the month to review with its content intact.
- Workflow controls on the dashboard widget: **Generate content for [Month]**, **Generate all remaining**, **Approve all**, **Auto-approve** toggle (new generations publish automatically), and a full **audit trail** (every generation, edit, approval and rollback with timestamp + actor).

Key files: `src/services/onboarding.ts` (storage + plan engine), `contentGen.ts`
(month generation, background jobs, publish/rollback), `csvImport.ts`,
`launchAssets.ts` (funnel/website/booking/90-day builder),
`src/components/Onboarding/` (wizard + Content Pipeline widget).

## Development

```bash
npm install
npm run dev        # Vite dev server on :5173
npx wrangler dev   # the API, on :8787 — the same Worker code that runs live
npm run typecheck  # tsc -b; a bare `tsc --noEmit` compiles nothing here
npm run build      # production build to dist/
```

`npm run dev` serves only the page. In development the app calls the API on
`localhost:8787`, so run `npx wrangler dev` alongside it for anything that talks
to the server — sign-in, sync, sending mail, bookings. `wrangler dev` runs the
real Workers runtime against a local D1, so what passes there is what deploys.

The API base is defined once, in `src/services/apiBase.ts`. In production it is
empty, because the Worker serving the page also serves `/api/*`.

Note on typechecking: the root `tsconfig.json` is a solution file (`"files": []`
plus references), so `tsc --noEmit` type-checks *nothing* and exits 0. Use
`npm run typecheck`, which runs `tsc -b`.

Optional AI: add a Gemini API key in Settings — every AI feature has an offline
fallback.

## Signing up, and how tenants are kept apart

Anyone can create an account at **app.protectedcentral.com/signup**. Each one is
an agency in its own right — that is what a customer of this product is — with
its own workspace from the moment it is created.

That made the permission model's one line wrong. It used to read:

```ts
if (user.role === 'agency') return true;
```

which was correct for exactly as long as "agency" meant the single person who
set the install up. With sign-up open, the first stranger through the door could
read every other customer's contacts, campaigns and mailboxes by naming their
workspace id. `crm_workspaces` (migration `0004`) records who owns what, and an
agency now reaches only workspaces it owns, claiming an unowned one on first
touch so an install that predates the table keeps working.

Two subtler versions of the same hole went with it. `__agency__` — the bucket
holding billing statuses and the suppression list — was one bucket for the whole
install; it is now one per agency, suffixed server-side so the client still
sends the plain name. And the workspace a browser synced into was
`acct-<timestamp>`, generated locally: guessable, and identical for two people
who registered in the same millisecond. Signing in now points the browser at the
id the *server* issued.

Sign-up is rate limited to five **created accounts** per IP per hour. Created,
not attempted: counting attempts would spend a real person's allowance on
passwords the rules rejected, and a request that fails validation is refused
anyway.

There is no email verification yet, because sending mail needs a mailbox the
install does not have until someone configures one.

## Signing in

Signing in happens on **app.protectedcentral.com**. Every way in from the
marketing site — the header, the hero, the closing panel — is a link to
`/login` there.

The first person to open a fresh install creates the owner account, and from
that moment every endpoint that opens an outbound connection requires a live
session. There is no demo login and no standing test account: a shared password
on a public site is found by bots within days, and one that also has to be
documented in a public repository cannot be kept secret at all.

Additional logins are created in **Settings → Team & Permissions**. Clients are
bound to a single workspace; the agency role sees all of them.


## Where generated content came from

Several setups create content in bulk: the business wizard plans a year of
campaigns, and a single video fans out into clips, posts, an email sequence, SMS
and a blog. After a few runs a marketing list is a pile of similarly-named
records, so everything a setup creates carries a source stamp — the origin, the
original's title, and a link back to it — rendered as a tag on the row.

| Origin | Set by | Reads as |
|---|---|---|
| `business-wizard` | the setup wizard's welcome campaigns, funnel and site | Business setup · *Company* |
| `content-plan` | each approved month of the 12-month plan | Content plan · *Theme* · Month 3 of 12 |
| `video-campaign` | Social Automation's push into the modules | Video campaign · *Video title* |

The stamp is written once at creation and never inferred from the name, because
names get edited. Records made by hand carry no tag, which is the useful
default: an untagged row means you made it.

## Blog Automation

Its purpose is one measurable thing: getting the customer's own pages to rank.
Everything in it is arranged around that, which is why the profile a portfolio
produces is not just "how do they write" but "what do they sell, to whom, which
pages have to rank, and what would someone type into Google to find them".

**Part 1 (shipped)** — portfolio intake and the ranking strategy.

Four ways in: paste, upload, a URL, or import pages from a site already in the
app. The last is the best of them: the page's URL comes along, and that is what
lets a later post link to it in context, which is the mechanism by which a blog
lifts a service page.

Out of it comes a voice profile and an SEO strategy: what the business sells,
who to, where, and topic clusters — a pillar plus the long-tail terms around it,
each with a search intent and a difficulty. All of it editable, and the project
records that a human has been through it so a rebuild cannot quietly undo their
corrections.

Two honesty rules the module holds to:

- **Difficulty is an estimate from the shape of the phrase** — how long, how
  specific, how commercial. Nothing queries Google, and the UI says so wherever
  a number appears.
- **Observed terms and suggested ones are visually distinct.** A dot means the
  portfolio actually used that phrase. No dot means it is a derived long-tail
  variant. Suggestions carry a weight of zero, which is what the UI reads.

Works with or without a Gemini key. With one, the model reads the portfolio and
every number it returns is still re-derived locally — a fabricated difficulty
presented as data is worse than an honest heuristic. Without one, the same shape
comes from reading the text.

**Part 2 (shipped)** — the month planner.

Pick a month, a cadence and the days to publish on, and it lays out one post per
keyword on real dates: only the chosen weekdays, never in the past, never two in
one slot. If the month has more slots than the strategy has keywords, it says so
rather than padding.

Three rules decide whether a plan is worth having, and they are enforced when it
is built *and* re-checked against the plan as it stands, because every part of it
is editable and an edit can break them:

| Rule | Why |
|---|---|
| One keyword per post | Two posts on the same phrase compete in the index. Google picks one and the other's work is wasted. |
| A cluster's pillar publishes first | Supporting posts link up to their pillar. If it is not out yet, those links point at nothing. |
| Every post links to a page that earns | A post with no internal link ranks for itself and moves no revenue. |

Selection is depth-first: a cluster's pillar, then its easiest supporting
long-tail, before moving on. Breadth-first — one post per cluster — produces a
month of pillar posts on the hardest terms in the strategy, which is the worst
possible opening for a site with no authority. On the test project that change
took the month's average estimated difficulty from 50 to 23.

Nothing is written until the plan is approved, and approval is refused while any
rule is broken.

Parts 3 to 5 — the writing, the images and publishing to a connected domain —
are not built yet, and the module says so on screen rather than implying
otherwise.
