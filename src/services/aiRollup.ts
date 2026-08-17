/**
 * What a campaign is actually doing, read from the modules that know.
 *
 * There is no synchronisation here and there is nothing to reconcile, because
 * nothing about a record's state was ever copied into the AI campaign. A link
 * holds an id; the figures come from following it. That is what makes the two
 * directions of requirement 15 work by construction: edit a sequence in
 * Marketing and this reads the edit, because this was always reading Marketing.
 *
 * The harder discipline is what to leave out. A campaign that has sent nothing
 * has no open rate — not a zero, which is a different claim entirely — so
 * anything unmeasurable comes back null and the screen shows a dash. Every
 * figure also carries where it came from, so "9 appointments" can be traced to
 * the module that counted them rather than taken on trust.
 */
import { emailStats, loadEmails, loadEnrollments } from './contactEmail';
import { leadStats, leadsFor } from './aiDiscovery';
import { MIN_SENDS } from './aiRecommend';
import type { Appointment, Booking, Contact } from '../types';
import type { EmailSequence } from '../types/marketing';
import type { AICampaign } from '../types/aiSalesAgent';

export interface RollupApi {
  contacts: Contact[];
  sequences: EmailSequence[];
  appointments: Appointment[];
  bookings: Booking[];
}

/** One number, and where it was read from. */
export interface Figure {
  label: string;
  /** null means "not measurable yet" — never rendered as 0. */
  value: number | null;
  /** The module that owns it, named on screen. */
  from: string;
  /** Shown under the figure when it needs qualifying. */
  note?: string;
}

export interface SequenceView {
  id: string;
  name: string;
  /** Read live from Marketing, never mirrored. */
  status: EmailSequence['status'] | 'missing';
  enrolled: number;
  active: number;
  completed: number;
  sent: number;
  opened: number;
  replied: number;
  bounced: number;
  openRate: number | null;
  replyRate: number | null;
}

export interface Rollup {
  figures: Figure[];
  sequences: SequenceView[];
  /** True once something has actually been sent, which gates the rate figures. */
  hasSends: boolean;
  /** Anything the roll-up could not answer, in words. */
  caveats: string[];
}

/**
 * The live state of one sequence this campaign created.
 *
 * A sequence the user deleted in Marketing comes back as 'missing' rather than
 * as its last known state — a campaign pointing at a deleted record should say
 * so, not keep displaying figures from a thing that no longer exists.
 */
export function sequenceView(campaign: AICampaign, api: RollupApi): SequenceView[] {
  const links = campaign.links.filter(l => l.kind === 'sequence');
  const emails = loadEmails();
  const enrollments = loadEnrollments();

  return links.map(link => {
    const seq = api.sequences.find(s => s.id === link.id);
    const mine = enrollments.filter(e => e.sequenceId === link.id);
    const sentEmails = emails.filter(e => e.sequenceId === link.id);
    const stats = emailStats(sentEmails);

    return {
      id: link.id,
      name: seq?.name ?? link.label,
      status: seq?.status ?? 'missing',
      enrolled: mine.length,
      active: mine.filter(e => e.status === 'active').length,
      completed: mine.filter(e => e.status === 'completed').length,
      sent: stats.sent,
      opened: stats.opened,
      replied: stats.replied,
      bounced: stats.bounced,
      /* A rate over nothing is not zero, it is undefined — and a rate over
         three sends is not a rate either. Two opens out of three is not "67%
         open rate", it is three sends, and printing the percentage invites a
         conclusion the sample cannot carry. The counts are still shown. */
      openRate: stats.sent >= MIN_SENDS ? stats.openRate : null,
      replyRate: stats.sent >= MIN_SENDS ? stats.replyRate : null,
    };
  });
}

/**
 * The people this campaign put into the CRM.
 *
 * Matched two ways because both are true and neither is complete on its own: a
 * contact linked at creation time, and one carrying the campaign id in its
 * custom fields. A contact deleted from the CRM simply stops appearing.
 */
export function campaignContacts(campaign: AICampaign, api: Pick<RollupApi, 'contacts'>): Contact[] {
  const linked = new Set(campaign.links.filter(l => l.kind === 'contact').map(l => l.id));
  return api.contacts.filter(c => linked.has(c.id) || c.customFields?.aiCampaignId === campaign.id);
}

/**
 * Meetings that came out of this campaign.
 *
 * The calendar has no idea a campaign exists, so these are found by matching
 * the people it created — an appointment by contact id, a booking by the email
 * address the guest used. Anything booked with someone this campaign never
 * touched is somebody else's meeting and is left out.
 */
export function campaignMeetings(campaign: AICampaign, api: RollupApi): {
  appointments: Appointment[]; bookings: Booking[];
} {
  const mine = campaignContacts(campaign, api);
  const ids = new Set(mine.map(c => c.id));
  const emails = new Set(mine.map(c => (c.email || '').toLowerCase()).filter(Boolean));
  return {
    appointments: api.appointments.filter(a => a.contactId && ids.has(a.contactId)),
    bookings: api.bookings.filter(b => emails.has((b.guestEmail || '').toLowerCase())),
  };
}

export function rollup(campaign: AICampaign, api: RollupApi): Rollup {
  const seqs = sequenceView(campaign, api);
  const leads = leadStats(leadsFor(campaign.id));
  const caveats: string[] = [];

  const mineContacts = campaignContacts(campaign, api);
  const { appointments: appts, bookings: books } = campaignMeetings(campaign, api);

  const sent = seqs.reduce((n, s) => n + s.sent, 0);
  const opened = seqs.reduce((n, s) => n + s.opened, 0);
  const replied = seqs.reduce((n, s) => n + s.replied, 0);
  const bounced = seqs.reduce((n, s) => n + s.bounced, 0);
  const enrolled = seqs.reduce((n, s) => n + s.enrolled, 0);
  const hasSends = sent > 0;
  /* Percentages only once there are enough sends to mean something. */
  const rateable = sent >= MIN_SENDS;

  if (!seqs.length) caveats.push('No email sequence has been built yet, so there is nothing sending.');
  if (seqs.some(s => s.status === 'missing')) {
    caveats.push('A sequence this campaign created no longer exists in Marketing — it was probably deleted there.');
  }
  if (seqs.length && !enrolled) caveats.push('The sequence exists but nobody is enrolled, so it will not send.');
  if (enrolled && !sent) caveats.push('People are enrolled and nothing has gone out yet — the first message is still due.');
  if (hasSends && !rateable) {
    caveats.push(`Open and reply rates are not shown yet: ${sent} ${sent === 1 ? 'send is' : 'sends are'} too few for a percentage to mean anything. They appear at about ${MIN_SENDS}.`);
  }
  if (leads.total && !leads.withEmail) {
    caveats.push(`None of the ${leads.total} prospects has an email address, which is why the email figures stay empty.`);
  }

  const figures: Figure[] = [
    { label: 'Prospects found', value: leads.total || null, from: 'AI Sales Agent' },
    { label: 'Match the plan', value: leads.qualified || null, from: 'AI Sales Agent' },
    { label: 'In your CRM', value: mineContacts.length || null, from: 'Contacts' },
    { label: 'Enrolled', value: enrolled || null, from: 'Email sequences' },
    { label: 'Sent', value: sent || null, from: 'Email' },
    { label: 'Opened', value: hasSends ? opened : null, from: 'Email', note: rateable ? `${Math.round((opened / sent) * 100)}% of sent` : hasSends ? `of ${sent} sent` : undefined },
    { label: 'Replied', value: hasSends ? replied : null, from: 'Email', note: rateable ? `${Math.round((replied / sent) * 100)}% of sent` : hasSends ? `of ${sent} sent` : undefined },
    { label: 'Bounced', value: hasSends ? bounced : null, from: 'Email' },
    { label: 'Appointments', value: (appts.length + books.length) || null, from: 'Calendar' },
  ];

  return { figures, sequences: seqs, hasSends, caveats };
}

/* ── Pausing, in both directions ───────────────────────────────────────── */

export interface PauseApi {
  sequences: EmailSequence[];
  updateSequence: (id: string, updates: Partial<EmailSequence>) => void;
}

export interface PauseResult {
  changed: string[];
  /** Sequences the campaign points at that are no longer there. */
  missing: string[];
}

/**
 * Pausing the campaign pauses what it created.
 *
 * Requirement 15 in the other direction is free — a sequence paused inside
 * Marketing shows as paused here because the status is read from Marketing —
 * but a campaign paused here has to actually reach in and stop the sending, or
 * "paused" is a label on a screen while the emails keep going out.
 */
export function propagatePause(campaign: AICampaign, api: PauseApi, to: 'paused' | 'active'): PauseResult {
  const changed: string[] = [];
  const missing: string[] = [];

  for (const link of campaign.links.filter(l => l.kind === 'sequence')) {
    const seq = api.sequences.find(s => s.id === link.id);
    if (!seq) { missing.push(link.label); continue; }
    /* A draft was never running, so resuming a campaign must not silently
       activate something a person deliberately left unstarted. */
    if (to === 'active' && seq.status === 'draft') continue;
    if (seq.status === to) continue;
    api.updateSequence(seq.id, { status: to });
    changed.push(seq.name);
  }
  return { changed, missing };
}

/**
 * Does the campaign's own status disagree with what its records are doing?
 *
 * Shown rather than silently corrected: the two can legitimately differ for a
 * moment, and a user who paused a sequence in Marketing should be told their
 * campaign still says Running rather than having one quietly rewritten.
 */
export function disagreements(campaign: AICampaign, api: RollupApi): string[] {
  const out: string[] = [];
  for (const s of sequenceView(campaign, api)) {
    if (s.status === 'missing') continue;
    if (campaign.status === 'running' && s.status === 'paused') {
      out.push(`This campaign says it is running, but “${s.name}” is paused in Marketing, so nothing is going out.`);
    }
    if (campaign.status === 'paused' && s.status === 'active') {
      out.push(`This campaign is paused, but “${s.name}” is still active in Marketing and will keep sending.`);
    }
    if (campaign.status === 'running' && s.status === 'draft') {
      out.push(`“${s.name}” is still a draft in Marketing. Nothing sends from a draft.`);
    }
  }
  return out;
}
