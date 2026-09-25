/**
 * Open and click tracking.
 *
 * A single-page app has no server of its own, so an open can never be detected
 * from the browser: the recipient is in their mail client, not on the site.
 * Outbound messages embed a 1×1 pixel and wrap their links, both pointing
 * here, and the app polls `events` to fold the results back into each
 * contact's history.
 *
 *   GET ?o=<emailId>&a=<accountId>          → 1×1 GIF, records an open
 *   GET ?c=<emailId>&a=<accountId>&u=<url>  → 302 to url, records a click
 *   GET ?events=1&a=<accountId>&since=<iso> → JSON, for syncing
 *
 * Everything except `events` is fetched by a mail client or a recipient's
 * browser, so it cannot require a session. That is not a hole — the worst an
 * anonymous caller can do is record a fake open on an id they would have to
 * guess. Reading the events back is what needs the session, and does.
 */
import { trackedLinkValid } from '../lib/trackSign';
import { corsHeaders, fail, json, bearer } from '../lib/http';
import { canAccess, nowIso, userFromToken, type Env } from '../lib/db';
import { dataGet } from '../lib/db';
import { enrolOnEvent } from '../lib/automationEngine';

/* The smallest transparent GIF there is. Served with no-store so a mail
   client's proxy cache does not swallow the second open of the same message. */
const PIXEL = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
  0x44, 0x01, 0x00, 0x3b,
]);

const ID_OK = /^[A-Za-z0-9_.\-:]{1,120}$/;

function pixel(): Response {
  return new Response(PIXEL, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
    },
  });
}

async function record(
  env: Env, accountId: string, emailId: string, kind: 'open' | 'click', url: string, ua: string,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO crm_track (account_id, kind, email_id, url, at, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(accountId, kind, emailId, url.slice(0, 2000), nowIso(), ua.slice(0, 180)).run();

  /*
   * And tell the automation engine, which is the only thing that can act on it.
   *
   * "Email is opened" and "Link is clicked" are two of the triggers the builder
   * offers, and until this existed neither could ever fire — the open was
   * written to `crm_track` and read by nothing that could do anything about it.
   * A trigger in a menu that can never happen is the same bug as an automation
   * with no engine, one layer up.
   *
   * The contact behind the message is resolved from `crm_contact_emails`, the
   * browser's own record of what it sent. That is a read of a blob the Worker
   * must never write, which is exactly what it is doing.
   */
  await fire(env, accountId, emailId, kind).catch(() => {});
}

/** Who was sent the message this open or click belongs to. */
async function fire(env: Env, accountId: string, emailId: string, kind: 'open' | 'click'): Promise<void> {
  const raw = await dataGet(env.DB, accountId, 'crm_contact_emails');
  if (!raw) return;
  let rows: { id?: string; contactId?: string; toEmail?: string; subject?: string }[];
  try { rows = JSON.parse(raw) as typeof rows; } catch { return; }
  if (!Array.isArray(rows)) return;

  const msg = rows.find(r => r.id === emailId);
  if (!msg?.contactId) return;

  await enrolOnEvent(env, accountId, {
    kind: kind === 'open' ? 'email_opened' : 'link_clicked',
    /* The subject, so "when *that* email is opened" can be narrowed the same
       way a form trigger names a form. */
    ref: String(msg.subject ?? ''),
    contactId: msg.contactId,
    contactEmail: String(msg.toEmail ?? ''),
  });
}

/** A plain page naming the destination, for a link this server did not sign. */
function leaving(dest: URL): Response {
  const esc = (x: string) => x.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));
  const href = esc(dest.toString());
  const host = esc(dest.hostname);
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Leaving for ${host}</title></head>`
    + `<body style="font-family:system-ui,sans-serif;background:#f4f5f7;margin:0;display:grid;place-items:center;min-height:100vh;padding:20px">`
    + `<main style="background:#fff;border-radius:16px;padding:28px;max-width:440px;box-shadow:0 10px 30px -12px rgba(0,0,0,.2)">`
    + `<h1 style="font-size:18px;margin:0 0 8px">This link goes to ${host}</h1>`
    + `<p style="color:#475569;font-size:14px;line-height:1.55;margin:0 0 18px">Only continue if you expected to go there.</p>`
    + `<p style="word-break:break-all;font-size:12.5px;color:#64748b;margin:0 0 18px">${href}</p>`
    + `<a href="${href}" rel="noopener noreferrer nofollow" style="display:inline-block;background:#17191c;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px">Continue to ${host}</a>`
    + `</main></body></html>`;
  return new Response(page, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

export async function handleTrack(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const account = (url.searchParams.get('a') ?? '').slice(0, 64);
  const ua = req.headers.get('User-Agent') ?? '';

  /* ── Sync: the only branch that reads anything back, so the only one that
        needs to prove who is asking. ── */
  if (url.searchParams.get('events')) {
    const token = bearer(req);
    const user = await userFromToken(env.DB, token);
    if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });
    if (!(await canAccess(env.DB, user, account))) return fail('That workspace is not yours to read.', 403);

    const since = url.searchParams.get('since') || '1970-01-01T00:00:00.000Z';
    const { results } = await env.DB.prepare(
      `SELECT kind, email_id AS emailId, url, at
         FROM crm_track
        WHERE account_id = ? AND at > ?
        ORDER BY at
        LIMIT 5000`,
    ).bind(account, since).all();
    return json({ success: true, events: results ?? [] });
  }

  /* ── An open ── */
  const openId = url.searchParams.get('o');
  if (openId) {
    /* A malformed id is dropped rather than stored: this endpoint is public,
       and the pixel still has to be returned either way so the message does
       not render with a broken image. */
    if (ID_OK.test(openId) && account && await trackedLinkValid(env, account, `open:${openId}`, '', url.searchParams.get('s') ?? '')) {
      await record(env, account, openId, 'open', '', ua).catch(() => {});
    }
    return pixel();
  }

  /* ── A click ── */
  const clickId = url.searchParams.get('c');
  const target = url.searchParams.get('u') ?? '';
  if (clickId) {
    let dest: URL | null = null;
    try {
      const parsed = new URL(target);
      /* Only http(s) is followed. Redirecting to whatever arrives in a query
         string turns every tracked link in every campaign into an open
         redirect — a phisher borrows the customer's domain for free. */
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') dest = parsed;
    } catch { /* not a URL */ }

    if (!dest) {
      return new Response('That link is not one this tracker can follow.', {
        status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    /* Only a link this server signed on its way out is followed straight
       through and counted (lib/trackSign.ts). Anything else — an email from
       before signing, or a link somebody assembled to borrow this domain —
       gets a page saying where it goes, and a click is not recorded. */
    const signed = await trackedLinkValid(env, account, clickId, target, url.searchParams.get('s') ?? '');
    if (!signed) return leaving(dest);
    if (ID_OK.test(clickId) && account) {
      await record(env, account, clickId, 'click', dest.toString(), ua).catch(() => {});
    }
    return Response.redirect(dest.toString(), 302);
  }

  return new Response(JSON.stringify({ success: false, error: 'Nothing to track in that request.' }), {
    status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
