/**
 * Turning an approved plan into records the rest of the CRM runs.
 *
 * This is the whole point of the module and also the narrowest part of it: the
 * agent does not send anything, store a message, or track a reply. It creates a
 * real contact, a real email sequence and a real enrolment through the same
 * calls a person clicking around the app would make, stamps each one so it can
 * be traced back, and stops.
 *
 * It follows campaignHandoff.ts, which already does this for the content
 * library — an injected API of existing actions rather than imports, so the
 * service can be tested without a React tree, and one convention instead of two.
 *
 * Three rules:
 *
 * It refuses rather than pretends. A plan that opens on email, run against
 * leads with no email addresses — which is every lead Google Places returns —
 * would create a sequence with nobody in it and report success. That is
 * reported as a refusal with the count, not as a campaign.
 *
 * Running it twice creates nothing twice. Every record it makes is linked to the
 * campaign, and the links are checked before anything is built.
 *
 * The permissions are enforced here, not in the screen. A UI that hides a button
 * is a suggestion; a service that refuses to enrol anyone without the sending
 * permission is a rule.
 */
import { aiCampaignSource, linkRecord } from './aiCampaigns';
import { logDecision } from './aiDecisionLog';
import { leadsFor, updateLead } from './aiDiscovery';
import { enrollInSequence } from './contactEmail';
import type { Contact } from '../types';
import type { EmailSequence, EmailStep } from '../types/marketing';
import type { AICampaign, AILead, AIStrategy } from '../types/aiSalesAgent';

/** The existing actions this needs, passed in so nothing here imports React. */
export interface OrchestrateApi {
  contacts: Contact[];
  bulkImportContacts: (contacts: Omit<Contact, 'id'>[]) => Contact[];
  addSequence: (seq: Omit<EmailSequence, 'id'>) => EmailSequence;
  updateSequence: (id: string, updates: Partial<EmailSequence>) => void;
}

export interface BuildResult {
  ok: boolean;
  /** What was created, in words for the log and the screen. */
  created: string[];
  /** What it would not do, and why. Never silent. */
  blocked: string[];
  contactsAdded: number;
  enrolled: number;
  sequenceId?: string;
  error?: string;
}

/* ── The messages ──────────────────────────────────────────────────────── */

/**
 * The opening email and its follow-ups, written from the plan.
 *
 * Deliberately short and specific. These are a starting point a person edits in
 * the Email module, not finished copy — so they say what the offer is and ask
 * one question, rather than filling three paragraphs with things the plan never
 * said.
 */
export function composeSequence(strategy: AIStrategy, businessName?: string): EmailStep[] {
  const who = strategy.icp.industry?.replace(/s$/, '') || 'business';
  const offer = withArticle(strategy.offer.what || 'what we do');
  const price = strategy.offer.priceHint ? ` It is ${strategy.offer.priceHint}.` : '';
  /* Signed with the actual business, or not at all. A cold email ending in the
     word "us" reads like a template that was never filled in — which is exactly
     what it would be. */
  const signOff = businessName?.trim() ? `\n\n${businessName.trim()}` : '';
  const steps: EmailStep[] = [];

  const step = (day: number, subject: string, body: string): EmailStep => ({
    id: `step-${day}-${Math.random().toString(36).slice(2, 7)}`,
    day,
    waitUnit: 'days',
    type: 'auto_email',
    subject,
    body,
    followUpRule: 'Stop if they reply',
  });

  steps.push(step(0,
    `Quick question about {{company}}`,
    `Hi {{firstName}},\n\nI work with ${who}s on ${offer}.${price}\n\n`
    + `Is that something {{company}} is looking at this quarter?\n\n`
    + `If not, no problem — just say so and I will leave you be.${signOff}`));

  const followUps = [
    ['Worth a look?', `Hi {{firstName}},\n\nFollowing up on my note about ${offer}. Happy to send over what it looks like in practice for a ${who} your size — no call needed.\n\nWorth a look?${signOff}`],
    ['One more thing', `Hi {{firstName}},\n\nOne thing worth mentioning: most ${who}s we speak to are not short of enquiries, they are short of time to follow them up.\n\nIf that sounds familiar, reply and I will show you what we do about it.${signOff}`],
    ['Closing the loop', `Hi {{firstName}},\n\nI will stop here — I do not want to clutter your inbox.\n\nIf ${offer} becomes relevant later, just reply to this and I will pick it up.${signOff}`],
  ];

  for (let i = 0; i < strategy.cadence.followUps; i++) {
    const [subject, body] = followUps[Math.min(i, followUps.length - 1)];
    /* Later follow-ups reuse the last template rather than repeating the second
       one, and the day always advances so two never land together. */
    steps.push(step(strategy.cadence.intervalDays * (i + 1), i >= followUps.length ? `${subject} (${i + 1})` : subject, body));
  }

  return steps;
}

/**
 * "on marketing service" is not a sentence. An offer taken verbatim from a
 * customer's own words rarely carries its own article, so one is added unless
 * the phrase already begins with something that does the job.
 */
function withArticle(offer: string): string {
  const t = offer.trim();
  if (!t) return 'what we do';
  if (/^(a|an|the|our|your|my|their)\s/i.test(t)) return t;
  /* A proper noun is a name, and names do not take an article. */
  if (/^[A-Z][a-z]/.test(t) && !/^[A-Z][a-z]+\s(service|offer|package|plan|programme|program|retainer)$/i.test(t)) return t;
  return `${/^[aeiou]/i.test(t) ? 'an' : 'a'} ${t}`;
}

/* ── Leads to contacts ─────────────────────────────────────────────────── */

function leadToContact(lead: AILead, source: ReturnType<typeof aiCampaignSource>): Omit<Contact, 'id'> {
  const now = new Date().toISOString();
  return {
    name: lead.name,
    email: lead.email ?? '',
    phone: lead.phone ?? '',
    status: 'lead',
    tags: ['ai-sales-agent'],
    /* Contact.source is a plain string on this type and predates the provenance
       model, so the traceable stamp goes in customFields alongside it. */
    source: `AI Sales Agent · ${source.refId}`,
    createdAt: now,
    lastActivity: now,
    value: 0,
    company: lead.name,
    website: lead.website ?? '',
    customFields: {
      aiCampaignId: source.refId ?? '',
      aiCampaignName: source.title,
      leadAddress: lead.address ?? '',
    },
  } as Omit<Contact, 'id'>;
}

/* ── Building ──────────────────────────────────────────────────────────── */

/**
 * What a campaign would do if built, without doing any of it.
 *
 * Shown before the button is pressed, because "this will add 47 contacts and
 * enrol nobody" is worth knowing in advance rather than afterwards.
 */
export function previewBuild(campaign: AICampaign): {
  qualified: number; alreadyPromoted: number; withEmail: number; wouldEnrol: number; blocked: string[];
} {
  const strategy = campaign.strategy;
  const leads = leadsFor(campaign.id);
  const qualified = leads.filter(l => l.status === 'qualified');
  const promoted = leads.filter(l => l.status === 'promoted');
  const withEmail = qualified.filter(l => !!l.email).length;

  const blocked: string[] = [];
  if (!strategy) blocked.push('There is no approved plan yet.');
  if (!qualified.length && !promoted.length) blocked.push('No qualified prospects to work with — run the search first.');
  if (strategy?.channels.includes('email') && withEmail === 0 && qualified.length > 0) {
    blocked.push(`None of the ${qualified.length} qualified prospects has an email address, so an email sequence would have nobody in it.`);
  }
  if (campaign.guardrails.sendEmail !== 'on') {
    blocked.push('Sending is not allowed unattended, so nobody will be enrolled until you turn it on in the campaign controls.');
  }
  return { qualified: qualified.length, alreadyPromoted: promoted.length, withEmail, wouldEnrol: campaign.guardrails.sendEmail === 'on' ? withEmail : 0, blocked };
}

export function buildCampaign(
  campaign: AICampaign,
  api: OrchestrateApi,
  now = new Date(),
  /** The customer's own business name, used to sign the emails. */
  businessName?: string,
): BuildResult {
  const created: string[] = [];
  const blocked: string[] = [];
  const strategy = campaign.strategy;

  if (!strategy) {
    return { ok: false, created, blocked, contactsAdded: 0, enrolled: 0, error: 'Approve a plan before building the campaign.' };
  }

  const leads = leadsFor(campaign.id);
  const qualified = leads.filter(l => l.status === 'qualified');
  if (!qualified.length) {
    const already = leads.filter(l => l.status === 'promoted').length;
    return {
      ok: false, created, blocked, contactsAdded: 0, enrolled: 0,
      error: already
        ? 'Every qualified prospect has already been added. Search for more first.'
        : 'No qualified prospects yet. Run the prospect search first.',
    };
  }

  const source = aiCampaignSource(campaign);

  /* ── Contacts ── */
  const existingByName = new Set(api.contacts.map(c => `${c.name.toLowerCase()}|${(c.phone || '').replace(/\D/g, '')}`));
  const fresh = qualified.filter(l => !existingByName.has(`${l.name.toLowerCase()}|${(l.phone || '').replace(/\D/g, '')}`));
  const duplicates = qualified.length - fresh.length;
  if (duplicates) blocked.push(`${duplicates} were already in your contacts and were left alone.`);

  const madeContacts = fresh.length ? api.bulkImportContacts(fresh.map(l => leadToContact(l, source))) : [];
  madeContacts.forEach((c, i) => {
    updateLead(fresh[i].id, { status: 'promoted' });
    linkRecord(campaign.id, { kind: 'contact', id: c.id, label: c.name, route: '/contacts' });
  });
  if (madeContacts.length) created.push(`${madeContacts.length} contacts`);

  /* ── The email sequence ── */
  let sequenceId: string | undefined;
  let enrolled = 0;

  if (strategy.channels.includes('email')) {
    /* Keyed by id, because bulkImportContacts pushes into the very array being
       filtered here — so a plain concatenation lists everything it just created
       twice, and enrols each of them twice. */
    const byId = new Map<string, Contact>();
    for (const c of [...madeContacts, ...api.contacts]) {
      if (c.customFields?.aiCampaignId === campaign.id || madeContacts.includes(c)) byId.set(c.id, c);
    }
    const contactable = [...byId.values()].filter(c => !!c.email?.trim());

    if (!contactable.length) {
      blocked.push(
        `No email sequence was created: none of these prospects has an email address. `
        + `Google Places does not publish them, so an email campaign here would send nothing. `
        + `${qualified.filter(l => l.phone).length} have a phone number.`,
      );
    } else {
      /* Built once. A second run finds the link and enrols into the existing
         sequence rather than making a near-identical second one. */
      const existingLink = campaign.links.find(l => l.kind === 'sequence');
      if (existingLink) {
        sequenceId = existingLink.id;
        blocked.push('The email sequence already existed, so it was reused rather than duplicated.');
      } else {
        const active = campaign.guardrails.activateWorkflows === 'on';
        const seq = api.addSequence({
          name: `${campaign.name} — outreach`,
          source,
          goal: strategy.summary.slice(0, 200),
          steps: composeSequence(strategy, businessName),
          status: active ? 'active' : 'draft',
          createdAt: now.toISOString(),
          enrolledCount: 0,
        });
        sequenceId = seq.id;
        created.push(`an email sequence with ${seq.steps.length} messages`);
        if (!active) {
          blocked.push('The sequence was created as a draft, because activating workflows needs your approval. Open it in Marketing to start it.');
        }
        linkRecord(campaign.id, {
          kind: 'sequence', id: seq.id, label: seq.name, route: '/marketing',
        });
      }

      /* ── Enrolment, gated ── */
      if (campaign.guardrails.sendEmail === 'on' && sequenceId) {
        const seq: EmailSequence = {
          id: sequenceId,
          name: `${campaign.name} — outreach`,
          goal: strategy.summary,
          steps: composeSequence(strategy, businessName),
          status: 'active',
          createdAt: now.toISOString(),
          enrolledCount: 0,
        };
        for (const c of contactable) { enrollInSequence(c, seq); enrolled++; }
        if (enrolled) {
          created.push(`${enrolled} enrolled`);
          api.updateSequence(sequenceId, { enrolledCount: enrolled });
        }
      } else {
        blocked.push(`${contactable.length} could be enrolled, but sending is set to “ask me first”. Change it in the campaign controls when you are ready.`);
      }
    }
  }

  /* ── SMS ── */
  if (strategy.channels.includes('sms')) {
    blocked.push('SMS was left out: this CRM has no SMS campaign engine yet, so an SMS record here would be one that can never send.');
  }

  logDecision(campaign.id, {
    kind: 'create',
    summary: created.length ? `Built: ${created.join(', ')}` : 'Nothing could be built',
    because: blocked.length ? blocked.join(' ') : `Created from the approved plan for ${qualified.length} qualified prospects.`,
    counts: { contacts: madeContacts.length, enrolled },
  });

  return {
    ok: created.length > 0,
    created, blocked,
    contactsAdded: madeContacts.length,
    enrolled,
    sequenceId,
    error: created.length ? undefined : (blocked[0] ?? 'Nothing could be built from this plan.'),
  };
}
