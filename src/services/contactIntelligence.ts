/**
 * contactIntelligence.ts — scoring and recommendations for the contact
 * command center.
 *
 * Everything here is deterministic and rule-based, computed from data the CRM
 * already holds (activities, deals, tasks, appointments). That means it works
 * offline with no API key and no cost, and the reasoning is inspectable —
 * every score component and suggestion explains why it fired.
 */

import type { Contact, ContactActivity, Deal, Pipeline, Appointment } from '../types';

/* ── Lifecycle stages ── */

export const LIFECYCLE_STAGES = [
  'Subscriber', 'Lead', 'MQL', 'SQL', 'Opportunity', 'Customer', 'Evangelist',
] as const;
export type LifecycleStage = typeof LIFECYCLE_STAGES[number];

export const LIFECYCLE_META: Record<LifecycleStage, { color: string; bg: string; hint: string }> = {
  Subscriber:  { color: '#64748b', bg: '#f1f5f9', hint: 'On your list, not yet engaged with sales' },
  Lead:        { color: '#0ea5e9', bg: '#e0f2fe', hint: 'Showed initial interest' },
  MQL:         { color: '#6366f1', bg: '#e0e7ff', hint: 'Marketing qualified — engaging with content' },
  SQL:         { color: '#8b5cf6', bg: '#ede9fe', hint: 'Sales qualified — ready for a conversation' },
  Opportunity: { color: '#f59e0b', bg: '#fef3c7', hint: 'Active deal in the pipeline' },
  Customer:    { color: '#22c55e', bg: '#dcfce7', hint: 'Closed won — now a customer' },
  Evangelist:  { color: '#ec4899', bg: '#fce7f3', hint: 'Refers others and leaves reviews' },
};

const ENGAGING_TYPES: ContactActivity['type'][] = ['email_opened', 'link_clicked', 'form_submitted', 'call', 'meeting'];

const daysSince = (iso?: string): number => {
  if (!iso) return 9999;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 9999;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
};

/* ── Health score ── */

export interface HealthComponent { label: string; score: number; max: number; detail: string; }
export interface HealthScore {
  total: number;
  band: 'strong' | 'warm' | 'at-risk';
  color: string;
  components: HealthComponent[];
}

/**
 * A 0–100 contact health score from four weighted signals. Returned with its
 * component breakdown so the UI can explain the number rather than assert it.
 */
export function computeHealthScore(contact: Contact, deals: Deal[], appointments: Appointment[]): HealthScore {
  const acts = contact.activities ?? [];
  const recent = acts.filter(a => daysSince(a.timestamp) <= 90);

  // Engagement — meaningful two-way signals in the last 90 days (max 40)
  const engagements = recent.filter(a => ENGAGING_TYPES.includes(a.type)).length;
  const engagementScore = Math.min(40, engagements * 8);

  // Recency — how long since anything happened (max 30)
  const since = Math.min(daysSince(contact.lastActivity), daysSince(acts[0]?.timestamp));
  const recencyScore = since <= 7 ? 30 : since <= 14 ? 24 : since <= 30 ? 16 : since <= 60 ? 8 : since <= 120 ? 3 : 0;

  // Pipeline progress — an open or won deal is the strongest buying signal (max 20)
  const won = deals.some(d => d.status === 'won');
  const openDeals = deals.filter(d => (d.status ?? 'active') === 'active');
  const bestProb = openDeals.reduce((m, d) => Math.max(m, d.probability ?? 0), 0);
  const pipelineScore = won ? 20 : openDeals.length ? Math.min(18, 6 + Math.round(bestProb / 10)) : 0;

  // Reachability — can you actually contact them, and are meetings happening (max 10)
  const hasUpcoming = appointments.some(a => a.status === 'scheduled');
  const reachScore =
    (contact.email ? 4 : 0) + (contact.phone ? 3 : 0) + (hasUpcoming ? 3 : 0);

  const total = Math.max(0, Math.min(100, engagementScore + recencyScore + pipelineScore + reachScore));
  const band: HealthScore['band'] = total >= 70 ? 'strong' : total >= 40 ? 'warm' : 'at-risk';
  const color = band === 'strong' ? '#22c55e' : band === 'warm' ? '#f59e0b' : '#ef4444';

  return {
    total, band, color,
    components: [
      { label: 'Engagement', score: engagementScore, max: 40, detail: `${engagements} engaging action${engagements === 1 ? '' : 's'} in 90 days` },
      { label: 'Recency', score: recencyScore, max: 30, detail: since >= 9999 ? 'No activity recorded' : `Last activity ${since} day${since === 1 ? '' : 's'} ago` },
      { label: 'Pipeline', score: pipelineScore, max: 20, detail: won ? 'Has a won deal' : openDeals.length ? `${openDeals.length} open deal${openDeals.length === 1 ? '' : 's'}, best ${bestProb}%` : 'No deals yet' },
      { label: 'Reachability', score: reachScore, max: 10, detail: [contact.email && 'email', contact.phone && 'phone', hasUpcoming && 'meeting booked'].filter(Boolean).join(', ') || 'No contact details' },
    ],
  };
}

/* ── Lifecycle inference ── */

/** Suggest the lifecycle stage the contact's behaviour actually supports. */
export function inferLifecycle(contact: Contact, deals: Deal[]): LifecycleStage {
  const acts = contact.activities ?? [];
  if (deals.some(d => d.status === 'won')) {
    const advocacy = acts.some(a => a.type === 'form_submitted' && /review|referr/i.test(a.description));
    return advocacy ? 'Evangelist' : 'Customer';
  }
  if (contact.status === 'customer') return 'Customer';
  if (deals.some(d => (d.status ?? 'active') === 'active')) return 'Opportunity';
  const highIntent = acts.some(a => a.type === 'meeting' || a.type === 'call' || (a.type === 'form_submitted' && /quote|demo|consult|pricing/i.test(a.description)));
  if (highIntent) return 'SQL';
  const engaged = acts.filter(a => a.type === 'email_opened' || a.type === 'link_clicked').length >= 2;
  if (engaged) return 'MQL';
  if (acts.length > 0 || contact.status === 'prospect') return 'Lead';
  return 'Subscriber';
}

/* ── Next best action ── */

export interface NextAction {
  id: string;
  title: string;
  why: string;
  /** Which tab/tool the user should land in. */
  action: 'email' | 'schedule' | 'deal' | 'task' | 'call' | 'profile';
  urgency: 'high' | 'medium' | 'low';
}

/**
 * Rank the most useful next moves for this contact. Rules fire on real signals
 * and are ordered by urgency, so the top card is genuinely the next best thing.
 */
export function nextBestActions(
  contact: Contact,
  deals: Deal[],
  appointments: Appointment[],
  health: HealthScore,
): NextAction[] {
  const acts = contact.activities ?? [];
  const out: NextAction[] = [];
  const since = daysSince(contact.lastActivity);
  const tasks = contact.tasks ?? [];
  const overdue = tasks.filter(t => !t.done && t.dueDate && new Date(t.dueDate).getTime() < Date.now());
  const openDeals = deals.filter(d => (d.status ?? 'active') === 'active');
  const upcoming = appointments.filter(a => a.status === 'scheduled');
  const lastOpen = acts.find(a => a.type === 'email_opened');
  const lastClick = acts.find(a => a.type === 'link_clicked');
  const everEmailed = acts.some(a => a.type === 'email_sent');

  if (overdue.length) out.push({
    id: 'overdue-task', title: `Complete "${overdue[0].title}"`,
    why: `This task was due ${daysSince(overdue[0].dueDate)} day(s) ago.`, action: 'task', urgency: 'high',
  });

  if (lastClick && daysSince(lastClick.timestamp) <= 7) out.push({
    id: 'clicked', title: 'Strike while it is hot — call or send a proposal',
    why: `They clicked a link ${daysSince(lastClick.timestamp)} day(s) ago, which is the strongest intent signal you have.`,
    action: 'call', urgency: 'high',
  });

  if (lastOpen && !lastClick && daysSince(lastOpen.timestamp) >= 2 && daysSince(lastOpen.timestamp) <= 21) out.push({
    id: 'opened-no-click', title: 'Follow up on the email they opened',
    why: `They opened your email ${daysSince(lastOpen.timestamp)} day(s) ago but did not click. A short nudge usually converts.`,
    action: 'email', urgency: 'high',
  });

  if (!everEmailed && contact.email) out.push({
    id: 'first-email', title: 'Send a first introduction email',
    why: 'You have never emailed this contact — open the conversation.', action: 'email', urgency: 'medium',
  });

  if (openDeals.length && !upcoming.length) out.push({
    id: 'deal-no-meeting', title: 'Book a call to move the deal forward',
    why: `"${openDeals[0].title}" is open at ${openDeals[0].probability ?? 0}% with no meeting scheduled.`,
    action: 'schedule', urgency: 'high',
  });

  if (!deals.length && (health.total >= 45 || contact.status === 'prospect')) out.push({
    id: 'create-deal', title: 'Create a deal for this contact',
    why: 'They are engaged but have no deal, so the pipeline is not reflecting real revenue potential.',
    action: 'deal', urgency: 'medium',
  });

  if (since >= 30 && since < 9999) out.push({
    id: 're-engage', title: 'Start a re-engagement sequence',
    why: `Nothing has happened for ${since} days — health is ${health.band}.`, action: 'email', urgency: since >= 60 ? 'high' : 'medium',
  });

  if (!contact.phone) out.push({
    id: 'missing-phone', title: 'Get a phone number on file',
    why: 'No phone means no SMS and no calls — you are limited to one channel.', action: 'profile', urgency: 'low',
  });

  if (!out.length) out.push({
    id: 'healthy', title: 'Keep the rhythm — send something useful',
    why: 'Nothing urgent is outstanding. A helpful touch keeps the relationship warm.', action: 'email', urgency: 'low',
  });

  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.urgency] - rank[b.urgency]).slice(0, 4);
}

/* ── Cross-module lookups ── */

/** Every deal across all pipelines that belongs to this contact. */
export function dealsForContact(contact: Contact, pipelines: Pipeline[]): (Deal & { pipelineName: string; stageName: string })[] {
  const out: (Deal & { pipelineName: string; stageName: string })[] = [];
  for (const p of pipelines) {
    for (const st of p.stages) {
      for (const d of st.deals) {
        const matches = d.contactId === contact.id
          || (!!contact.email && d.contactEmail?.toLowerCase() === contact.email.toLowerCase())
          || (!!d.contactName && d.contactName === contact.name);
        if (matches) out.push({ ...d, pipelineName: p.name, stageName: st.name });
      }
    }
  }
  return out;
}

/** Appointments/bookings tied to this contact, newest first. */
export function appointmentsForContact(contact: Contact, appointments: Appointment[]): Appointment[] {
  return appointments
    .filter(a => a.contactId === contact.id || (!!contact.name && a.contactName === contact.name))
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
}

/* ── Unified timeline ── */

export interface TimelineEntry {
  id: string;
  kind: 'activity' | 'note' | 'task' | 'appointment' | 'deal';
  type: string;
  title: string;
  detail?: string;
  at: string;
}

/**
 * Merge every interaction into one chronological stream: activities, notes,
 * tasks, appointments and deal stage changes.
 */
export function buildTimeline(
  contact: Contact,
  deals: (Deal & { pipelineName: string; stageName: string })[],
  appointments: Appointment[],
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const a of contact.activities ?? []) {
    entries.push({ id: `a-${a.id}`, kind: 'activity', type: a.type, title: a.description, at: a.timestamp });
  }
  for (const n of contact.notes ?? []) {
    entries.push({ id: `n-${n.id}`, kind: 'note', type: 'note', title: 'Note', detail: n.content, at: n.createdAt });
  }
  for (const t of contact.tasks ?? []) {
    entries.push({
      id: `t-${t.id}`, kind: 'task', type: t.done ? 'task_done' : 'task_open',
      title: t.done ? `Task completed: ${t.title}` : `Task created: ${t.title}`,
      detail: t.dueDate ? `Due ${t.dueDate}` : undefined, at: t.createdAt,
    });
  }
  for (const ap of appointments) {
    entries.push({
      id: `ap-${ap.id}`, kind: 'appointment', type: 'meeting',
      title: `${ap.status === 'cancelled' ? 'Cancelled: ' : ''}${ap.title}`,
      detail: `${ap.date} at ${ap.time}`, at: `${ap.date}T${(ap.time || '09:00').padStart(5, '0')}:00`,
    });
  }
  for (const d of deals) {
    entries.push({
      id: `d-${d.id}`, kind: 'deal', type: 'deal',
      title: `Deal: ${d.title}`,
      detail: `${d.pipelineName} · ${d.stageName} · $${(d.value ?? 0).toLocaleString()}`,
      at: d.lastStageChangedAt || d.createdAt,
    });
  }

  return entries
    .filter(e => e.at)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

/** Render the timeline as plain text for export/print. */
export function timelineToText(contact: Contact, entries: TimelineEntry[]): string {
  const lines = [
    `Activity timeline — ${contact.name}`,
    `${contact.email || 'no email'}${contact.phone ? ` · ${contact.phone}` : ''}`,
    `Exported ${new Date().toLocaleString()}`,
    ''.padEnd(60, '-'),
  ];
  for (const e of entries) {
    lines.push(`${new Date(e.at).toLocaleString()}  [${e.type}]  ${e.title}${e.detail ? ` — ${e.detail}` : ''}`);
  }
  return lines.join('\n');
}
