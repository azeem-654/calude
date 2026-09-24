/**
 * Merge fields: `{{firstName}}` and friends, filled in at the moment of sending.
 *
 * ── One implementation ──
 *
 * The automation engine and the sequence tick each had their own copy, and
 * they disagreed: one blanked a token it did not know, the other left
 * "{{something}}" in the email. Both now use this.
 *
 * ── Two kinds of field ──
 *
 * About the person — read from the contact record on every send, so an edit
 * to somebody's name or company is in the next email they get, not frozen at
 * the moment they were enrolled.
 *
 * About the business — `{{myCompany}}`, `{{website}}`, `{{bookingLink}}`,
 * `{{senderName}}`. These let an email written once (by a person, or by the
 * New Project wizard from the client's portfolio) say who it is from and where
 * to book without anybody pasting it into every step. They come from the
 * project's business profile, the workspace's booking page and the mailbox.
 *
 * ── A line that would say nothing ──
 *
 * "Book a time here: " with no link after it is worse than no line. A line
 * whose only business field is empty is dropped rather than sent half-filled.
 */
import type { Env } from './db';

export interface Person {
  name?: string; firstName?: string; lastName?: string;
  email?: string; phone?: string; company?: string; jobTitle?: string;
}

export interface Business {
  myCompany: string;
  website: string;
  bookingLink: string;
  senderName: string;
}

export const EMPTY_BUSINESS: Business = { myCompany: '', website: '', bookingLink: '', senderName: '' };

/** The fields a customer may use, for the editor's buttons and the AI's rules. */
export const MERGE_FIELDS = ['firstName', 'lastName', 'name', 'company', 'jobTitle', 'email', 'phone', 'myCompany', 'website', 'bookingLink', 'senderName'] as const;

export function personalise(text: string, c: Person, biz: Business = EMPTY_BUSINESS): string {
  const full = (c.name ?? '').trim();
  const first = (c.firstName ?? full.split(' ')[0] ?? '').trim();
  const last = (c.lastName ?? full.split(' ').slice(1).join(' ')).trim();
  const map: Record<string, string> = {
    firstName: first, lastName: last, name: full || first,
    email: c.email ?? '', phone: c.phone ?? '',
    company: c.company ?? '', jobTitle: c.jobTitle ?? '',
    myCompany: biz.myCompany, website: biz.website, bookingLink: biz.bookingLink, senderName: biz.senderName,
  };
  const BUSINESS = new Set(['myCompany', 'website', 'bookingLink', 'senderName']);
  return text
    .split('\n')
    .filter(line => {
      const tokens = [...line.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => m[1]);
      return !tokens.some(t => BUSINESS.has(t) && !map[t]);
    })
    .join('\n')
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => map[k] ?? '');
}

const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] as string));

/**
 * A plain-text body as email HTML.
 *
 * Bodies written in the step editor are plain text with blank lines between
 * paragraphs, and they were sent as HTML as they stood — so every line break
 * disappeared and a four-paragraph email arrived as one block. Anything that
 * already looks like HTML is left alone. Bare links become links.
 */
export function textToHtml(body: string): string {
  if (/<(p|br|div|table|a|strong|em|ul|ol|h\d)\b/i.test(body)) return body;
  return body
    .trim()
    .split(/\n{2,}/)
    .map(par => `<p style="margin:0 0 14px;line-height:1.55">${esc(par)
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
      .replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * The business fields for a workspace — and a project, when the email belongs
 * to one. Cached per call site by the caller: read once per tick, not per send.
 */
export async function businessFor(env: Env, accountId: string, projectId?: string | null, senderName = ''): Promise<Business> {
  let myCompany = ''; let website = '';
  try {
    const row = projectId
      ? await env.DB.prepare(
        `SELECT p.name AS name, p.profile AS profile FROM crm_projects j JOIN crm_portfolios p ON p.id = j.portfolio_id
          WHERE j.id = ? AND j.account_id = ?`,
      ).bind(projectId, accountId).first<{ name: string; profile: string }>()
      : await env.DB.prepare('SELECT name, profile FROM crm_portfolios WHERE account_id = ? ORDER BY updated_at DESC LIMIT 1')
        .bind(accountId).first<{ name: string; profile: string }>();
    if (row) {
      let prof: Record<string, string> = {};
      try { prof = JSON.parse(row.profile || '{}') as Record<string, string>; } catch { prof = {}; }
      myCompany = String(prof.companyName || row.name || '').trim();
      website = String(prof.website || '').trim();
    }
  } catch { /* no profile — the fields stay empty and their lines are dropped */ }

  let bookingLink = '';
  try {
    const b = await env.DB.prepare('SELECT slug FROM crm_booking_config WHERE account_id = ?').bind(accountId).first<{ slug: string }>();
    const origin = (env.APP_ORIGIN ?? '').replace(/\/$/, '');
    if (b?.slug && origin) bookingLink = `${origin}/book/${b.slug}`;
  } catch { /* no booking page */ }

  return { myCompany, website, bookingLink, senderName };
}
