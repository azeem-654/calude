/**
 * "See it working" on the industry sites: each problem a business in that
 * industry has, then the real screen where Protected Central handles it.
 *
 * ── One list, three readers ──
 *
 * IndustryDemo.tsx draws the steps; `scripts/industry-demos.mts` photographs
 * every `file` here from the running app (it refuses to run if a file has no
 * recipe); `marketing/industry-films/` turns the same steps, words and
 * pictures into each site's narrated film. So a step's words can never sit
 * over a picture of something else, and the film cannot say what the page
 * does not.
 *
 * ── What the pictures are ──
 *
 * Four sample workspaces on a fresh database: a heating and cooling firm and
 * a roofer set up the way the growth service sets one up (the industry
 * snapshot's pipeline and fields, workflows from the template library, the
 * Jobs & revenue ledger written through the real API), an online store set up
 * the way the e-commerce service sets one up (the `ecommerce` snapshot, its
 * catalogue and orders, drafts, workflows and support tickets), and the
 * synthetic medical practice `synthetic_seed` loads, whose every screen says
 * "Synthetic test data only". Every business, person and amount is invented;
 * the section says so above the first picture. Each `solved` line describes
 * only what is on its screen, never a result.
 *
 * The store is connected to no marketplace — none can be. Amazon, eBay and
 * Walmart appear only as where a customer bought, written on the record, and
 * in what a customer wrote in a ticket.
 */
import type { ReelShot } from './reels';

export type DemoSlug = 'hvac' | 'roofing' | 'medical-billing' | 'ecommerce';

export interface DemoStep {
  /** The problem, as the owner or practice manager would say it. */
  pain: string;
  /** What it costs them, in one or two sentences. */
  problem: string;
  /** What the screen below shows Protected Central doing about it. */
  solved: string;
  /** The module the screens belong to, named on each slide. */
  module: string;
  shots: ReelShot[];
  /** The film's narration for this step: the problem, then what it shows. */
  say: [string, string];
}

export interface IndustryDemo {
  slug: DemoSlug;
  eyebrow: string;
  lead: string;
  emph: string;
  body: string;
  /** Said once, above the first picture. */
  sample: string;
  /** The narrated film (marketing/industry-films). A demo without one shows its steps only; nothing reads a film that is not there. */
  film?: { title: string; intro: string; outro: string };
  steps: DemoStep[];
}

const shot = (file: string, caption: string, alt: string, notes: string[]): ReelShot => ({ file, caption, alt, notes });

export const INDUSTRY_DEMOS: Record<DemoSlug, IndustryDemo> = {
  hvac: {
    slug: 'hvac',
    eyebrow: 'See it working',
    lead: 'Six problems every HVAC office knows —',
    emph: 'and the screen that handles each.',
    body: 'A heating and cooling business set up the way we set yours up: the HVAC pipeline, the inquiry ledger, the follow-up workflows and the calendar. Each step is the problem first, then the real screen.',
    sample: 'Screens from a sample HVAC workspace with invented customers and example amounts — the running software, not a mock-up.',
    film: {
      title: 'Protected Central for HVAC',
      intro: 'Heating and cooling businesses rarely lose work for lack of calls. They lose it in the gaps between them. Here is the software our growth service runs for an HVAC business, problem by problem.',
      outro: 'Every inquiry captured with its source, every estimate followed up, every visit confirmed, and every job tracked to the payment. Book an HVAC growth consultation at protected central dot com slash H V A C.',
    },
    steps: [
      {
        pain: 'Leads in five places',
        problem: 'Web forms, phone calls, ads and referrals arrive in different inboxes, and nobody can say who is waiting for what — or which source brought them.',
        solved: 'Every inquiry lands in Jobs & revenue with its source kept from the first contact — the ad, the form, the outbound call, the referral — and its stage beside it, from inquiry to collected.',
        module: 'Jobs & revenue',
        shots: [shot('ind-hvac-jobs', 'Jobs & revenue: every inquiry, its source and its stage', 'The Jobs & revenue screen of a sample HVAC business: the agreement, counts of inquiries, jobs won, quoted, completed and collected, and a list of inquiries each marked with its stage and whether it came from the service or the business’s own source.', ['Every inquiry in one list, whoever took it', 'Its source kept from the first contact', 'Quoted is never counted as money — only collected is'])],
        say: ['Leads arrive in five places: web forms, calls, ads and referrals. Nobody can say who is waiting, or where they came from.', 'In Protected Central every inquiry lands in one ledger, with its source kept from the first contact and its stage beside it.'],
      },
      {
        pain: 'Web inquiries wait while every van is out',
        problem: 'On the first hot day the phone rings non-stop, and the web inquiries sit until the evening — by then they have booked someone else.',
        solved: 'Speed to Lead runs on the server: a form submitted is tagged, answered from your own mailbox within minutes, and a call-back goes on today’s task list.',
        module: 'AI Autopilot',
        shots: [shot('ind-hvac-speed', 'Speed to Lead: answered within minutes, a call-back on today’s list', 'The sample HVAC business workspace in AI Autopilot with six active workflows; the first, Speed to Lead, drawn as steps: a form is submitted, tag it, wait two minutes, email them, and on.', ['A form submitted starts it — day or night', 'Answered from your mailbox in minutes', 'Runs on the server every five minutes, laptop closed'])],
        say: ['On the first hot day, the phone never stops, and web inquiries wait until evening.', 'Speed to Lead answers each one from your own mailbox within minutes, and puts a call-back on today’s list. It runs on the server, every five minutes.'],
      },
      {
        pain: 'Estimates that go quiet',
        problem: 'The estimate goes out after the site visit and nobody chases it — the next call is always more urgent.',
        solved: 'Each job sits in an HVAC pipeline — New enquiry, Visit booked, Estimate sent, Follow-up, Job won, Job complete — and Quote Follow-up chases every estimate three times over a fortnight, then stops asking.',
        module: 'Pipeline',
        shots: [
          shot('ind-hvac-pipeline', 'The HVAC pipeline: every estimate in its stage', 'A deals board titled HVAC jobs with columns New enquiry, Visit booked, Estimate sent, Follow-up and Job won, each card a job with its customer, value, days in stage and probability.', ['Your stages, installed by the HVAC snapshot', 'Days in stage on every card — the stale ones show', 'Open and weighted value counted from real deals']),
          shot('ind-hvac-quote', 'Quote Follow-up: three chases over a fortnight, then it stops', 'The Quote Follow-up workflow: when a job is tagged quoted, wait three days, email asking whether there are questions on the price, wait five days, and so on.', ['Starts when an estimate is sent', 'Three messages over two weeks, from your mailbox', 'Stops the moment they answer']),
        ],
        say: ['Estimates go out after the visit, and nobody chases them.', 'Every job sits in an HVAC pipeline, with days in stage on each card. Quote Follow-up chases each estimate three times over a fortnight, then stops.'],
      },
      {
        pain: 'Visits missed, slots wasted',
        problem: 'Diagnostics, installs and tune-ups are booked weeks apart, and a forgotten appointment is a wasted truck roll.',
        solved: 'Every visit on one week grid, linked to its customer; Appointment Reminder confirms the booking and reminds them the day before.',
        module: 'Calendar',
        shots: [
          shot('ind-hvac-calendar', 'The week: diagnostics, installs and tune-ups on one grid', 'A calendar week for the sample HVAC business with a no-heat diagnostic, an AC visit, a two-day heat pump install, spring tune-ups and estimate visits, and a list of upcoming visits beside it.', ['Every visit with its customer', 'Installs that run all day, shown as they are', 'Who to call next, listed beside the week']),
          shot('ind-hvac-reminder', 'Appointment Reminder: confirmed, then reminded the day before', 'The Appointment Reminder workflow: an appointment is booked, confirm it by email, wait until the day before, text the reminder.', ['Confirmed the moment it is booked', 'Reminded the day before', 'Texts only where an SMS provider is connected']),
        ],
        say: ['Visits are booked weeks apart, and a forgotten appointment is a wasted truck roll.', 'Every visit sits on one week grid, and Appointment Reminder confirms each booking and reminds the customer the day before.'],
      },
      {
        pain: 'Nobody knows which jobs actually paid',
        problem: 'Quotes, invoices and payments live in different places, so “how much did that campaign bring in?” has no answer anyone trusts.',
        solved: 'Open any job: inquiry, quote, completion and each payment, dated and signed by whoever recorded it. You confirm the completed job and every payment — a payment we only reported waits for you.',
        module: 'Jobs & revenue',
        shots: [
          shot('ind-hvac-lead', 'One job, from inquiry to payment', 'A furnace install opened in Jobs & revenue: its source, its quote, the final amount the owner confirmed and the payment received, with a history of each step and who recorded it.', ['Every step dated and signed', 'The final amount is yours to confirm', 'Tax and permits left out of any fee']),
          shot('ind-hvac-payments', 'Payments: what counts, and what waits for you', 'The Payments tab: each payment with its job, amount, method and whether it was confirmed by the contractor or is still waiting for confirmation.', ['A reported payment waits for your confirmation', 'Refunds and reversals come off', 'Only confirmed collections count']),
        ],
        say: ['Quotes, invoices and payments live in different places, so nobody knows which work actually paid.', 'Open any job and see the inquiry, the quote, the completion and each payment, dated and signed. A payment only counts once you confirm it.'],
      },
      {
        pain: 'Past customers forgotten',
        problem: 'Last year’s installs and plan members sit in a database, and nobody writes to them until they ring somebody else.',
        solved: 'Every customer in one list with their stage, open deals, place in the pipeline and how they found you. Tag the ones to win back, and a re-activation workflow writes to them before the season — three messages, then it leaves them alone.',
        module: 'Contacts',
        shots: [
          shot('ind-hvac-contacts', 'Customers: stage, deals, pipeline and source in one list', 'The contacts list of the sample HVAC business: homeowners and property managers, each with their source, stage, open deals and value, the pipeline stage they are in, and status.', ['Stage, deals and pipeline stage on every row', 'Filter to who is due before the season', 'Duplicates merged; spreadsheets imported']),
          shot('ind-hvac-winback', 'Re-activation: before the season, three messages, then stop', 'The Cold Lead Re-activation workflow: when a contact is tagged dormant, email something useful first, wait six days, offer a slot this month.', ['For customers who agreed to hear from you', 'Useful first, then an offer', 'Three messages, then it leaves them alone']),
        ],
        say: ['Last year’s customers sit in a database until they call somebody else.', 'Every customer sits in one list with their stage, deals and source. Tag the ones to win back, and a re-activation workflow writes to them before the season, then leaves them alone.'],
      },
    ],
  },

  roofing: {
    slug: 'roofing',
    eyebrow: 'See it working',
    lead: 'Six places roofing work slips —',
    emph: 'and the screen that catches each.',
    body: 'A roofing business set up the way we set yours up: the roofing pipeline with its insurance-claim stage, the inquiry ledger, inspection reminders and estimate follow-up. Each step is the problem first, then the real screen.',
    sample: 'Screens from a sample roofing workspace with invented homeowners and example amounts — the running software, not a mock-up.',
    film: {
      title: 'Protected Central for roofing',
      intro: 'After a storm, roofers are flooded with calls, then lose half of them in the follow-up. Here is the software our growth service runs for a roofing business, problem by problem.',
      outro: 'Every inquiry captured, every inspection confirmed, every estimate and insurance claim moving, and every job tracked to the payment. Book a roofing growth consultation at protected central dot com slash roofing.',
    },
    steps: [
      {
        pain: 'Storm-week chaos',
        problem: 'After hail or wind, inquiries pour in from the website, ads and neighbours — and the ones written on a notepad in the truck are gone by Friday.',
        solved: 'Every inquiry lands in Jobs & revenue with its source and its stage — leak, hail inspection, storm claim — kept from the first contact to the collected payment.',
        module: 'Jobs & revenue',
        shots: [shot('ind-roof-jobs', 'Jobs & revenue: every inquiry, its source and its stage', 'The Jobs & revenue screen of a sample roofing business: counts of inquiries, jobs won, quoted, completed and collected, and inquiries for leaks, hail claims and re-roofs, each with its stage and source.', ['Every inquiry in one list, whoever took it', 'Its source kept from the first contact', 'Quoted is never counted as money — only collected is'])],
        say: ['After a storm, inquiries pour in from everywhere, and the ones on a notepad in the truck are gone by Friday.', 'In Protected Central every inquiry lands in one ledger, with its source and its stage, kept from first contact to payment.'],
      },
      {
        pain: 'The crew is on a roof when it rings',
        problem: 'Homeowners call three roofers. The one who answers first gets the inspection — and you are thirty feet up.',
        solved: 'Speed to Lead answers a web inquiry from your mailbox within minutes and puts a call-back on today’s list, so the inquiry is acknowledged while the crew works.',
        module: 'AI Autopilot',
        shots: [shot('ind-roof-speed', 'Speed to Lead: acknowledged in minutes, a call-back on today’s list', 'The sample roofing business workspace in AI Autopilot with six active workflows; the first, Speed to Lead, drawn step by step from a form submitted to an email from the roofer’s mailbox.', ['A form submitted starts it — day or night', 'Answered from your mailbox in minutes', 'Runs on the server every five minutes'])],
        say: ['Homeowners call three roofers, and the first to answer gets the inspection. Your crew is on a roof.', 'Speed to Lead answers each web inquiry from your mailbox within minutes, and puts a call-back on today’s list.'],
      },
      {
        pain: 'Inspections missed',
        problem: 'An inspection booked for Thursday, a homeowner who forgot, a crew that drove across town for nothing.',
        solved: 'Inspections, adjuster meetings and tear-offs on one week grid; Appointment Reminder confirms each booking and reminds the homeowner the day before.',
        module: 'Calendar',
        shots: [
          shot('ind-roof-calendar', 'The week: inspections, adjuster meetings and tear-offs', 'A calendar week for the sample roofing business: roof and leak inspections, an adjuster meeting on site, a flat roof survey, a full-day tear-off and a final walk-through.', ['Every visit with its homeowner', 'Adjuster meetings beside your own visits', 'Who to call next, listed beside the week']),
          shot('ind-roof-reminder', 'Appointment Reminder: confirmed, then reminded the day before', 'The Appointment Reminder workflow: an appointment is booked, confirm it by email, wait until the day before, text the reminder.', ['Confirmed the moment it is booked', 'Reminded the day before', 'Texts only where an SMS provider is connected']),
        ],
        say: ['An inspection is booked, the homeowner forgets, and the crew drives across town for nothing.', 'Inspections and adjuster meetings sit on one week grid, and every booking is confirmed and reminded the day before.'],
      },
      {
        pain: 'Estimates and insurance claims stall',
        problem: 'Estimates wait for a decision and insurance jobs wait for an adjuster — and nobody can see which are stuck.',
        solved: 'A roofing pipeline with an Insurance claim stage, days in stage on every card, and follow-up that starts the moment an estimate is sent.',
        module: 'Pipeline',
        shots: [
          shot('ind-roof-pipeline', 'The roofing pipeline, with its insurance-claim stage', 'A deals board titled Roofing jobs with columns New enquiry, Inspection booked, Estimate sent, Insurance claim and Contract signed, each card a job with its homeowner, value and days in stage.', ['Your stages, installed by the roofing snapshot', 'Insurance jobs kept apart, so none goes quiet', 'Days in stage on every card']),
          shot('ind-roof-quote', 'Estimate follow-up that starts when the estimate is sent', 'The Quote Follow-up workflow: when a job is tagged quoted, wait three days, email, wait five days, and on — then it stops.', ['Starts when an estimate is sent', 'Three messages over two weeks', 'Stops the moment they answer']),
        ],
        say: ['Estimates wait for a decision, insurance jobs wait for an adjuster, and nobody sees which are stuck.', 'A roofing pipeline keeps insurance claims in their own stage, with days in stage on every card, and follow-up starts the moment an estimate goes out.'],
      },
      {
        pain: 'Which jobs actually paid — and the insurer’s cheque?',
        problem: 'Deposits, insurer payments and final invoices arrive at different times, and the books never quite match the jobs.',
        solved: 'Open any job: inquiry, quote, completion and every payment, dated and signed. You confirm each payment, including the insurer’s; permits and tax stay out of any fee.',
        module: 'Jobs & revenue',
        shots: [
          shot('ind-roof-lead', 'One job, from inquiry to the insurer’s payment', 'An insurance re-roof opened in Jobs & revenue: its source, quote, the final amount confirmed by the owner and the payment received by cheque, with each step’s history.', ['Every step dated and signed', 'The final amount is yours to confirm', 'Permits and tax left out of any fee']),
          shot('ind-roof-payments', 'Payments: what counts, and what waits for you', 'The Payments tab: payments by cheque, bank transfer and card, each with whether the contractor confirmed it or it is still waiting.', ['A reported payment waits for your confirmation', 'Refunds and reversals come off', 'Only confirmed collections count']),
        ],
        say: ['Deposits, insurer payments and invoices arrive at different times, and nobody knows which jobs actually paid.', 'Open any job and see every step and every payment, including the insurer’s, dated and signed, and counted only once you confirm it.'],
      },
      {
        pain: 'Reviews asked at the wrong moment',
        problem: 'A review request sent to an unhappy homeowner is how a one-star review gets written.',
        solved: 'Client Review Request asks once the job is signed off, by email and then by text; Unhappy Customer Recovery puts anybody unhappy in front of a person, with a task to ring them today.',
        module: 'AI Autopilot',
        shots: [shot('ind-roof-reviews', 'Reviews asked at the right moment; the unhappy go to a person', 'Two workflows in the roofing business workspace: Client Review Request, which asks after the job, and Unhappy Customer Recovery, which gives an unhappy customer to a person with a task to ring them.', ['Asked once the job is signed off', 'An unhappy customer goes to a person first', 'A task to ring them today, before anything else'])],
        say: ['A review request sent to an unhappy homeowner is how a one-star review gets written.', 'Review Request asks once the job is signed off, and Unhappy Customer Recovery puts anyone unhappy in front of a person, with a task to call them today.'],
      },
    ],
  },

  'medical-billing': {
    slug: 'medical-billing',
    eyebrow: 'See it working',
    lead: 'Where claims stall —',
    emph: 'and the screen our billing team works it in.',
    body: 'The RCM workspace with a synthetic practice loaded: claims with the clearinghouse’s and the payer’s answers kept apart, coding review, denials and appeal deadlines, remittances, A/R aging, prior authorizations, the leakage audit and the practice’s own portal.',
    sample: 'Synthetic test data only — invented SYN- references and test payers, no real patient information. The software as our billing team uses it, not a mock-up.',
    film: {
      title: 'Protected Central medical billing',
      intro: 'Most practices do not lose revenue in one big failure. They lose it in claims nobody followed, denials nobody appealed, and payments nobody checked. Here is the workspace our billing team runs, shown on a synthetic practice with no real patient data.',
      outro: 'Every claim followed to payment, every denial worked to an outcome, every payment reconciled, and a portal that shows you all of it. Book a medical billing assessment at protected central dot com slash medical billing.',
    },
    steps: [
      {
        pain: '“Submitted” is not “paid”',
        problem: 'Billing companies report claims as sent. Whether the payer ever answered — and what it said — is a different question nobody shows you.',
        solved: 'Every claim carries two statuses that are never merged: what the clearinghouse said and what the payer said. Billed and paid sit beside them, claim by claim.',
        module: 'Claims',
        shots: [shot('ind-med-claims', 'Claims: the clearinghouse’s answer and the payer’s, kept apart', 'The Medical billing workbench on a synthetic practice: the synthetic-data banner, totals for claims, billed, paid, payer A/R, open denials and amount at stake, and claims each showing a clearinghouse status and a separate payer status.', ['Clearinghouse accepted is not paid — both shown', 'Billed and paid on every claim', 'Totals counted from the claims below'])],
        say: ['Billing companies report claims as sent. Whether the payer ever answered is a different question.', 'Here every claim carries two statuses that are never merged: what the clearinghouse said, and what the payer said.'],
      },
      {
        pain: 'Rejections that sit uncorrected',
        problem: 'A claim rejected by the clearinghouse never reached the payer. If nobody corrects it, nobody ever pays it.',
        solved: 'Open a claim: its lines, codes and every status change, with what is wrong and the next action. A rejection is a task until it is corrected and resubmitted.',
        module: 'Claims',
        shots: [shot('ind-med-claim', 'One claim: its lines, its statuses and what happens next', 'A synthetic claim opened in the workbench: its service lines with codes and charges, the clearinghouse rejection, the payer status and the actions available to the biller.', ['Every line with its code and charge', 'The rejection reason, in words', 'The next action, with who did what'])],
        say: ['A rejected claim never reaches the payer. If nobody corrects it, nobody pays it.', 'Open any claim to see its lines, its statuses and the next action. A rejection stays open until it is corrected and resubmitted.'],
      },
      {
        pain: 'Coding problems found after the denial',
        problem: 'A missing modifier or a diagnosis that does not support the service is found when the denial arrives, weeks later.',
        solved: 'Claims wait in Coding review before they go out. Software flags what looks wrong; a qualified person decides — nothing is recoded on its own.',
        module: 'Coding review',
        shots: [shot('ind-med-review', 'Coding review: checked by a person before it is sent', 'The Coding review queue with a synthetic claim waiting for review, its lines and the reason it was held.', ['Held before submission, not after the denial', 'The reason it was held, in words', 'A person decides every coding change'])],
        say: ['Coding problems are usually found when the denial arrives, weeks later.', 'Here claims wait in coding review before they go out. Software flags, and a qualified person decides.'],
      },
      {
        pain: 'Denials written off quietly',
        problem: 'Denials pile up, the appeal window closes, and the balance is adjusted off without anybody telling the practice.',
        solved: 'Each denial is classified by reason code, with the appeal deadline in view and its outcome tracked: appeal, correction and resubmission, or a write-off that needs a written reason.',
        module: 'Denials & appeals',
        shots: [shot('ind-med-denials', 'Denials: the reason, the deadline and what was done', 'The Denials and appeals tab: open denials grouped by reason, and a synthetic medical-necessity denial with its reason codes, amount, the date it was denied and the date the appeal is due, with buttons to draft an appeal, record a correction or write it off with a reason.', ['Grouped by reason, so the pattern shows', 'The appeal deadline on every denial', 'A write-off needs a written reason'])],
        say: ['Denials pile up, the appeal window closes, and balances are adjusted off without a word.', 'Here each denial is classified by reason, its appeal deadline in view, and a write-off needs a written reason.'],
      },
      {
        pain: 'Payments nobody reconciles',
        problem: 'Remittances post in bulk, underpayments slip through, and the deposit never quite matches what the report says.',
        solved: 'Remittances are imported row by row and matched to claim lines; the same payment is never posted twice, and what does not match becomes an exception somebody owns.',
        module: 'Remittances',
        shots: [shot('ind-med-remits', 'Remittances: every row matched to a claim line', 'The Remittances tab: the import from a CSV export of the 835, and a synthetic remittance opened to show each row matched to its claim line with billed, allowed, paid and adjustment amounts.', ['Each row matched to a claim line', 'Duplicates refused before they post', 'Unmatched rows become owned exceptions'])],
        say: ['Remittances post in bulk, underpayments slip through, and deposits never quite match.', 'Here each remittance row is matched to its claim line, duplicates are refused, and anything unmatched becomes an exception somebody owns.'],
      },
      {
        pain: 'A/R getting older',
        problem: 'Balances drift past 90 and 120 days because nobody owns the follow-up, and the aging report does not say how it was counted.',
        solved: 'A/R by age and by payer, with the rule stated: aged from the date of service, unbilled claims shown apart, the patient’s share moved off the payer.',
        module: 'A/R aging',
        shots: [shot('ind-med-aging', 'A/R aging: by age, by payer, with the rule stated', 'The A/R aging tab: what payers still owe in 0–30, 31–60, 61–90, 91–120 and over-120-day buckets, the counting rule written underneath, and a table by synthetic payer.', ['Aged from the date of service', 'Unbilled claims shown apart', 'Every payer, every bucket'])],
        say: ['Balances drift past ninety and a hundred and twenty days, because nobody owns the follow-up.', 'Here A R is shown by age and by payer, with the counting rule written underneath.'],
      },
      {
        pain: 'Treated before the authorization',
        problem: 'A service is delivered before the prior authorization comes back, and the claim is denied for it.',
        solved: 'A prior-authorization queue: each one needed, requested, approved or denied, with the authorization number, its dates and the date it is needed by.',
        module: 'Prior auth',
        shots: [shot('ind-med-auths', 'Prior authorization: needed, requested, approved — before the visit', 'The Prior auth tab: synthetic authorizations marked needed, submitted and approved, each with the service code, units, payer, the date it is needed by and, once approved, its number and valid dates.', ['Needed-by dates before the visit', 'The number and valid dates on record', 'Denied ones flagged before the service'])],
        say: ['A service is delivered before the authorization comes back, and the claim is denied.', 'Here every prior authorization is tracked from needed, to requested, to approved, with its number and dates, before the visit.'],
      },
      {
        pain: 'Leakage you cannot see',
        problem: 'Claims never submitted, filing limits passed, payers paying below contract — small amounts nobody adds up.',
        solved: 'The leakage audit lists each claim line once, under its most serious finding, with the evidence: lost, at risk, or recoverable underpayment — never counted twice.',
        module: 'Leakage audit',
        shots: [shot('ind-med-leakage', 'The leakage audit: every finding with its evidence', 'The Leakage audit tab: totals lost, at risk and recoverable underpayment, then findings such as a rejection not corrected, a payment below the fee schedule, a denial not worked, a claim close to its filing limit and one past it, each with its evidence.', ['Lost, at risk and recoverable kept apart', 'Each line counted once', 'The evidence written on every finding'])],
        say: ['Unsubmitted claims, passed filing limits and underpayments are small amounts nobody adds up.', 'The leakage audit lists each claim line once, under its most serious finding, with the evidence written beside it.'],
      },
      {
        pain: 'No view of what your biller is doing',
        problem: 'A monthly PDF, slow replies, and no way to check who touched your claims or what is waiting on you.',
        solved: 'The practice’s own portal shows the same claims, denials and A/R; requests and answers sit in Messages; and every view and change is in an access log nobody can edit.',
        module: 'Practice portal',
        shots: [
          shot('ind-med-messages', 'Messages: what is waiting on the practice, and the answers', 'The Messages tab: a request to the synthetic practice and the shared notes between the practice and the billing team.', ['Requests the practice can answer in place', 'Shared notes, separate from internal ones', 'Nothing is lost in an email thread']),
          shot('ind-med-audit', 'The access log: who viewed or changed what, and when', 'The Access log tab: an append-only list of views and changes on the synthetic practice’s claims, each with who, what and when.', ['Every view and change recorded', 'Append-only — nobody can edit it', 'Ids and codes, never patient details']),
        ],
        say: ['A monthly PDF, slow replies, and no way to see who touched your claims.', 'The practice gets its own portal, with requests and answers in one place, and an access log of every view and change that nobody can edit.'],
      },
    ],
  },

  /* No film yet: the page shows the steps alone until one is made. */
  ecommerce: {
    slug: 'ecommerce',
    eyebrow: 'See it working',
    lead: 'Nine places an online store loses customers —',
    emph: 'and the screen that handles each.',
    body: 'A small outdoor-gear brand selling on its own shop and on marketplaces, set up the way we set yours up: the store-customer pipeline, the catalogue and orders, the launch email and posts as drafts, the store’s workflows and its support tickets. Each step is the problem first, then the real screen.',
    sample: 'Screens from a sample store workspace with invented customers, products and orders — the running software, not a mock-up. No marketplace is connected: Amazon, eBay and Walmart appear only as where a customer bought.',
    steps: [
      {
        pain: 'Products and orders in too many tabs',
        problem: 'The catalogue lives in one place, the orders in another and the marketplace sales on a spreadsheet — so nobody is sure what sold, what is still unpaid and what came back.',
        solved: 'The Online shop holds the catalogue — price, cost, stock, and whether each product is for sale or still a draft — and every order with its lines, total and status: pending, paid, fulfilled or refunded.',
        module: 'Online shop',
        shots: [
          shot('ind-ecom-shop', 'Products: price, cost, stock — for sale or still a draft', 'The Online shop of a sample outdoor-gear store: six products, each with its price, what it costs, units in stock and category; five marked for sale and the new camp stove still a draft.', ['Price, cost and stock on every product', 'A new product stays a draft until it is ready', 'Collections, discount codes, delivery and tax below']),
          shot('ind-ecom-orders', 'Orders: pending, paid, fulfilled or refunded', 'The Orders panel: six orders, each with the customer’s email, what they bought, the total and a status of pending, paid, fulfilled or refunded, under a note that no payment account is connected yet.', ['Every order with its lines and total', 'The status changed in place', 'It says so when no payment account is connected']),
        ],
        say: ['The catalogue is in one place, the orders in another, and nobody is sure what sold or what is still unpaid.', 'The online shop keeps the catalogue, with price, cost and stock, and every order with its status: pending, paid, fulfilled or refunded.'],
      },
      {
        pain: 'Customers you cannot tell apart',
        problem: 'A buyer from your own shop, one from Amazon and a wholesale enquiry look the same in an inbox, and nobody can say who bought once and who keeps coming back.',
        solved: 'The e-commerce snapshot’s Store customers pipeline — New enquiry, Cart or quote, First order, Review asked, Repeat customer, Lapsed — and a customer list that keeps where each one came from, a marketplace order noted by hand.',
        module: 'Pipeline',
        shots: [
          shot('ind-ecom-pipeline', 'Store customers: from first enquiry to repeat buyer', 'A deals board titled Store customers with columns New enquiry, Cart or quote, First order, Review asked, Repeat customer and Lapsed — win back, each card a customer with what they bought or asked about, its value and days in stage.', ['Stages installed by the e-commerce snapshot', 'Unpaid orders and group quotes kept apart', 'Days in stage on every card']),
          shot('ind-ecom-contacts', 'Customers: where they came from, their stage and pipeline', 'The contacts list of the sample store: each customer with their source — shop checkout, a wholesale form, or an Amazon, eBay or Walmart order noted by hand — their stage, open deals and place in the pipeline.', ['Where each customer came from', 'Marketplace buyers noted by hand, not synced', 'Stage and pipeline on every row']),
        ],
        say: ['A shop buyer, an Amazon buyer and a wholesale enquiry all look the same in an inbox.', 'Every customer sits in a store pipeline, from first enquiry to repeat buyer, with where they came from kept on the record.'],
      },
      {
        pain: 'A launch email nobody has time to write',
        problem: 'The new product is ready, the people who asked to hear about it are waiting, and the email is still a note on somebody’s phone.',
        solved: 'The launch email waits in Email campaigns as a draft for customers, its subject, preview line and message ready to read — and the screen says plainly that no mailbox can send yet.',
        module: 'Email campaigns',
        shots: [
          shot('ind-ecom-campaigns', 'Email campaigns: the launch email, drafted', 'The Email campaigns screen with two draft campaigns — the camp stove launch and a restock note — nothing sent yet, under a notice that no mailbox can send until one is connected.', ['Drafts, nothing sent', 'It says so when no mailbox can send', 'Addressed to customers, not everybody']),
          shot('ind-ecom-campaign', 'The launch email: subject, preview line and message', 'The camp stove launch campaign opened on its Content tab: the subject, the preview line and the message, signed by the store’s owner.', ['Read every word before it goes', 'Subject and preview line together', 'Marked Draft until it is activated']),
        ],
        say: ['The product is ready, and the launch email is still a note on somebody’s phone.', 'Here the launch email waits as a draft, ready to read, and the screen says plainly that no mailbox can send it yet.'],
      },
      {
        pain: 'Launch posts that never get made',
        problem: 'Everybody agrees the launch needs posts. Launch week arrives and nothing has been designed.',
        solved: 'The launch and product posts are drafted in the Graphics Designer & Editor — for Instagram, Facebook, LinkedIn, YouTube and TikTok — one marked Ready to publish, the rest drafts, and none published.',
        module: 'Graphics Designer & Editor',
        shots: [shot('ind-ecom-social', 'Launch posts, drafted — none published', 'The Graphics Designer & Editor for the sample store: eight designs, none published or scheduled; the camp stove square post marked Ready to publish, and launch, product, restock and tip posts as drafts.', ['Designed ahead of launch week', 'Ready to publish, or still a draft — said on each', 'Published stays at zero until somebody posts'])],
        say: ['Everybody agrees the launch needs posts, and launch week arrives with nothing designed.', 'Here the launch posts are drafted ahead, one marked ready to publish, and none published.'],
      },
      {
        pain: 'Unpaid orders nobody chases',
        problem: 'A card declines at checkout, the order sits unpaid, and nothing tells anybody — so the sale quietly disappears.',
        solved: 'The store’s business workspace in AI Autopilot holds its seven workflows and the set-up still to do. Abandoned Cart Recovery starts when an order is tagged unpaid: wait an hour, assume it was the card, wait a day, ask once whether to hold it.',
        module: 'AI Autopilot',
        shots: [
          shot('ind-ecom-workspace', 'The store’s business workspace: its aim, workflows and set-up', 'The sample store’s business workspace in AI Autopilot, opened on its Overview: the aim — launch the camp stove, recover unpaid orders, ask for reviews, bring buyers back — its seven workflows, and set-up steps still to tick, starting with connecting the mailbox.', ['One aim, seven workflows', 'Set-up steps shown until they are done', 'Revenue counted from paid orders only']),
          shot('ind-ecom-cart', 'Abandoned Cart Recovery: two reminders, then it stops', 'The E-commerce Abandoned Cart Recovery workflow: when an order is tagged unpaid, wait an hour, email assuming it was the card, wait a day, ask once whether to hold it.', ['Starts when an order is tagged unpaid', 'Assumes the card failed, not the customer', 'Two messages, then it stops']),
        ],
        say: ['A card declines at checkout, the order sits unpaid, and nothing tells anybody.', 'The store’s business workspace runs Abandoned Cart Recovery: an hour later it assumes it was the card, and a day later asks once whether to hold the order.'],
      },
      {
        pain: 'Reviews asked before the parcel arrives',
        problem: 'A review request on the day of purchase is asked before anyone has an opinion — and one sent to an unhappy customer invites a bad review.',
        solved: 'Post-Purchase Review thanks the buyer at once and asks how it went twelve days later; Unhappy Customer Recovery takes an unhappy customer off the review list and gives a person a task to ring them today.',
        module: 'AI Autopilot',
        shots: [shot('ind-ecom-reviews', 'Reviews asked once it has arrived; the unhappy go to a person', 'Workflows in the store’s business workspace: Post-Purchase Review, which thanks the buyer and asks twelve days later; Client Review Request, asked once the order is delivered; and Unhappy Customer Recovery, which stops review requests and sets a task to ring the customer.', ['Thanked now, asked once it has been used', 'An unhappy customer is never asked for a review', 'A task to ring them today'])],
        say: ['A review asked the day of purchase comes before anyone has an opinion, and one sent to an unhappy customer invites a bad review.', 'Post-Purchase Review asks once the order has arrived, and Unhappy Customer Recovery hands an unhappy customer to a person instead.'],
      },
      {
        pain: 'Texts nobody agreed to',
        problem: 'A text costs money and cannot be recalled — and one sent to somebody who never asked for it is how a small brand gets reported.',
        solved: 'The review request sends a single text, only after its email and a wait, then marks the customer as asked; and this business workspace is set so that sending texts asks first.',
        module: 'AI Autopilot',
        shots: [
          shot('ind-ecom-sms', 'One text, after the email — then it stops', 'The Client Review Request workflow scrolled to its end: an email asking once, a four-day wait, one text, then the customer is marked as asked.', ['One text, after the email', 'Then it marks them asked and stops', 'Texts only where an SMS provider is connected']),
          shot('ind-ecom-guardrails', 'Send texts: asks first', 'The business workspace settings: what AI Autopilot is allowed to do for the store — write workflows, switch them on, send email, send texts, book appointments, find prospects — with sending texts set to Asks first.', ['Texts set to ask first', 'Each permission per business workspace', 'Changes take effect on the next pass']),
        ],
        say: ['A text costs money, cannot be recalled, and sent to somebody who never asked, gets a small brand reported.', 'Here a review request sends one text, only after its email, and sending texts is set to ask first.'],
      },
      {
        pain: '“Where is my order?” in five inboxes',
        problem: 'Tracking questions, a dented mug and a marketplace return arrive by email, chat and DM, and the urgent one waits behind the rest.',
        solved: 'Every request from the store’s help widget is a ticket with a reference and a status — open, in progress, waiting on customer, resolved — and internal notes the customer never sees; Ticket Triage sends urgent ones to a person and acknowledges the rest.',
        module: 'Customer Engagement',
        shots: [
          shot('ind-ecom-tickets', 'Tickets: each with a reference, a status and notes', 'The Tickets tab: five tickets about a declined card, a dented mug, a sock size bought on Amazon, stalled tracking and a product question, each with its status; the Amazon one opened with an internal note that it is returned through Amazon.', ['Every request a ticket with a reference', 'Open, in progress, waiting, resolved', 'Internal notes the customer never sees']),
          shot('ind-ecom-triage', 'Ticket Triage: urgent to a person, the rest acknowledged', 'The Customer Support Ticket Triage workflow: a support form submitted is tagged as a ticket; if urgent it goes straight to a senior with a task, otherwise it is acknowledged and a task is set to answer it.', ['Urgent goes straight to a person', 'Everyone else is told it has arrived', 'A task so nothing waits unanswered']),
        ],
        say: ['Tracking questions, damaged parcels and marketplace returns arrive everywhere, and the urgent one waits behind the rest.', 'Every request becomes a ticket with a status and private notes, and ticket triage sends the urgent ones straight to a person.'],
      },
      {
        pain: 'One-time buyers who never come back',
        problem: 'Most customers buy once. Nobody reminds them when the socks wear out, and last year’s buyers hear nothing until they have bought elsewhere.',
        solved: 'Repeat Order Reminder writes once, sixty days after an order, with an easy way to stop; Cold Lead Re-activation sends something useful, then something new, then asks whether to stop.',
        module: 'AI Autopilot',
        shots: [shot('ind-ecom-repeat', 'Reminded once when it runs out; lapsed buyers written to, then left alone', 'Two workflows in the store’s business workspace: Repeat Order Reminder, which waits sixty days after an order and reminds once, and Cold Lead Re-activation, which sends a useful note, then news from the workshop, then asks whether to stop.', ['Reminded once, easy to stop', 'Useful first, then something new', 'Three messages, then it leaves them alone'])],
        say: ['Most customers buy once, and nobody reminds them when they run out.', 'Repeat Order Reminder writes once when the order has plausibly run out, and re-activation writes to lapsed buyers three times, then leaves them alone.'],
      },
    ],
  },
};

/** Every picture the steps show, for the capture script. */
export const DEMO_FILES: string[] = Object.values(INDUSTRY_DEMOS).flatMap(d => d.steps.flatMap(s => s.shots.map(x => x.file)));
