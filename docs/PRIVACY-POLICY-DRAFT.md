# Privacy Policy — DRAFT for legal review

> **Not published, and not legal advice.** This is a factual starting point
> written from what the software actually does (see docs/SECURITY.md). A
> lawyer should adapt it to the jurisdictions you sell in (for example UK/EU
> GDPR, US state laws), add your company details, lawful bases, and your
> complaint and data-protection-officer arrangements. Do not publish it as-is.

**Who we are.** Protected Central ("we") is operated by [legal entity name,
registered address, company number]. Contact: [privacy@…].

## 1. Two kinds of personal data

- **Our customers' account data** — the people who sign up: name, email
  address, password (stored only as a salted hash), sign-in records (time,
  device description, network address), billing status, and settings.
- **Data our customers put in** — their contacts, deals, messages, forms,
  bookings, orders, content and files. For this data our customer is the
  controller and we act as their processor, on their instructions.
  [Provide / reference a Data Processing Agreement.]

## 2. What we use account data for

To provide the service, keep accounts secure (sign-in limits, 2-step sign-in,
security activity log), bill subscriptions, answer support requests, and
enforce the Acceptable Use policy (/terms), including automated screening of
outgoing messages for abuse.

## 3. Who processes data on our behalf

| Provider | Purpose | When |
|---|---|---|
| Cloudflare | Hosting, database, network | Always |
| Google (Gemini API) | AI writing, reading, transcription, screening | When an AI feature is used |
| Google (Sign-In, Calendar) | Signing in; calendar bookings | If used / connected |
| Stripe or Creem | Payments (card details go to them, not us) | When paying |
| The customer's chosen email provider | Sending and reading mail | As connected |
| Twilio | Text messages | If connected |
| Openprovider | Domain registration | If a domain is bought |

[State international transfer mechanisms, e.g. standard contractual clauses.]

## 4. AI

AI features send the material needed for the task (for example a business
profile and a request, an incoming email being replied to, a visitor's chat,
files given to the project wizard) to Google's Gemini API. Contact lists are
not sent. [State the Gemini plan in use and whether Google may use inputs to
improve its services — confirm billing is enabled on the key's project.]

## 5. How long we keep data

Workspace data: until the customer deletes it or closes the workspace.
Security activity: 180 days. Email delivery logs: 30 days. Automation step
logs: 14 days. Database restore points: within Cloudflare D1 Time Travel's
window for our plan. [Billing records: as required by tax law.]

## 6. Security

Server-enforced separation between workspaces; hashed passwords; optional
2-step sign-in; HTTPS with HSTS; connected-service credentials encrypted
(AES-256-GCM) and never returned to a browser. No method of transmission or
storage is completely secure. [Breach notification commitments.]

## 7. Your rights and choices

Customers can export their workspace data and delete their account and
workspaces in Settings → Security & Privacy. [List data-subject rights for
your jurisdictions and how contacts of our customers should exercise them —
usually via the customer.]

## 8. Cookies and local storage

The app stores the sign-in token and workspace preferences in the browser's
local storage to keep you signed in. [List any analytics or marketing cookies
if added later — none today.]

## 9. Changes

[How changes are announced.] Last updated: [date].
