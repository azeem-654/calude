# Medical billing — requirements for any future integration

Written 2026-10-29. Read with `docs/HIPAA-LAUNCH-BLOCKERS.md` (what must be
true before any real patient data) and `docs/claude/rcm.md` (how the module
works). **Nothing here makes Protected Central HIPAA-compliant, and nothing in
the app or on the site may say it is.** Compliance is a set of agreements,
practices and reviews; the software can only avoid making them harder.

## The rule today: minimum necessary, records stay with the practice

Patient records and protected health information (PHI) stay in the
practice's own EHR or practice-management system, which already has its own
BAA. Protected Central keeps only what the billing work needs to be tracked:

| Kept | Never kept |
|---|---|
| the practice's patient **account reference** (synthetic `SYN-` until live) | name, date of birth, address, phone, email |
| dates of service, CPT/HCPCS and ICD-10 codes, modifiers | insurance member ID, Medicare number (MBI), SSN |
| charges, allowed, paid, adjustments, denial reason codes | clinical notes, images, documents |
| prior-authorization numbers and their dates | anything a payer portal or clearinghouse login would show |

No new medical-record store is to be added. If a future feature seems to
need one, the answer is an integration that *reads* from the practice's
system on demand, under the conditions below — not a copy here.

## Where PHI must never go — and what stops it (2026-10-29)

| Destination | Why it is closed | What enforces it |
|---|---|---|
| AI (`/api/ai.php`, Gemini) | No BAA with the AI provider | `lib/phiGuard.ts` refuses a request whose text looks like patient data (SSN, MBI, labelled DOB / MRN / member ID, a patient named next to a date); the RCM module makes no AI call at all |
| Marketing campaigns and email | Mail providers (Brevo) hold no BAA; a campaign is the least private channel | Pre-send check blocks a campaign containing patient-looking data, and its "send anyway" does not cover it (`services/deliverability.ts`); the RCM module sends no email |
| Support tickets and chat | The help desk is ordinary business software with no BAA | A website visitor's chat message or ticket has patient-looking data **removed** before it is stored or read by the AI agent (`routes/engage.ts`); a team member's reply is **refused** with the box named (`routes/engagement.ts`) |
| Logs | Cloudflare logs and the UI fault reports are not PHI stores | The RCM access log (`crm_rcm_events`) holds ids and codes only; no route logs a request body; fault reports carry endpoint, field and path only (`routes/uireport.ts`) |
| Analytics | — | The app loads no third-party analytics or tracking scripts |
| Screen sharing (Live help) | A practice sharing its screen shows whatever is on it | Launch blocker `baa_mail` names it; a practice in live mode must not share the medical billing screens in Live help |

The net is a safety net, not a guarantee: it catches what is unmistakably
patient data and lets ambiguous text (a bare date, an order number) through,
because refusing every date in marketing copy would teach people to ignore
it. `npm run test:phi` holds its behaviour.

## Before connecting anything that touches claims or patients

This covers an EHR / practice-management connection, a clearinghouse (837
claims, 835 remittances, 277 status), eligibility checks (270/271), payer
portals, a document store, e-signature, fax, SMS reminders to patients, or an
AI model applied to claim data. Each must clear **every** item before the
first real record moves:

1. **A signed BAA with the vendor**, covering the exact product used (a
   vendor's BAA often lists only some of its services). Keep a copy, the
   signing date and the covered-service list with the launch checklist.
2. **A BAA chain**: the practice ↔ the operator BAA, and the operator ↔
   every subprocessor that would see PHI — including Cloudflare (Enterprise
   only) if the data passes through the Worker or is stored in D1/R2. If
   Cloudflare cannot be covered, the integration must keep PHI off Cloudflare
   entirely (for example, the practice's system talks to the vendor directly
   and only references and amounts come here).
3. **Minimum necessary**: request only the fields the feature needs; map
   them to the "Kept" column above. A field in the "Never kept" column needs
   a written reason, a lawyer's agreement, and a change to this document.
4. **Credentials** stored encrypted at rest under `CREDENTIAL_WRAP_KEY`
   (owner checklist 13), never returned to a browser, called only from the
   Worker, with the verified stamp cleared when they change
   (`docs/claude/security.md`).
5. **Tenancy**: every call scoped to the practice's workspace on the server
   (`workspaceAccess` / `knownWorkspace`), added to `npm run test:security`.
6. **Access logging**: each read and write that touches the vendor's data
   appended to `crm_rcm_events` with ids and codes only — never a patient
   reference or a value from the "Never kept" column.
7. **2-step sign-in** for every user of a live workspace (already enforced).
8. **Transport and storage**: TLS to the vendor; no PHI in URLs, query
   strings, email bodies, push notifications or error messages.
9. **Retention and deletion** agreed in writing: how long each record is
   kept, what happens when a practice leaves, and how backups age out
   (owner checklist 14).
10. **A security risk assessment updated** for the new data flow, and the
    breach procedure updated to include the vendor's notification duties.
11. **Test data first**: the integration runs against synthetic `SYN-` data
    and the vendor's sandbox until the launch checklist is signed off for
    that practice.
12. **Plain words on screen**: the screen says what is connected and what is
    not; nothing says "HIPAA compliant", "certified" or "secure" as a claim.

AI on claim data specifically: only through a provider and product that
signs a BAA for that use, with prompts that carry codes and amounts, never
identifiers; outputs treated as suggestions for a human biller, logged as
such; and no training on the data (the provider's terms must say so).

## Commercial: the percentage-of-collections fee

The published medical billing price includes 5% of eligible net collections
(`MEDICAL_BILLING_OFFER`, lib/offers.ts). **Percentage-of-collections
arrangements must be reviewed by a qualified attorney against the applicable
state laws and the practice's payer contracts before commercial use** —
some states and some payer contracts (and some government programs'
reassignment rules) restrict or prohibit it. Where it is not permitted, a
different basis is agreed in writing. The Fee statement tab says so on
screen, and launch blocker `compensation_review` and owner checklist item 34
hold it open until the review is done.
