# Connected searches: an AI Prospecting search as a project's lead source

Written 2026-10-07.

## What a customer does

1. **Search.** In AI Prospecting, search for the businesses they want, for
   example "dentists in New York City with a website", and look at the results.
2. **Connect.** Press **Connect to AI Autopilot** in the results bar, or in a
   search's "…" menu in the history.
3. **Answer five questions.** Each has a default that works:
   - **Which project.** An existing one, or a new one made on the spot.
   - **The workflow.** Its name, and the search it stays linked to: what, where,
     whether a website or phone is required, and any exclusions.
   - **When.** Every day, weekdays, weekly, custom days or manual only, from a
     chosen hour in the customer's own time zone.
   - **How many.** The number of **verified** leads a run should add. 40 means
     40 that passed every check, not 40 records. A run examines as many
     candidates as that takes, within a ceiling, and says so if it falls short.
   - **How strictly to check.** Recommended or Strict, a minimum confidence
     (85% by default), and optional rejections in Advanced.
   - **Where leads go.** The CRM always. Then a list, tags, a team member, an
     opportunity in a pipeline, and the next workflow in the same project
     (an email outreach, for example).
4. **Activate.**

The same wizard opens from a project: **Connect Prospect Search** on its
Prospects tab or Workflows tab. That works on a brand-new project too.

## What the project shows

- **Prospects tab.** One card per connected search, showing:
  - the schedule, the target, and the last and next run;
  - today's progress, e.g. "12 / 40";
  - the candidate being checked right now, check by check;
  - what happened to the last few: "✓ Verified · 92% · Added to CRM · Added to
    NYC Dentists · Sent to Dental Outreach", or "Turned away — on your
    suppression list";
  - turn-aways counted by reason.

  The card also has buttons to view the search, run now, pause, open settings
  and disconnect, plus a box for typed instructions such as "Change it to 25
  per day", "Only accept leads above 90% confidence", "Pause this prospecting
  source", "Start these leads in my email outreach workflow" and "Connect my
  NYC Dentists search".
- **Overview.** "Prospecting today": verified leads per source and in total.
- **Workflows tab.** The source drawn as what it does: trigger, search, find
  candidates, verify, duplicate check, suppression check, confidence. Below
  that, the YES branch (add to CRM, then tag, opportunity, next workflow) and
  the NO branch (reject, then find a replacement). **View Prospect Search →**
  opens the search itself.
- **Back in AI Prospecting.** A connected search says **Autopilot connected · N
  workflows**, with each connection's project, workflow, schedule, target and
  status, and buttons to view, manage or pause it.

## What makes it safer, and what it does not do

These are controls, not a legal guarantee. Whether a given use of business
contact data is lawful depends on where the customer and the recipients are,
and on the source's terms; that is a question for a lawyer.

- **Only sources whose terms allow it run on a schedule.**
  - Google Maps never does: its terms forbid keeping results, so a Google
    search connects through business directories instead, and the wizard says
    so.
  - The Lead Directory (your own files) is not an AI Prospecting source at all.
- **You can hold a source back.** Settings → Platform services → **Prospect
  sources**: on, kept internal (you only) or off, per source. Searches,
  connections and runs already going respect it at once.
- **Real verification, never a guessed address.**
  - Only addresses the business published (on its own site or in the directory)
    are used.
  - The domain and its mail server are checked; with a connected verifier,
    Strict also checks the mailbox.
  - **Confidence is the sum of checks that actually ran**, and the screen lists
    the points.
- **Duplicates and opt-outs are refused, never re-examined.** Anyone already in
  the CRM or the project, on the suppression list, or unsubscribed is turned
  away. A rejected business is kept with its reason, so no later run examines it
  again.
- **Data minimisation.**
  - Customers see verified leads; candidates appear only as counts and reasons.
  - After 30 days, a rejected business's address, phone and street are cleared.
    Its name and the source's id stay, so it is never examined twice.
- **Provenance.** Every lead carries the search, the source and its licence, and
  the date it was found, on the contact itself.
- **Limited exposure.**
  - At most 100 verified leads a run, with a ceiling on searches and websites
    read per run.
  - No bulk export of candidates.
  - An ended trial stops it.
- **Audit trail.** Every change to a connection (connect, target, schedule,
  bar, pause, disconnect, a typed instruction) is logged with who made it, on
  the source card's "What it did" list.
