# Medical billing — what must be true before real patient data goes in

The medical billing module (**Sales → Medical billing**, `/rcm`) runs on
**synthetic data only** until every item below is done. Each workspace starts
synthetic: patient references must begin `SYN-`, so a real one cannot be typed
in by mistake, and every screen says it is test data.

Going live is one switch per practice workspace, made by the install owner, and
the app refuses it until:

1. every item in the table is signed off in the app (**Medical billing → Launch
   checklist**, owner only) with a note saying how — who did it, which
   document, where it is kept;
2. the practice's BAA signing date is recorded on its workspace;
3. no synthetic records are left in that workspace;
4. the owner's own account has 2-step sign-in on.

Once live, **everybody** who opens that workspace — the billing team and the
practice's own logins — must have 2-step sign-in, or they are refused. A live
workspace can never be switched back to synthetic (a database trigger holds
that). The list is `HIPAA_BLOCKERS` in `worker/src/lib/rcm.ts`; `npm run
test:rcm` fails if this page and that list disagree.

| Key | What | Why it blocks |
|---|---|---|
| `baa_template` | A lawyer-reviewed **Business Associate Agreement** template | It is signed with each practice before any of its patient data is shared. The site already promises this (/medical-billing). |
| `baa_hosting` | A **BAA with the hosting provider** (Cloudflare) | The database, the Worker and backups all run on Cloudflare. **Cloudflare signs BAAs on its Enterprise plan only**; the account is on Workers Paid. Without a BAA, patient data cannot be stored here at all — this is the hardest item and may mean moving the module's data elsewhere. |
| `baa_mail` | Mail and other services **kept away from patient data**, or under a BAA | This module sends no email and makes no AI call with claim data. Confirm nothing else receives it: the support chat, screen sharing (a practice sharing its screen shows patient data), the nightly backup, error logs. Brevo and the Google AI key are **not** covered by a BAA today. |
| `risk_assessment` | A written **security risk assessment** | The HIPAA Security Rule requires one: the risks to patient data on this platform and what reduces each. |
| `policies_training` | **Privacy and security policies**, and staff trained on them | Minimum necessary use, who may see what, sanctions for misuse. |
| `breach_procedure` | A **breach notification procedure** | Who decides a breach happened, who tells the practice, and within what time (the BAA will set a deadline). |
| `mfa_everyone` | **2-step sign-in** for everyone with access | Enforced by the app in live mode. Sign it off once your own team has it on. |
| `backups_encrypted` | **Encrypted backups**, with retention and deletion agreed | The nightly backup must be encrypted (owner checklist item 14, `BACKUP_PASSPHRASE`), and how long records are kept after a practice leaves must be written down. |
| `audit_review` | A schedule for **reviewing the access log** | The module logs every view of a claim, every remittance opened and every change (Medical billing → Access log, readable by the practice too). Somebody must read it — monthly is common. |
| `compensation_review` | Legal review of the **billing compensation model** | Percentage-of-collections billing is restricted in some states and by some payer contracts (owner checklist item 34). |

## What the module does and does not hold

- **Holds:** the practice's patient account reference, dates of service,
  diagnosis and procedure codes, charges, what the payer allowed and paid,
  denial reason codes, prior-authorization numbers.
- **Never holds:** a patient's name, date of birth, address, phone, insurance
  member ID or Social Security number. An SSN-shaped string is refused in every
  box and every imported file.
- **Never sends** claim data by email, to an AI, or to any third party. There
  is **no clearinghouse, eligibility or payer integration**: claims are
  submitted in the practice's clearinghouse and what it answered is recorded
  here by hand, and remittances are imported as CSV files.
- The access log cannot be edited or deleted (database triggers) and is kept
  when a workspace is closed.

## What it does not claim

Nothing in the app or on the site says "HIPAA compliant" or "HIPAA certified" —
there is no such certification, and compliance is a set of practices, most of
them above, not a feature.
