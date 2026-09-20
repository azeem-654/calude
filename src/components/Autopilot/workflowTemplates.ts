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

export interface WorkflowTemplate {
  key: string;
  name: string;
  description: string;
  /** One line on what it is for, shown before somebody adds it. */
  blurb: string;
  nodes: WorkflowNode[];
}

export const TEMPLATES: WorkflowTemplate[] = [
  {
    key: 'enquiry',
    name: 'Answer a new enquiry',
    description: 'New enquiries get a reply within the hour',
    blurb: 'Tags them, waits a quarter of an hour so it does not read as a robot, replies, and puts a call on your list.',
    nodes: [
      n('n0', 'trigger', 'A form is submitted', { event: 'form_submitted' }, 'n1'),
      n('n1', 'add_tag', 'Tag as an enquiry', { tag: 'enquiry' }, 'n2'),
      /* Fifteen minutes, not instantly. Long enough not to read as an
         autoresponder, short enough that they still have the page open. */
      n('n2', 'wait', 'Wait 15 minutes', { minutes: '15' }, 'n3'),
      n('n3', 'send_email', 'Acknowledge it', {
        subject: 'Thanks for getting in touch, {{firstName}}',
        body: 'Hello {{firstName}},\n\nI have your enquiry and will come back to you shortly with everything you need.\n\nIf it is urgent, just reply to this and it comes straight to me.',
      }, 'n4'),
      n('n4', 'create_task', 'Remind me to call them', { title: 'Call this enquiry back' }, null),
    ],
  },
  {
    key: 'chase',
    name: 'Chase one that went quiet',
    description: 'Three days later, unless they have already bought',
    blurb: 'Waits three days, checks they are not already a customer, and sends one more note. Stops there.',
    nodes: [
      n('n0', 'trigger', 'A form is submitted', { event: 'form_submitted' }, 'n1'),
      n('n1', 'wait', 'Wait 3 days', { days: '3' }, 'n2'),
      n('n2', 'condition', 'Already a customer?', { field: 'status', operator: 'equals', value: 'customer' },
        null, { yesId: 'n3', noId: 'n4' }),
      /* Yes ends it. Chasing somebody who has already bought is the fastest way
         to make an automation look like spam. */
      n('n3', 'end', 'Nothing to do', {}, null),
      n('n4', 'send_email', 'Still interested?', {
        subject: 'Still thinking it over, {{firstName}}?',
        body: 'Just checking you got my note — happy to answer anything, or to leave you to it.',
      }, 'n5'),
      n('n5', 'add_tag', 'Tag as chased', { tag: 'chased' }, null),
    ],
  },
  {
    key: 'thanks',
    name: 'Thank a new customer',
    description: 'A day after they are tagged as one',
    blurb: 'Waits a day so it does not arrive with the invoice, then thanks them and opens the door to a review.',
    nodes: [
      n('n0', 'trigger', 'A tag is added', { event: 'tag_added', tag: 'customer' }, 'n1'),
      n('n1', 'wait', 'Wait 1 day', { days: '1' }, 'n2'),
      n('n2', 'send_email', 'Thank you', {
        subject: 'Thanks, {{firstName}}',
        body: 'Really glad to be working with you.\n\nIf anything is not right, reply and I will sort it. And if it is, a short review would mean a lot.',
      }, null),
    ],
  },
  {
    key: 'nudge',
    name: 'Text the ones who never open email',
    description: 'A short text after two unopened emails',
    blurb: 'Some people never open email and will answer a text in a minute. Needs an SMS sender connected.',
    nodes: [
      n('n0', 'trigger', 'A form is submitted', { event: 'form_submitted' }, 'n1'),
      n('n1', 'wait', 'Wait 2 days', { days: '2' }, 'n2'),
      n('n2', 'condition', 'Do we have a number?', { field: 'phone', operator: 'is_set' },
        null, { yesId: 'n3', noId: 'n4' }),
      n('n3', 'send_sms', 'Send a short text', {
        message: 'Hi {{firstName}}, just checking you got my email about your enquiry. Happy to call if easier.',
      }, null),
      n('n4', 'end', 'No number, nothing to send', {}, null),
    ],
  },
  {
    key: 'noshow',
    name: 'Follow up a missed appointment',
    description: 'Re-engage somebody who did not turn up',
    blurb: 'An hour later, a note that does not blame them, then a text two days on offering to rebook.',
    nodes: [
      n('n0', 'trigger', 'An appointment is booked', { event: 'appointment_scheduled' }, 'n1'),
      n('n1', 'wait', 'Wait 1 hour', { hours: '1' }, 'n2'),
      n('n2', 'send_email', 'Sorry we missed you', {
        subject: 'Sorry we missed you, {{firstName}}',
        body: 'No problem at all — these things happen. Reply with a couple of times that suit and I will put one in.',
      }, 'n3'),
      n('n3', 'wait', 'Wait 2 days', { days: '2' }, 'n4'),
      n('n4', 'send_sms', 'Offer to rebook', {
        message: 'Hi {{firstName}}, shall we find another time? Reply with a day that works.',
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
export const DEMO_WORKFLOWS = ['enquiry', 'chase', 'noshow'];
