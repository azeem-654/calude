# Who we are up against, and what the market actually buys

*Researched September 2026. Every figure below is **vendor- or agency-published**
rather than independent research, and is attributed. Treat all of it as the
industry's own marketing until measured on our own installs — which is the
reason the product shows these as ranges and labels them assumptions.*

---

## The short version

Three findings changed what we built.

**One.** The market does not lack automation platforms. It lacks the confidence
that the one it bought is doing anything. The most consistent complaint about
the market leader is not a missing feature — it is that you are handed a canvas
and left to work out what to put on it.

**Two.** The value is concentrated in a handful of automations, and everybody
knows which. Answering an enquiry fast, texting back a missed call, asking for a
review, waking a dormant list. A library of eleven thousand templates is not
eleven thousand times more useful than a library of eighteen fitted ones.

**Three.** Nobody in this category shows you whether a workflow is *working*.
They show you that it is switched on. Those are different questions and only one
of them is the one being asked.

Our answer to all three is the same: fewer, better-fitted templates, previewed
in full before you commit; and progress counted from real runs rather than
drawn on a timer.

---

## The field

### GoHighLevel — the one we are actually replacing

The direct competitor. Sold to agencies who resell it white-labelled, which is
our model too.

**What they get right.** Breadth. Workflows, pipelines, sub-accounts, phone
numbers, email authentication, SaaS mode, snapshots, an AI suite. If a small
agency needs a thing, it is in there somewhere.

**Where their users hurt.** That same breadth. Agencies on r/gohighlevel put the
time to feel genuinely competent at **sixty to ninety days**, and one documented
case describes **thirty to forty hours on initial setup alone**, with email open
rates falling from 35–40% to 9% after a migration because authentication was not
finished before sending at volume ([The Stack Insiders,
2026](https://www.thestackinsiders.com/blog/gohighlevel-reddit)).

That last detail is worth sitting with. A platform let somebody send at volume
from an unauthenticated domain and said nothing. The cost landed weeks later, in
a metric they had to go and look for.

**What we take from it.** Two things. Do not ship a feature that can fail
silently — this is already the house rule and it is the single biggest
differentiator available to us. And do not make somebody spend forty hours
before the product does anything: a new project should produce something
readable on day one.

### Zapier — the usability benchmark

**What they get right.** The sequential trigger-then-actions structure is
learnable in an afternoon, and the template gallery is the model everybody else
copies: find a template among many, understand what it does *before* creating
anything, and — in an existing workspace — see exactly what will change before
applying it ([Microsoft Learn's write-up of the same
pattern](https://learn.microsoft.com/en-us/azure/logic-apps/create-publish-workflow-templates)).

**Where it costs.** Per-task pricing. A ten-step workflow is ten tasks on
Zapier and one execution on n8n ([Cipher
Projects](https://www.cipherprojects.com/blog/posts/n8n-vs-zapier-vs-make-automation-comparison/)).
And the rigid trigger-then-actions shape makes genuinely branching logic
awkward.

**What we take from it.** The preview discipline, wholesale. Our wizard draws
the entire workflow, names what must be connected, and only then offers the
button. Nothing is added by browsing.

### n8n — the library problem

**What they get right.** Execution-based pricing, self-hosting, and enormous
reach: **11,741 community templates as of August 2026, about 8,000 of them AI**
([ConnectSafely](https://connectsafely.ai/articles/n8n-templates-workflow-automation-examples)).
Over 75% of their customers use the AI nodes.

**Where it costs.** Eleven thousand templates is a search problem wearing a
library's clothes. And the community collection files by *department* — Ops,
Sales, Marketing, Engineering, HR — while the official one files by *app*.
Neither matches how somebody arrives, which is with a symptom.

**What we take from it.** File by the **job to be done**, not the app or the
department. Nobody opens this thinking "I need a condition node"; they open it
thinking "people ring and we miss it". And search the *problem*, not just the
name — "missed calls" has to find a template called "Text back a call nobody
answered", which it did not until we pinned it with a test.

### Make — the middle

Flowchart-style visual editing, roughly 60% cheaper than Zapier, and generally
placed between Zapier's simplicity and n8n's power
([Parseur](https://parseur.com/blog/zapier-n8n-make)). Not a direct competitor
for our customer, who is a plumber's marketing agency rather than an ops team.

### ActiveCampaign — the one that already ships recipes

Worth noting because they do the thing this document argues for: pre-built
win-back automations that segment dormant contacts by engagement history and
run multi-channel reactivation. The lesson is that fitted recipes are a
differentiator somebody already proved.

---

## What the numbers say people should automate

Ranked by what the published figures claim is worth most, first.

### 1. Speed to lead

- Leads contacted **within five minutes** are reported as roughly **21× likelier
  to convert** than at thirty minutes.
- **78% of deals** are said to go to whoever responds first.

([Call Loop](https://www.callloop.com/blog/marketing-automation-for-small-business),
[Branding Marketing Agency](https://www.brandingmarketingagency.com/blogs/missed-call-text-back-automation/))

This is the single largest lever in the category and it is not close. It is
first on our shelf for that reason, and the shelves are deliberately not
alphabetical — A–Z would open the library on "Appointments".

### 2. Missed calls

- **~28% of all business calls** go unanswered; **home services miss ~62%**,
  professional services ~54%, retail ~48%.
- After hours, small businesses miss **close to 100%**.
- **86% of callers who reach voicemail hang up** rather than leave one.
- SMS open rates ~98%, mostly read within minutes.

([CallMissed](https://www.callmissed.com/blog/missed-call-text-back-automation-small-businesses),
[Valley Marketing Group](https://thevalleymarketinggroup.com/blog/missed-call-text-back-service-business-roi/))

**And here is where we have to be honest.** This app has no phone system. We
cannot detect a missed call. Our template fires from a tag, and it says so
before you add it — the `needs` line reads "this app has no phone system, so the
tag comes from your own, or from you adding it by hand". Shipping it as though
it hooked into telephony would be exactly the silent failure GoHighLevel's users
complain about.

### 3. Database reactivation

- Home services campaigns: **2–6% response email-only**, **5–11% SMS-only**,
  **8–15% multichannel**, with **3–5% of dormant contacts** becoming revenue
  opportunities.
- Agencies claim **18–32% of annual revenue** can be sourced from existing
  customer and dormant lead lists without buying a lead.
- Segmented campaigns are claimed to beat one-message-to-everybody by 40–60%.

([Prestyj](https://prestyj.com/blog/database-reactivation-response-rates-home-services-2026))

The cheapest list anybody owns is the one they already have. Our template says
plainly that it only works *once* per list, which the vendor write-ups tend to
leave out.

### 4. Reviews, appointments, pipeline

Lower-ceiling and steadier. Reminders and no-show recovery pay back in kept
slots; review requests pay back because most businesses ask nobody at all. The
research is thinner here and we have not dressed it up — those templates carry
no evidence block rather than a borrowed number.

---

## What none of them do well, and what we did about it

### "Is it actually working?"

Every platform in this category shows a workflow as **on** or **off**. None
shows whether anybody is in it. A live workflow that has never been triggered
looks identical to one running fifty people through a week.

**What we built.** A step says how many people are standing on it *right now*,
counted from live runs. A workflow header says how many are in it and how many
finished — and says **nothing at all** when the answer is none, rather than
showing a zero dressed up as progress. Under the tabs, a rail of what the
project has actually made: each bubble a record that exists, naming the module
it lives in, clicking through to it.

The per-step "done" count was deliberately dropped. The log holds only a
`run_id`, so resolving the workflow is a join over a fortnight of every step of
every run, on every poll of every card — and that class of query is what put
this account at 77% of Cloudflare's daily D1 limit. A number is not worth an
outage.

### "What do I build?"

The complaint under the sixty-to-ninety-day learning curve. Our wizard asks
*how you want to work* before showing anything: a template, a sentence for the
AI, or an empty canvas. The template route files by symptom, searches by
symptom, and previews in full.

### "What will it cost me to find out this doesn't work?"

Every template states what must be connected **before** it is chosen, and every
outcome is a range labelled an assumption. A template that texts on a workspace
with no SMS provider says so on the preview, not in a delivery log a week later.
There is a test that fails the build if a template sends by a channel it does
not declare — it caught two on the first run.

---

## Where we are genuinely behind

Stated plainly, because a competitive document that only lists strengths is a
sales deck.

- **No telephony.** No call tracking, no missed-call trigger, no IVR.
  GoHighLevel's phone system is a real product and ours does not exist.
- **No native integrations directory.** Zapier connects to thousands of apps;
  we connect to the ones we wrote. For our customer — an agency running local
  trades — this matters less than it sounds, but it is a real gap.
- **No conditional splits beyond one condition per node.** Make's multi-branch
  editor is genuinely better for complex logic.
- **Small library.** Seventeen templates against n8n's eleven thousand. We think
  fitted beats numerous for this buyer, but it is a bet, not a fact.

## Where we are genuinely ahead

- **Nothing pretends to work.** A provider that is not connected says so; a
  partial failure is reported as partial; a feed with nothing new is recorded as
  *skipped*, not *done*. This is a codebase rule, enforced by tests, and it is
  the direct answer to the loudest complaint about the leader.
- **Progress counted from records, not timers.** Every number on the board can
  be pointed at.
- **The AI is included and is the operator's.** Customers are not asked for a
  key. The bill scales with customers — that is a deliberate trade, not an
  oversight.

---

## Sources

- [The Stack Insiders — what agencies say about GoHighLevel on Reddit, 2026](https://www.thestackinsiders.com/blog/gohighlevel-reddit)
- [CallMissed — missed call text back automation, 2026](https://www.callmissed.com/blog/missed-call-text-back-automation-small-businesses)
- [Valley Marketing Group — missed call text-back ROI, 2026](https://thevalleymarketinggroup.com/blog/missed-call-text-back-service-business-roi/)
- [Call Loop — marketing automation for small business, 2026](https://www.callloop.com/blog/marketing-automation-for-small-business)
- [Branding Marketing Agency — missed call text back guide](https://www.brandingmarketingagency.com/blogs/missed-call-text-back-automation/)
- [Prestyj — database reactivation response rates, home services, 2026](https://prestyj.com/blog/database-reactivation-response-rates-home-services-2026)
- [ConnectSafely — n8n template library size, 2026](https://connectsafely.ai/articles/n8n-templates-workflow-automation-examples)
- [Parseur — n8n vs Zapier vs Make, 2026](https://parseur.com/blog/zapier-n8n-make)
- [Cipher Projects — n8n vs Zapier vs Make pricing, 2026](https://www.cipherprojects.com/blog/posts/n8n-vs-zapier-vs-make-automation-comparison/)
- [Microsoft Learn — workflow template gallery patterns](https://learn.microsoft.com/en-us/azure/logic-apps/create-publish-workflow-templates)
- [Agency Level 5 — GoHighLevel automation guide, 2026](https://www.agencylevel5.com/en/blog/gohighlevel-automation-complete-guide-2026)
