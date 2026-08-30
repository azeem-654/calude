/**
 * One-click opt-out.
 *
 * Four things share this URL, which is why it is not simply a JSON endpoint:
 *
 *   GET  ?e&a&c&t          a page with one button — the link in every footer
 *   POST same params       records it; also what Gmail and Yahoo POST directly
 *                          when the recipient uses their own "unsubscribe"
 *   GET  ?list=1&a&since   the app folding opt-outs into its suppression list
 *   GET  ?sign=1&e&a&c     the sender asking for a signed URL to embed
 *
 * The signature is the point. A mail provider fetches this with no session at
 * all, so the address has to be trustworthy on its own — otherwise anyone can
 * unsubscribe anyone by editing a query string.
 */
import { addr, fail, json } from '../lib/http';
import { canAccess, installSecret, nowIso, requireSessionForSocket, userFromToken, type Env } from '../lib/db';
import { signAddress } from '../lib/crypto';
import { timingSafeEqual } from '../lib/crypto';

const SECRET_KEY = 'unsub_key';

function html(bodyHtml: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Unsubscribe</title>
<style>
  :root { color-scheme: light }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#f2f4f6; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  .card { background:#fff; border-radius:16px; padding:32px; max-width:420px; width:calc(100% - 32px);
          box-shadow:0 6px 24px rgba(16,24,40,.08); }
  h1 { font-size:19px; margin:0 0 8px; color:#0f172a; }
  p { font-size:14px; line-height:1.6; color:#475569; margin:0 0 18px; }
  button { font:inherit; font-size:14px; font-weight:600; padding:11px 20px; border:none; border-radius:9px;
           background:#17191c; color:#fff; cursor:pointer; }
  .dot { width:40px; height:40px; border-radius:12px; background:#17191c; margin-bottom:16px; }
</style></head><body><div class="card">${bodyHtml}</div></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
}

const esc = (s: string) => s.replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export async function handleUnsubscribe(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const q = url.searchParams;

  /* Both a form POST (the button, and Gmail's one-click) and a query string
     have to work, so parameters are read from either. */
  let form = new URLSearchParams();
  if (req.method === 'POST') {
    const ct = req.headers.get('Content-Type') ?? '';
    if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
      form = new URLSearchParams(await req.text());
    }
  }
  const pick = (k: string) => (form.get(k) ?? q.get(k) ?? '').trim();

  const email = pick('e');
  const account = pick('a');
  const campaign = pick('c');
  const token = pick('t');

  const secret = await installSecret(env.DB, SECRET_KEY);

  /* ── The app reading opt-outs back into its suppression list ── */
  if (q.get('list')) {
    const user = await userFromToken(env.DB, q.get('token') ?? undefined);
    if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });
    if (!(await canAccess(env.DB, user, account))) return fail('That workspace is not yours to read.', 403);
    const since = q.get('since') || '1970-01-01T00:00:00.000Z';
    const { results } = await env.DB.prepare(
      'SELECT email, campaign_id AS campaignId, at FROM crm_unsubscribes WHERE account_id = ? AND at > ? ORDER BY at LIMIT 5000',
    ).bind(account, since).all();
    return json({ success: true, unsubscribes: results ?? [] });
  }

  /* ── The sender asking for a signed URL to put in a footer ── */
  if (q.get('sign')) {
    const gate = await requireSessionForSocket(env.DB, q.get('token') ?? undefined);
    if ('denied' in gate) return gate.denied;
    const clean = addr(email);
    if (!clean) return fail('A valid email address is required to sign.');
    return json({ success: true, t: await signAddress(secret, clean, account) });
  }

  /* ── Recording an opt-out ── */
  const clean = addr(email);
  const expected = clean ? await signAddress(secret, clean, account) : '';
  const signed = !!clean && !!token && timingSafeEqual(token, expected);

  if (req.method === 'POST') {
    if (!signed) {
      /* A provider that gets an error here may retry forever, so this answers
         200 with an explanation rather than a status they will queue on. */
      return json({ success: false, error: 'That unsubscribe link is not valid.' });
    }
    await env.DB.prepare(
      `INSERT INTO crm_unsubscribes (account_id, email, campaign_id, at) VALUES (?, ?, ?, ?)
       ON CONFLICT(account_id, email) DO UPDATE SET campaign_id = excluded.campaign_id, at = excluded.at`,
    ).bind(account, clean!.toLowerCase(), campaign || null, nowIso()).run();

    /* RFC 8058: the provider's own one-click POST wants a bare acknowledgement,
       not a page. A person who pressed the button wants to be told it worked. */
    const oneClick = form.has('List-Unsubscribe') || q.has('List-Unsubscribe');
    if (oneClick) return json({ success: true });

    return html(`<div class="dot"></div>
      <h1>You have been unsubscribed</h1>
      <p><strong>${esc(clean!)}</strong> will not receive any more marketing email from this sender.</p>`);
  }

  /* ── The page with the button ── */
  if (!signed) {
    return html(`<div class="dot"></div>
      <h1>This link is not valid</h1>
      <p>It may have been altered in transit, or copied incompletely from the email. Reply to the message
         and ask to be removed, and the sender can do it for you.</p>`, 400);
  }

  return html(`<div class="dot"></div>
    <h1>Unsubscribe</h1>
    <p>Press the button and <strong>${esc(clean!)}</strong> will stop receiving marketing email from this sender.</p>
    <form method="post">
      <input type="hidden" name="e" value="${esc(email)}">
      <input type="hidden" name="a" value="${esc(account)}">
      <input type="hidden" name="c" value="${esc(campaign)}">
      <input type="hidden" name="t" value="${esc(token)}">
      <button type="submit">Unsubscribe me</button>
    </form>`);
}
