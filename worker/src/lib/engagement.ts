/**
 * The pieces every engagement channel shares.
 *
 * A form, a chat widget and (later) a voice call all have to do the same four
 * things: work out whose tenant this is, find or make the person, write down
 * what happened, and tell the rest of the app. Doing that once here is what
 * stops three channels drifting into three different ideas of what a lead is.
 */
import { nowIso, type Env } from './db';

export const rid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** A key that is safe to hand a browser: random, and meaningful only as a lookup. */
export const publicKey = (): string => {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
};

export const cleanEmail = (v: unknown): string => {
  const s = String(v ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s.slice(0, 190) : '';
};

export const cleanSlug = (v: unknown): string =>
  String(v ?? '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/* Long enough that guessing is not a strategy, short enough to sit in a URL. */
export const guestKey = publicKey;

export interface Person {
  id: string;
  account_id: string;
  email: string;
  phone: string;
  name: string;
}

/**
 * Find the person this capture belongs to, or make them.
 *
 * ── Why the email is the identity and the phone is not ──
 *
 * The CRM already deduplicates on email, and two systems disagreeing about who
 * is the same human is worse than either rule on its own. A phone number is
 * kept and updated but never used to merge: households and businesses share
 * them, and merging two people into one support history is not undoable.
 *
 * ── Why empty is never merged ──
 *
 * An anonymous chat has no email. Treating "" as a value would make every
 * anonymous visitor the same person, so their conversations would pool into one
 * thread and each would read the last one's messages. The unique index is
 * partial for the same reason.
 */
export async function upsertPerson(env: Env, accountId: string, input: {
  email?: string; phone?: string; name?: string; company?: string;
  source?: string; sourceRef?: string; context?: unknown;
}): Promise<Person> {
  const email = cleanEmail(input.email);
  const phone = String(input.phone ?? '').trim().slice(0, 40);
  const name = String(input.name ?? '').trim().slice(0, 120);
  const company = String(input.company ?? '').trim().slice(0, 160);
  const now = nowIso();

  if (email) {
    const found = await env.DB.prepare(
      'SELECT id, account_id, email, phone, name FROM crm_engage_people WHERE account_id = ? AND email = ?',
    ).bind(accountId, email).first<Person>();
    if (found) {
      /* Fill blanks, never overwrite. Somebody who gave their full name once and
         typed "J" the second time should not lose the first — and a form that
         omits a field entirely must not blank what another channel captured. */
      await env.DB.prepare(
        `UPDATE crm_engage_people
         SET name = CASE WHEN name = '' THEN ? ELSE name END,
             phone = CASE WHEN phone = '' THEN ? ELSE phone END,
             company = CASE WHEN company = '' THEN ? ELSE company END,
             updated_at = ?
         WHERE id = ?`,
      ).bind(name, phone, company, now, found.id).run();
      return { ...found, name: found.name || name, phone: found.phone || phone };
    }
  }

  const id = rid('per');
  await env.DB.prepare(
    `INSERT INTO crm_engage_people
     (id, account_id, email, phone, name, company, source, source_ref, context, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    id, accountId, email, phone, name, company,
    String(input.source ?? '').slice(0, 30), String(input.sourceRef ?? '').slice(0, 80),
    JSON.stringify(input.context ?? {}).slice(0, 4000), now, now,
  ).run();

  return { id, account_id: accountId, email, phone, name };
}

/**
 * Write down that something happened.
 *
 * Append-only and never updated. The timeline, the dashboard counts and the
 * automation engine all read this one table, so there is a single account of
 * what occurred rather than three that can disagree — and `dispatched_at` being
 * separate from the row existing means a workflow that fails cannot lose the
 * event it failed on.
 */
export async function recordEvent(env: Env, accountId: string, e: {
  kind: string; personId?: string; refId?: string; summary?: string; detail?: unknown;
}): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO crm_engage_events
       (id, account_id, person_id, kind, ref_id, summary, detail, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).bind(
      rid('ev'), accountId, e.personId ?? '', e.kind, e.refId ?? '',
      String(e.summary ?? '').slice(0, 400),
      JSON.stringify(e.detail ?? {}).slice(0, 4000), nowIso(),
    ).run();
  } catch {
    /* A timeline entry must never be the thing that fails a booking or loses a
       lead. The capture itself has already been written by the time this runs. */
  }
}

/**
 * The next ticket reference for a workspace.
 *
 * A counter row rather than `MAX(number) + 1`, because two tickets created in
 * the same second by a widget and a form would otherwise take the same number
 * and one would lose the unique index — turning a race into a lost support
 * request. The upsert is a single statement, so it is the database that
 * serialises them.
 */
export async function nextTicketRef(env: Env, accountId: string): Promise<string> {
  const row = await env.DB.prepare(
    `INSERT INTO crm_ticket_counters (account_id, next_number) VALUES (?, 2)
     ON CONFLICT(account_id) DO UPDATE SET next_number = crm_ticket_counters.next_number + 1
     RETURNING next_number`,
  ).bind(accountId).first<{ next_number: number }>();
  /* RETURNING gives the value *after* the update, so an existing row hands back
     the number after the one we are taking. A fresh row inserts 2 and returns
     it, which is the same shift — both mean "take n − 1". */
  const n = Math.max(1, (row?.next_number ?? 2) - 1);
  return `T-${String(n).padStart(4, '0')}`;
}

/* ── Knowledge retrieval ──────────────────────────────────────────────────────
 *
 * Lexical, not vector. This install has no embedding store, and standing one up
 * behind a customer-facing AI — where a wrong retrieval becomes a confident
 * wrong answer in the customer's own brand voice — is not something to do
 * quietly as part of a larger change.
 *
 * So: term overlap, weighted towards the title, and the articles it matched are
 * returned with the answer and shown. A bad retrieval is then visible on screen
 * rather than laundered into prose.
 */
export interface KbHit { id: string; title: string; body: string; score: number }

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
  'to', 'of', 'in', 'on', 'for', 'with', 'at', 'by', 'from', 'as', 'it', 'its',
  'this', 'that', 'these', 'those', 'i', 'you', 'we', 'they', 'my', 'our', 'your',
  'do', 'does', 'did', 'can', 'could', 'would', 'should', 'will', 'how', 'what',
  'when', 'where', 'why', 'who', 'me', 'have', 'has', 'had', 'not', 'no', 'yes',
]);

const terms = (s: string): string[] =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w));

export async function searchKnowledge(
  env: Env, accountId: string, query: string, limit = 4,
): Promise<KbHit[]> {
  const want = terms(query);
  if (!want.length) return [];

  const { results } = await env.DB.prepare(
    `SELECT id, title, body FROM crm_kb_articles
     WHERE account_id = ? AND status = 'published' LIMIT 400`,
  ).bind(accountId).all<{ id: string; title: string; body: string }>();

  const hits: KbHit[] = [];
  for (const a of results ?? []) {
    const title = terms(a.title);
    const body = terms(a.body);
    let score = 0;
    for (const w of new Set(want)) {
      /* A term in the title counts for three in the body: an article called
         "Refund policy" is the answer to "what is your refund policy", and one
         that mentions refunds once in passing is not. */
      if (title.includes(w)) score += 3;
      if (body.includes(w)) score += 1;
    }
    if (score > 0) hits.push({ id: a.id, title: a.title, body: a.body, score });
  }

  hits.sort((x, y) => y.score - x.score);
  /* Anything scraping a single weak term is noise, and noise handed to a model
     as "here is your knowledge" is what produces a confident irrelevance. */
  return hits.filter(h => h.score >= 2).slice(0, limit);
}
