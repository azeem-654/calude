<!-- Read this before working on medical billing / RCM (phase 4). -->

## Medical billing / RCM

**Sales → Medical billing** (`/rcm`, `Rcm/MedicalBilling.tsx`), API
`/api/rcm.php` (`routes/rcm.ts`), rules `lib/rcm.ts` (pure, imported by the
screen too), tables `crm_rcm_*` (migration 0080). Tests: `npm run test:rcm`
(rules), `npm run test:rcme2e` (Worker + D1 + both screens at 1280/390),
`test:security` (two tenants).

**Who is who.** The *biller* is the install owner, reaching a practice's
workspace by id without claiming it (`knownWorkspace`, as the growth ledger
does). The *practice* is whoever `workspaceAccess` lets in — a portal: reads
everything except internal notes, writes shared notes, answers requests.
Every other action answers 403 `biller_only`. Launch blockers and the
practice list are owner-only.

**Patient data — the traps.**

- A workspace is **synthetic** until `go_live`: patient refs must start
  `SYN-`, rows carry `synthetic = 1`. `go_live` refuses until every
  `HIPAA_BLOCKERS` item is signed off (`crm_rcm_blockers`), the BAA date is
  set, no synthetic rows remain, the owner has TOTP, and `confirm: 'LIVE'`.
  Live is one-way (trigger). In live mode **every** request to that workspace
  needs `totp_enabled_at` — practice logins included.
- No name, DOB, address, member ID or SSN columns exist. `phiProblem` refuses
  an SSN-shaped string in any request body and any remittance row. Never add
  a patient-name field; never send claim data to email, AI or a third party.
- `crm_rcm_events` is the access log: append-only by trigger, kept when a
  workspace closes (`closeWorkspace` KEEP — naming it there would abort the
  whole batch). `claim_get`, `remit_get` and (once per 10 minutes)
  `overview` log views. Event `detail` holds ids and codes, never patient refs.
- Synthetic fixtures (`synthetic_seed`) go only into the owner's **own**
  workspace (`c.owner && c.mine`) — never a practice's. They are labelled on
  every screen; this is the one place sample data is allowed, because it is
  the owner's test bench.

**Two statuses, never merged.** `ch_status` (not_sent / submitted / accepted
/ rejected — the clearinghouse's edits) and `payer_status` (none … paid /
partial / denied / appealed / closed). `payerMoveProblem` refuses "paid" and
"partly paid" by hand: money comes only from a posted remittance. There is
**no clearinghouse, eligibility or payer integration**; answers are recorded
by hand and the screen says so (`integrations: { clearinghouse: 'none' }`).

**Remittances.** CSV (`parseRemitCsv`, header aliases for common 835
exports). Preview writes nothing. A file's hash is unique per workspace; each
row's `rowKey` is unique among *posted* rows (partial unique index), so the
same payment in a second file is recorded `duplicate`, never posted twice.
Each posted row is its own batch (row + line + claim + denial + event), so a
crash cannot leave a row marked posted without its money. A posted row is
fixed by trigger. Unmatched rows are matched by hand or set aside with a
reason; `reconcile` compares the bank deposit with what was posted.

**Leakage audit.** `leakageAudit` gives each claim line **at most one**
finding, in `LEAK_ORDER` (lost before at-risk before recoverable), capped at
the line's charge, so the total is a sum of disjoint parts. Underpayment
needs a fee schedule on the payer; with none, none is found — say so, never
estimate.

**A/R aging** buckets payer balance (billed − paid − write-down − patient
share) by date of service; unsent and rejected claims are "unbilled", shown
apart; patient payments are not tracked.

The launch list and its reasoning: `docs/HIPAA-LAUNCH-BLOCKERS.md` (the test
fails if it and `HIPAA_BLOCKERS` disagree). Nothing anywhere says "HIPAA
compliant" or "certified".
