<!-- Moved from CLAUDE.md, word for word: read this before working on prospect search, ai prospecting, the lead library, daily finders and connected searches. -->

## Prospect search — the free directory first, Google Maps on the owner's key

**The free directory is the default** (`source: 'free'`; the AI Sales Agent
sends `'auto'`, which is the same, and falls back to Google only when it found
nothing). `lib/geoapify.ts`: OpenStreetMap's businesses through **Geoapify**
on the owner's key (`crm_install_providers` kind `geoapify`, card on Platform
services, `routes/geoapify.ts` owner-only, proved on save). A trade is mapped to
Geoapify's categories by `categoriesFor` (only published keys — an unknown one
fails the request); the place is geocoded once and searched inside its own
boundary. Geoapify's terms allow storing, so searches and places are cached a
fortnight in `crm_prospect_cache`. Credits are counted per UTC day in
`crm_meta` and stop at 2,800 (free plan: 3,000) — past that, or with no key, a
refused key, an outage, or a trade with **no** Geoapify category (plumbers,
roofers: Geoapify has none), the search goes to Overpass (`searchProspects`,
singularised word), also free. Attribution comes back with every answer.
Overpass cannot search a whole state (it times out), and a place like
"Richmond, Virginia" is the area named Richmond *intersected with* Virginia —
`lib/regions.ts` knows the US states, the UK nations, the larger
Canadian/Australian provinces and a few whole countries (Australia, the UK, the
US, Canada, New Zealand, Ireland — never used to narrow a "town, country"
search, `splitPlace`) with their largest towns, so a region is
searched at its largest town (the answer's `note` says so), `expand_place`
answers without a Geoapify key, and a finder's `save` stores a region as its
towns. Common trades are matched to OSM's own tag values (`osmTagsFor`:
"real estate" → `estate_agent`), not the typed words.
**Google's terms forbid saving business names and addresses**; the Google tab
remains for customers who ask, budgeted as below. `npm run test:platform`
covers the free directory against a Geoapify mock (`GEOAPIFY_BASE`).

**Prospecting** (`/prospecting`, under Customers; `components/Prospecting`) is
the page of its own; Contacts → Find businesses is the same code
(`useProspectSearch.ts`, `ProspectParts.tsx`) in a dialog. Imports go into a
**contact list** (`crm_contact_lists`, the Contacts model, synced): deduped by
email, Google place or name + phone/website, adding existing contacts to the
list rather than copying them. A list has `kind` 'cold' | 'owned' and
`listKindOf()` calls it cold if it says so or holds any `prospect` — the
sendingPlan distinction. A list can be a campaign's audience
(`/marketing?new=campaign&list=<id>`) or an Autopilot project's
(`brief.audience.listId`, `/autopilot?new=1&list=<id>`, hand-picked lists only —
the server cannot evaluate a smart list's rules); `autopilotTick` re-reads the
list itself, enrols only its people, cold ones 20 at a time and each batch
waiting for approval whatever the guardrail. `npm run test:prospecting`
(self-contained: Geoapify mock :8838, wrangler :8908, fresh D1).

### AI Prospecting — one sentence, checked addresses

`/prospecting` is **AI Prospecting** (`components/Prospecting/AiProspecting.tsx`,
`AiParts.tsx`, `aiProspecting.css`; the judgement in `services/aiProspecting.ts`).
**One sentence, no boxes, no tabs.** A sentence ("dentists in Leeds with a
website") is all the customer types — there is no kind-of-business box, no
town box and no row of source tabs (the owner removed them). `readAsk` /
`parseAsk` split it at the last in/near/around; "with a website/email/phone"
becomes a filter, not a search term; and the words that pick a source are
read and taken out: "registered companies", "limited companies", "Companies
House", "company register", "with (their) directors" → `register`; "with
reviews/ratings", "on Google (Maps)", "top-rated" → `google`; anything else →
the free directory. `chooseSource(asked, availability)` (pure, in
services/aiProspecting.ts, `test:aiprospecting`) then decides what is
actually asked: the register only with the owner's Companies House key, Google
only where it is on — otherwise the free directory, **with a note saying so**
(under the box before the search, beside the source label after). What was
understood shows under the words as chips (trade · place · narrowing ·
source; pressing one selects those words to retype). A sentence missing its
place or its trade is **asked about under the box** (`askProblem`, with
recent places or common trades as one-press fixes) and never searched blind.
It runs as `useProspectSearch.ask`, a plan whose steps are real calls, shown
as they run with what they found: search, read every website, free-check every
address. The sentence box carries
`data-field="prospects.ask prospects.trade prospects.place"` — fieldGuard
matches one name of several — so a server refusal naming the trade or the
place is never a dead end, and its words go under the box with how to say it
in the sentence (`errorField` on the hook). Enter searches, Shift+Enter is a
new line; the box grows. The dashboard's `ProspectingPanel` hands a sentence
over as `/prospecting?q=`.

**Two screens** (`AiStart.tsx`, `AiResults.tsx`): *New search* is **prompt
first** — the headline and the sentence box (`Composer`: one card with a
gradient edge, 20px corners, a glow on focus, the mic and Search inside it)
are the first thing on screen, above the fold at 1280×720 and 390×720 (`test:
prospecting` measures both; on a phone the sub-line and the header's title
give way, and the box sits 16px from each edge with 44px buttons), then the
example chips and a tip naming only the source words that work on this
install. Below a hairline: the live promise in bold, the three illustrated
steps (compact) and the trust row; "How it works" in the header, "Need ideas?"
in the side panel, which lists recent searches (trade icons, "…" menus) and
lead lists — beside the page on a laptop, under it on a phone. As soon as a
search starts, *Results* — the assistant (a drawn robot whose bubble is the
running step's own words), the same sentence box (`variant="bar"`, the asked
sentence kept in it) under a read-only label of the source searched
(`SOURCE_LABEL`) and any note on why, a mic (`MicButton`, the Autopilot voice
engine), related trades, the progress card (ring = stages done, timeline, sources), the
step-by-step log, five **counted** figures, the table (#, category, status,
**found at**, actions, switchable columns, a per-row "…" menu drawn into the
card so the scrolling table cannot clip it), and a rail: the results' own
coordinates on a grid (no tile servers), sources scanned with what each
returned, insights computed from the rows, and a type breakdown. The side panel
becomes a drawer there. Nothing on either screen is an invented figure: no
phone "validity", no "best time to reach", no source that was not asked.

**"Live" is a property of the requests, not a label.** The page runs
`useProspectSearch({ live: true })`, which sends `fresh: true`: the directory,
register and Google searches, the website reads (`findContacts` — which reads
the raw page, so short contact pages and `mailto:` links count) and the free
address checks all skip their caches; a paid mailbox verdict is reused with its
own date. Every row carries `foundAt` (the server's `fetchedAt`), shown in the
Found column and kept on an imported contact (`customFields.foundAt`); the
website read adds `live` (did it answer) and `checkedAt`. The Contacts dialog
still takes the caches. `test:prospecting` proves a repeated search asks the
directory again.

**A recent search reopens, it is not re-run.** Each search's rows, website
reads, checks (with their dates) and step log are kept in
`crm_prospect_results` (`saveSnapshot` in prospectImport.ts, one per search in
the history, ≤ 900 KB, synced like any workspace key); clicking it in the side
panel calls `restore` and shows "saved search, found <date>" with **Search
again, live**. A Google search is never kept (Google's terms) and so is run
again. The first pass now reads **every** website (not 16), and
`findContacts` follows the home page's own contact/about links and decodes
Cloudflare-protected and entity-encoded addresses (`unmask`), four fetches a
site at most.

**The results name no supplier.** The source label reads *All businesses*,
*Registered companies* or *With ratings & reviews* (`SOURCE_LABEL`); the rail
is "What was searched"; the step log says "Searched for …". Only the loading
line names sources (`useStage`, each line true of the source searched —
"Searching Google Maps" only for a Google search), and the licences' credit stays in small type
(`Attribution`). `SOURCE_NAME` remains the provenance stamp on imports and the
Contacts dialog. Checks read **Contact verified · <date>** (a verifier said
the mailbox takes mail) or **Contact checked · <date>** (format, domain, mail
server) — never "verified" for a domain check.

**Its dark mode is its own.** The page and the dashboard panel carry
`data-noinvert` and define both palettes on `.aip, .aip-vars` (switched by
`html[data-theme="dark"]`), because the app's inverting dark mode turns the
orange gradient blue. The shared `ProspectParts` read `--pp-*` custom properties
with the old colours as fallbacks, so the Contacts dialog is unchanged.

**Email checks** (`lib/emailVerify.ts`, `/api/prospects.php` `verify` / `people`,
migration 0062). Two levels, and the screen says which answered:
- *basic* — ours, free: syntax, domain (DoH, `DOH_BASE` overridable), MX / null
  MX / A fallback, throwaway domains, role and webmail flags. Its best answer is
  **`domain_ok`, never `valid`**: a Worker cannot open port 25, so it cannot ask
  whether a mailbox exists, and calling a domain check "verified" is the
  plausible success this codebase refuses.
- *mailbox* — the owner's verifier (`crm_install_providers` kind
  `email_verifier`: Hunter, ZeroBounce or MillionVerifier; Settings → Platform
  services → **Email finder & verifier**, `routes/emailVerifier.ts`, owner-only,
  proved on the provider's free credits call). Only its "deliverable" is `valid`.
  A key fault stops the pass and is reported once; the rest keep their basic verdict.

Verdicts are cached per address across workspaces (`crm_email_checks`: a week
basic, 30 days mailbox, 6 h unknown). Each workspace has an allowance on the
owner's credits (`BUDGET`: 100 checks a day / 500 a month, 10 web searches a
day / 40 a month, `crm_verifier_usage`) and an ended trial stops it.
**With Hunter**, `people` asks Hunter's domain search for addresses it saw
published; **an address with no source page is dropped** — that is Hunter's
pattern guess, and guesses are what prospects.ts refuses. `bestAddress` imports
the first address no check said would bounce; the check, and a named person's
name and role, go onto the contact (`customFields.emailStatus`, `firstName`,
`jobTitle`). **AI Prospecting never searches LinkedIn, Apollo or bought
data** — their terms forbid exactly this. **Nor does it show the owner's own
lead files** (the Lead library): the panel that listed directory matches
beside a search (`DirectoryMatches.tsx`, with a "See them all" link) is gone —
the owner decided customers must not see a searchable directory of people; the
platform finds businesses live, it is not a data broker. `test:isolation`
checks a search never asks `leaddir.php`. `npm run test:emailverify` and
`npm run test:aiprospecting` (pure); `npm run test:prospecting` drives it with
DoH and Hunter mocks (`EMAIL_VERIFIER_BASE`), in both themes.

**Sources are named for what they are, never "free"** (`SOURCE_NAME` in
services/prospects.ts): *Business directories* (`free` — Geoapify/Overpass),
*Verified business directories* (`register` — `lib/companiesHouse.ts`, UK
Companies House on the owner's key, `crm_install_providers` kind
`companies_house`, card on Platform services, `routes/companiesHouse.ts`
owner-only) and *Google Maps*. The register is searched by SIC code
(`sicFor`; a trade with none is refused on `prospects.trade`, never guessed),
`company_status=active` only, directors for the first 20 of a page; OGL data,
cached a fortnight. It holds no websites or emails and the screen says so;
an import names the first serving director (`firstName`/`jobTitle`), tags
`company register`, keeps `customFields.companyNumber`. `npm run test:register` (pure).

**Bulk and "Add to…".** *Find all emails* reads every unread website in
batches of 8 with a progress bar; *Show all email addresses* lists each
address with its own check; *Copy* leaves out the bouncing. Ticked rows get
an action bar: save to a list, or **add to an existing workflow, AI project
or email campaign** (`AddTo.tsx`) — each imports first (same `importChosen`,
same `RuleConfirm` clause-3 box), then: a workflow via `engagement.php
enrol_contacts` (`enrolInto`, active graphs of this workspace only, trigger
`manual`; suppressed addresses left out because the engine does not read the
suppression list); a project by adding to its `brief.audience` list (or
re-saving a briefed project with every target it had, since `saveProject`
resets what it is not sent); a draft campaign by pointing it at the list, a
scheduled one by `enrollInSequence` for its time (skipping suppressed and
bouncing). Imports tag the check (`emailTag`: `verified email`, `email domain
ok`, `risky email`, `email bounces`, replacing an older one). Rows say *In
Contacts* and *Do not email* (suppression list). Every animation (orb, dots,
shimmer on the cell being read or checked, scanning step, moving composer
gradient) is tied to real work and stops under reduced motion.

### The Lead library — the owner's own lead files (never a customer's search)

**Protected Central is not a lead seller or a data broker, and no customer
screen may look like one.** The people the install owner loads from their own
files are the **Lead library**: searched by the owner alone on
`/lead-directory` (Workspace → Lead library, `ownerOnly` in navModel,
`Prospecting/LeadDirectory.tsx`; anybody else is redirected to `/contacts`).
On the server `facets`, `search` and `reveal` answer 403 `not_owner` to
everybody but the install owner — checked before the database is, so the
answer is the same with no `LEADS` binding — and a customer's `status` says
only `shared`. Customers meet the library only as **"Licensed business data"**
on leads their projects' daily prospecting is given (below), and never see the
word "directory". `docs/LEAD-DIRECTORY.md` is the owner's guide (Leads.cm
findings, and a data-broker note: hiding the screen does not by itself change
whether sharing licensed personal data is selling it).
`routes/leaddir.ts` is the API; `lib/leadDir.ts` the rules (pure).

- **It feeds projects' daily finders, labelled truthfully**, only while the
  owner has opened it (`settings`: `shared` + `attested_at` — the same gate,
  read as the switch). `libraryStep` in prospectFinderTick.ts, once a step for
  a plain finder (not a connection), after today's ready leads are added:
  `libraryWhere` (pure) maps the finder's trades to the library's industries
  (`tradeIndustries`: the whole phrase, then dropping words from the end —
  never down to filler, never read as a job title) and its places through
  `placeWhere`, email required; `libraryRoom` (finderPlan.ts, pure) allows
  ≤ 5 a step and ≤ half of `per_day`, less what is already ready. People
  already given to the project (`ld_given` in the LEADS db, and `ld:<id>`
  refs in `crm_project_prospects`), removed (`ld_removed`), on the
  workspace's suppression list or unsubscribes, or already in its Contacts
  are turned away and recorded so they never come back; every address gets
  `checkEmails`' free check and one that would bounce is refused. Ready ones
  join through `addReady` like any found lead (so the prospects allowance
  counts them), with `source: 'library'`, and `contactOf` writes source
  `AI Autopilot · licensed business data`, `customFields.dataSource` and a
  dated `provenance` naming `LICENSED_SOURCE` (lib/prospectSources.ts) —
  never "found on the web": a cold emailer must be able to say where a
  recipient's data came from (GDPR Art. 14). No `LEADS` binding → skipped,
  said once a day in the finder's log; closed → skipped silently. `remove`
  answers `passedTo` (the workspaces given that person), for Art. 19.
- **The customer's lists live in Contacts** (`/contacts`; the old
  `/lead-lists` redirects there keeping `?list=`, and its nav entry is gone).
  `Contacts/ListsPanel.tsx` draws them beside the table — `ListsSidebar`
  (built by `buildFolders` in `services/leadLists.ts`, pure but its fetch):
  a folder per AI Autopilot business workspace (`finders.php` `folders`: the
  brief's audience list and every finder's list, plus contacts with that
  `customFields.projectId` on none of them, shown as `found:<id>`), "Saved
  from AI Prospecting" (`origin: 'prospecting'`) and "My lists"; on a phone
  it folds to one line. Opening a list filters the table and shows
  `ListHeader`: count, kind, the email checks, **Send to AI Autopilot**,
  Email this list (`/marketing?new=campaign&list=`), Export CSV (`toCsv`,
  "Where it came from"), edit, delete. The Source under a name is
  `sourceOf` (old `Lead directory` imports read "Licensed business data").
  Ticked contacts can be sent to AI Autopilot or put on a new list.
  **Sending to a business workspace has one implementation**,
  `services/sendToWorkspace.ts` (Contacts' `SendToWorkspace.tsx` and AI
  Prospecting's Add to): the workspace's own static audience list, else the
  list being sent if hand-picked, else a new one — a smart list is never
  pointed at, the server cannot run its rules. `?list=<id>&send=1` opens
  the dialog (AI Prospecting's "Send it to AI Autopilot"). The table
  scrolls inside `.cl-table-scroll` (window height, sticky header) so its
  sideways bar is always on screen; AI Prospecting's results table does the
  same (`.aip-table-wrap` from 721px of container).

- **Its own D1 database, bound as `LEADS`** (`crmpro-leads`, staging
  `crmpro-staging-leads`): millions of rows must never fill the product's
  database, because a full D1 refuses every write. `scripts/leads-db.mjs`,
  run by both deploy workflows, finds it by name, creates it the first time
  and writes its id into that run's `wrangler.jsonc` (the committed id is a
  placeholder); if it cannot, it drops the binding and the deploy goes on —
  the directory then answers `no_database`. The schema is made on first use
  (`ensureSchema`), not by migrations. `staging:check` fails if staging is
  bound to the live directory.
- **Loading is done by the owner's browser** (`services/leadImport.ts`): a
  CSV, `.csv.gz` or ZIP (read from its central directory, ZIP64 included,
  Deflate via `DecompressionStream`) of any size is streamed from disk —
  or **a whole folder** (chosen with `webkitdirectory`, or dropped and walked
  by `pickedFromDrop`, any depth), or several files; a ZIP may hold folders,
  `.gz` files and ZIPs (three deep, `sourcesOf`). Each lead file is its own
  load (`importMany`, 1–4 at once, keyed by its path in the folder); choosing
  the folder again skips files already in (`import_start` `skipDone`) and a
  file with no name/email column is "passed over", by name. The real ceiling
  is the D1 database's size (10 GB on Workers Paid), which a load names. Files are
  parsed, mapped by column name (`ALIASES` — Leads.cm, Apollo, ZoomInfo,
  Seamless, Lusha and CRM headers; accents, punctuation and spacing ignored)
  and sent 500 rows a request (`import_rows`). **Before a load the owner sees
  the mapping** (`previewFile`: which column became which field, the first
  people as they will be kept, the encoding — UTF-8, UTF-16 or Windows-1252,
  sniffed — and the delimiter, `,` `;` tab or `|`). **No column is thrown
  away**: a header no alias claims is kept with the person in `extra` (JSON,
  ≤ 2,000 chars); street address, the file's
  email status (read into valid/risky/invalid/unknown by `emailStatusOf`),
  company LinkedIn, social links, SIC/NAICS and technologies have columns of
  their own (`ADDED_COLUMNS`, added to an older table by `ensureSchema`). The
  email is the first column that *is* an address, so a blank or "N/A" work
  email falls through to the next. The server counts rows per file (`ld_imports.rows_seen`);
  the same file again (`fileKey`: name|size|mtime) re-reads and skips that
  many — resuming depends on every row, empty ones too, being counted, and on
  ZIP entries being read in central-directory order. Deduped by email, else
  name + domain/company (`dedupe`, unique). `ld_facets` keeps counts per
  industry/state/country/level/size as rows come and go — never a GROUP BY
  over the table.
- **"business owners", "CEOs"** typed where an industry goes are read as job
  titles and seniority (`roleTerms`) when no industry matches.
- **Opening it** needs the owner's statement that they may share the records
  (`settings`, `attested_at`) — vendors usually license lists to the buyer
  alone. The owner's search must name an industry or a place (a title alone
  would scan the table); results are 50 a page by id, counted to 5,000, shown
  in full (`REVEAL_BUDGET`/`ld_reveals` are kept for the record but nothing
  spends them now). **Removed on request** (`ld_removed`) stays out of later
  loads. The owner's imports go to their Contacts on a `cold` list, source and
  tag "Licensed business data", **with every address checked first** — the
  same free check as AI Prospecting (`verifyEmails`, 20 at a time), its
  verdict on the contact (`emailStatus`/`emailCheck`/`emailCheckedAt`) and as
  a tag (`emailTag`). The file's own "verified" is shown as **list: verified**
  and kept as `listEmailStatus`, never in place of our check: it is the
  seller's word. Every other field and kept column travels to the contact.
- `npm run test:leadimport` (pure: parser, ZIP/ZIP64/gzip, mapping, resume,
  the server's rules) and `npm run test:leaddir` (self-contained: wrangler
  :8938 + a Geoapify/DNS mock on :8978, fresh D1 in `.wrangler-leaddir`, needs
  a `VITE_BASE=/` build; the owner loads a ZIP and a whole folder through the card and searches
  it, customers are refused and redirected, a finder is given library people
  — suppressed, known and repeat people turned away, half a day at most,
  nothing while closed — and the customer's lists in Contacts at 1280 and 390).
  `test:finder` holds `libraryRoom`/`libraryWhere` still; `test:security`
  and `test:isolation` cover the closed customer actions. Never commit a
  real lead file.

### Autopilot prospecting — a project finds its own prospects every day

A project can run a **finder**: kinds of business × places, searched live on a
rotation, websites read, addresses checked, and up to `per_day` new prospects
added to the project's audience list every day (up to half of them, when the
owner has opened their Lead library, given from it as "Licensed business
data" — see above). Pure plan in
`worker/src/lib/finderPlan.ts` (`nextJob`: search → read → rest/exhausted;
12 searches and 150 website reads a day, 6 reads a tick, `PER_DAY_MAX` 100),
the driver in `worker/src/prospectFinderTick.ts` (2 finders a tick, on the cron
**before** `runAutopilot`, so a prospect added this tick can be enrolled on
it), the API in `routes/finders.ts` (`/api/finders.php`: `save` — with `append`
to merge a rotation —, `overview`, `set_status`, `run_step`, `expand_place`,
`record`, `removed`, `sync`, `prospects` — the paged lead list; every action workspace-checked and the project
must be this workspace's). Tables in migration 0063 (`crm_prospect_finders`,
`crm_project_prospects` — unique per project and `ref`, `crm_finder_runs`,
`crm_sms_consents`). `npm run test:finder` (pure) and `npm run test:autoprospects`
(self-contained: Geoapify + DNS mock :8848, wrangler :8918, fresh D1 in
`.wrangler-autoprospects`, needs a `VITE_BASE=/` build).

- **A finder is a workflow.** `save` writes "Find new prospects daily" (schedule
  trigger → an `ai` node with `source: 'directory'`, `produces: 'prospects'`);
  `runProjectAgents` hands that node to the finder (`finderStepFor`) before any
  AI key is asked for. Switching the workflow off pauses the finder and the
  tick skips a finder whose workflow is not active. The editor does not offer
  `directory`/`prospects` (`finderOnly`, `editorChoices`) — only `save` makes one.
- **Daily searches never use Google** (paid per search, its terms forbid
  keeping results): Geoapify while today's shared credits are under 2,000,
  else Overpass; `register` uses Companies House. A rotation run to its end
  is `exhausted` and says so; adding a place or trade starts it again.
- **Contacts stay browser-owned.** The finder writes `crm_contacts` and the
  list server-side with `dataUpdate` (compare-and-swap on `updated_at`), and a
  `reconcile` pass puts back any found contact a stale browser save dropped.
  A contact the customer deletes (`pf-…` ids, `forgetFoundContacts`) is
  tombstoned `removed` and never re-added. `ProspectSync` pulls new ones into
  the browser on load and on return to the tab.
- **Screens.** A project's **Prospects** tab (`ProjectLeads.tsx`): first
  **Where this project's leads come from** — every source as one compact card
  (the daily search, `FinderCard` in `ProjectProspects.tsx`; each connected
  search, `SourceCard` in `ProspectSources.tsx`) with its state in plain words
  and its actions beside it ("All searches done for now" explains itself and
  offers *Add places or kinds of business* — no Resume, which would find
  nobody new), and one **Add another lead source** button; the two-way empty
  state ("Set up a daily search" / "Connect a search") only when the project
  has no source at all. Then tiles counted by the server, each opening its
  group; **All leads** (`LeadsList.tsx`, `finders.php prospects`: every
  business examined, any source, any outcome — added, still being checked, no
  email, already in Contacts, turned away with the reason — 50 a page,
  newest first, chips, search, CSV export, "Open contact" →
  `/contacts?contact=<id>`; tiles and chips count by one `GROUP_SQL`, so they
  cannot disagree; a table that becomes cards by container query); the
  30-day chart; and, folded under **Details**, the rotation and the step log.
  The set-up form keeps `finder.trades`, `finder.places`, `finder.perDay`,
  `finder.list`. The wizard asks `prospectTrades` / `prospectPlaces`
  / `prospectPerDay` / `prospectSms` when contacts are to be found, reads them
  from the sentence when it can ("sell my products to real estate agents in
  Virginia" — the *selling-to* clause is the audience, not the business, so
  `matchSolutions` drops it before scoring), offers a region's towns
  (`citiesIn`, largest first), and shows the finder's who/where with a live
  sample on the blueprint (`FinderReview`) because an answered question is
  not asked. "commercial properties in virginia" typed as a trade is split
  into trade and place (`splitTradePlace`, client and `save`). The build makes
  the cold list and the finder; the Build screen then runs its first steps in
  front of the customer (`FinderLive.tsx`, `run_step`) instead of saying
  "nobody to email yet", and Connections/Review say the contacts are **found
  by this project**. A sample that could not run says the finder retries — it
  is not shown as the project failing.
- **Booking page in the wizard.** Picking our booking page (question
  `booking` = `page`, and on the blueprint when `bookingPage` is required)
  shows `BookingSetup.tsx` (see **The booking page** below) beside the real
  page, published as edited with `publishBookingConfig` (and again by the
  build), because `{{bookingLink}}` is only filled once a page is published.
- **Texts only after a yes.** A prospect is never texted on the strength of an
  email. `{{smsOptInLink}}` (a P.S. the wizard adds when texts were asked
  for, kept through email tailoring) is a per-contact HMAC link
  (`lib/smsConsent.ts`, install secret `sms_optin`, needs `APP_ORIGIN`) to
  `/api/sms-optin.php`: GET only shows the form (scanners), POST needs the box
  ticked and an E.164 number, rate-limited per IP. A yes records
  `crm_sms_consents`, clears that number's STOP, puts the number and the
  `sms opt-in` tag on the contact and fires `tag_added` — the wizard's "Text
  the prospects who opt in" workflow (a draft) starts on it.
  `prospectSmsBlock` gates the engine and the sequence sender: a `prospect`
  without consent for that number is skipped, by name.

### Connected searches — a tested AI Prospecting search as a project's lead source

The customer builds and tests a search in AI Prospecting, then **Connect to
AI Autopilot** (results bar, history "…" menu) — or, from a project, **Connect
Prospect Search** (Prospects tab, Workflows tab, a fresh project too). One
wizard both ways (`Prospecting/ConnectAutopilot.tsx`): project (or a new one) →
workflow name and the linked search's criteria → schedule and the target of
**verified** leads per run → verification → where leads go (CRM always; a
list, tags, an owner, an opportunity in a pipeline, and the next workflow of
the same project). Rules in `worker/src/lib/prospectSources.ts` — pure, no
imports, and imported by the browser too (`services/prospectSources.ts`), so
there is one implementation; `npm run test:sources`. API `routes/sources.ts`
(`/api/sources.php`); migration 0066. `npm run test:sourcese2e`
(self-contained: Geoapify + DNS mock :8849, wrangler :8919, fresh D1 in
`.wrangler-sources`, needs a `VITE_BASE=/` build).

- **A search definition** (`crm_search_definitions`, `ps-…`, one per
  workspace and `searchKey`) holds trade, place, source, filters, exclusions
  and a `version`. **A connection is a finder row naming it** (`search_id`)
  plus its project workflow — the existing engine runs it; nothing is copied
  into a second one. One search may feed many projects, and one project many
  searches, each with its own settings. Changing what a search finds
  (`update_search`) bumps its version and asks: **Update workflow** copies the
  criteria into the connections (`apply_search`), **Keep existing** leaves them
  on their version, and the source card says it is behind. AI Prospecting asks
  the same when the search on screen differs from a connected one.
- **Runs** (`stepFinder` when `search_id` is set): only on run days from the
  run hour **in the customer's time zone** (`runNow`, `nextRunStart`,
  `zonedTime`); counters belong to that local day; `manual_run` (Run now)
  starts today's run; the target is verified leads and the run examines as
  many candidates as that takes within `runLimits(target)`, saying so when it
  falls short. Each candidate goes through `qualify`: website, the address
  (published on its site or in the directory), the domain and mail-server
  check (`strict` asks the owner's verifier for the mailbox), **duplicates
  against the CRM and the project, the suppression list (`crm_suppression_list`,
  `crm_suppressions`) and `crm_unsubscribes`**, exclusions, and the
  confidence bar. **Confidence is a sum of checks that ran** (the points are
  listed on screen) — never a guess. A rejected candidate is kept with its
  `reject_reason` so no run examines it again; after 30 days its address,
  phone and street are cleared (`minimiseRejected`). Qualifying leads get
  `customFields.provenance` (search, source, licence, date) and `confidence`,
  then the connection's tags/owner/deal, and `enrolInto` the next workflow —
  each outcome said on the lead's line in `live`, the record the source card
  polls (the candidate being checked, check by check, then the result). A
  connection's workflow is drawn by `SourceFlow` (search → verify → duplicate →
  suppression → confidence → YES/NO), with **View Prospect Search**
  (`/prospecting?search=<id>`).
- **Plain language**: `parseSourceCommand` (pattern-read, never an AI call)
  and the `command` action — target, schedule, pause/resume, bar, next
  workflow by name, connect a search by name. Anything else is answered with
  what it can do. Every change is logged with who made it (`crm_finder_runs`,
  kind `config`).
- **Sources the owner can hold back**: `SOURCE_POLICY` says what each source
  may do (Google is never run on a schedule or kept); the owner's switch per
  source (`crm_meta.source_policy`, `lib/sourcePolicyStore.ts`, `policy`
  action: on / kept internal / off) is asked by manual search, by connecting,
  by Run now, and by the engine, which pauses a connection on a source
  switched off.

### Google Maps on the owner's key

Contacts → **Find businesses** (`components/Contacts/FindProspects.tsx`) and
the AI Sales Agent's Google source (`services/aiDiscovery.ts`) both call
`/api/prospects.php` (`routes/prospects.ts`): session + `workspaceAccess`
always, the key never from the request. `search` reads **Places API (New)**
Text Search (`searchBusinesses` in `lib/googlePlaces.ts`, `GOOGLE_PLACES_BASE`
overridable, field mask with phone/website — Google's dearer SKU) on the key
from `placesKeyFor`; on the owner's key `placesBudget` caps each workspace (20
an hour, 60 a day, 300 a month) and an ended trial is refused. Refusals by
name: `no_key` ("Prospect search needs the Google Maps key — the owner sets it
in Settings → Platform services."), `trial_ended`, `places_budget` (429), and
Google's own (`bad_key`, `api_disabled`, …, which also mark the owner's key as
refused). Each call is counted in `crm_places_usage` (migration 0058) and shown
on the owner's key card. **Nothing of a Google search is cached** — Google's
terms let a place id be kept and restrict the rest; imported contacts carry
`customFields.googlePlaceId`. `source: 'osm'` still searches OpenStreetMap
(free, keepable, cached a fortnight) as the second choice on the same screen.
The old `/api/places-search.php`, which took a key in the body, answers 410.
`npm run test:prospects` (pure mapping) and `npm run test:platform` (self-
contained: Places mock on :8833, wrangler on :8822, fresh D1, needs a
`VITE_BASE=/` build). Tests that call `wrangler d1 execute` mid-run send
`Connection: close`: the blocked event loop otherwise reuses a socket the
Worker already closed and fails as "other side closed".
