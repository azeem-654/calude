/**
 * Workflows somebody can start from, and the demo that shows the whole thing.
 *
 * ── Why these are data rather than a wizard ──
 *
 * A new project's Workflows tab is empty, and an empty screen asks the customer
 * to invent a follow-up from nothing — which is the moment most people close
 * the tab. Each of these is a thing every small business already does by hand
 * and forgets to do, written out as steps they can read, change and switch on.
 *
 * They are **starting points, not products**. Every one lands as a draft in the
 * project's own table, editable in full, and nothing is switched on by adding
 * one — because each of them sends something.
 *
 * ── The demo ──
 *
 * `DEMO` builds a real client, a real project and three real workflows. Nothing
 * in it is mocked: the rows are the same rows a customer's own project has, the
 * engine runs them the same way, and deleting the project removes them. It is
 * labelled a demo so nobody mistakes it for their own work, and that label is
 * the only thing about it that is special.
 */
import type { WorkflowNode } from '../../services/autopilot';

const n = (
  id: string, type: string, label: string,
  config: Record<string, string>, nextId: string | null,
  extra: Partial<WorkflowNode> = {},
): WorkflowNode => ({ id, type, label, config, nextId, ...extra });

/** The shelf a template sits on. See `CATEGORIES` for the order and the why. */
export type TemplateCategory =
  | 'speed' | 'appointments' | 'reviews' | 'winback'
  | 'pipeline' | 'retention' | 'content' | 'shop';

export interface WorkflowTemplate {
  key: string;
  name: string;
  description: string;
  /**
   * Which shelf of the library it sits on.
   *
   * By the **job it does**, not by the feature it uses. Zapier and n8n file by
   * app — "Gmail", "Slack" — which works when somebody arrives knowing the tool
   * they want to connect. Nobody here arrives thinking "I need a condition
   * node"; they arrive thinking "people ring and we miss it".
   */
  category: TemplateCategory;
  /** One line on what it is for, shown before somebody adds it. */
  blurb: string;
  /**
   * The problem, stated as the customer would state it.
   *
   * The single most common complaint about the big automation platforms is that
   * you are handed a canvas and left to work out what to build. A template that
   * only says what it *does* still leaves that work undone. This says what goes
   * wrong without it.
   */
  pain: string;
  /**
   * What the industry says about this one, and who said it.
   *
   * Attributed, and every one of these is a vendor or agency published figure
   * rather than independent research — so the source travels with the number.
   * A claim with no source attached is a claim this product is making itself,
   * and it is not in a position to.
   */
  evidence?: { claim: string; source: string };
  /**
   * The words somebody actually types.
   *
   * Searching the name and the copy is not enough: this library is filed by the
   * *problem*, and the problem somebody types is "missed calls" while the
   * template is called "Text back a call nobody answered" and its blurb says
   * `missed-call` with a hyphen. A search that returns nothing for the most
   * obvious phrase in the category is a library nobody trusts twice.
   */
  keywords: string[];
  /**
   * The trades and sectors this is written for.
   *
   * Shown as tags on the gallery card and filterable. Kept explicit rather than
   * derived because it is a judgement about who the copy suits, and the copy is
   * the part a plumber and a SaaS founder would each want changed.
   */
  industry: string[];
  /**
   * On the front shelf.
   *
   * A handful only. "Featured" that includes half the library is a sort order,
   * not a recommendation.
   */
  featured?: boolean;
  /**
   * What has to be connected before this can actually run.
   *
   * Said before it is added, not discovered from a delivery log. A workflow
   * that texts is useless without an SMS provider, and the honest place to say
   * so is the moment somebody is choosing it.
   */
  needs: string[];
  /**
   * What it is reasonable to expect.
   *
   * A range, always, and labelled an assumption — the same rule the sending
   * plan follows. A single number here would be a forecast this product cannot
   * make about a business it knows six lines about.
   */
  outcome: string;
  nodes: WorkflowNode[];
}

/**
 * The shelves, in the order somebody should build them.
 *
 * Not alphabetical and not arbitrary: this is the order the research says pays.
 * Answering a new enquiry fast is the one that returns something in the first
 * week; content is the one that pays in six months. A library sorted A–Z buries
 * the first behind "Appointments".
 */
export const CATEGORIES: { key: TemplateCategory; label: string; blurb: string }[] = [
  {
    key: 'speed',
    label: 'Answer people fast',
    blurb: 'The first hour after somebody gets in touch decides most of it. Build these first.',
  },
  {
    key: 'appointments',
    label: 'Appointments',
    blurb: 'Getting them booked, getting them kept, and getting the no-shows back.',
  },
  {
    key: 'reviews',
    label: 'Reviews and reputation',
    blurb: 'Asking at the right moment, and catching an unhappy customer before they post.',
  },
  {
    key: 'winback',
    label: 'Win back old customers',
    blurb: 'The cheapest list anybody owns is the one they already have.',
  },
  {
    key: 'pipeline',
    label: 'Keep the pipeline moving',
    blurb: 'Deals that go quiet, quotes nobody chased, stages nobody updated.',
  },
  {
    key: 'retention',
    label: 'Keep the customers you win',
    blurb: 'The first month after somebody buys, and the referral nobody asks for.',
  },
  {
    key: 'content',
    label: 'Content on a schedule',
    blurb: 'Runs on a clock rather than on a person: posts, articles and campaigns, written from the client’s own profile.',
  },
  {
    key: 'shop',
    label: 'Shop and orders',
    blurb: 'Orders that were never paid for, and buyers nobody thanked.',
  },
];

export const TEMPLATES: WorkflowTemplate[] = [
  /* ── Answer people fast ─────────────────────────────────────────────────
   *
   * First in the library because it is first in the research: the business that
   * replies first wins most of the time, and replying within five minutes
   * rather than thirty is the single largest lever in here. Everything else
   * below is worth less than getting this one right.
   */
  {
    key: 'speed-to-lead',
    name: 'Speed to Lead Response Automation',
    category: 'speed',
    description: 'Answer every new enquiry within minutes and chase the ones that go quiet.',
    blurb: 'Tags them, waits long enough not to read as a robot, replies, puts a call on your list, then checks two days later whether anybody actually got back to them.',
    pain: 'An enquiry arrives at 4pm on a Friday. Somebody sees it Monday. By then they have had three other quotes.',
    evidence: {
      claim: 'Leads contacted within five minutes are reported as far likelier to convert than those contacted at thirty, and the business that replies first is said to take most of the deals.',
      source: 'Call Loop / Branding Marketing Agency, 2026',
    },
    industry: ['Trades', 'Professional services', 'Agency', 'Local business'],
    featured: true,
    keywords: ['speed to lead', 'new lead', 'enquiry', 'inquiry', 'contact form', 'respond fast', 'first response', 'follow up'],
    needs: ['A connected mailbox', 'A form on the site or funnel'],
    outcome: 'Every enquiry gets an answer the same hour instead of the next working day. What that is worth depends entirely on how many you currently miss — count a fortnight before and after.',
    nodes: [
      n('n0', 'trigger', 'A form is submitted', { event: 'form_submitted' }, 'n1'),
      n('n1', 'add_tag', 'Tag as an enquiry', { tag: 'enquiry' }, 'n2'),
      /* Two minutes, not instantly. Long enough not to read as an
         autoresponder, short enough that they still have the page open. */
      n('n2', 'wait', 'Wait 2 minutes', { minutes: '2' }, 'n3'),
      n('n3', 'send_email', 'Answer them', {
        subject: 'Thanks for getting in touch, {{firstName}}',
        body: 'Hello {{firstName}},\n\nI have your enquiry and I am looking at it now. I will come back to you today with everything you need.\n\nIf it is urgent, just reply to this — it comes straight to me.',
      }, 'n4'),
      n('n4', 'create_task', 'Remind me to call them', { title: 'Call this enquiry back today' }, 'n5'),
      n('n5', 'wait', 'Wait 2 days', { days: '2' }, 'n6'),
      n('n6', 'condition', 'Did anybody reply?', { field: 'status', operator: 'equals', value: 'replied' }, null,
        { yesId: null, noId: 'n7' }),
      n('n7', 'send_email', 'Check nothing was missed', {
        subject: 'Did you get what you needed, {{firstName}}?',
        body: 'Hello {{firstName}},\n\nJust checking this did not slip through. If you still want a price, reply with the address and I will get one over.\n\nIf you have sorted it elsewhere, no problem at all — tell me and I will stop bothering you.',
      }, null),
    ],
  },
  {
    key: 'missed-call',
    name: 'Missed Call Text Back Automation',
    category: 'speed',
    description: 'Text a caller straight back when nobody picked up, then follow with email.',
    blurb: 'Tag somebody "missed-call" and this texts them straight back, then emails if they do not reply. The tag is what starts it — see what it needs, below.',
    pain: 'The phone rings while you are under a sink. They do not leave a voicemail; they ring the next firm on the list.',
    evidence: {
      claim: 'Home service businesses are reported to miss around 62% of inbound calls, and most callers who reach voicemail are said to hang up rather than leave one.',
      source: 'CallMissed / Valley Marketing Group, 2026',
    },
    /* Said plainly, because this is the one template whose trigger this product
       does not yet supply on its own. A customer who adds it expecting the
       phone system to fire it would find it never ran. */
    industry: ['Trades', 'Home services', 'Local business', 'Clinics'],
    keywords: ['missed call', 'missed calls', 'text back', 'missed call text back', 'voicemail', 'phone', 'callback', 'ring back'],
    needs: [
      'An SMS provider connected',
      'A connected mailbox, for the follow-up if they do not reply to the text',
      'Something to add the "missed-call" tag — this app has no phone system, so the tag comes from your own, or from you adding it by hand',
    ],
    outcome: 'A caller who would have rung the next firm gets a text before they do. Only worth adding if something can actually apply the tag.',
    nodes: [
      n('n0', 'trigger', 'A tag is added', { event: 'tag_added', tag: 'missed-call' }, 'n1'),
      n('n1', 'send_sms', 'Text them back', {
        message: 'Hi {{firstName}}, sorry we missed your call — we are on a job. Text back what you need and we will ring you straight after.',
      }, 'n2'),
      n('n2', 'wait', 'Wait 4 hours', { hours: '4' }, 'n3'),
      n('n3', 'condition', 'Have they replied?', { field: 'status', operator: 'equals', value: 'replied' }, null,
        { yesId: null, noId: 'n4' }),
      n('n4', 'send_email', 'Try email as well', {
        subject: 'Sorry we missed you, {{firstName}}',
        body: 'Hello {{firstName}},\n\nWe missed your call earlier. If you tell me what you need I will get you a price today.\n\nOr ring back whenever suits — we pick up between jobs.',
      }, null),
    ],
  },
  {
    key: 'quote-chase',
    name: 'Quote Follow-up Automation',
    category: 'speed',
    description: 'Chase a quote three times over a fortnight, then stop asking.',
    blurb: 'Most quotes are never followed up once. This follows up three times over two weeks and then leaves them alone.',
    pain: 'You send a price and hear nothing. Chasing feels pushy, so it never happens, and the job goes to whoever did chase.',
    industry: ['Trades', 'Construction', 'Professional services'],
    keywords: ['quote', 'quotation', 'estimate', 'proposal', 'chase', 'follow up', 'went quiet', 'no reply'],
    needs: ['A connected mailbox', 'A tag or stage that means "quoted"'],
    outcome: 'Some proportion of quiet quotes come back. Two or three in ten is the number people report; yours depends on your price and your trade.',
    nodes: [
      n('n0', 'trigger', 'A tag is added', { event: 'tag_added', tag: 'quoted' }, 'n1'),
      n('n1', 'wait', 'Wait 3 days', { days: '3' }, 'n2'),
      n('n2', 'send_email', 'Anything I can explain?', {
        subject: 'Any questions on that price, {{firstName}}?',
        body: 'Hello {{firstName}},\n\nJust checking the quote made sense. If there is anything on it you would like explained, or you would rather a different option, tell me and I will put one together.',
      }, 'n3'),
      n('n3', 'wait', 'Wait 5 days', { days: '5' }, 'n4'),
      n('n4', 'send_email', 'Something useful, not a chase', {
        subject: 'The bit most people ask about',
        body: 'Hello {{firstName}},\n\nNot chasing — one thing worth knowing before you decide, whoever you go with: ask what happens if something goes wrong afterwards, and get the answer in writing.\n\nIf you want to go ahead with us, just say and I will book it in.',
      }, 'n5'),
      n('n5', 'wait', 'Wait 6 days', { days: '6' }, 'n6'),
      n('n6', 'send_email', 'Ask plainly, and accept no', {
        subject: 'Shall I close this off, {{firstName}}?',
        body: 'Hello {{firstName}},\n\nI will stop emailing after this one. Do you still want the work doing?\n\nIf not, that is genuinely fine — reply "no" and I will close it off.',
      }, 'n7'),
      n('n7', 'add_tag', 'Mark as chased out', { tag: 'chased-out' }, null),
    ],
  },

  /* ── Appointments ─────────────────────────────────────────────────────── */
  {
    key: 'appointment-reminders',
    name: 'Appointment Reminder Automation',
    category: 'appointments',
    description: 'Confirm the booking, then remind them the day before it happens.',
    blurb: 'Two reminders, timed so neither is a nuisance, with a plain way to move it rather than just not turning up.',
    pain: 'Somebody books three weeks out, forgets, and you lose the slot and the fuel getting there.',
    industry: ['Clinics', 'Trades', 'Salons', 'Professional services'],
    keywords: ['appointment', 'reminder', 'booking', 'calendar', 'confirmation', 'diary'],
    needs: ['A connected mailbox', 'An SMS provider, for the morning-of text', 'Bookings coming through the app'],
    outcome: 'No-shows drop. How far depends on how far ahead people book — the further out, the more this is worth.',
    nodes: [
      n('n0', 'trigger', 'An appointment is booked', { event: 'appointment_scheduled' }, 'n1'),
      n('n1', 'send_email', 'Confirm it', {
        subject: 'You are booked in, {{firstName}}',
        body: 'Hello {{firstName}},\n\nThat is in the diary. If anything changes, reply to this and we will move it — far better than nobody being in.',
      }, 'n2'),
      n('n2', 'wait', 'Wait until the day before', { days: '1' }, 'n3'),
      n('n3', 'send_sms', 'Text the reminder', {
        message: 'Hi {{firstName}}, reminder that we are with you tomorrow. Reply MOVE if the time no longer works.',
      }, null),
    ],
  },
  {
    key: 'no-show-recovery',
    name: 'Appointment No-Show Recovery Automation',
    category: 'appointments',
    description: 'Get a missed appointment rebooked without anybody feeling awkward.',
    blurb: 'Assumes nothing about why they missed it, and makes rebooking one reply rather than a phone call they have to remember to make.',
    pain: 'They miss the slot, feel awkward about it, and neither side gets in touch again.',
    industry: ['Clinics', 'Salons', 'Trades', 'Coaching'],
    keywords: ['no show', 'no-show', 'missed appointment', 'rebook', 'did not turn up', 'cancellation'],
    needs: ['A connected mailbox', 'An SMS provider', 'A "no-show" tag — added by you, or by the calendar'],
    outcome: 'A good share of missed appointments come back when asked once without blame. Assume some, not all.',
    nodes: [
      n('n0', 'trigger', 'A tag is added', { event: 'tag_added', tag: 'no-show' }, 'n1'),
      n('n1', 'send_sms', 'No blame, just rebook', {
        message: 'Hi {{firstName}}, we missed you today — no problem at all. Reply with a day that suits and we will put you back in.',
      }, 'n2'),
      n('n2', 'wait', 'Wait 1 day', { days: '1' }, 'n3'),
      n('n3', 'condition', 'Have they rebooked?', { field: 'status', operator: 'equals', value: 'booked' }, null,
        { yesId: null, noId: 'n4' }),
      n('n4', 'send_email', 'One more, then stop', {
        subject: 'Still want that appointment, {{firstName}}?',
        body: 'Hello {{firstName}},\n\nWe had you down for yesterday and did not manage to see you. If you still want it doing, reply with a day and I will book it.\n\nIf not, no problem — I will close it off.',
      }, 'n5'),
      n('n5', 'create_task', 'Ring them if still nothing', { title: 'Ring this no-show — two messages, no reply' }, null),
    ],
  },

  /* ── Reviews ──────────────────────────────────────────────────────────── */
  {
    key: 'review-request',
    name: 'Client Review Request Automation',
    category: 'reviews',
    description: 'Ask for a review while the work is still fresh, once by email and once by text.',
    blurb: 'Asks while the work is fresh, once by email and once by text, and stops. Most businesses ask nobody; the rest ask everybody twice a week.',
    pain: 'Reviews are how people choose a trade, and nobody asks — because at the end of a job you are already thinking about the next one.',
    industry: ['Trades', 'Local business', 'Clinics', 'Hospitality'],
    keywords: ['review', 'reviews', 'google review', 'testimonial', 'feedback', 'rating', 'reputation'],
    needs: ['A connected mailbox', 'An SMS provider, for the single nudge', 'Your review link', 'A "job-done" tag'],
    outcome: 'Asking at all is the whole change. A steady handful a month rather than none is the realistic picture.',
    nodes: [
      n('n0', 'trigger', 'A tag is added', { event: 'tag_added', tag: 'job-done' }, 'n1'),
      n('n1', 'wait', 'Wait 2 days', { days: '2' }, 'n2'),
      n('n2', 'send_email', 'Ask once, properly', {
        subject: 'Did we get it right, {{firstName}}?',
        body: 'Hello {{firstName}},\n\nIf the job went well, a short review makes a real difference to a business this size — it is how the next person decides.\n\nAnd if anything was not right, reply to me first and I will put it right.',
      }, 'n3'),
      n('n3', 'wait', 'Wait 4 days', { days: '4' }, 'n4'),
      n('n4', 'send_sms', 'One nudge, then leave it', {
        message: 'Hi {{firstName}}, no pressure at all — if you have a minute, a quick review would really help us. Thank you either way.',
      }, 'n5'),
      n('n5', 'add_tag', 'Mark as asked', { tag: 'review-asked' }, null),
    ],
  },
  {
    key: 'unhappy-first',
    name: 'Unhappy Customer Recovery Automation',
    category: 'reviews',
    description: 'Route an unhappy customer to a person instead of to a review site.',
    blurb: 'Anybody tagged unhappy goes to a person with a task, and is never asked for a public review. The two must not be the same path.',
    pain: 'A review request sent to somebody who had a bad experience is an invitation to post about it.',
    /* Said explicitly because the alternative is a product that quietly games
       reviews. Filtering who is *asked* is ordinary; suppressing what somebody
       writes is not, and this does not do that. */
    industry: ['Local business', 'Hospitality', 'Clinics', 'Retail'],
    keywords: ['unhappy', 'complaint', 'bad review', 'negative', 'angry customer', 'reputation'],
    needs: ['A connected mailbox', 'An "unhappy" tag, or a condition you set yourself'],
    outcome: 'Fewer public complaints that nobody had a chance to fix. This decides who gets asked — it cannot and does not stop anybody posting.',
    nodes: [
      n('n0', 'trigger', 'A tag is added', { event: 'tag_added', tag: 'unhappy' }, 'n1'),
      n('n1', 'remove_tag', 'Never ask this one for a review', { tag: 'review-asked' }, 'n2'),
      n('n2', 'create_task', 'Ring them today', { title: 'Unhappy customer — ring today, before anything else' }, 'n3'),
      n('n3', 'send_email', 'Own it, quickly', {
        subject: 'I am sorry, {{firstName}} — let me put it right',
        body: 'Hello {{firstName}},\n\nI have heard that did not go as it should. I would rather hear it from you directly than not at all.\n\nI will ring you today. If there is a better time, reply and say when.',
      }, null),
    ],
  },

  /* ── Win back ─────────────────────────────────────────────────────────── */
  {
    key: 'dormant-winback',
    name: 'Cold Lead Re-activation Automation',
    category: 'winback',
    description: 'Wake a list that has gone cold with three messages, then leave it alone.',
    blurb: 'For the contacts sitting in the database doing nothing. One useful message, one offer, one plain question — then it stops asking.',
    pain: 'Everybody has a few thousand old customers and quotes and nobody writes to them, because writing to all of them at once feels like spam.',
    evidence: {
      claim: 'Home service reactivation campaigns are reported at roughly 2–6% response by email alone and 8–15% across email and SMS together, with agencies claiming a meaningful share of annual revenue comes from the existing database.',
      source: 'Prestyj, 2026',
    },
    industry: ['Home services', 'Trades', 'Agency', 'Retail'],
    keywords: ['database reactivation', 'win back', 'winback', 'dormant', 'cold list', 'old leads', 'past customers', 're-engage'],
    needs: ['A connected mailbox', 'Contacts who genuinely opted in', 'A "dormant" tag or a list'],
    outcome: 'A few percent of a cold list responding is the published picture. On two thousand contacts that is tens of conversations, not hundreds — and it only works once per list.',
    nodes: [
      n('n0', 'trigger', 'A tag is added', { event: 'tag_added', tag: 'dormant' }, 'n1'),
      n('n1', 'send_email', 'Useful first, not an offer', {
        subject: 'One thing worth checking before winter, {{firstName}}',
        body: 'Hello {{firstName}},\n\nIt has been a while. One thing worth doing whoever you use: check the pressure and the last service date. Most of what we get called out to in January could have been caught in October.\n\nIf you want us to look, reply and I will find a slot.',
      }, 'n2'),
      n('n2', 'wait', 'Wait 6 days', { days: '6' }, 'n3'),
      n('n3', 'send_email', 'Make it easy to say yes', {
        subject: 'A slot this month, {{firstName}}?',
        body: 'Hello {{firstName}},\n\nWe have space this month before it gets busy. If you have been meaning to get it looked at, now is the cheap time to do it.\n\nReply with a day that suits.',
      }, 'n4'),
      n('n4', 'wait', 'Wait 8 days', { days: '8' }, 'n5'),
      n('n5', 'send_email', 'Ask once whether to stop', {
        subject: 'Shall I stop emailing, {{firstName}}?',
        body: 'Hello {{firstName}},\n\nI have written twice and not heard back, so I will leave it there.\n\nIf you would rather we did not email at all, use the unsubscribe link below and that is that. If you would like us back, you know where we are.',
      }, 'n6'),
      n('n6', 'add_tag', 'Mark as woken', { tag: 'reactivation-done' }, null),
    ],
  },

  /* ── Pipeline ─────────────────────────────────────────────────────────── */
  {
    key: 'stage-proposal',
    name: 'Proposal Follow-up Automation',
    category: 'pipeline',
    description: 'Follow up the moment a deal reaches Proposal, rather than when somebody remembers.',
    blurb: 'When a deal moves to the stage you name, it sends the follow-up and puts a call on your list. No more "I thought you were chasing that".',
    pain: 'The deal moves on the board and then nothing happens, because moving it felt like the action.',
    industry: ['B2B', 'Agency', 'SaaS', 'Professional services'],
    keywords: ['pipeline', 'deal', 'stage', 'proposal', 'opportunity', 'sales'],
    needs: ['A connected mailbox', 'A pipeline with named stages'],
    outcome: 'Every deal that reaches the stage gets the same follow-up instead of the ones somebody remembered.',
    nodes: [
      n('n0', 'trigger', 'A deal changes stage', { event: 'deal_stage_changed', tag: 'Proposal' }, 'n1'),
      n('n1', 'send_email', 'Send what they need to decide', {
        subject: 'Everything for that decision, {{firstName}}',
        body: 'Hello {{firstName}},\n\nHere is what you need to decide on this. If anything is missing, tell me and I will get it to you today.\n\nWhat is the timeline you are working to? That helps me line up the right people.',
      }, 'n2'),
      n('n2', 'create_task', 'Ring them in two days', { title: 'Ring about the proposal' }, 'n3'),
      n('n3', 'wait', 'Wait 5 days', { days: '5' }, 'n4'),
      n('n4', 'condition', 'Has it moved on?', { field: 'status', operator: 'not_equals', value: 'proposal' }, null,
        { yesId: null, noId: 'n5' }),
      n('n5', 'send_email', 'Ask what is holding it', {
        subject: 'What is holding this up, {{firstName}}?',
        body: 'Hello {{firstName}},\n\nStill sitting with you, so I assume something is unresolved. Tell me what it is — price, timing, or somebody else who has to agree — and I will deal with that rather than sending another reminder.',
      }, null),
    ],
  },
  {
    key: 'stale-deal',
    name: 'Stale Deal Alert Automation',
    category: 'pipeline',
    description: 'Flag a deal nobody has touched in a fortnight so the forecast means something.',
    blurb: 'No email to the customer at all — this one only tells you. A deal nobody has touched for two weeks is either dead or forgotten, and those want different treatment.',
    pain: 'The board slowly fills with deals nobody has looked at, and the forecast stops meaning anything.',
    industry: ['B2B', 'Agency', 'SaaS', 'Sales teams'],
    keywords: ['stale', 'stuck deal', 'pipeline hygiene', 'forgotten', 'no movement', 'forecast'],
    needs: ['Nothing — it only creates tasks. It sends no email and no text.'],
    outcome: 'The board stops lying. How many stale deals you find the first time is usually a surprise.',
    nodes: [
      n('n0', 'trigger', 'A tag is added', { event: 'tag_added', tag: 'deal-open' }, 'n1'),
      n('n1', 'wait', 'Wait 14 days', { days: '14' }, 'n2'),
      n('n2', 'condition', 'Has anything happened?', { field: 'status', operator: 'equals', value: 'open' }, 'n3',
        { yesId: 'n3', noId: null }),
      n('n3', 'create_task', 'Decide: chase or close', { title: 'This deal has not moved in a fortnight — chase it or close it' }, 'n4'),
      n('n4', 'add_tag', 'Flag it as stale', { tag: 'stale' }, null),
    ],
  },

  /* ── Retention ────────────────────────────────────────────────────────── */
  {
    key: 'new-customer',
    name: 'Client Onboarding and Referral Automation',
    category: 'retention',
    description: 'Look after a new customer for their first month, then ask for the referral.',
    blurb: 'The fortnight after somebody buys is the only time they are certain to open your email. Most businesses use it for nothing.',
    pain: 'Everything goes into winning the customer and nothing into the week after, which is when they decide whether to recommend you.',
    industry: ['Agency', 'Professional services', 'SaaS', 'Trades'],
    keywords: ['onboarding', 'welcome', 'new customer', 'referral', 'thank you', 'retention'],
    needs: ['A connected mailbox', 'A "customer" tag'],
    outcome: 'More referrals, because somebody asked. Referral rates are a function of asking at all rather than of the wording.',
    nodes: [
      n('n0', 'trigger', 'A tag is added', { event: 'tag_added', tag: 'customer' }, 'n1'),
      n('n1', 'send_email', 'Thank them and say what happens', {
        subject: 'Thanks, {{firstName}} — here is what happens next',
        body: 'Hello {{firstName}},\n\nThank you for the work. Here is what happens now, so nothing is a surprise.\n\nAnything at all, reply to this. It comes to me, not to a helpdesk.',
      }, 'n2'),
      n('n2', 'wait', 'Wait 10 days', { days: '10' }, 'n3'),
      n('n3', 'send_email', 'Check it is still right', {
        subject: 'All still good, {{firstName}}?',
        body: 'Hello {{firstName}},\n\nJust checking everything is still as it should be. If anything is not, I would rather know now than in six months.',
      }, 'n4'),
      n('n4', 'wait', 'Wait 20 days', { days: '20' }, 'n5'),
      n('n5', 'send_email', 'Ask for the referral, once', {
        subject: 'Know anybody who needs the same, {{firstName}}?',
        body: 'Hello {{firstName}},\n\nMost of our work comes from people passing our name on. If you know somebody who needs the same doing, send them my way — I will look after them the same.\n\nAnd if you would rather not, that is completely fine. I will not ask again.',
      }, null),
    ],
  },

  /* ── Content, on a schedule ────────────────────────────────────────────
   *
   * These are the ones with no person in them. They run on a clock, read a
   * source, and write drafts — see `worker/src/lib/projectAgents.ts`. They are
   * here rather than in a separate list because a customer does not think in
   * terms of which engine runs a thing.
   */
  {
    key: 'daily-posts',
    name: 'Daily Social Content Automation',
    category: 'content',
    description: "Write one social post every morning from the client's own profile.",
    blurb: 'Reads what the client does and who buys it, writes one post with a headline set on the image, and files it as a draft in the Social Creator.',
    pain: 'Posting consistently is the part everybody abandons in week three, and an empty feed makes a business look shut.',
    industry: ['Agency', 'Local business', 'Retail', 'Trades'],
    keywords: ['social media', 'instagram', 'facebook', 'daily post', 'content', 'posting', 'schedule'],
    needs: ['A client profile with something in it', 'Nothing else — it publishes nothing, only drafts'],
    outcome: 'A draft a morning, waiting to be read. It writes them; it does not post them.',
    nodes: [
      n('n0', 'trigger', 'Every day', { event: 'schedule', cadence: 'daily' }, 'n1'),
      n('n1', 'ai', 'Write a post from the portfolio', {
        source: 'portfolio', produces: 'social', platform: 'instagram', count: '1',
      }, null),
    ],
  },
  {
    key: 'feed-blog',
    name: 'News Feed to Blog Automation',
    category: 'content',
    description: 'Watch an RSS feed and write up whatever is new as a draft article.',
    blurb: 'Reads an RSS or Atom feed each morning and writes a post about whatever appeared since it last looked. A morning with nothing new is recorded as skipped, not as done.',
    pain: 'Writing about your industry needs somebody reading it every day, which nobody has time to do.',
    industry: ['Agency', 'SaaS', 'Media', 'Professional services'],
    keywords: ['rss', 'feed', 'news', 'blog', 'articles', 'seo', 'content'],
    needs: ['The feed address — the feed itself, not the page it sits on'],
    outcome: 'A draft on the mornings the feed had something, and an honest "nothing new" on the mornings it did not.',
    nodes: [
      n('n0', 'trigger', 'Every day', { event: 'schedule', cadence: 'daily' }, 'n1'),
      /* Deliberately blank rather than a plausible example address: a template
         that arrives pointed at somebody else's feed quietly writes about the
         wrong business until it is noticed. `problemsWith` refuses to save it
         until an address is set. */
      n('n1', 'ai', 'Write up what is new', { source: 'rss', sourceUrl: '', produces: 'blog' }, null),
    ],
  },
  {
    key: 'youtube-blog',
    name: 'YouTube to Blog Repurposing Automation',
    category: 'content',
    description: 'Turn every new video on a channel into a written post that search engines can read.',
    blurb: 'For a client who films but does not write. Each new video on the channel becomes a draft article — the same thing, in the form search engines can read.',
    pain: 'A channel with fifty videos has fifty pieces of writing nobody made, and video does not rank for the thing people type.',
    industry: ['Agency', 'Media', 'Coaching', 'SaaS'],
    keywords: ['youtube', 'video', 'transcript', 'blog', 'repurpose', 'seo'],
    needs: ['The channel ID, which begins UC — a handle or a video link will not do, and it says so'],
    outcome: 'One draft per new video. Nothing is published; each is yours to read first.',
    nodes: [
      n('n0', 'trigger', 'Every day', { event: 'schedule', cadence: 'daily' }, 'n1'),
      n('n1', 'ai', 'Write up the new video', { source: 'youtube', sourceUrl: '', produces: 'blog' }, null),
    ],
  },
  {
    key: 'year-emails',
    name: 'Annual Email Campaign Automation',
    category: 'content',
    description: 'Write a whole year of weekly emails in one go, as a draft campaign.',
    blurb: 'Writes a whole year of weekly emails in one go and files them as a draft campaign. Nobody is enrolled — they are there to be read and edited first.',
    pain: 'Everybody agrees a newsletter is a good idea and nobody gets past the third one.',
    industry: ['Agency', 'Retail', 'SaaS', 'Coaching'],
    keywords: ['newsletter', 'email campaign', 'nurture', 'drip', 'weekly email', 'year of emails'],
    needs: ['A client profile with something in it', 'A connected mailbox, once you want to actually send them'],
    outcome: 'Fifty-two drafts. Written in batches, so it may take a few minutes and can finish across two runs — it says how far it got.',
    nodes: [
      n('n0', 'trigger', 'Every month', { event: 'schedule', cadence: 'monthly' }, 'n1'),
      n('n1', 'ai', 'Write the campaign', {
        source: 'portfolio', produces: 'email_campaign', campaignSteps: '52', everyDays: '7',
      }, null),
    ],
  },

  /* ── Shop ─────────────────────────────────────────────────────────────── */
  {
    key: 'unpaid-order',
    name: 'E-commerce Abandoned Cart Recovery Automation',
    category: 'shop',
    description: 'Recover an order that never got paid for, with two reminders and no nagging.',
    blurb: 'Somebody got as far as the payment page and stopped. Usually that is a card that failed or a phone that rang, not a decision.',
    pain: 'The order sits there unpaid and nobody notices, because nothing tells anybody.',
    industry: ['E-commerce', 'Retail', 'D2C'],
    featured: true,
    keywords: ['abandoned cart', 'unpaid', 'checkout', 'failed payment', 'order', 'basket'],
    needs: ['A connected mailbox', 'A shop with orders coming through'],
    outcome: 'Some unpaid orders complete. Published recovery rates vary enormously by what is being sold — measure your own before believing anybody’s number.',
    nodes: [
      n('n0', 'trigger', 'A tag is added', { event: 'tag_added', tag: 'order-unpaid' }, 'n1'),
      n('n1', 'wait', 'Wait 1 hour', { hours: '1' }, 'n2'),
      n('n2', 'send_email', 'Assume it was the card', {
        subject: 'Your order did not go through, {{firstName}}',
        body: 'Hello {{firstName}},\n\nYour order is saved but the payment did not complete — usually that is the card rather than you changing your mind.\n\nThe basket is still there when you are ready.',
      }, 'n3'),
      n('n3', 'wait', 'Wait 1 day', { days: '1' }, 'n4'),
      n('n4', 'send_email', 'Ask once whether to hold it', {
        subject: 'Shall I keep that held, {{firstName}}?',
        body: 'Hello {{firstName}},\n\nStill holding your order. If you would rather not go ahead, no problem — I will release it.\n\nIf something went wrong at checkout, tell me what happened and I will sort it.',
      }, null),
    ],
  },
  {
    key: 'thank-buyer',
    name: 'Post-Purchase Review Automation',
    category: 'shop',
    description: 'Thank a buyer now, and ask how it went once it has plausibly arrived.',
    blurb: 'Thanks them immediately, waits until the thing has plausibly arrived and been used, then asks how it went.',
    pain: 'A review asked for the day of purchase is asked before anybody has anything to say.',
    industry: ['E-commerce', 'Retail', 'D2C'],
    keywords: ['order', 'purchase', 'thank you', 'post purchase', 'review', 'delivery'],
    needs: ['A connected mailbox', 'A shop with orders coming through'],
    outcome: 'More reviews, fewer of them irrelevant, because the timing matches when somebody actually has an opinion.',
    nodes: [
      n('n0', 'trigger', 'A tag is added', { event: 'tag_added', tag: 'order-paid' }, 'n1'),
      n('n1', 'send_email', 'Thank them properly', {
        subject: 'Thank you, {{firstName}}',
        body: 'Hello {{firstName}},\n\nThank you for the order — it is being sorted now. Anything at all, reply to this.',
      }, 'n2'),
      n('n2', 'wait', 'Wait 12 days', { days: '12' }, 'n3'),
      n('n3', 'send_email', 'Ask once it has been used', {
        subject: 'How did you get on, {{firstName}}?',
        body: 'Hello {{firstName}},\n\nYou should have had that a little while now. How did you get on?\n\nIf it was good, a short review helps more than you would think. If it was not, reply to me and I will put it right.',
      }, null),
    ],
  },

  /* ── Social and content ───────────────────────────────────────────────────
   *
   * ── The thing to be straight about ──
   *
   * This app does not post to Instagram, LinkedIn or X. There is no social
   * integration in the codebase — email, SMS, WordPress, calendar, payments,
   * and that is the list. Every template below therefore writes **real,
   * editable drafts into the Social Creator**, and says so. Drawing a "Publish
   * to Instagram" node that the engine would step over is precisely the silent
   * failure this product exists to not be.
   *
   * What they do is still the expensive part: deciding what to say, writing it
   * in the client's voice, and doing it every day without anybody remembering.
   */
  {
    key: 'multi-platform-social',
    name: 'Multi-Platform Social Posting Automation',
    category: 'content',
    description: 'One idea, written four ways — one for each platform’s length and tone.',
    blurb: 'Writes the same message properly for Instagram, Facebook, LinkedIn and X rather than posting one square picture everywhere. Each lands as its own editable draft.',
    pain: 'The same caption pasted onto four platforms reads as written for none of them, and reposting by hand is the job everybody drops first.',
    industry: ['Agency', 'Retail', 'Local business', 'SaaS'],
    featured: true,
    keywords: ['multi platform', 'cross post', 'social posting', 'instagram', 'linkedin', 'facebook', 'twitter', 'x', 'repurpose'],
    needs: [
      'A client profile with something in it',
      'Nothing to publish with — this app writes the drafts, and you publish from the Social Creator',
    ],
    outcome: 'Four platform-shaped drafts a day instead of one caption pasted four times. It writes them; it does not post them.',
    nodes: [
      n('n0', 'trigger', 'Every day', { event: 'schedule', cadence: 'daily' }, 'n1'),
      n('n1', 'ai', 'Write it for Instagram', {
        source: 'portfolio', produces: 'social', platform: 'instagram', count: '1',
      }, 'n2'),
      n('n2', 'ai', 'Write it for LinkedIn', {
        source: 'portfolio', produces: 'social', platform: 'linkedin', count: '1',
      }, 'n3'),
      n('n3', 'ai', 'Write it for Facebook', {
        source: 'portfolio', produces: 'social', platform: 'facebook', count: '1',
      }, null),
    ],
  },
  {
    key: 'linkedin-repurpose',
    name: 'LinkedIn Content Repurposing Automation',
    category: 'content',
    description: 'Turn what the client publishes into LinkedIn posts in their own voice.',
    blurb: 'Reads a blog feed and writes a LinkedIn post about each new piece — the argument, not a link with "check out our latest".',
    pain: 'A company blog nobody reads, and a LinkedIn page nobody posts on, when the second could be carrying the first.',
    industry: ['B2B', 'SaaS', 'Agency', 'Professional services'],
    keywords: ['linkedin', 'repurpose', 'b2b', 'thought leadership', 'blog to social', 'content'],
    needs: [
      'The blog feed address — the feed itself, not the page it sits on',
      'Nothing to publish with — drafts land in the Social Creator for you to post',
    ],
    outcome: 'A LinkedIn draft for each new article. Quiet on the weeks nothing was published, which it records as skipped rather than as done.',
    nodes: [
      n('n0', 'trigger', 'Every day', { event: 'schedule', cadence: 'daily' }, 'n1'),
      n('n1', 'ai', 'Write the LinkedIn post', {
        source: 'rss', sourceUrl: '', produces: 'social', platform: 'linkedin', count: '1',
      }, null),
    ],
  },
  {
    key: 'shorts-repurpose',
    name: 'Short Video Repurposing Automation',
    category: 'content',
    description: 'Every new video becomes posts for the platforms that are not YouTube.',
    blurb: 'Watches a YouTube channel and writes social posts about each new video — the hook, the point, and why somebody should watch.',
    pain: 'Fifty videos on a channel and nothing anywhere else, because clipping and captioning each one is an afternoon.',
    industry: ['Media', 'Coaching', 'Agency', 'Retail'],
    keywords: ['youtube', 'shorts', 'reels', 'tiktok', 'video', 'repurpose', 'clips', 'social'],
    needs: [
      'The channel ID, which begins UC — a handle or a video link will not do, and it says so',
      'Nothing to publish with — drafts land in the Social Creator',
    ],
    outcome: 'Two drafts per new video. Nothing is clipped or edited — this writes the words, not the footage.',
    nodes: [
      n('n0', 'trigger', 'Every day', { event: 'schedule', cadence: 'daily' }, 'n1'),
      n('n1', 'ai', 'Write posts about the new video', {
        source: 'youtube', sourceUrl: '', produces: 'social', platform: 'instagram', count: '2',
      }, null),
    ],
  },
  {
    key: 'content-calendar',
    name: 'Weekly Content Calendar Automation',
    category: 'content',
    description: 'A week of posts written on Monday rather than one a day in a panic.',
    blurb: 'Writes six posts in one go every week, each about a different thing, so the calendar is full before the week starts.',
    pain: 'Posting daily works right up until the first busy week, and then the feed goes quiet for a month.',
    industry: ['Agency', 'Local business', 'Retail', 'Hospitality'],
    featured: true,
    keywords: ['content calendar', 'weekly', 'batch', 'schedule', 'social', 'planning', 'posts'],
    needs: [
      'A client profile with something in it',
      'Nothing to publish with — the week’s drafts land in the Social Creator',
    ],
    outcome: 'Six drafts a week, waiting to be read and scheduled. Whether they go out is still somebody’s decision.',
    nodes: [
      n('n0', 'trigger', 'Every week', { event: 'schedule', cadence: 'weekly' }, 'n1'),
      n('n1', 'ai', 'Write the week', {
        source: 'portfolio', produces: 'social', platform: 'instagram', count: '6',
      }, null),
    ],
  },
  {
    key: 'blog-to-social',
    name: 'Blog to Social Snippets Automation',
    category: 'content',
    description: 'Every article becomes several posts instead of one link.',
    blurb: 'Reads the client’s own blog feed and pulls three separate posts out of each article — different points, not the same summary three times.',
    pain: 'An article takes a day to write and gets shared once, on the day it goes out, and then never again.',
    industry: ['SaaS', 'Agency', 'Media', 'B2B'],
    keywords: ['blog to social', 'snippets', 'repurpose', 'atomise', 'content', 'rss'],
    needs: [
      'The blog feed address',
      'Nothing to publish with — drafts land in the Social Creator',
    ],
    outcome: 'Three drafts per article rather than one link. On weeks with no new article it records that nothing was new.',
    nodes: [
      n('n0', 'trigger', 'Every day', { event: 'schedule', cadence: 'daily' }, 'n1'),
      n('n1', 'ai', 'Pull the posts out of it', {
        source: 'rss', sourceUrl: '', produces: 'social', platform: 'instagram', count: '3',
      }, null),
    ],
  },
  {
    key: 'seo-blog-pipeline',
    name: 'SEO Blog Pipeline Automation',
    category: 'content',
    description: 'An article a week, written from the client profile.',
    blurb: 'Writes a genuinely useful article each week about something the client’s customers search for before they buy — not an advert with subheadings.',
    pain: 'Everybody knows the blog would help and nobody has written one since the site went live.',
    industry: ['SaaS', 'Professional services', 'Trades', 'Agency'],
    keywords: ['seo', 'blog', 'article', 'content marketing', 'organic', 'writing'],
    needs: [
      'A client profile with something in it',
      'A connected WordPress site, only if you want it published rather than drafted',
    ],
    outcome: 'A draft article a week. Whether it is published is governed by the Publish content permission, which asks first by default.',
    nodes: [
      n('n0', 'trigger', 'Every week', { event: 'schedule', cadence: 'weekly' }, 'n1'),
      n('n1', 'ai', 'Write this week’s article', { source: 'portfolio', produces: 'blog' }, null),
    ],
  },
  {
    key: 'ugc-review',
    name: 'UGC Content Review Automation',
    category: 'content',
    description: 'Customer content gets looked at by a person before it is used anywhere.',
    blurb: 'Tag a customer whose photo or review you want to use, and this puts the permission request and the sign-off on somebody’s list. No AI, no sending without a human.',
    pain: 'Using a customer’s photo without asking is the kind of shortcut that ends up in a complaint rather than a campaign.',
    industry: ['Retail', 'E-commerce', 'Hospitality', 'Agency'],
    keywords: ['ugc', 'user generated', 'permission', 'rights', 'review content', 'approval', 'customer photos'],
    needs: ['A connected mailbox', 'A "ugc" tag on the contact whose content you want'],
    outcome: 'Permission asked for in writing, and a record that it was. This is a paper trail, not a growth lever.',
    nodes: [
      n('n0', 'trigger', 'A tag is added', { event: 'tag_added', tag: 'ugc' }, 'n1'),
      n('n1', 'send_email', 'Ask permission properly', {
        subject: 'May we use your photo, {{firstName}}?',
        body: 'Hello {{firstName}},\n\nWe saw what you posted and would love to share it. May we?\n\nIf yes, just reply "yes" — that is all we need, and we will credit you. If you would rather we did not, no problem at all and we will not ask again.',
      }, 'n2'),
      n('n2', 'wait', 'Wait 3 days', { days: '3' }, 'n3'),
      n('n3', 'condition', 'Did they reply?', { field: 'status', operator: 'equals', value: 'replied' }, 'n4',
        { yesId: 'n4', noId: 'n5' }),
      n('n4', 'create_task', 'Check the permission and file it', { title: 'UGC permission given — file the reply before using it' }, null),
      n('n5', 'add_tag', 'No answer means no', { tag: 'ugc-no-answer' }, null),
    ],
  },  /* ── Sales, support and the rest ──────────────────────────────────────── */
  {
    key: 'ai-lead-qualification',
    name: 'AI Lead Qualification Automation',
    category: 'speed',
    description: 'Sort the serious enquiries from the tyre-kickers before anybody rings back.',
    blurb: 'Reads what they wrote, tags them, and splits the flow: a real enquiry gets a person and a call, everybody else gets a useful email and no wasted phone time.',
    pain: 'Half the enquiries are worth ringing immediately and half are not, and nobody knows which until they have rung all of them.',
    industry: ['Agency', 'B2B', 'Trades', 'Professional services'],
    featured: true,
    keywords: ['lead qualification', 'qualify', 'scoring', 'triage', 'lead scoring', 'routing', 'sales'],
    needs: ['A connected mailbox', 'A form on the site or funnel', 'A tag or field that marks a qualified enquiry'],
    outcome: 'Calls go to the enquiries worth calling. What that saves depends on how mixed your enquiries are — it is the difference between ringing everybody and ringing the right half.',
    nodes: [
      n('n0', 'trigger', 'A form is submitted', { event: 'form_submitted' }, 'n1'),
      n('n1', 'add_tag', 'Tag as an enquiry', { tag: 'enquiry' }, 'n2'),
      n('n2', 'condition', 'Is this one qualified?', { field: 'company', operator: 'is_set' }, 'n3',
        { yesId: 'n3', noId: 'n6' }),
      n('n3', 'assign_to', 'Give it to somebody', { user: '' }, 'n4'),
      n('n4', 'create_task', 'Ring them today', { title: 'Qualified enquiry — ring today' }, 'n5'),
      n('n5', 'send_email', 'Tell them who is calling', {
        subject: 'I will ring you today, {{firstName}}',
        body: 'Hello {{firstName}},\n\nI have your enquiry and I will ring you today. If there is a better time, reply and say when.',
      }, null),
      n('n6', 'send_email', 'Useful, and no phone call', {
        subject: 'Here is what you asked about, {{firstName}}',
        body: 'Hello {{firstName}},\n\nThanks for getting in touch. Here is what you need to know, so you can decide in your own time.\n\nIf you would like to talk it through, reply and I will ring you.',
      }, null),
    ],
  },
  {
    key: 'sales-followup',
    name: 'Sales Follow-up Automation',
    category: 'pipeline',
    description: 'Five touches over three weeks, then it accepts no for an answer.',
    blurb: 'The sequence most salespeople mean to run and stop after the second email. Useful first, then plain, then it stops.',
    pain: 'Most sales are lost to nobody following up rather than to a competitor, and following up five times by hand is a job nobody does.',
    industry: ['B2B', 'SaaS', 'Agency', 'Professional services'],
    keywords: ['sales follow up', 'cadence', 'sequence', 'outreach', 'nurture', 'prospect'],
    needs: ['A connected mailbox', 'A tag that means "in conversation"'],
    outcome: 'Every prospect gets the same five touches rather than the ones somebody remembered. It stops on its own, which is the part people get wrong.',
    nodes: [
      n('n0', 'trigger', 'A tag is added', { event: 'tag_added', tag: 'prospect' }, 'n1'),
      n('n1', 'send_email', 'Open with something useful', {
        subject: 'The thing most people get wrong here, {{firstName}}',
        body: 'Hello {{firstName}},\n\nNot a pitch. One thing worth knowing before you decide anything, whoever you end up using.\n\nIf it is useful and you want to talk, reply.',
      }, 'n2'),
      n('n2', 'wait', 'Wait 4 days', { days: '4' }, 'n3'),
      n('n3', 'send_email', 'Say what you actually do', {
        subject: 'How we would approach this, {{firstName}}',
        body: 'Hello {{firstName}},\n\nHere is how we would handle what you are dealing with, in plain terms and with the costs.\n\nHappy to talk it through, or happy to leave you to it.',
      }, 'n4'),
      n('n4', 'wait', 'Wait 6 days', { days: '6' }, 'n5'),
      n('n5', 'condition', 'Have they replied?', { field: 'status', operator: 'equals', value: 'replied' }, null,
        { yesId: null, noId: 'n6' }),
      n('n6', 'send_email', 'Ask plainly, and mean it', {
        subject: 'Shall I stop, {{firstName}}?',
        body: 'Hello {{firstName}},\n\nI have written twice and not heard back, which usually means the timing is wrong.\n\nReply "not now" and I will leave it. Reply "go on" and I will send one more thing.',
      }, 'n7'),
      n('n7', 'add_tag', 'Mark as followed up', { tag: 'followed-up' }, null),
    ],
  },
  {
    key: 'ticket-triage',
    name: 'Customer Support Ticket Triage Automation',
    category: 'pipeline',
    description: 'Urgent tickets get a person; the rest get an honest holding reply.',
    blurb: 'Splits incoming tickets the moment they arrive. Urgent goes to somebody with a task; everything else gets acknowledged so nobody is left wondering.',
    pain: 'Every ticket looks the same in an inbox, so the urgent one waits behind four that were not.',
    industry: ['SaaS', 'Agency', 'E-commerce', 'Professional services'],
    keywords: ['support', 'ticket', 'triage', 'helpdesk', 'escalation', 'routing', 'urgent', 'customer service'],
    needs: ['A connected mailbox', 'A form or tag that marks an urgent ticket'],
    outcome: 'Urgent things reach a person quickly and ordinary things get answered. It does not read the ticket — the tag or the form field decides, which is why it is reliable.',
    nodes: [
      n('n0', 'trigger', 'A form is submitted', { event: 'form_submitted', formName: 'Support' }, 'n1'),
      n('n1', 'add_tag', 'Tag as a ticket', { tag: 'ticket' }, 'n2'),
      n('n2', 'condition', 'Is it urgent?', { field: 'status', operator: 'equals', value: 'urgent' }, 'n3',
        { yesId: 'n3', noId: 'n5' }),
      n('n3', 'assign_to', 'Straight to a senior', { user: '' }, 'n4'),
      n('n4', 'create_task', 'Deal with this now', { title: 'Urgent ticket — deal with it now' }, null),
      n('n5', 'send_email', 'Acknowledge it honestly', {
        subject: 'We have your message, {{firstName}}',
        body: 'Hello {{firstName}},\n\nWe have this and somebody will come back to you. If it becomes urgent in the meantime, reply and say so — that moves it.',
      }, 'n6'),
      n('n6', 'create_task', 'Answer it properly', { title: 'Support ticket waiting for an answer' }, null),
    ],
  },
  {
    key: 'webinar-followup',
    name: 'Webinar Registration Follow-up Automation',
    category: 'appointments',
    description: 'Reminders before, and two different messages after depending on who turned up.',
    blurb: 'Confirms, reminds, then splits: people who attended get the next step, people who missed it get the recording and no guilt.',
    pain: 'Half the registrations never show, and both halves get the same email afterwards, which suits neither.',
    industry: ['SaaS', 'Coaching', 'B2B', 'Agency'],
    keywords: ['webinar', 'event', 'registration', 'attendance', 'reminder', 'recording', 'follow up'],
    needs: ['A connected mailbox', 'An "attended" tag added after the event'],
    outcome: 'Attendees and no-shows get different messages. The split only works if something marks who attended — without that, everybody takes the missed branch.',
    nodes: [
      n('n0', 'trigger', 'A form is submitted', { event: 'form_submitted', formName: 'Webinar' }, 'n1'),
      n('n1', 'send_email', 'Confirm the place', {
        subject: 'You are registered, {{firstName}}',
        body: 'Hello {{firstName}},\n\nYou are on the list. We will send a reminder the day before with the link.',
      }, 'n2'),
      n('n2', 'wait', 'Wait until the day before', { days: '1' }, 'n3'),
      n('n3', 'send_email', 'Remind them', {
        subject: 'Tomorrow, {{firstName}}',
        body: 'Hello {{firstName}},\n\nIt is tomorrow. The link is in your confirmation email — reply if you cannot find it.',
      }, 'n4'),
      n('n4', 'wait', 'Wait 2 days', { days: '2' }, 'n5'),
      n('n5', 'condition', 'Did they attend?', { field: 'tag', operator: 'equals', value: 'attended' }, 'n6',
        { yesId: 'n6', noId: 'n7' }),
      n('n6', 'send_email', 'Give attendees the next step', {
        subject: 'Thanks for coming, {{firstName}}',
        body: 'Hello {{firstName}},\n\nThank you for joining. Here is the thing I promised, and here is what to do next if you want to take it further.',
      }, null),
      n('n7', 'send_email', 'Send the recording, no guilt', {
        subject: 'Here is the recording, {{firstName}}',
        body: 'Hello {{firstName}},\n\nYou missed it — no problem, they always clash with something. Here is the recording, and the summary if you would rather read it.',
      }, null),
    ],
  },
  {
    key: 'agency-onboarding',
    name: 'Agency Client Onboarding Automation',
    category: 'retention',
    description: 'The first fortnight of a new client, without anybody remembering the steps.',
    blurb: 'Welcome, the things you need from them, the kick-off, and a check that it is going well — in order, on time, every time.',
    pain: 'Onboarding is a checklist in somebody’s head, and the bits that get missed are the bits that cause the first awkward conversation.',
    industry: ['Agency', 'Professional services', 'SaaS', 'Consulting'],
    featured: true,
    keywords: ['onboarding', 'new client', 'kickoff', 'welcome', 'agency', 'account management'],
    needs: ['A connected mailbox', 'A "client-signed" tag'],
    outcome: 'Every client gets the same start. What it is worth is the awkward conversations that do not happen.',
    nodes: [
      n('n0', 'trigger', 'A tag is added', { event: 'tag_added', tag: 'client-signed' }, 'n1'),
      n('n1', 'send_email', 'Welcome and what happens now', {
        subject: 'Welcome aboard, {{firstName}}',
        body: 'Hello {{firstName}},\n\nDelighted to have you. Here is exactly what happens over the next two weeks, so nothing is a surprise.\n\nAnything at all, reply to this.',
      }, 'n2'),
      n('n2', 'create_task', 'Set the workspace up', { title: 'Set up the workspace for this new client' }, 'n3'),
      n('n3', 'wait', 'Wait 2 days', { days: '2' }, 'n4'),
      n('n4', 'send_email', 'Ask for what you need', {
        subject: 'Three things from you, {{firstName}}',
        body: 'Hello {{firstName}},\n\nTo get going we need three things from you. They are listed below and none of them takes long.\n\nThe sooner these land, the sooner we start.',
      }, 'n5'),
      n('n5', 'create_task', 'Book the kick-off call', { title: 'Book the kick-off call' }, 'n6'),
      n('n6', 'wait', 'Wait 12 days', { days: '12' }, 'n7'),
      n('n7', 'send_email', 'Check it is going well', {
        subject: 'Two weeks in — how is it going, {{firstName}}?',
        body: 'Hello {{firstName}},\n\nTwo weeks in. Is this what you expected? If anything is not right I would much rather hear it now.',
      }, null),
    ],
  },
  {
    key: 'birthday-anniversary',
    name: 'Customer Anniversary Automation',
    category: 'retention',
    description: 'One message a year, on the day they became a customer.',
    blurb: 'Tag the anniversary and this sends one message. No offer, no upsell — the whole point is that it is not asking for anything.',
    pain: 'Every message a customer gets is asking for something, which is why they stop opening them.',
    industry: ['Local business', 'Retail', 'Clinics', 'Hospitality'],
    keywords: ['anniversary', 'birthday', 'loyalty', 'retention', 'thank you', 'milestone'],
    needs: ['A connected mailbox', 'An "anniversary" tag, added by you or by a date field'],
    outcome: 'One message a year that is not a sales message. Measured in replies rather than in revenue.',
    nodes: [
      n('n0', 'trigger', 'A tag is added', { event: 'tag_added', tag: 'anniversary' }, 'n1'),
      n('n1', 'send_email', 'Say thank you and nothing else', {
        subject: 'A year today, {{firstName}}',
        body: 'Hello {{firstName}},\n\nA year today since you first came to us. Nothing to sell — just thank you. It matters more to a business this size than people realise.',
      }, 'n2'),
      n('n2', 'add_tag', 'Mark it as sent', { tag: 'anniversary-sent' }, null),
    ],
  },
  {
    key: 'nps-followup',
    name: 'Customer Satisfaction Follow-up Automation',
    category: 'reviews',
    description: 'Ask how it went, and route the answer to the right place.',
    blurb: 'One question a fortnight after the work, then the answer splits: happy goes to a review ask, unhappy goes to a person the same day.',
    pain: 'Nobody finds out a customer was unhappy until it is a review, and by then it is a public problem rather than a private one.',
    industry: ['Trades', 'Clinics', 'Professional services', 'Local business'],
    keywords: ['nps', 'satisfaction', 'survey', 'feedback', 'how did we do', 'csat'],
    needs: ['A connected mailbox', 'A "job-done" tag', 'A tag or field to record the answer'],
    outcome: 'You hear about the unhappy ones. How many depends entirely on whether people reply, which is usually a minority — but the ones who do are the ones who matter.',
    nodes: [
      n('n0', 'trigger', 'A tag is added', { event: 'tag_added', tag: 'job-done' }, 'n1'),
      n('n1', 'wait', 'Wait 14 days', { days: '14' }, 'n2'),
      n('n2', 'send_email', 'Ask one question', {
        subject: 'How did we do, {{firstName}}?',
        body: 'Hello {{firstName}},\n\nOne question, and a one-word answer is fine: how did we do?\n\nIf anything was not right, this is the easiest place to tell me.',
      }, 'n3'),
      n('n3', 'wait', 'Wait 3 days', { days: '3' }, 'n4'),
      n('n4', 'condition', 'Were they happy?', { field: 'tag', operator: 'equals', value: 'happy' }, 'n5',
        { yesId: 'n5', noId: 'n6' }),
      n('n5', 'add_tag', 'Line them up for a review ask', { tag: 'job-done' }, null),
      n('n6', 'create_task', 'Ring anybody who was not happy', { title: 'Customer was not happy — ring them today' }, null),
    ],
  },
  {
    key: 'referral-request',
    name: 'Client Referral Request Automation',
    category: 'retention',
    description: 'Ask the happy ones, once, at the moment they are happiest.',
    blurb: 'Waits until somebody has been a customer long enough to mean it, asks once, and never asks that person again.',
    pain: 'Referrals are most of the work for a business this size and almost nobody asks for them, because asking feels like begging.',
    industry: ['Trades', 'Professional services', 'Agency', 'Clinics'],
    keywords: ['referral', 'word of mouth', 'recommend', 'introduction', 'advocacy'],
    needs: ['A connected mailbox', 'A "customer" tag'],
    outcome: 'Some referrals, from people who would have given one if asked. Asking at all is the change; the wording matters much less than people think.',
    nodes: [
      n('n0', 'trigger', 'A tag is added', { event: 'tag_added', tag: 'customer' }, 'n1'),
      n('n1', 'wait', 'Wait 45 days', { days: '45' }, 'n2'),
      n('n2', 'condition', 'Still a happy customer?', { field: 'tag', operator: 'not_equals', value: 'unhappy' }, 'n3',
        { yesId: 'n3', noId: null }),
      n('n3', 'send_email', 'Ask once, and mean the get-out', {
        subject: 'A favour, {{firstName}} — and a genuine no is fine',
        body: 'Hello {{firstName}},\n\nMost of our work comes from people passing our name on. If you know somebody who needs the same doing, send them my way and I will look after them exactly as I looked after you.\n\nAnd if not, that is completely fine — I will not ask again.',
      }, 'n4'),
      n('n4', 'add_tag', 'Never ask this one twice', { tag: 'referral-asked' }, null),
    ],
  },
  {
    key: 'reorder-reminder',
    name: 'Repeat Order Reminder Automation',
    category: 'shop',
    description: 'A nudge when whatever they bought has plausibly run out.',
    blurb: 'For anything people buy again. Waits the length of the thing, then reminds them once — with a straightforward way to say they do not want reminding.',
    pain: 'Consumable products get bought once because nobody was reminded, and the customer does not think of you until they are already somewhere else.',
    industry: ['E-commerce', 'Retail', 'D2C', 'Clinics'],
    keywords: ['reorder', 'repeat', 'subscription', 'replenish', 'run out', 'consumable', 'repeat purchase'],
    needs: ['A connected mailbox', 'An "order-paid" tag'],
    outcome: 'Some repeat orders that would not have happened. Set the wait to match how long the thing actually lasts — too early is worse than not asking.',
    nodes: [
      n('n0', 'trigger', 'A tag is added', { event: 'tag_added', tag: 'order-paid' }, 'n1'),
      n('n1', 'wait', 'Wait 60 days', { days: '60' }, 'n2'),
      n('n2', 'send_email', 'Remind once, easy to stop', {
        subject: 'Running low, {{firstName}}?',
        body: 'Hello {{firstName}},\n\nAbout the time you would be running out. Ordering again takes a minute.\n\nIf you would rather not be reminded about this, reply "stop" and I will take you off it.',
      }, 'n3'),
      n('n3', 'add_tag', 'Mark as reminded', { tag: 'reorder-reminded' }, null),
    ],
  },
];


/* ── The demo ─────────────────────────────────────────────────────────────── */

/**
 * The client the demo is for.
 *
 * A specific business rather than "Example Ltd", because every prompt and every
 * piece of writing in this product reads the profile — and a vague one produces
 * vague copy, which is the opposite of what a demonstration is for.
 */
export const DEMO_CLIENT = {
  name: 'Northside Plumbing (demo)',
  profile: {
    companyName: 'Northside Plumbing',
    industry: 'Plumbing and heating',
    description: 'Boiler repairs, installations and servicing for landlords and letting agents across Leeds.',
    products: 'Boiler repair, boiler installation, annual servicing, landlord gas safety certificates',
    audience: 'Landlords and letting agents with two to forty properties',
    tone: 'Plain and direct. No jargon, no sales language.',
    objective: 'More boiler installs booked over the winter',
  },
};

export const DEMO_PROJECT = {
  name: 'Northside Plumbing — winter installs (demo)',
  objective: 'Win more boiler installations from landlords before the cold sets in',
  kind: 'leadgen' as const,
  /*
   * Nothing that sends is switched on.
   *
   * A demo whose first act is emailing somebody is not a demo, it is an
   * accident. Writing is on so the project has something to show; every send
   * asks first, exactly as a real project does by default.
   */
  guardrails: {
    createWorkflows: 'on',
    activateWorkflows: 'approval',
    sendEmail: 'approval',
    sendSms: 'approval',
    bookAppointments: 'approval',
    findProspects: 'approval',
    publishContent: 'approval',
  },
};

/** The three the demo ships with, drawn from the templates above. */
/**
 * The three the demo ships with, drawn from the templates above.
 *
 * Chosen to show the three shapes the engine has: a straight run of steps, a
 * condition with both branches drawn, and one that only creates tasks. A demo
 * of three near-identical email sequences demonstrates one thing three times.
 */
export const DEMO_WORKFLOWS = ['speed-to-lead', 'quote-chase', 'review-request'];
