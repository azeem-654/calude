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
    name: 'Answer a new enquiry in minutes',
    category: 'speed',
    description: 'A reply within minutes, then a nudge if they go quiet',
    blurb: 'Tags them, waits long enough not to read as a robot, replies, puts a call on your list, then checks two days later whether anybody actually got back to them.',
    pain: 'An enquiry arrives at 4pm on a Friday. Somebody sees it Monday. By then they have had three other quotes.',
    evidence: {
      claim: 'Leads contacted within five minutes are reported as far likelier to convert than those contacted at thirty, and the business that replies first is said to take most of the deals.',
      source: 'Call Loop / Branding Marketing Agency, 2026',
    },
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
    name: 'Text back a call nobody answered',
    category: 'speed',
    description: 'A text within the minute when a call goes unanswered',
    blurb: 'Tag somebody "missed-call" and this texts them straight back, then emails if they do not reply. The tag is what starts it — see what it needs, below.',
    pain: 'The phone rings while you are under a sink. They do not leave a voicemail; they ring the next firm on the list.',
    evidence: {
      claim: 'Home service businesses are reported to miss around 62% of inbound calls, and most callers who reach voicemail are said to hang up rather than leave one.',
      source: 'CallMissed / Valley Marketing Group, 2026',
    },
    /* Said plainly, because this is the one template whose trigger this product
       does not yet supply on its own. A customer who adds it expecting the
       phone system to fire it would find it never ran. */
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
    name: 'Chase a quote that went quiet',
    category: 'speed',
    description: 'Three chases over a fortnight, then it stops',
    blurb: 'Most quotes are never followed up once. This follows up three times over two weeks and then leaves them alone.',
    pain: 'You send a price and hear nothing. Chasing feels pushy, so it never happens, and the job goes to whoever did chase.',
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
    name: 'Remind them about the appointment',
    category: 'appointments',
    description: 'A reminder the day before and the morning of',
    blurb: 'Two reminders, timed so neither is a nuisance, with a plain way to move it rather than just not turning up.',
    pain: 'Somebody books three weeks out, forgets, and you lose the slot and the fuel getting there.',
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
    name: 'Get a no-show rebooked',
    category: 'appointments',
    description: 'A text the same hour, an email the next day',
    blurb: 'Assumes nothing about why they missed it, and makes rebooking one reply rather than a phone call they have to remember to make.',
    pain: 'They miss the slot, feel awkward about it, and neither side gets in touch again.',
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
    name: 'Ask for a review at the right moment',
    category: 'reviews',
    description: 'Two days after the job, then one nudge',
    blurb: 'Asks while the work is fresh, once by email and once by text, and stops. Most businesses ask nobody; the rest ask everybody twice a week.',
    pain: 'Reviews are how people choose a trade, and nobody asks — because at the end of a job you are already thinking about the next one.',
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
    name: 'Catch an unhappy customer first',
    category: 'reviews',
    description: 'Route the unhappy ones to a person, not to a review site',
    blurb: 'Anybody tagged unhappy goes to a person with a task, and is never asked for a public review. The two must not be the same path.',
    pain: 'A review request sent to somebody who had a bad experience is an invitation to post about it.',
    /* Said explicitly because the alternative is a product that quietly games
       reviews. Filtering who is *asked* is ordinary; suppressing what somebody
       writes is not, and this does not do that. */
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
    name: 'Wake up a list that has gone cold',
    category: 'winback',
    description: 'Three messages to people who have not been in touch for months',
    blurb: 'For the contacts sitting in the database doing nothing. One useful message, one offer, one plain question — then it stops asking.',
    pain: 'Everybody has a few thousand old customers and quotes and nobody writes to them, because writing to all of them at once feels like spam.',
    evidence: {
      claim: 'Home service reactivation campaigns are reported at roughly 2–6% response by email alone and 8–15% across email and SMS together, with agencies claiming a meaningful share of annual revenue comes from the existing database.',
      source: 'Prestyj, 2026',
    },
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
    name: 'Follow up the moment a deal reaches Proposal',
    category: 'pipeline',
    description: 'Fires off the stage change rather than somebody remembering',
    blurb: 'When a deal moves to the stage you name, it sends the follow-up and puts a call on your list. No more "I thought you were chasing that".',
    pain: 'The deal moves on the board and then nothing happens, because moving it felt like the action.',
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
    name: 'Notice a deal that has gone quiet',
    category: 'pipeline',
    description: 'A fortnight of silence puts it on somebody’s list',
    blurb: 'No email to the customer at all — this one only tells you. A deal nobody has touched for two weeks is either dead or forgotten, and those want different treatment.',
    pain: 'The board slowly fills with deals nobody has looked at, and the forecast stops meaning anything.',
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
    name: 'Look after somebody who has just bought',
    category: 'retention',
    description: 'Thanks, what happens next, then a referral ask',
    blurb: 'The fortnight after somebody buys is the only time they are certain to open your email. Most businesses use it for nothing.',
    pain: 'Everything goes into winning the customer and nothing into the week after, which is when they decide whether to recommend you.',
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
    name: 'A post a day, from the portfolio',
    category: 'content',
    description: 'One social post every morning, written from this client’s profile',
    blurb: 'Reads what the client does and who buys it, writes one post with a headline set on the image, and files it as a draft in the Social Creator.',
    pain: 'Posting consistently is the part everybody abandons in week three, and an empty feed makes a business look shut.',
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
    name: 'Turn a news feed into blog posts',
    category: 'content',
    description: 'Watches a feed and writes up anything new',
    blurb: 'Reads an RSS or Atom feed each morning and writes a post about whatever appeared since it last looked. A morning with nothing new is recorded as skipped, not as done.',
    pain: 'Writing about your industry needs somebody reading it every day, which nobody has time to do.',
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
    name: 'Turn new videos into written posts',
    category: 'content',
    description: 'Watches a YouTube channel and writes up each new video',
    blurb: 'For a client who films but does not write. Each new video on the channel becomes a draft article — the same thing, in the form search engines can read.',
    pain: 'A channel with fifty videos has fifty pieces of writing nobody made, and video does not rank for the thing people type.',
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
    name: 'A year of weekly emails',
    category: 'content',
    description: 'Fifty-two emails, written once, from the client’s profile',
    blurb: 'Writes a whole year of weekly emails in one go and files them as a draft campaign. Nobody is enrolled — they are there to be read and edited first.',
    pain: 'Everybody agrees a newsletter is a good idea and nobody gets past the third one.',
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
    name: 'Chase an order nobody paid for',
    category: 'shop',
    description: 'Two reminders, then it stops',
    blurb: 'Somebody got as far as the payment page and stopped. Usually that is a card that failed or a phone that rang, not a decision.',
    pain: 'The order sits there unpaid and nobody notices, because nothing tells anybody.',
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
    name: 'Thank a buyer and ask later',
    category: 'shop',
    description: 'Thanks now, a review ask once it has arrived',
    blurb: 'Thanks them immediately, waits until the thing has plausibly arrived and been used, then asks how it went.',
    pain: 'A review asked for the day of purchase is asked before anybody has anything to say.',
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
