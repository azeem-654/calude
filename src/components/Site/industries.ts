/**
 * What the trade pages say — protectedcentral.com/hvac and /roofing.
 *
 * IndustryPage.tsx draws both from this file, so the two pages share every
 * component and differ only in what is written here. Each line was checked
 * against what the product does on the day it was written:
 *
 *   - workflows are named by template key (Autopilot/workflowTemplates.ts), and
 *     the page prints each template's own name and `needs`, so a dependency
 *     (an SMS provider, a tag your phone system has to apply) is read from the
 *     template rather than retyped and forgotten;
 *   - screens are reels.ts shots — the running app, a sample workspace — and
 *     their captions say what is on them, not that they are an HVAC firm's;
 *   - prospecting finds *businesses* in public directories (AI Prospecting),
 *     never homeowners and never storm paths, so the pages point it at
 *     commercial work and say so;
 *   - there is no phone system, no dispatch or crew scheduling, and no
 *     connection to field-service software. Each page says that in its own
 *     words, because a trade owner will ask, and finding out after paying is
 *     worse than reading it here.
 *
 * Nothing here is a figure. No lead counts, no response rates, no revenue —
 * there is no customer data to base one on (CLAUDE.md: no invented figures).
 */
import type { ReactNode } from 'react';
import {
  Inbox, Clock, CalendarClock, History, BarChart3, ClipboardList, Search,
  Users, Calendar, Mail, Workflow, Mic, ShieldCheck, Send, Eye, PenLine,
  Thermometer, CloudRain, Building2, MessageSquare, Home, PhoneCall, FileCheck2, Handshake, Receipt,
} from 'lucide-react';
import type { TradeSlug } from '../../../worker/src/lib/industryPages';
import type { MicrositeConfig } from './micrositeContext';

type Icon = (p: { size?: number }) => ReactNode;

/** A problem as the owner would say it, and what the product does about it. */
export interface Problem { icon: Icon; title: string; pain: string; fix: string }

/** One product section: a reel of real screens and a block per module. */
export interface ModuleStage {
  id: string;
  eyebrow: string;
  lead: string;
  emph: string;
  body: string;
  /** reels.ts keys, in order; their shots are joined into one slideshow. */
  reels: string[];
  /** Only these shots of those reels, when a reel carries some that belong to another story. */
  only?: string[];
  features: { icon: Icon; title: string; body: string; module?: string }[];
  /** Held back where `featureReady('prospects')` is false. */
  needsProspects?: boolean;
}

export interface Industry {
  slug: TradeSlug;
  /** The microsite's frame: its own nav, its own home, its booking words. */
  site: MicrositeConfig;
  /** The growth service, introduced in the trade's words. */
  service: { lead: string; emph: string; body: string };
  /** How the service runs, first call to monthly review. */
  serviceSteps: { icon: Icon; title: string; body: string }[];
  /** The journey every opportunity is tracked through, in the trade's words. */
  journey: string[];
  icon: Icon;
  /** Shown in the eyebrow: "For HVAC businesses". */
  forWhom: string;
  hero: { lead: string; emph: string; sub: string };
  heroShots: string[];
  problemsHead: { lead: string; emph: string; body: string };
  problems: Problem[];
  stages: ModuleStage[];
  /** An example pipeline, drawn as chips — the customer names their own stages. */
  pipelineExample: string[];
  workflowsHead: { lead: string; emph: string; body: string };
  /** Template keys, each with the trade's reason for using it. */
  workflows: { key: string; why: string }[];
  outcomes: string[];
  /** What it does not do — the claims a trade owner will test first. */
  limits: string[];
  pricingIntro: string;
  faq: { q: string; a: string }[];
  talk: { body: string; placeholder: string };
  closing: { title: string; body: string };
}

/* ── Shared steps ─────────────────────────────────────────────────────────
   How a business workspace is set up and run is the same for every trade, so
   it is said once. Each step is a screen in REELS.autopilot. */
export const PROCESS: { icon: Icon; title: string; body: string }[] = [
  { icon: Mic, title: '1. Describe the business', body: 'Tell AI Autopilot what you do, where you work and what you want more of — typed, spoken, or from your website. It asks only what it could not work out.' },
  { icon: Workflow, title: '2. Read the blueprint', body: 'Before anything exists you see every workflow it plans and every step in it, and change any of it in a sentence.' },
  { icon: Send, title: '3. Connect what it sends with', body: 'Your own mailbox — Gmail, Microsoft 365, Brevo or any SMTP. Texts need an SMS provider connected. Until a mailbox is connected nothing sends.' },
  { icon: ShieldCheck, title: '4. Approve what goes out', body: 'Anything that emails or texts starts as a draft. What each business workspace may do on its own is a setting you can see and change.' },
  { icon: Clock, title: '5. It runs on the server', body: 'Every five minutes, whether or not anybody is logged in — so a follow-up due at 7am goes at 7am, not when somebody opens a laptop.' },
  { icon: Eye, title: '6. Review and adjust', body: 'Each business workspace shows what it did, what it made and what waits for you; Analytics shows where leads came from. Change a step with the pen on it.' },
];

/* ── The two modules every trade page shows ──────────────────────────────── */

const LEADS_FEATURES = (enquiry: string) => [
  { icon: Users, title: 'Contacts', module: 'Contacts', body: `Every ${enquiry} with its source, notes, tasks, deals and full history on one page. Spreadsheet imports merge duplicates on the way in.` },
  { icon: ClipboardList, title: 'Forms on your site', module: 'Forms & tickets', body: `A form that files the ${enquiry} as a contact and starts the follow-up you chose — on your own website, a funnel or a page built here.` },
  { icon: Calendar, title: 'Calendar & booking page', module: 'Calendar', body: 'A public booking page in your own hours, the week on one grid, and a reminder workflow before each appointment.' },
];

/* Both trade microsites have the same sections, so the same menu. */
const SITE_NAV = [
  { href: '#problems', label: 'Problems' },
  { href: '#see-it-work', label: 'Demo' },
  { href: '#service', label: 'The service' },
  { href: '#tracking', label: 'Lead to revenue' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

export const INDUSTRIES: Record<TradeSlug, Industry> = {
  hvac: {
    slug: 'hvac',
    site: {
      id: 'hvac', root: '/hvac', tag: 'HVAC', nav: SITE_NAV, signIn: true, growthTerms: true,
      bookLabel: 'Request an HVAC Growth Consultation', bookShort: 'Book a consultation',
      writeHref: '#talk', writeLabel: 'Write to us about your business',
      footerLine: 'Growth and follow-up for heating and cooling businesses.',
    },
    service: {
      lead: 'A growth service,', emph: 'not just software.',
      body: 'We set up an HVAC pipeline, capture and source every inquiry, run the agreed campaigns and outbound prospecting, qualify what comes in and hand qualified opportunities to your team — then track each one through estimate, job, invoice and payment, so both of us can see what the service actually brought in.',
    },
    serviceSteps: [
      { icon: PhoneCall, title: '1. Strategy call', body: 'How inquiries reach you, what estimates are open, your service area and the work you want more of.' },
      { icon: FileCheck2, title: '2. Agreement and limits', body: 'Scope, monthly limits on calls and campaigns, the attribution rules and what the performance fee excludes — in writing, before any work.' },
      { icon: Workflow, title: '3. Setup', body: 'Your pipeline, lead capture with sources, estimate follow-up and the agreed campaigns, built and checked with you.' },
      { icon: Search, title: '4. Prospecting and campaigns', body: 'Commercial prospecting and outbound calls by people, to approved scripts, screened against do-not-call lists and inside calling hours.' },
      { icon: Handshake, title: '5. Qualified hand-off', body: 'Qualified opportunities go to your team with their history. You quote, do the work and invoice, as you do now.' },
      { icon: Receipt, title: '6. Confirm and review', body: 'You confirm quotes, completed jobs and payments; each month we review the report and the fee with you before it is invoiced.' },
    ],
    journey: ['Inquiry received', 'Qualified', 'Opportunity', 'Visit booked', 'Estimate sent', 'Estimate accepted', 'Job won', 'Job in progress', 'Job completed', 'Final amount confirmed', 'Invoice issued', 'Payment received'],
    icon: Thermometer,
    forWhom: 'For HVAC businesses',
    hero: {
      lead: 'Every estimate followed up',
      emph: 'Every season planned ahead',
      sub: 'A growth and automation service for heating and cooling businesses: an HVAC pipeline set up for you, every inquiry captured with its source, agreed campaigns and outbound prospecting, qualified opportunities handed to your team — and every estimate tracked through to the job, the invoice and the payment.',
    },
    heroShots: ['pipe-board', 'hero-flow', 'contacts-profile'],
    problemsHead: {
      lead: 'Where HVAC work',
      emph: 'slips through.',
      body: 'Most of it is not a shortage of enquiries. It is the follow-up that nobody had time for between calls.',
    },
    problems: [
      {
        icon: Inbox, title: 'Leads in five places',
        pain: 'Web forms, phone calls, texts, emails and a spreadsheet from last year — and no single list of who is waiting for what.',
        fix: 'Forms on your site file each enquiry as a contact with its source. Calls and texts you take, you add in a few seconds. Spreadsheet imports merge duplicates.',
      },
      {
        icon: Clock, title: 'Estimates that go quiet',
        pain: 'The estimate goes out after the site visit, and nobody chases it — the next call is always more urgent.',
        fix: 'Quote Follow-up chases each estimate three times over a fortnight from your mailbox, then stops asking. Stale Deal Alert puts any estimate untouched for two weeks on somebody’s task list.',
      },
      {
        icon: Thermometer, title: 'The first heatwave',
        pain: 'When the weather turns, the phone rings all day and web enquiries wait until the evening — or next week.',
        fix: 'Speed to Lead answers a web enquiry within minutes from your mailbox and puts a call-back on today’s task list, so it does not wait for a quiet moment.',
      },
      {
        icon: History, title: 'Past customers forgotten',
        pain: 'Last year’s installs and service calls sit in the database, and nobody writes to them until they ring somebody else.',
        fix: 'A reactivation campaign writes to the customers you tag, ahead of the season — three messages, then it leaves them alone. It is meant for people who agreed to hear from you.',
      },
      {
        icon: BarChart3, title: 'No view of the pipeline',
        pain: 'Nobody can say how many estimates are open, which are worth chasing, or what they add up to.',
        fix: 'A pipeline with your own stages, dragged across as jobs move, with open and weighted value counted from the deals you record. Describe the business and AI proposes the stages.',
      },
      {
        icon: PenLine, title: 'The same admin every day',
        pain: 'The same confirmation, the same reminder, the same “just checking in” — typed by hand, when somebody remembers.',
        fix: 'Workflows do the repeat work — confirmations, reminders, follow-ups and tasks for the team — as steps you can read, change and switch off.',
      },
      {
        icon: Building2, title: 'Prospecting stops when it is busy',
        pain: 'Maintenance contracts with commercial sites need steady outreach, and it is the first thing to stop when every van is out.',
        fix: 'AI Prospecting finds businesses in your area from public directories — property managers, restaurants, offices — checks the addresses they publish, and proposes them in batches you approve.',
      },
    ],
    stages: [
      {
        id: 'leads', eyebrow: 'Lead organisation', lead: 'Every enquiry,', emph: 'one list.',
        body: 'Whoever took it and however it arrived, each enquiry becomes a contact with a next step — so “did anybody ring them back?” has an answer.',
        reels: ['contacts', 'engagement', 'calendar'], only: ['contacts-list', 'contacts-profile', 'eng-forms', 'cal-week', 'cal-booking'],
        features: LEADS_FEATURES('enquiry'),
      },
      {
        id: 'pipeline', eyebrow: 'CRM & pipeline', lead: 'A pipeline shaped like', emph: 'your estimates.',
        body: 'Enquiry, visit booked, estimate sent, won — or whatever your stages are. Each deal carries its value, its owner and its history, and the follow-up can start the moment it changes stage.',
        reels: ['pipelines', 'analytics'], only: ['pipe-board', 'pipe-deal', 'pipe-table', 'analytics'],
        features: [
          { icon: BarChart3, title: 'Pipelines', module: 'Pipelines', body: 'Stages you name, deals dragged across, open and weighted value counted from your own records. Install and service work can be separate pipelines.' },
          { icon: Workflow, title: 'Stage-triggered follow-up', module: 'Pipelines', body: 'Proposal Follow-up starts when a deal reaches the stage you choose — the email goes and a call lands on your list.' },
          { icon: Eye, title: 'Analytics', module: 'Analytics', body: 'Leads and where they came from, and revenue, read live from the modules — never estimated.' },
        ],
      },
      {
        id: 'follow-up', eyebrow: 'Estimate & inquiry follow-up', lead: 'Follow-up that runs', emph: 'without being remembered.',
        body: 'Sequences on your own mailbox that stop the moment somebody answers, and campaigns to the lists you choose — scheduled on the server, so they go out with every laptop closed.',
        reels: ['marketing'],
        features: [
          { icon: Mail, title: 'Email & sequences', module: 'Email & sequences', body: 'Multi-step cadences written with AI in your voice, sent from your own mailbox, ended by a reply.' },
          { icon: CalendarClock, title: 'Seasonal campaigns', module: 'Email & sequences', body: 'A check-in before summer and before winter, to the customers you choose — drafted for you to read and approve.' },
          { icon: MessageSquare, title: 'Texts, with consent', module: 'Email & sequences', body: 'SMS through the provider you connect, only to people who opted in, with STOP honoured.' },
        ],
      },
      {
        id: 'prospecting', eyebrow: 'AI-assisted prospecting', lead: 'Commercial accounts,', emph: 'found every day.',
        body: 'Describe who you want to reach — “property managers in Phoenix”, “restaurants in Columbus” — and AI Prospecting searches public business directories and the businesses’ own websites, checks each address, and can repeat the search every day.',
        reels: ['prospecting', 'hero'], only: ['pr-start', 'pr-addto', 'pr-every-day', 'hero-daily'],
        needsProspects: true,
        features: [
          { icon: Search, title: 'One sentence, a list', body: 'Trade and town in plain words. It finds businesses, not homeowners, so it suits commercial maintenance and contract work.' },
          { icon: ShieldCheck, title: 'Checked before use', body: 'Every address is checked for format, domain and mail server. Connect a verifier and it can say a mailbox exists.' },
          { icon: Users, title: 'Batches you approve', body: 'New prospects are proposed in batches that wait for your yes before anybody is written to.' },
        ],
      },
    ],
    pipelineExample: ['New enquiry', 'Visit booked', 'Estimate sent', 'Follow-up', 'Won', 'Lost'],
    workflowsHead: {
      lead: 'Ready-made workflows,', emph: 'picked for HVAC.',
      body: 'Each is a starting point you can read in full, change and switch on. Nothing runs until you do, and each one says what it needs before you add it.',
    },
    workflows: [
      { key: 'speed-to-lead', why: 'For the web enquiries that arrive while every technician is on a job.' },
      { key: 'quote-chase', why: 'For estimates sent after a site visit that never got a yes or a no.' },
      { key: 'dormant-winback', why: 'Before each season: past customers who have not booked a service in a year.' },
      { key: 'year-emails', why: 'Maintenance tips and seasonal reminders for every week of the year, drafted from your business profile.' },
      { key: 'appointment-reminders', why: 'For installs and service visits booked weeks ahead, so the slot is not lost.' },
      { key: 'stale-deal', why: 'Any estimate nobody has touched in a fortnight goes on a task list.' },
      { key: 'review-request', why: 'After the job, while the house is warm (or cool) again.' },
      { key: 'referral-request', why: 'Happy customers asked once whether anybody they know needs the same.' },
    ],
    outcomes: [
      'Every enquiry has a next step and somebody it belongs to.',
      'Every estimate is followed up on a schedule — until they answer, or it stops asking.',
      'Past customers hear from you before the season rather than after it.',
      'You can see what is open, at what stage, and what it is worth.',
      'Today’s call-backs are tasks on a list, not things somebody has to remember.',
      'Commercial prospecting keeps going in the busy months, in batches you approve.',
    ],
    limits: [
      'It does not answer your phone. There is no phone system here, and texts go out only through an SMS provider you connect.',
      'It does not dispatch technicians, plan routes or manage parts. It has a calendar and a booking page, not a dispatch board.',
      'It does not connect to field-service software today. Contacts come in by form, CSV import or by hand.',
      'It does not guarantee leads or revenue. It makes sure the enquiries and estimates you have are followed up.',
      'It does not replace your office team. It does the repeated follow-up so they can do the rest.',
    ],
    pricingIntro: 'The setup, the monthly platform and service fee, and a performance fee on eligible collections from jobs the service brought in. Your advertising budget and any approved third-party charges are yours, paid directly and never marked up.',
    faq: [
      { q: 'Does it answer our phones or take calls for us?', a: 'No. Protected Central has no phone system and does not answer calls. Texts go out through an SMS provider you connect. The Missed Call Text Back workflow can text a caller back, but only once something tags them “missed-call” — your own phone system or somebody on your team.' },
      { q: 'Can it schedule or dispatch technicians?', a: 'No. It has a calendar, a public booking page for appointments people book themselves, and reminders before them. It does not route technicians, plan jobs or manage parts — keep your field-service software for that.' },
      { q: 'Does it connect to our field-service or job-management software?', a: 'Not directly today. Contacts come in through forms, CSV imports (duplicates merged) or by hand. If you need a connection to something you already use, raise it on the strategy call — it is scoped and quoted separately, never assumed.' },
      { q: 'Will it email or text customers without our say-so?', a: 'No. Anything that emails or texts starts as a draft, and new prospects are proposed in batches that wait for approval. What each business workspace may do on its own is a setting you can see and change.' },
      { q: 'Where do new commercial leads come from?', a: 'AI Prospecting searches public business directories and the businesses’ own websites, and checks every address before it is used. It finds businesses — property managers, offices, restaurants — not homeowners. How many it finds a month depends on your plan.' },
      { q: 'Who sets it up?', a: 'We do, as part of the setup fee: your pipeline, lead capture, the agreed campaigns and the tracking. You check it with us before anything runs. You keep a login to see everything yourself.' },
      { q: 'Who makes the outbound calls?', a: 'People, working to a script you have approved, inside calling hours, screened against do-not-call lists, and within the monthly limit in your agreement. Nothing places automated, prerecorded or AI-voiced calls. Calling starts only after the scope and the compliance check are agreed.' },
      { q: 'Do you promise more jobs or revenue?', a: 'No. We cannot promise leads, jobs or revenue. The service makes sure inquiries and estimates are captured, followed up and tracked, and that prospecting keeps going. What that brings in depends on your market, your prices and how your team answers.' },
    ],
    talk: {
      body: 'Tell us how enquiries reach you now, how estimates are followed up, and what you would like to change. A person reads every message and replies by email.',
      placeholder: 'How many technicians, how enquiries arrive, what happens after an estimate goes out…',
    },
    closing: { title: 'Every enquiry answered.\nEvery estimate followed up.', body: 'Start with a strategy call about your business. No obligation, and nothing runs until you have agreed it.' },
  },

  roofing: {
    slug: 'roofing',
    site: {
      id: 'roofing', root: '/roofing', tag: 'Roofing', nav: SITE_NAV, signIn: true, growthTerms: true,
      bookLabel: 'Request a Roofing Growth Consultation', bookShort: 'Book a consultation',
      writeHref: '#talk', writeLabel: 'Write to us about your business',
      footerLine: 'Inquiries, inspections and estimates, followed through for roofing contractors.',
    },
    service: {
      lead: 'Inspections to collected payments,', emph: 'run with you.',
      body: 'We set up a roofing pipeline, capture homeowner and property-manager inquiries with their source, run the agreed campaigns and commercial prospecting, qualify what comes in and pass qualified opportunities to your team — then follow every inspection and estimate through to the signed job, the final invoice and the payment.',
    },
    serviceSteps: [
      { icon: PhoneCall, title: '1. Strategy call', body: 'Residential or commercial, how inquiries arrive, what happens after an inspection and where estimates stall.' },
      { icon: FileCheck2, title: '2. Agreement and limits', body: 'Scope, monthly limits, attribution rules and exclusions — such as insurance-claim work you already had — agreed in writing first.' },
      { icon: Workflow, title: '3. Setup', body: 'Your roofing pipeline, inquiry capture with sources, inspection confirmations and estimate follow-up, built and checked with you.' },
      { icon: Search, title: '4. Prospecting and campaigns', body: 'Property managers and commercial owners found and called by people, to approved scripts, screened against do-not-call lists and inside calling hours.' },
      { icon: Handshake, title: '5. Qualified hand-off', body: 'Qualified opportunities reach your estimator with their history. You inspect, quote and do the work, as you do now.' },
      { icon: Receipt, title: '6. Confirm and review', body: 'You confirm accepted estimates, completed jobs and payments; each month we go through the report and the fee with you before it is invoiced.' },
    ],
    journey: ['Inquiry received', 'Qualified', 'Opportunity', 'Inspection booked', 'Estimate sent', 'Estimate accepted', 'Contract won', 'Job in progress', 'Job completed', 'Final amount confirmed', 'Invoice issued', 'Payment received'],
    icon: Home,
    forWhom: 'For roofing contractors',
    hero: {
      lead: 'Every inspection followed up',
      emph: 'Every estimate kept moving',
      sub: 'A growth and automation service for roofing contractors: a roofing pipeline set up for you, homeowner and property-manager inquiries captured with their source, agreed campaigns and commercial prospecting, and every inspection and estimate followed through to the signed job and the collected payment.',
    },
    heroShots: ['pipe-board', 'hero-flow', 'cal-week'],
    problemsHead: {
      lead: 'Where roofing work',
      emph: 'goes quiet.',
      body: 'Inquiries come in waves. The ones that are lost are mostly lost in the follow-up, weeks after the inspection.',
    },
    problems: [
      {
        icon: Inbox, title: 'Inquiries everywhere',
        pain: 'Website forms, calls, texts, referrals and a sheet of addresses from last month — some answered, some not, nobody sure which.',
        fix: 'Forms on your site file each inquiry as a contact with its source. Calls and texts you take, you add in a few seconds. Spreadsheet imports merge duplicates.',
      },
      {
        icon: CalendarClock, title: 'Slow inspection follow-up',
        pain: 'The inspection is booked, then forgotten until the day — and the estimate after it waits until somebody has a free evening.',
        fix: 'Appointment Reminder confirms the inspection and reminds them the day before. Speed to Lead answers a new inquiry within minutes and puts a call-back on today’s list.',
      },
      {
        icon: CloudRain, title: 'Leads gone cold after the rush',
        pain: 'After a storm everybody wants an inspection at once. A month later half those leads have gone quiet, and nobody had time to chase them.',
        fix: 'Cold Lead Re-activation writes to the leads you tag — three messages, then it stops. Stale Deal Alert flags any estimate untouched for a fortnight.',
      },
      {
        icon: BarChart3, title: 'No view of the pipeline',
        pain: 'How many estimates are out, how many are waiting on a decision, what the open work is worth — nobody can say without a spreadsheet.',
        fix: 'A pipeline with your own stages — inquiry, inspection booked, estimate sent, decision pending, won — with open and weighted value counted from your deals. AI can propose the stages.',
      },
      {
        icon: Search, title: 'Prospecting by hand',
        pain: 'Commercial work means finding property managers and building owners, and writing to them, week after week.',
        fix: 'AI Prospecting finds businesses in your area from public directories — property managers, facilities firms, commercial landlords — checks their published addresses, and proposes them in batches you approve.',
      },
      {
        icon: MessageSquare, title: 'Two audiences, one message',
        pain: 'A homeowner and a property manager need different follow-up, and both get the same rushed email — or nothing.',
        fix: 'Tag each contact, or keep two pipelines, and give each its own sequence in its own words. Every workflow starts from the tag or stage you choose.',
      },
      {
        icon: ClipboardList, title: 'Too many open jobs to track',
        pain: 'Dozens of estimates at different stages, each needing a different next step, kept in somebody’s head.',
        fix: 'Every deal carries its stage, owner, tasks and history. Stage-triggered workflows send the next message and put the call on the right person’s list.',
      },
    ],
    stages: [
      {
        id: 'leads', eyebrow: 'Inquiry management', lead: 'Every inquiry,', emph: 'one list.',
        body: 'From the website, a referral or a call taken on the roof — each inquiry becomes a contact with a next step, and nobody has to remember who rang back.',
        reels: ['contacts', 'engagement', 'calendar'], only: ['contacts-list', 'contacts-profile', 'eng-forms', 'cal-week', 'cal-booking'],
        features: LEADS_FEATURES('inquiry'),
      },
      {
        id: 'pipeline', eyebrow: 'CRM & pipeline', lead: 'From inspection', emph: 'to signed job.',
        body: 'Inquiry, inspection booked, estimate sent, decision pending, won — or your own stages. Each deal carries its value, owner and history, and the follow-up can start the moment it moves.',
        reels: ['pipelines', 'analytics'], only: ['pipe-board', 'pipe-deal', 'pipe-table', 'analytics'],
        features: [
          { icon: BarChart3, title: 'Pipelines', module: 'Pipelines', body: 'Stages you name, deals dragged across, open and weighted value counted from your own records. Residential and commercial can be separate pipelines.' },
          { icon: Workflow, title: 'Stage-triggered follow-up', module: 'Pipelines', body: 'Proposal Follow-up starts when an estimate reaches the stage you choose — the email goes and a call lands on your list.' },
          { icon: Eye, title: 'Analytics', module: 'Analytics', body: 'Leads and where they came from, and revenue, read live from the modules — never estimated.' },
        ],
      },
      {
        id: 'follow-up', eyebrow: 'Inspection & estimate follow-up', lead: 'Follow-up homeowners', emph: 'actually receive.',
        body: 'Sequences on your own mailbox that stop the moment somebody answers, and campaigns to the lists you choose — scheduled on the server, so they go out while the crew is on a roof.',
        reels: ['marketing'],
        features: [
          { icon: Mail, title: 'Email & sequences', module: 'Email & sequences', body: 'Multi-step cadences written with AI in your voice, sent from your own mailbox, ended by a reply.' },
          { icon: Users, title: 'Homeowners and property managers', module: 'Email & sequences', body: 'A different sequence for each audience, chosen by tag or pipeline, each in its own words.' },
          { icon: MessageSquare, title: 'Texts, with consent', module: 'Email & sequences', body: 'SMS through the provider you connect, only to people who opted in, with STOP honoured.' },
        ],
      },
      {
        id: 'prospecting', eyebrow: 'AI-assisted prospecting', lead: 'Commercial work,', emph: 'found every day.',
        body: 'Describe who you want to reach — “property management companies in Dallas”, “commercial landlords in Tampa” — and AI Prospecting searches public business directories and the businesses’ own websites, checks each address, and can repeat the search every day.',
        reels: ['prospecting', 'hero'], only: ['pr-start', 'pr-addto', 'pr-every-day', 'hero-daily'],
        needsProspects: true,
        features: [
          { icon: Search, title: 'One sentence, a list', body: 'Trade and town in plain words. It finds businesses, not homeowners and not storm paths, so it suits commercial and property-management work.' },
          { icon: ShieldCheck, title: 'Checked before use', body: 'Every address is checked for format, domain and mail server. Connect a verifier and it can say a mailbox exists.' },
          { icon: Users, title: 'Batches you approve', body: 'New prospects are proposed in batches that wait for your yes before anybody is written to.' },
        ],
      },
    ],
    pipelineExample: ['New inquiry', 'Inspection booked', 'Estimate sent', 'Decision pending', 'Won', 'Lost'],
    workflowsHead: {
      lead: 'Ready-made workflows,', emph: 'picked for roofing.',
      body: 'Each is a starting point you can read in full, change and switch on. Nothing runs until you do, and each one says what it needs before you add it.',
    },
    workflows: [
      { key: 'speed-to-lead', why: 'For the inquiries that arrive while the crew is on a roof.' },
      { key: 'appointment-reminders', why: 'Confirms the inspection and reminds the homeowner the day before.' },
      { key: 'quote-chase', why: 'For estimates sent after the inspection that never got a decision.' },
      { key: 'stage-proposal', why: 'Starts the follow-up the moment an estimate moves to the stage you name.' },
      { key: 'stale-deal', why: 'Any estimate nobody has touched in a fortnight goes on a task list.' },
      { key: 'dormant-winback', why: 'For leads from the last rush that went quiet — edit the wording for roofs.' },
      { key: 'review-request', why: 'After the job is signed off, while the new roof is the talk of the street.' },
      { key: 'unhappy-first', why: 'Anybody unhappy goes to a person with a task — never to a review request.' },
    ],
    outcomes: [
      'Every inquiry has a next step and somebody it belongs to.',
      'Inspections are confirmed and reminded, so fewer slots are lost.',
      'Every estimate is followed up on a schedule — until they decide, or it stops asking.',
      'Leads from the last rush are written to again, instead of forgotten.',
      'You can see every open estimate, its stage and what it is worth.',
      'Commercial prospecting keeps going in batches you approve.',
    ],
    limits: [
      'It does not answer your phone. There is no phone system here, and texts go out only through an SMS provider you connect.',
      'It does not track storms or find homeowners. Prospecting searches business directories, so it suits commercial work.',
      'It does not schedule crews, measure roofs, order materials or handle insurance claims.',
      'It does not connect to roofing or job-management software today. Contacts come in by form, CSV import or by hand.',
      'It does not guarantee leads or revenue, and it does not replace your office team — it does the repeated follow-up.',
    ],
    pricingIntro: 'The setup, the monthly platform and service fee, and a performance fee on eligible collections from roofing jobs the service brought in. Your advertising budget and any approved third-party charges are paid by you directly and never marked up.',
    faq: [
      { q: 'Can it find homes damaged in a storm?', a: 'No. It does not track storms and does not find individual homeowners. AI Prospecting searches public business directories, so it suits commercial work — property managers, facilities firms, commercial building owners. Homeowners reach you through your forms, your booking page and the lists you are allowed to contact.' },
      { q: 'Does it answer our phones or take calls for us?', a: 'No. Protected Central has no phone system and does not answer calls. Texts go out through an SMS provider you connect. The Missed Call Text Back workflow can text a caller back, but only once something tags them “missed-call” — your own phone system or somebody on your team.' },
      { q: 'Can it schedule crews or manage jobs?', a: 'No. It has a calendar, a public booking page for inspections people book themselves, and reminders before them. It does not schedule crews, measure roofs, order materials or handle insurance claims.' },
      { q: 'Can homeowners and property managers get different follow-up?', a: 'Yes. Tag each contact, or keep separate pipelines, and give each audience its own sequence. Every workflow starts from the tag or stage you choose, and every message is yours to edit.' },
      { q: 'Does it connect to our roofing or job-management software?', a: 'Not directly today. Contacts come in through forms, CSV imports (duplicates merged) or by hand. If you need a connection to something you already use, raise it on the strategy call — it is scoped and quoted separately, never assumed.' },
      { q: 'Will it email or text anybody without our say-so?', a: 'No. Anything that emails or texts starts as a draft, and new prospects are proposed in batches that wait for approval. What each business workspace may do on its own is a setting you can see and change.' },
      { q: 'Who sets it up?', a: 'We do, as part of the setup fee: the pipeline, inquiry capture, inspection and estimate follow-up, the agreed campaigns and the tracking. You check it with us before anything runs, and keep a login to see everything.' },
      { q: 'Does insurance or storm work count toward the fee?', a: 'Only what your agreement says counts. Work you already had, existing customers and jobs from your other sources are excluded, and how insurance-funded jobs, supplements and deductibles are treated is written into the agreement before work starts.' },
      { q: 'Do you promise more jobs or revenue?', a: 'No. We cannot promise leads, jobs, collections or revenue. The service makes sure inquiries, inspections and estimates are captured, followed up and tracked, and that prospecting keeps going. What that brings in depends on your market, your prices and how your team answers.' },
    ],
    talk: {
      body: 'Tell us how inquiries reach you now, what happens after an inspection, and what you would like to change. A person reads every message and replies by email.',
      placeholder: 'Residential or commercial, how inquiries arrive, what happens after an estimate goes out…',
    },
    closing: { title: 'Every inquiry answered.\nEvery estimate followed up.', body: 'Start with a consultation about your roofing business. No obligation, and nothing runs until you have agreed it.' },
  },
};
