/**
 * What has actually happened lately.
 *
 * The dashboard used to run a simulation here: invented messages and invented
 * orders, attached to the names of real customers, ticking over every few
 * seconds. It looked alive and said nothing true — "Ana Silva placed an order
 * — $1,500" on a workspace where Ana had never bought anything.
 *
 * This reads the records instead. Contacts as they arrive, deals as they open
 * and close, meetings as they are booked, and the last thing each contact said.
 * If nothing has happened, it returns nothing, and the panel says so.
 */
import type { Appointment, Contact, Conversation, Pipeline } from '../../types';

export type ActivityKind = 'contact' | 'deal' | 'won' | 'lost' | 'meeting' | 'message';

export interface Activity {
  id: string;
  kind: ActivityKind;
  /** Who it concerns. */
  who: string;
  /** What happened, as a phrase that follows the name. */
  what: string;
  /** Milliseconds. */
  at: number;
  /** Where the record lives. */
  path: string;
}

export interface ActivityInput {
  contacts: Contact[];
  pipelines: Pipeline[];
  appointments: Appointment[];
  conversations: Conversation[];
}

function stamp(value?: string): number {
  if (!value) return NaN;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? NaN : t;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

export function recentActivity(input: ActivityInput, limit = 6, now = Date.now()): Activity[] {
  const out: Activity[] = [];
  const push = (a: Activity) => {
    /* Anything stamped in the future is a clock or an import artefact — it
       would sit permanently at the top of a feed that is meant to be recent. */
    if (Number.isNaN(a.at) || a.at > now + 60_000) return;
    out.push(a);
  };

  for (const c of input.contacts) {
    push({ id: `c:${c.id}`, kind: 'contact', who: c.name, what: 'was added to your contacts', at: stamp(c.createdAt), path: '/contacts' });
  }

  for (const p of input.pipelines) {
    for (const s of p.stages) {
      for (const d of s.deals) {
        if (d.status === 'won') {
          push({ id: `w:${d.id}`, kind: 'won', who: d.contactName || d.title, what: `— ${d.title} won, ${money(d.value)}`, at: stamp(d.closedAt || d.createdAt), path: '/pipelines' });
        } else if (d.status === 'lost') {
          push({ id: `l:${d.id}`, kind: 'lost', who: d.contactName || d.title, what: `— ${d.title} was lost`, at: stamp(d.closedAt || d.createdAt), path: '/pipelines' });
        } else {
          push({ id: `d:${d.id}`, kind: 'deal', who: d.contactName || d.title, what: `— ${d.title} opened at ${money(d.value)}`, at: stamp(d.createdAt), path: '/pipelines' });
        }
      }
    }
  }

  for (const a of input.appointments) {
    if (a.status === 'cancelled') continue;
    /* createdAt is optional on older records; without it there is no honest
       moment to file the booking under, so it is left out rather than guessed. */
    const at = stamp(a.createdAt);
    if (Number.isNaN(at)) continue;
    push({ id: `a:${a.id}`, kind: 'meeting', who: a.contactName || a.title, what: `booked ${a.title} for ${a.date}`, at, path: '/calendar' });
  }

  for (const c of input.conversations) {
    const last = c.messages[c.messages.length - 1];
    if (!last || last.sender !== 'contact') continue;
    const text = last.content.trim().replace(/\s+/g, ' ');
    push({
      id: `m:${c.id}`,
      kind: 'message',
      who: c.contactName,
      what: `said “${text.length > 46 ? `${text.slice(0, 45)}…` : text}”`,
      at: stamp(last.timestamp || c.lastMessageTime),
      path: '/conversations',
    });
  }

  return out.sort((a, b) => b.at - a.at).slice(0, limit);
}

export function relTime(at: number, now: number): string {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 45) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m || 1}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d ago` : `${Math.floor(d / 7)}w ago`;
}
