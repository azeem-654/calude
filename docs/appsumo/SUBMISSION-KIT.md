# AppSumo submission kit

Everything to paste and upload when submitting Protected Central to AppSumo
(`partners.appsumo.com/self-submission`, then the listing step in the Partner
Portal). The wording below comes from what the product does, taken from the live
site on 2026-11-04. It has no invented numbers, reviews or customer counts, and
AppSumo's listing policy requires the same.

Items marked **YOU DECIDE** are the owner's decision. They are business terms,
not copy.

---

## Before you submit: what reviewers will check

Researched 2026-11-04 from AppSumo's own pages: *Quality standards*
(sell.appsumo.com/p/quality-standards), *Our application vetting process*
(help.appsumo.com article 701), the *Partner Listing & Updates Policy*
(appsumo.com/partner-terms/listing-policy) and the *Licensing API v2* docs
(docs.licensing.appsumo.com). AppSumo says roughly 1 in 10 products pass its
testing. It runs every tool through a 25-point checklist and scores it on
UI/UX, features, integrations and pricing. The deciding question is **"Does
the tool actually do what it says it does?"** After the contract, unaffiliated
testers ("Beta-lings") check that again before launch.

### Their standards, and where we stand

| AppSumo standard (their words) | Where we stand | What to do |
|---|---|---|
| **"Does the tool actually do what it says?"** Reviewers test with **working test accounts** you supply, plus a **demo or output URL** showing the core output | The listing leads with AI Autopilot and AI Prospecting. Prospecting needs the Google Maps key and the free directory on **app.protectedcentral.com** (OWNER-CHECKLIST 23, 27, 30). Without them, a reviewer's first search finds nothing | **Blocker.** Do 23, 27 and 30 on live, then run one prospect search yourself as a customer would. See *Reviewer test script* below |
| **Support**: "Can this company actually support the customers it acquires?" and lifetime support for lifetime buyers | **Done:** `support@protectedcentral.com` exists (2026-11-04) and is in the site footer, /changelog and /appsumo. The in-app help button is still off (OWNER-CHECKLIST 16) | Switch on the help button (item 16) |
| **Active development**: "active roadmaps, changelogs, and responsive teams"; a tool with no recent updates is "not making the cut" | **Done:** a public changelog at **protectedcentral.com/changelog** ("What's new", linked in the site footer), with only dated, shipped releases | Add the newest release at the top whenever one goes live (`src/components/Site/changelog.ts`) |
| **Real founders**: "Founders must publicly put their name on the product"; refusing is a red flag | **Done:** "Founded by Azeem Sattar" in the site footer, and on /changelog and /appsumo (2026-11-04) | Optional: a photo or LinkedIn link makes it stronger |
| **Own product**: "PLR, white-label, and resale products are not accepted" | We are our own code, built in-house. But the first draft of this listing said "white-label for agencies" next to "alternative to GoHighLevel". Many GoHighLevel "SaaS-mode" rebrands apply to AppSumo, and reviewers know the pattern | Say plainly in the application: *"Protected Central is our own software, written and run by us — not a rebranded platform. Agency mode lets an agency put its own brand on client workspaces."* The copy below now says it that way |
| **"No AI wrappers or early-stage tools"**; "vibe-coded MVPs pretending to be finished products" are rejected | The product does a lot of real work beyond the AI: CRM, sending from your own mailbox, booking pages, a video engine and a server cron | Lead the demo with what *runs*: the Autopilot board after a day, a booking page, a sent sequence. Not only the AI chat |
| **No "coming soon"** features in the listing | The app shows "not connected" honestly and never says "coming soon" (checked 2026-11-04) | Keep the listing to what works on live today |
| **Viability**: runway, revenue model, paying customers, real reviews | Only you can answer | Answer truthfully. AppSumo checks for fake testimonials, and so does our own rule |
| **Pricing**: "lower than anywhere"; no hidden fees or unclear caveats | The deal tiers must sit below the $97/$297 monthly plans for the same allowances | Check that each tier's yearly value beats the monthly plan |
| **120 days live**; lifetime updates for lifetime buyers; previous buyers get new features at no cost | The deal tiers are plans of kind `deal`, so every new feature reaches them automatically | Nothing to do |
| Privacy Policy and Terms (linked from the listing) | **Done:** published, and the owner confirmed the lawyer's review (2026-11-04) | Nothing |
| The listing video | **Done:** the owner approved the voiceover as it is (2026-11-04) | Optional: a 2–3 minute cut, which AppSumo buyers tend to prefer |
| A deal launch brings traffic to the owner account's door | Master password and 2-step sign-in still open (OWNER-CHECKLIST 3, 8) | Settings → Security |

### Reviewer test script (put in the application's notes)

Testers score what they can reach in a few minutes. Give them a path:

1. **Sign up** at https://app.protectedcentral.com/appsumo with one of the codes
   you give them. Tier 1 applies at once; Plan & billing shows "AppSumo
   lifetime deal".
2. **AI Autopilot → New business workspace**: type one sentence, e.g. "Get
   more booked appointments for a dental clinic in Austin". It asks only what
   it could not work out, then shows the blueprint. Approve it.
3. **AI Prospecting**: "dentists in Austin, Texas with a website" → leads with
   the email each one publishes on its own site, each with its source.
4. **Connect a mailbox** (their own Gmail or Microsoft 365) → a sequence
   step starts as a draft. Nothing sends until they approve it.
5. **Booking page**: open its public link. This is the **demo/output URL**
   AppSumo asks for, so publish one from your own account and paste its link.
6. **Redeem a second code** on /appsumo → the tier moves up to Tier 2.

Before you send it, walk the script yourself on live as a fresh customer
account. Any step that fails is the one their tester will report.

## Application form (self-submission)

**Product name:** Protected Central

**Website:** https://protectedcentral.com

**Sign-in / app:** https://app.protectedcentral.com

**Category:** Marketing & Sales → CRM / Marketing automation
(secondary: Lead generation, Agency tools)

**Stage:** Live, paid product (not beta). Self-serve plans at $97 and $297 a
month with a 7-day free trial and no card required.

**One-line description (tagline)**, under 80 characters, three options:

1. Describe the outcome — AI builds and runs your CRM, follow-up and marketing.
2. The AI-built CRM: say what you want to grow, approve the plan, it runs.
3. CRM, prospecting and marketing automation that AI builds and runs for you.

**Who it's for:** small businesses (local services, clinics, trades, shops) and
the marketing agencies that serve them.

**Alternative to:** GoHighLevel, HubSpot Starter, ActiveCampaign, Zapier/Make
(for marketing workflows).

**Founder:** Azeem Sattar.

**Built by:** in-house, on our own code. Not a rebranded or white-labelled
platform (AppSumo does not accept those, so say it up front).

**Support plan:** in-app help widget (chat, tickets, screen sharing) plus a
support email: support@protectedcentral.com. Founder-run strategy calls on
weekdays, 09:00–17:00 New York time.

**Changelog:** https://protectedcentral.com/changelog

---

## Listing copy

### Headline
**Describe the outcome. AI builds the system.**

### TL;DR (5 bullets)
- Tell it what your business should accomplish (more leads, daily content,
  follow-up that never slips) and AI Autopilot builds the workflows and runs
  them on the server, whether or not you are logged in
- AI Prospecting finds the businesses you sell to, reads the email each one
  publishes on its own site, and checks it before you send
- CRM, pipeline, email campaigns, booking pages, websites and funnels, social
  posts and blog articles, all in one login
- Nothing sends unasked: every email or text starts as a draft until you
  approve it
- Agency mode: a workspace per client, under your own brand and domain

### Overview (paste as the product description)

Protected Central is a CRM and marketing-automation platform where you describe
the result you want and AI builds the system to get it.

Say it in a sentence — typed, spoken, or by handing over your website and
files. **AI Autopilot** asks only the questions it could not answer itself,
then shows you a blueprint: every workflow, every step, each fork labelled Yes
or No. You change it in a sentence and approve it before anything exists.
After that it runs on the server every five minutes, and its board shows what
it did and what is waiting for your approval.

**AI Prospecting** turns "real estate agents in Richmond, Virginia with a
website" into a list of leads you can reach. It searches business directories,
verified company registers and Google Maps. It reads the email address each
business publishes on its own website, never a guessed firstname@, and checks
the format, domain and mail server before you send. Every lead records where it
came from and when it was found. A business workspace can repeat the search
every day on its own.

Everything else a small business or agency runs on is in the same login:

- **CRM & pipeline:** contacts, deals and a pipeline board
- **Email & SMS:** campaigns and sequences sent from your own mailbox and
  domain (Gmail, Microsoft 365, or one of the many sending services it
  connects to), with Twilio for texts
- **Content:** social posts with images in your brand colours for Facebook,
  Instagram, LinkedIn, X, TikTok, Pinterest and YouTube, and SEO articles
  published to WordPress on a schedule
- **Bookings:** your own booking page, reminders before each visit, and a
  rebooking message for no-shows
- **Websites & funnels:** pages whose forms drop leads straight into the CRM
- **Reviews:** Google reviews, with replies posted back
- **Support:** a help widget with chat, tickets and screen sharing
- **Agencies:** a workspace per client under your own brand, onboarding
  that runs itself, and reports clients can open without a login

### Key features (one line each, for the features block)

1. **AI Autopilot:** describe the outcome, approve the blueprint, it runs
2. **33 ready-made workflows**, organised by the problem they solve: missed
   calls, quotes gone quiet, reviews, daily posts
3. **Workflow canvas:** every branch drawn the way it runs, and any step can be
   edited in place
4. **AI Prospecting:** leads found live, with each email address checked
5. **Campaigns and sequences** from your own mailbox, stopping when somebody
   replies
6. **Social and blog content** in your brand colours, each piece waiting for
   your approval
7. **Booking pages** with reminders and rebooking
8. **Websites and funnels** connected to the CRM
9. **Agency mode** with client sub-accounts and logins under your brand
10. **Guardrails:** you choose what each business workspace may do on its own

### Integrations (only ones the code actually calls)

Google (sign-in, Calendar, Meet, Maps, Business Profile, Gmail), Gemini,
Microsoft 365, Stripe, Creem, Cloudflare, Twilio, WordPress, Printful, Brevo,
Resend, SendGrid, Mailgun, Mailjet, Postmark, ActiveCampaign, SMTP2GO, Mailtrap,
Hunter, ZeroBounce, MillionVerifier, Geoapify, OpenStreetMap, Companies House,
Openprovider, Porkbun, Migadu, YouTube.

Writes content for: Facebook, Instagram, X, TikTok, LinkedIn, YouTube and
Shorts, Instagram Reels, Pinterest, WordPress, Google Business Profile.

---

## Images: `docs/appsumo/images/`

All are 1920×1080 JPGs (16:9), except `logo-512.png`, a square with a
transparent background. Each image shows the running app with the demo
workspace the site's own screenshots use, and its header says "Screens show a
demo workspace with example data".

| File | Headline |
|---|---|
| 01-autopilot-board.jpg | AI Autopilot runs your business on the server *(use as the cover)* |
| 02-describe.jpg | Describe the outcome. AI builds the system. |
| 03-blueprint.jpg | Approve the blueprint before anything exists |
| 04-prospecting.jpg | AI Prospecting: say who to sell to |
| 05-pipeline.jpg | CRM pipeline, contacts and deals |
| 06-social.jpg | Daily content in your colours |
| 07-campaigns.jpg | Email campaigns from your own mailbox and domain |
| 08-sites.jpg | Websites and funnels, built in |
| 09-booking.jpg | A booking page of your own |
| 10-agency.jpg | Run agency clients under your own name |
| 11-tickets.jpg | Support tickets and live help |
| 12-revenue.jpg | Analytics from lead to revenue |
| logo-512.png | Logo |

To rebuild them after the site's screenshots change, run
`node docs/appsumo/compose-images.mjs` from the repo root.

## Video

- **File:** `public/site/launch/launch-16x9.mp4` (1920×1080, 5 min 31 s,
  23 MB, captions in `captions.vtt`). Live at
  https://protectedcentral.com/site/launch/launch-16x9.mp4
- **Vertical version:** `launch-9x16.mp4`
- **Poster frame:** `poster-16x9.jpg`
- AppSumo usually takes a YouTube or Vimeo link, so upload the video there
  unlisted and paste the link.
- The voiceover is approved as it is (2026-11-04). AppSumo buyers tend to
  prefer 2–3 minutes; a shorter cut can be made from the same footage.

---

## Deal terms: YOU DECIDE

AppSumo negotiates the structure with you. Lifetime deals are common, but annual
and other structures are possible.

**What a lifetime deal costs us.** A lifetime buyer pays once, but these
allowances cost the operator every month, for good:

- AI requests and AI-written content (Gemini key)
- AI Shorts, recordings and video rendering
- Prospects found (Geoapify and Google Maps credits)
- Storage

**Recommended structure:** each tier maps to an existing plan's features. Give
lifetime buyers lower monthly AI, video and prospect allowances than the
monthly plans, or require them to connect their own AI key (the app already
supports one AI key per workspace). Then a one-time payment never turns into a
cost that never ends.

A starting shape to fill in. Numbers are set in `worker/src/lib/allowances.ts`
only, never here:

| | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| Features | Advanced | Advanced | Scale |
| Business workspaces | ? | ? | ? |
| Client sub-accounts | ? | ? | ? |
| AI requests / month | ? (or own key) | ? | ? |
| Prospects / month | ? | ? | ? |
| AppSumo price | $? | $? | $? |

AppSumo's standard terms to agree to: lifetime access to the plan bought, codes
redeemed within 60 days, AppSumo's 60-day refund window, and future updates for
that plan.

## Redemption: codes or AppSumo's Activate button

Both are built. Use whichever AppSumo's **Redemption** step asks for. AppSumo's
current partner docs present **Licensing** (webhooks + OAuth) as the way
buyers activate. Codes still work wherever AppSumo accepts a code file.

### Licensing: AppSumo's Activate button (built 2026-11-04)

The buyer presses **Activate** on AppSumo and lands on our page with their
tier. There is no code to copy. Refunds, upgrades and downgrades arrive by
themselves; AppSumo forbids changing a license by hand.

1. In the Partner Portal → your product → Licensing, enter:
   - **Webhook URL:** `https://app.protectedcentral.com/api/appsumo-webhook.php`
   - **OAuth Redirect URL:** `https://app.protectedcentral.com/api/appsumo-oauth.php`

   Both validate at once: the webhook answers AppSumo's test POST and the
   redirect answers its bare GET.
2. Copy the **API key** shown there. In Cloudflare → Workers & Pages →
   `crmpro` → Settings → Variables and Secrets → Add → type *Secret*, name
   `APPSUMO_API_KEY`. Do the same for `APPSUMO_CLIENT_ID` and
   `APPSUMO_CLIENT_SECRET`, which AppSumo shows once both URLs validate.
   They never go in the database and are never shown in the app.
3. Signed in as the owner, open **app.protectedcentral.com/appsumo**. The
   *Activate button* card ticks each secret, shows the last signed webhook,
   and says so in red if one was ever refused for its signature.
4. Make a test purchase from the Partner Portal and press Activate. You should
   arrive at `/appsumo` signed up with the tier you bought.

The tier comes from AppSumo's `tier` (1–3), mapped to AppSumo Tier 1/2/3 in
`allowances.ts`. Add-ons (`parent_license_key`) are recorded and never counted.
No add-on is sold.

### Codes

- **Redemption URL:** `https://app.protectedcentral.com/appsumo`. It shows
  what each tier includes, takes the code, and walks a new buyer through
  creating an account. The code is kept in their browser while they sign up,
  then the page reopens with it filled in.
- **Codes for AppSumo:** signed in as the owner, open `/appsumo` and use
  *Make codes*. The CSV downloads once; upload it at AppSumo's Redemption step.
  If AppSumo gives you its own codes instead, use *Import AppSumo's codes*.
- **Stacking:** each extra code is redeemed on the same page, or from Plan &
  billing → *Redeem an AppSumo code*.
- **Refunds:** paste the refunded code under *A refunded code*. The buyer's
  tier drops by one, and with no codes left their AppSumo plan ends.
- **For AppSumo's reviewers:** give them two or three codes from your file.
  They can sign up, redeem one, and see the tier applied at once. This works
  whichever model the listing uses.
- **Stacking instructions** for the Pricing tab: "After your first code is
  redeemed, open app.protectedcentral.com/appsumo (or Plan & billing →
  Redeem an AppSumo code) and enter each extra code — your allowances go up at
  once."
