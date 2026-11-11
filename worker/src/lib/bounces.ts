/**
 * Addresses that cannot or will not take mail — added to suppression (E-7).
 *
 * Nothing learned of a bounce. A hard-bounced address stayed on every list and
 * every sequence went on mailing it, which is how a sending domain's
 * reputation is spent: providers judge a sender by its bounce and complaint
 * rates, and on hosted mail that sender is the platform's own key, shared by
 * every hosted customer. Two ways in, both ending in `crm_unsubscribes` —
 * the table `suppressedSet` already reads, so every marketing sender already
 * honours what lands there:
 *
 *   provider events   Resend and Brevo post bounces and complaints for mail
 *                     sent on the platform's key to /api/mail-webhook.php.
 *   bounce messages   a delivery-status notification arriving in a mailbox
 *                     (any provider, own SMTP included) is read by the reply
 *                     cron (`parseDsn`), not answered.
 *
 * Only a permanent failure suppresses. A full mailbox or a greylist is a
 * temporary one, and suppressing it would silently drop a real customer.
 * `campaign_id` records why: 'bounced' or 'complained'.
 */
import { installSecret, nowIso, type Env } from './db';
import { hostedConfig } from './hostedMail';

export type Why = 'bounced' | 'complained';
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const clean = (e: unknown) => String(e ?? '').trim().toLowerCase().replace(/^.*<([^>]+)>.*$/, '$1');

/** Add addresses to a workspace's suppression, and mark their last delivery as bounced. */
export async function suppress(env: Env, accountId: string, emails: string[], why: Why, detail = ''): Promise<number> {
  let n = 0;
  for (const raw of [...new Set(emails.map(clean))].slice(0, 50)) {
    if (!EMAIL.test(raw)) continue;
    const r = await env.DB.prepare('INSERT OR IGNORE INTO crm_unsubscribes (account_id, email, campaign_id, at) VALUES (?, ?, ?, ?)')
      .bind(accountId, raw, why, nowIso()).run().catch(() => null);
    n += r?.meta?.changes ?? 0;
    await env.DB.prepare(
      `UPDATE crm_delivery_log SET status = ?, detail = ? WHERE id = (
         SELECT id FROM crm_delivery_log WHERE account_id = ? AND recipient = ? AND channel = 'email' ORDER BY created_at DESC LIMIT 1)`,
    ).bind(why, (detail || (why === 'bounced' ? 'The receiving server refused this address permanently.' : 'The recipient marked this as spam.')).slice(0, 300), accountId, raw)
      .run().catch(() => null);
  }
  return n;
}

/* ── Bounce messages in a mailbox ─────────────────────────────────────────── */

const DAEMON = /mailer-daemon|postmaster|mail delivery (subsystem|system)|microsoftexchange/i;
const DSN_SUBJECT = /undeliver|delivery status notification|returned mail|mail delivery failed|failure notice|delivery failure|could not be delivered|non remis|unzustellbar/i;

/**
 * Is this a bounce, and which addresses failed for good? Read from the
 * notification's text: the machine-readable part (`Final-Recipient` with a
 * 5.x.x `Status`), and the wording the common servers use when that part is
 * not in what the mailbox handed over.
 */
export function parseDsn(msg: { from: string; fromName?: string; subject: string; body: string }): { isDsn: boolean; hard: string[] } {
  const isDsn = DAEMON.test(`${msg.from} ${msg.fromName ?? ''}`) && DSN_SUBJECT.test(msg.subject)
    || /report-type=delivery-status/i.test(msg.body);
  if (!isDsn) return { isDsn: false, hard: [] };
  const body = msg.body.replace(/<[^>]+>/g, ' ');
  const hard = new Set<string>();
  /* Per-recipient blocks: Final-Recipient … Status: 5.x.x */
  const blocks = body.split(/(?=Final-Recipient:)/i);
  for (const b of blocks) {
    const who = /Final-Recipient:\s*rfc822;\s*<?([^\s<>;]+@[^\s<>;]+)>?/i.exec(b)?.[1];
    const status = /Status:\s*([245])\.\d{1,3}\.\d{1,3}/i.exec(b)?.[1];
    const action = /Action:\s*(\w+)/i.exec(b)?.[1]?.toLowerCase();
    if (who && (status === '5' || (!status && action === 'failed'))) hard.add(clean(who));
  }
  if (!hard.size) {
    /* "550 5.1.1 <x@y>: Recipient address rejected" and friends. */
    for (const m of body.matchAll(/<?([^\s<>;:"']+@[^\s<>;:"']+\.[a-z]{2,})>?[^\n]{0,160}?\b5[0-5]\d\b[ -]?(?:5\.\d{1,3}\.\d{1,3})?/gi)) hard.add(clean(m[1]));
    for (const m of body.matchAll(/\b5[0-5]\d\b[ -](?:5\.\d{1,3}\.\d{1,3})?[^\n]{0,160}?<?([^\s<>;:"']+@[^\s<>;:"']+\.[a-z]{2,})>?/gi)) hard.add(clean(m[1]));
  }
  /* Gmail, Outlook and Exim name the address in a sentence and the 5xx on
     another line: the sentence counts only beside a permanent code. */
  if (!hard.size && /\b5[0-5]\d\b|\b5\.\d{1,3}\.\d{1,3}\b/.test(body)) {
    for (const m of body.matchAll(/(?:wasn['’]t delivered to|could not be delivered to|delivery to the following recipients? failed(?: permanently)?:?|following address(?:\(es\))? failed:?|undeliverable to)\s*<?([^\s<>;:"']+@[^\s<>;:"']+\.[a-z]{2,})>?/gi)) hard.add(clean(m[1]));
  }
  /* Never the bouncer itself. */
  for (const e of [...hard]) if (DAEMON.test(e) || e === clean(msg.from)) hard.delete(e);
  return { isDsn: true, hard: [...hard].filter(e => EMAIL.test(e)) };
}

/* ── Provider events (hosted mail, on the platform's key) ─────────────────── */

/** The address the owner pastes into Resend or Brevo. The token is an install secret, so the URL is the credential. */
export async function mailWebhookUrl(env: Env, origin: string, provider: 'resend' | 'brevo'): Promise<string> {
  const t = (await installSecret(env.DB, 'mail_webhook')).slice(0, 40);
  return `${origin.replace(/\/$/, '')}/api/mail-webhook.php?p=${provider}&t=${t}`;
}

const eq = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

/** Resend signs with Svix: base64 HMAC-SHA256 of "id.timestamp.body" with the whsec_ secret. */
export async function svixOk(secret: string, headers: Headers, body: string): Promise<boolean> {
  const id = headers.get('svix-id') ?? '', ts = headers.get('svix-timestamp') ?? '', sigs = headers.get('svix-signature') ?? '';
  if (!id || !ts || !sigs) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const raw = Uint8Array.from(atob(secret.replace(/^whsec_/, '')), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
  const want = btoa(String.fromCharCode(...mac));
  return sigs.split(' ').some(s => eq(s.replace(/^v1,/, ''), want));
}

interface Normal { why: Why; to: string[]; from: string; detail: string }

function normalise(provider: string, ev: Record<string, unknown>): Normal | null {
  if (provider === 'resend') {
    const type = String(ev.type ?? '');
    const d = (ev.data ?? {}) as { from?: string; to?: string[] | string; bounce?: { type?: string; message?: string } };
    const to = Array.isArray(d.to) ? d.to : d.to ? [d.to] : [];
    if (type === 'email.complained') return { why: 'complained', to, from: clean(d.from), detail: 'The recipient marked this as spam.' };
    /* Transient is a full mailbox or a greylist — not a reason to stop. */
    if (type === 'email.bounced' && !/transient|temporary/i.test(String(d.bounce?.type ?? ''))) {
      return { why: 'bounced', to, from: clean(d.from), detail: String(d.bounce?.message ?? 'The receiving server refused this address permanently.') };
    }
    return null;
  }
  const event = String(ev.event ?? '');
  const to = [String(ev.email ?? '')];
  const from = clean(ev.sender_email ?? ev.from ?? '');
  if (event === 'hard_bounce' || event === 'invalid_email') return { why: 'bounced', to, from, detail: String(ev.reason ?? 'The receiving server refused this address permanently.') };
  if (event === 'spam' || event === 'complaint') return { why: 'complained', to, from, detail: 'The recipient marked this as spam.' };
  return null;
}

/** Which workspaces sent it: the hosted domain of the From, or (Brevo names no sender) who last mailed that address from a hosted domain. */
async function ownersOf(env: Env, n: Normal): Promise<string[]> {
  const domain = n.from.split('@')[1] ?? '';
  if (domain) {
    const r = await env.DB.prepare('SELECT account_id AS a FROM crm_hosted_domains WHERE domain = ?').bind(domain).first<{ a: string }>().catch(() => null);
    return r?.a ? [r.a] : [];
  }
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT l.account_id AS a FROM crm_delivery_log l JOIN crm_hosted_domains h ON h.account_id = l.account_id
      WHERE l.recipient = ? AND l.channel = 'email' AND lower(l.sent_from) LIKE '%@' || h.domain
      ORDER BY l.created_at DESC LIMIT 5`,
  ).bind(clean(n.to[0])).all<{ a: string }>().catch(() => ({ results: [] as { a: string }[] }));
  return (results ?? []).map(r => r.a);
}

/** POST /api/mail-webhook.php?p=resend|brevo&t=<token> */
export async function handleMailWebhook(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  const url = new URL(req.url);
  const provider = url.searchParams.get('p') === 'brevo' ? 'brevo' : 'resend';
  const token = (await installSecret(env.DB, 'mail_webhook')).slice(0, 40);
  if (!eq(url.searchParams.get('t') ?? '', token)) return new Response('not allowed', { status: 403 });
  const body = await req.text();
  if (body.length > 1_000_000) return new Response('too large', { status: 413 });
  /* Resend also signs every delivery; once its signing secret is saved, an
     unsigned one is refused even with the right URL. */
  if (provider === 'resend') {
    const secret = (await hostedConfig(env).catch(() => null))?.eventsSecret ?? '';
    if (secret && !(await svixOk(secret, req.headers, body))) return new Response('bad signature', { status: 400 });
  }
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return new Response('bad json', { status: 400 }); }
  const events = (Array.isArray(parsed) ? parsed : [parsed]).slice(0, 100) as Record<string, unknown>[];
  let added = 0;
  for (const ev of events) {
    const n = ev && typeof ev === 'object' ? normalise(provider, ev) : null;
    if (!n || !n.to.length) continue;
    for (const a of await ownersOf(env, n)) added += await suppress(env, a, n.to, n.why, n.detail);
  }
  /* 200 for anything accepted, acted on or not — a non-2xx makes the
     provider retry an event that was never going to matter. */
  return new Response(`ok (${added})`, { status: 200 });
}
