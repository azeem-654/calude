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
 * Three sample workspaces on a fresh database: a heating and cooling firm and
 * a roofer set up the way the growth service sets one up (the industry
 * snapshot's pipeline and fields, workflows from the template library, the
 * Jobs & revenue ledger written through the real API), and the synthetic
 * medical practice `synthetic_seed` loads, whose every screen says
 * "Synthetic test data only". Every business, person and amount is invented;
 * the section says so above the first picture. Each `solved` line describes
 * only what is on its screen, never a result.
 */
import type { ReelShot } from './reels';

export type DemoSlug = 'hvac' | 'roofing' | 'medical-billing';

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
  film: { title: string; intro: string; outro: string };
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
};

/** Every picture the steps show, for the capture script. */
export const DEMO_FILES: string[] = Object.values(INDUSTRY_DEMOS).flatMap(d => d.steps.flatMap(s => s.shots.map(x => x.file)));
