/**
 * Sending over HTTPS, for customers who use a provider rather than their own
 * SMTP server.
 *
 * On Freehostia this existed because shared hosting blocks outbound mail ports
 * and port 443 is the one route that always survives. Here SMTP works, so this
 * is no longer a fallback — it is simply the other thing customers use, and
 * for several of these the API is the only way in.
 *
 * It stays server-side for the reason it always should have been: none of
 * these APIs send an Access-Control-Allow-Origin header, so a browser refuses
 * the request before it is made, and a sending key in the page is a licence to
 * send as that customer sitting where any script can read it.
 */
import { addr, body, fail, headerSafe, json } from '../lib/http';
import { requireSessionForSocket, type Env } from '../lib/db';

interface ProviderBody {
  token?: string;
  provider?: string;
  apiKey?: string; apiSecret?: string; apiUrl?: string; domain?: string;
  fromName?: string; fromEmail?: string;
  to?: string; subject?: string; html?: string;
  replyTo?: string; unsubscribeUrl?: string;
}

interface Posted { ok: boolean; status: number; text: string; error: string }

async function post(url: string, headers: Record<string, string>, payload: BodyInit, basic?: string): Promise<Posted> {
  const h: Record<string, string> = { ...headers };
  if (basic) h.Authorization = 'Basic ' + btoa(basic);
  try {
    const r = await fetch(url, { method: 'POST', headers: h, body: payload });
    const text = await r.text();
    return { ok: r.ok, status: r.status, text, error: '' };
  } catch (e) {
    return { ok: false, status: 0, text: '', error: `Could not reach the provider over HTTPS: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Whatever the provider called its message id. */
function messageId(text: string): string {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    for (const k of ['id', 'MessageID', 'messageId', 'message_id', 'MessageId']) {
      const v = j[k];
      if (v && (typeof v === 'string' || typeof v === 'number')) return String(v);
    }
    const mj = j as { Messages?: { To?: { MessageID?: string }[] }[]; data?: { email_id?: string } };
    if (mj.Messages?.[0]?.To?.[0]?.MessageID) return String(mj.Messages[0].To[0].MessageID);
    if (mj.data?.email_id) return String(mj.data.email_id);
  } catch { /* not JSON */ }
  return 'sent';
}

/**
 * Say what the provider said, in a sentence that suggests what to do next.
 * A bare "HTTP 401" sends people to check their SMTP password.
 */
function explain(provider: string, status: number, text: string): string {
  let detail = '';
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    for (const k of ['message', 'Message', 'error', 'ErrorMessage', 'detail']) {
      if (typeof j[k] === 'string') { detail = j[k] as string; break; }
    }
    const nested = j as { errors?: { message?: string }[]; data?: { error?: string } };
    if (!detail && nested.errors?.[0]?.message) detail = nested.errors[0].message!;
    if (!detail && nested.data?.error) detail = nested.data.error;
  } catch { /* not JSON */ }
  if (!detail) detail = text.replace(/<[^>]*>/g, '').trim().slice(0, 240);

  const hint = status === 401 || status === 403
    ? ' The key was rejected — check you copied the whole thing, and that it is a sending key rather than a read-only one.'
    : status === 400 || status === 422
      ? ' Usually the sending address: most providers will only send from a domain you have verified with them.'
      : status === 429
        ? ' You have hit the rate limit on your plan — wait a moment and try again.'
        : '';
  const name = provider.charAt(0).toUpperCase() + provider.slice(1);
  return `${name} refused the message (HTTP ${status}). ${detail}${hint}`;
}

export async function handleProviderSend(req: Request, env: Env): Promise<Response> {
  const d = await body<ProviderBody>(req);
  const gate = await requireSessionForSocket(env.DB, d.token);
  if ('denied' in gate) return gate.denied;

  const provider = String(d.provider ?? '').toLowerCase().trim();
  const apiKey = String(d.apiKey ?? '').trim();
  const apiSecret = String(d.apiSecret ?? '').trim();
  const domain = String(d.domain ?? '').trim();

  if (!provider) return fail('No provider was named.');
  if (!apiKey) return fail('An API key is required. Paste the one from your provider dashboard into Settings → Email & SMS.');
  if (!String(d.to ?? '').trim()) return fail('Recipient address is required');

  const to = addr(d.to);
  if (!to) return fail(`"${d.to}" is not a valid email address`);
  const fromEmail = addr(d.fromEmail);
  if (!String(d.fromEmail ?? '').trim()) return fail('A sending address is required. Set one in Settings → Email & SMS.');
  if (!fromEmail) return fail(`"${d.fromEmail}" is not a valid sending address.`);
  const replyRaw = String(d.replyTo ?? '').trim();
  if (replyRaw && !addr(replyRaw)) return fail(`"${replyRaw}" is not a valid reply-to address`);

  const fromName = headerSafe(d.fromName ?? 'CRM', 120);
  const subject = headerSafe(d.subject ?? '', 300) || '(no subject)';
  const html = String(d.html ?? '');
  const reply = replyRaw || fromEmail;
  const fromHeader = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

  let unsub = String(d.unsubscribeUrl ?? '').trim();
  if (unsub) { try { const u = new URL(unsub); if (!/^https?:$/.test(u.protocol)) unsub = ''; } catch { unsub = ''; } }
  const unsubHeaders: Record<string, string> = unsub
    ? { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
    : {};

  const JSON_H = { 'Content-Type': 'application/json' };
  let r: Posted;

  switch (provider) {
    /* Brevo — 300/day free, no card. */
    case 'brevo':
    case 'sendinblue':
      r = await post('https://api.brevo.com/v3/smtp/email',
        { ...JSON_H, 'api-key': apiKey, Accept: 'application/json' },
        JSON.stringify({
          sender: { name: fromName || 'CRM', email: fromEmail },
          to: [{ email: to }], subject, htmlContent: html, replyTo: { email: reply },
          ...(unsub ? { headers: unsubHeaders } : {}),
        }));
      break;

    /* Resend — 3,000/month free; its onboarding@resend.dev sender works before
       a domain is verified, which makes it the fastest to a first real send. */
    case 'resend':
      r = await post('https://api.resend.com/emails',
        { ...JSON_H, Authorization: `Bearer ${apiKey}` },
        JSON.stringify({ from: fromHeader, to: [to], subject, html, reply_to: reply, ...(unsub ? { headers: unsubHeaders } : {}) }));
      break;

    /* Mailjet authenticates with a key and a secret; a missing secret otherwise
       comes back as a rejected key and sends people to regenerate a good one. */
    case 'mailjet': {
      if (!apiSecret) return fail('Mailjet needs both an API key and an API secret — the secret is on the same page of your Mailjet account.');
      const msg: Record<string, unknown> = {
        From: { Email: fromEmail, Name: fromName || 'CRM' },
        To: [{ Email: to }], Subject: subject, HTMLPart: html, ReplyTo: { Email: reply },
      };
      if (unsub) msg.Headers = unsubHeaders;
      r = await post('https://api.mailjet.com/v3.1/send', JSON_H, JSON.stringify({ Messages: [msg] }), `${apiKey}:${apiSecret}`);
      break;
    }

    case 'smtp2go': {
      const custom = [{ header: 'Reply-To', value: reply },
        ...Object.entries(unsubHeaders).map(([header, value]) => ({ header, value }))];
      r = await post('https://api.smtp2go.com/v3/email/send', JSON_H,
        JSON.stringify({ api_key: apiKey, sender: fromHeader, to: [to], subject, html_body: html, custom_headers: custom }));
      break;
    }

    case 'sendgrid':
      r = await post('https://api.sendgrid.com/v3/mail/send',
        { ...JSON_H, Authorization: `Bearer ${apiKey}` },
        JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: fromEmail, name: fromName || 'CRM' },
          reply_to: { email: reply }, subject,
          content: [{ type: 'text/html', value: html }],
          ...(unsub ? { headers: unsubHeaders } : {}),
        }));
      break;

    case 'postmark': {
      const payload: Record<string, unknown> = {
        From: fromHeader, To: to, Subject: subject, HtmlBody: html, ReplyTo: reply, MessageStream: 'outbound',
      };
      if (unsub) payload.Headers = Object.entries(unsubHeaders).map(([Name, Value]) => ({ Name, Value }));
      r = await post('https://api.postmarkapp.com/email',
        { ...JSON_H, 'X-Postmark-Server-Token': apiKey, Accept: 'application/json' }, JSON.stringify(payload));
      break;
    }

    /* Mailgun needs the sending domain as well as the key, and the EU region
       lives on a different host, so both are asked for rather than assumed. */
    case 'mailgun': {
      if (!domain) return fail('Mailgun needs the sending domain from your Mailgun dashboard as well as the API key.');
      if (!/^[a-z0-9.\-]+$/i.test(domain)) return fail(`"${domain}" is not a valid Mailgun domain.`);
      const base = domain.includes('.eu.') ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';
      const form = new URLSearchParams({ from: fromHeader, to, subject, html, 'h:Reply-To': reply });
      for (const [k, v] of Object.entries(unsubHeaders)) form.set(`h:${k}`, v);
      r = await post(`${base}/v3/${domain}/messages`, {}, form, `api:${apiKey}`);
      break;
    }

    /* Mailtrap is a capture inbox for testing: mail lands in its UI and
       reaches nobody, which is exactly what it is for. */
    case 'mailtrap':
      r = await post('https://send.api.mailtrap.io/api/send',
        { ...JSON_H, Authorization: `Bearer ${apiKey}` },
        JSON.stringify({ from: { email: fromEmail, name: fromName || 'CRM' }, to: [{ email: to }], subject, html, ...(unsub ? { headers: unsubHeaders } : {}) }));
      break;

    /* ActiveCampaign posts to the customer's own account subdomain, so the URL
       arrives from the browser — the one provider here where a hostile value
       would turn this endpoint into a request-forger against Cloudflare's
       network. Matched against their two real domain shapes and nothing else. */
    case 'activecampaign': {
      const acUrl = String(d.apiUrl ?? '').trim().replace(/\/$/, '');
      if (!acUrl) return fail('ActiveCampaign needs your account URL, e.g. https://youraccount.api-us1.com');
      if (!/^https:\/\/[a-z0-9][a-z0-9-]{0,62}\.(api-us\d+\.com|activehosted\.com)$/i.test(acUrl)) {
        return fail(`"${acUrl}" is not an ActiveCampaign account URL. It looks like https://youraccount.api-us1.com — copy it from Settings → Developer in ActiveCampaign.`);
      }
      r = await post(`${acUrl}/api/3/sendEmail`, { ...JSON_H, 'Api-Token': apiKey },
        JSON.stringify({ email: { subject, html, from: fromEmail, fromname: fromName || 'CRM', reply_to: reply, to, sender: { name: fromName || 'CRM', email: fromEmail } } }));
      break;
    }

    default:
      return fail(`"${provider}" is not a sending provider this app knows. Choose one of: Brevo, Resend, Mailjet, SMTP2GO, SendGrid, Postmark, Mailgun, Mailtrap, ActiveCampaign.`);
  }

  if (r.error) return json({ success: false, transport: 'api', provider, message: r.error, error: r.error });
  if (r.ok) {
    return json({
      success: true, transport: 'api', provider, id: messageId(r.text),
      message: `Accepted by ${provider.charAt(0).toUpperCase() + provider.slice(1)} over HTTPS.`,
    });
  }
  const msg = explain(provider, r.status, r.text);
  return json({ success: false, transport: 'api', provider, status: r.status, message: msg, error: msg });
}
