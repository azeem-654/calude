# Your lead library — loading your leads, and Leads.cm

Written 2026-10-07, revised 2026-10-15. Covers: the 30 MB upload limit, loading
your 3.3 GB ZIP (about 6 GB of CSV), loading more later, what customers get
(and what they no longer get), what Leads.cm can and cannot do for you, and a
note on data-broker rules.

**What changed on 2026-10-15.** Customers no longer search your leads. There
is no "Lead Directory" under Customers any more: Protected Central finds leads
live and is not a lead seller or a data broker, and a screen where any
customer could look people up by industry and place is what one looks like.
What you loaded is now your **Lead library** — searched by you alone — and,
when you open it, a quiet extra source for your customers' projects' daily
prospecting, labelled **"Licensed business data"** on every lead it supplies
(section 4). Customers have their **lists in Contacts** instead: their *own*
leads, a folder per AI Autopilot business workspace.

---

## 1. The short answer

**Don't send lead files through the chat.** The 30 MB limit belongs to the chat
attachment box, and nothing on our side can raise it. The chat is also the wrong
place for 6 GB of people's names, emails and phone numbers.

**Load them inside your own app instead.** Go to **Settings → Platform services →
Lead directory → Choose a CSV or ZIP**. Your browser reads the file from your
disk in pieces, so there is **no size limit**. A 3.3 GB ZIP is fine, and it
never has to be uploaded whole. People are sent 500 at a time.

That card is where every future load goes too. You can also hand me a new file
format; if its columns have unusual names, I add them to the column list in
`src/services/leadImport.ts`.

---

## 2. Before your first big load

**1. Cloudflare plan.** The directory has its own database (`crmpro-leads`),
separate from your customers' data. That way a full directory can never stop
sign-ins or sending. The first deploy creates it by itself.

| | Workers Free | Workers Paid ($5/month) |
|---|---|---|
| Size of one database | 500 MB | **10 GB** |
| Rows written | 100,000 a day | 50 million a month included |

Your sample works out to about 550 bytes per person once trimmed. A 6 GB file is
therefore roughly **3.5 million people and 2–3 GB of database**, which needs
**Workers Paid**. On the free plan the load stops at 500 MB and the card says
"The directory database is full".
Check: Cloudflare dashboard → **Workers & Pages → Plans**.

**2. The ZIP format.** Browsers can open ordinary ZIPs ("Deflate", which is what
Windows, macOS and most tools make). A ZIP made with 7-Zip's LZMA or Deflate64
setting is refused by name. Re-zip it normally, or load the CSVs themselves, or
use `.csv.gz`.

**3. The computer.** Use a laptop plugged in, on a good connection, with the tab
left open. Expect **1–3 hours** for 6 GB. The card keeps the screen awake, shows
the percentage, people added and duplicates skipped, and estimates the time left.

---

## 3. Loading it, step by step

1. Open **app.protectedcentral.com → Settings → Platform services**, scroll to
   **Lead directory — your own leads**.
   - If it says "no database yet", the deploy could not create it, and the
     Deploy to Cloudflare log names the reason. The token needs **D1: Edit**,
     which it already has for the main database.
2. Type where the leads came from in the first box, e.g. *Leads.cm — US real
   estate, Oct 2026*. Only you see this.
3. Press **Choose a CSV or ZIP** and pick the 3.3 GB ZIP. Before anything is
   loaded you see **what was detected**: every column of the file and the field
   it became (or "kept as is"), the first three people as they will be kept,
   and how the file was read (its text encoding and separator). Check it, then
   press **Load these people**. Every CSV inside is read in turn; folders, PDFs
   and macOS's `__MACOSX` copies are skipped.
4. If it stops (the laptop sleeps, the Wi-Fi drops, you press **Pause**), choose
   **the same file** again. It carries on from the row after the last one sent.
   It does not start again.
5. When it says **Finished**, the totals show the people added, the duplicates
   skipped (the same email, or the same name at the same company, is one
   person), and the largest industries and states.

Columns recognised automatically include Leads.cm's own export (name, title,
managementlevel, industry, city, state, country, email, phone/cphone, website,
company, companysize, linkedin, revenue, foundedyear, keywords) and the usual CRM
names (First Name, Last Name, Email Address, Company Name, Job Title, Zip Code…).
Apollo, ZoomInfo, Seamless, Lusha and Hunter exports are recognised too
(Corporate Phone, Person Linkedin Url, Company Linkedin Url, # Employees,
Employee Range, Email Status, Street, Facebook/Twitter Url, SIC Code, NAICS,
Technologies, Work/Personal Email…), and headers are matched without regard to
capitals, accents, spaces or punctuation. A person's own phone is used first,
then the company's; a work email first, then a personal one — and a blank or
"N/A" email falls through to the next column. Files saved by Excel as "Unicode
text" (UTF-16) or as an older Windows CSV are read correctly, and comma,
semicolon, tab and pipe separators all work.

**Nothing in the file is thrown away.** A column the library has no field for
is kept with each person under its own header (up to 2,000 characters a
person), shown on your Lead library screen, and copied onto the contact when
you add them to your own Contacts. Long company descriptions are cut to their
first few hundred characters.

**Emails are checked when they are used.** If your file says an email is
verified, your Lead library shows **list: verified** beside it — that is the
seller's word, not ours. Whenever somebody from the library goes into Contacts
— yours, or a customer's project — the address is checked again (format,
domain, mail server — the same free check AI Prospecting uses), the result is
written on the contact and tagged (*verified email*, *email domain ok*, *risky
email*, *email bounces*), and one that would bounce is not added. Addresses are
not checked during a load: millions of lookups would take days and fill the
main database.

A load done by mistake can be taken back out with **Undo this load**. Someone who
asks to be removed: type their email under **Remove a person who asks**. They
are deleted and kept out of every later load.

---

## 4. Who sees what

**You: Workspace → Lead library** (`/lead-directory`, listed for you only).
Search by industry, place (a state, "Tampa, FL", a country), job title ("CEO"
also finds "Chief Executive Officer"), seniority, company size and "only with
an email"; everybody is shown in full, nothing is counted. **Add to Contacts**
puts people in your own Contacts on a list marked *cold*, named as **Licensed
business data** with where they came from.

**Your customers: nothing to search.** The menu item is gone, the old address
takes them to their own Contacts, and the server refuses them the search,
the facets and the reveal (403 `not_owner`) — the API is closed, not just the
button. A customer can only ask whether the library is open, never how big it
is or what is in it.

**What reaches a customer, when you open it.** The library stays **closed**
until you tick *"I hold the right to share these records with my customers,
and I will remove anybody who asks"* and open it (Settings → Platform services,
the library card; section 6 explains the box). Open, a customer's AI Autopilot
project that runs **daily prospecting** (a finder: kinds of business × places)
may be given a few people from it each step:

- only people whose **industry** matches one of the finder's kinds of business
  ("real estate agents" → *Real estate*), in one of its **places**, with an
  email address;
- **at most 5 a step and half of the finder's daily number** — the rest is
  still found live on the web, so a project is never quietly turned into a
  bought list;
- **never the same person twice** for a project (recorded in `ld_given` in the
  library's database, and as `ld:<id>` in the project's prospects); never
  anybody you removed; never anybody on that customer's suppression list or
  unsubscribed; never somebody already in their Contacts;
- every address **checked first**; one that would bounce is turned away;
- each lead is labelled **"Licensed business data"** — on the contact's source,
  its `provenance` (with the date) and a tag — never "found on the web".
  That is what lets your customer answer "where did you get my details?",
  which the law requires of a cold emailer in many places (GDPR Art. 14).

It counts against the customer's monthly prospects allowance like any other
lead their project finds. Connected searches (an AI Prospecting search a
customer linked to a project) run their own checks and are not given library
people. Closing the library stops all of it at the next step.

**Removing somebody who asks** now also tells you which customers' workspaces
their details were given to (`passedTo` in the answer), because you must pass
the request on to them — their copy in those CRMs is theirs to delete.

**Their lists in Contacts** (beside the contact table; the old `/lead-lists`
address redirects there) are their own leads, folder by folder: one per AI
Autopilot business workspace (its audience list and the lists its finders
fill), one for what they saved from AI Prospecting, and their own lists. They
can open a list, send it to an AI Autopilot business workspace, email it as a
campaign and export it as CSV — with a "Where it came from" column. Nothing
there reaches beyond what is already in their workspace.

---

## 5. Leads.cm — what it is, and whether you can "plug in" its whole database

What I found (their site rate-limited my reads, so this comes from their public
pages and reviews):

- **What it is.** A B2B contact database started in 2024, claiming **700 million+
  contacts**, for a flat **$20 a month with unlimited exports**.
- **Where the data comes from.** LinkedIn, Instagram, and a tool that detects
  which software a website uses. Your sample matches this: every row has a
  LinkedIn profile, and it carries a "technologies" column.
- **How you get the data out.** CSV export, and copy to clipboard. It has a
  built-in email checker. **No public API, webhook or Zapier integration is
  advertised**, so there is nothing to connect it to automatically.

**Can the platform hold Leads.cm's whole database if you subscribe? No.**
1. There is no API to pull it through. The only way out is the CSV export, one
   filtered list at a time.
2. 700 million people is roughly **300–400 GB**. That is far beyond one D1
   database (10 GB), and far beyond what a browser can load.
3. A $20 "unlimited exports" plan almost always licenses the data **for your own
   outreach**. Re-selling it to your customers inside your product is a
   different licence. Ask Leads.cm **in writing** whether their terms allow you
   to make exported records available to your own customers, and keep their
   answer.

**What works:** export the slices your customers actually want, for example
"real estate, Florida, owners and CEOs, with email". Load each slice with a
label. Duplicates across slices are skipped automatically. A few million
well-chosen people is far more useful than hundreds of millions nobody searches.

If you outgrow 10 GB, the next step is one directory database per region
(US-East, US-West…), searched together. That is a contained change to
`routes/leaddir.ts`. Ask me when you get close; the card shows the total.

---

## 6. The parts that are your call — please read

- **Licence.** Most lead sellers license data to the buyer alone. Opening the
  directory to customers means you hold a licence that allows resale or
  sharing. That is what the tick box asks you to confirm.
- **The website said "No scraped LinkedIn".** Your Leads.cm data comes from
  LinkedIn, so the AI Prospecting card on protectedcentral.com that said this
  has been changed to **"Nothing anonymous"**: every lead says where it came
  from, and anybody who asks is removed. AI Prospecting itself still never
  searches LinkedIn.
- **Privacy law (US).** Cold B2B email is legal under CAN-SPAM, provided it
  carries an opt-out and a postal address; the app's campaigns already add both.
  But **selling or sharing personal details of people you have no relationship
  with can make you a "data broker"** in several states. California's Delete Act
  requires data brokers to register every year and to process deletion requests
  from the state's central deletion platform. Texas, Oregon and Vermont have
  their own registries. **Ask a lawyer before opening the library to
  customers' projects.** Removing people on request is already built in.
- **Outside the US.** If a file contains people in the UK or EU, GDPR applies,
  which is much stricter. Load only countries your licence and your lawyer are
  comfortable with.

---

## 7. Data broker note

Hiding the directory from customers' screens changed what the product looks
like and closed a route anybody could use to copy your data. **It does not, by
itself, change the legal question.** If the library is open, personal details
you licensed from a seller still leave your hands and land in your customers'
CRMs — through their projects rather than through a search box. Whether that
counts as *selling* or *sharing* personal data turns on what happens, not on
which screen it happens behind.

Things worth checking, plainly:

- **Your vendor licence.** Most lead sellers license data for the buyer's own
  outreach. Passing records to your customers — even a few a day, inside their
  projects — is usually a different licence. Get the vendor's answer in
  writing.
- **US data-broker laws.** California's Delete Act (a business that sells or
  shares personal data of people it has no direct relationship with registers
  with the California Privacy Protection Agency each year and, from August
  2026, processes deletion requests from its central platform, DROP); Vermont,
  Texas and Oregon keep data-broker registries of their own. Whether you are a
  "data broker" under each depends on its definitions and on whether you are
  paid for the data — your subscription fee may or may not count.
- **GDPR / UK GDPR**, if any record is a person in the EU or UK. You and your
  customer would each be a controller with your own duties: a lawful basis to
  disclose, telling people where their data came from (Art. 14 — the
  "Licensed business data" label and the provenance on each contact help your
  customer do this), and passing on erasure requests to the recipients
  (Art. 19 — `passedTo` on a removal names them).

None of this means you must stop; it means the answer depends on your licence
and your jurisdictions. **Recommendation:** check your vendor licence, ask a
privacy lawyer whether opening the library makes you a data broker where your
customers' recipients live, and keep the library **closed** (its default) until
you have both answers. Everything above keeps working with it closed — your
customers' projects simply find all their leads live.
