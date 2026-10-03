/**
 * /api/sms-optin.php — where a found business says yes to texts.
 *
 *   GET  ?a&c&s   a page: who is asking, their mobile number, one box to tick
 *   POST same     records it (lib/smsConsent.ts `recordConsent`)
 *
 * No session: the link arrives in an email, so it is signed per contact
 * (`optInLink`) and a forged or edited link gets a page saying so, never a
 * consent. A GET only shows the form — a mail scanner following the link must
 * not be able to say yes for somebody — and the box has to be ticked and the
 * number typed by the person. Rate-limited per address because anybody can
 * reach it.
 */
import { type Env } from '../lib/db';
import { businessFor } from '../lib/mergeFields';
import { rateLimit } from '../lib/rateLimit';
import { CONSENT_WORDING, e164, optInValid, recordConsent } from '../lib/smsConsent';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function page(body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Texts</title><meta name="robots" content="noindex">
<style>
  :root { color-scheme: light }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; background:#f2f4f6;
         font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  .card { background:#fff; border-radius:16px; padding:28px; max-width:440px; width:calc(100% - 32px); box-shadow:0 6px 24px rgba(16,24,40,.08); }
  h1 { font-size:19px; margin:0 0 8px; color:#0f172a; } p { font-size:14px; line-height:1.6; color:#475569; margin:0 0 14px; }
  label { display:block; font-size:13px; font-weight:600; color:#0f172a; margin:0 0 6px; }
  input[type=tel] { width:100%; box-sizing:border-box; font:inherit; font-size:15px; padding:11px 12px; border:1px solid #d6dae1; border-radius:9px; margin-bottom:12px; }
  .tick { display:flex; gap:10px; align-items:flex-start; font-size:13px; line-height:1.55; color:#334155; font-weight:400; margin-bottom:16px; }
  button { font:inherit; font-size:14px; font-weight:600; padding:11px 20px; border:none; border-radius:9px; background:#17191c; color:#fff; cursor:pointer; }
  .err { color:#b42318; font-size:13px; margin:0 0 12px; }
</style></head><body><div class="card">${body}</div></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } },
  );
}

export async function handleSmsOptin(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  let form = new URLSearchParams();
  if (req.method === 'POST') form = new URLSearchParams(await req.text());
  const pick = (k: string) => (form.get(k) ?? url.searchParams.get(k) ?? '').trim();
  const a = pick('a'), c = pick('c'), s = pick('s');

  if (!(await optInValid(env, a, c, s))) {
    return page('<h1>This link is not valid</h1><p>It may have been copied incompletely. Nothing has been changed.</p>', 400);
  }
  const biz = await businessFor(env, a).catch(() => null);
  const who = esc(biz?.myCompany || 'this business');
  const form_ = (error = '', phone = '') => page(`
    <h1>Texts from ${who}</h1>
    <p>Would a text be easier than email? Leave your mobile number and ${who} will text you about this instead. You can reply STOP at any time.</p>
    ${error ? `<p class="err">${esc(error)}</p>` : ''}
    <form method="post">
      <input type="hidden" name="a" value="${esc(a)}"><input type="hidden" name="c" value="${esc(c)}"><input type="hidden" name="s" value="${esc(s)}">
      <label for="phone">Mobile number, with the country code</label>
      <input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+1 804 555 0101" value="${esc(phone)}" required>
      <label class="tick"><input type="checkbox" name="agree" value="1" required> <span>${esc(CONSENT_WORDING)}</span></label>
      <button type="submit">Yes, text me</button>
    </form>`);

  if (req.method !== 'POST') return form_();

  const ip = req.headers.get('CF-Connecting-IP') ?? '';
  const v = await rateLimit(env, { what: 'sms-optin', who: ip || a, max: 10, windowSeconds: 3600 });
  if (!v.allowed) return page('<h1>Too many tries</h1><p>Please try again in a little while.</p>', 429);
  const phone = e164(pick('phone'));
  if (pick('agree') !== '1') return form_('Tick the box to agree to texts.', pick('phone'));
  if (!phone) return form_('Write the number with its country code, starting with + (for example +1 804 555 0101).', pick('phone'));
  await recordConsent(env, a, c, phone, ip);
  return page(`<h1>Thank you</h1><p>${who} can now text you at ${esc(phone)}. Reply STOP to any message to stop them.</p>`);
}
