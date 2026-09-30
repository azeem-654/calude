/**
 * Sending, and checking a key, over a mail provider's HTTPS API.
 *
 * ── Why this is a library now ──
 *
 * It lived inside routes/provider-send, the endpoint a signed-in browser calls.
 * Every server-side sender — the campaign cron, Autopilot, replies, digests,
 * automations, sign-in codes — spoke SMTP only, so a mailbox set to "Brevo" in
 * Settings was, to all of them, a mailbox with no server: it could not be
 * validated ("add your SMTP host first", on a form with no SMTP host field)
 * and nothing scheduled ever went out through it. `lib/deliver.ts` is the one
 * door they all use now, and it comes here for anything but SMTP.
 *
 * ── Checking without sending ──
 *
 * `verifyProvider` asks each provider a read-only question the key must be
 * good for, and where the provider can say so, whether the From address is
 * one it will send from — the refusal people otherwise meet on the first real
 * send. Nothing is sent, the same as validating an SMTP login sends nothing.
 */
import type { MessageInput } from './mime';

export interface ProviderCreds { name: string; key: string; secret: string; domain: string; url: string }

export interface ProviderResult { ok: boolean; status: number; error: string; id: string }

/** The providers this file can send through; Settings offers the same list. */
export const PROVIDERS = ['brevo', 'sendinblue', 'resend', 'mailjet', 'smtp2go', 'sendgrid', 'postmark', 'mailgun', 'mailtrap', 'activecampaign'] as const;

export const providerLabel = (p: string): string => ({
  brevo: 'Brevo', sendinblue: 'Brevo', resend: 'Resend', mailjet: 'Mailjet', smtp2go: 'SMTP2GO',
  sendgrid: 'SendGrid', postmark: 'Postmark', mailgun: 'Mailgun', mailtrap: 'Mailtrap', activecampaign: 'ActiveCampaign',
} as Record<string, string>)[p] ?? (p.charAt(0).toUpperCase() + p.slice(1));

interface Posted { ok: boolean; status: number; text: string; error: string }

async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: BodyInit, basic?: string): Promise<Posted> {
  const h: Record<string, string> = { ...headers };
  if (basic) h.Authorization = 'Basic ' + btoa(basic);
  try {
    const r = await fetch(url, { method, headers: h, body: payload });
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
export function explain(provider: string, status: number, text: string, doing = 'refused the message'): string {
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
  if (detail && !/[.!?]$/.test(detail)) detail += '.';

  const brevo = provider === 'brevo' || provider === 'sendinblue';
  const hint = (status === 401 || status === 403) && brevo && /unrecogni[sz]ed ip/i.test(text)
    ? ' Your Brevo account only accepts API calls from listed IP addresses, and this app sends from Cloudflare\'s. Brevo → Security → Authorised IPs → turn the restriction off for API keys.'
    : (status === 401 || status === 403) && brevo
    ? ' Brevo did not recognise this as an API key. Use one from Brevo → SMTP & API → API Keys (it starts "xkeysib-") — not the SMTP key, and not a key from a different Brevo account.'
    : status === 401 || status === 403
    ? ' The key was rejected — check you copied the whole thing, and that it is an API key with permission to send rather than a read-only one.'
    : status === 400 || status === 422
      ? ' Usually the sending address: most providers will only send from a domain you have verified with them.'
      : status === 429
        ? ' You have hit the rate limit on your plan — wait a moment and try again.'
        : '';
  return `${providerLabel(provider)} ${doing} (HTTP ${status}). ${detail}${hint}`.replace(/\s+\./g, '.');
}

/**
 * The key as the provider expects it, or a sentence saying why it is not one.
 *
 * Brevo's "SMTP & API" page shows two keys side by side, and the SMTP one
 * (`xsmtpsib-…`) opens on the tab people land on. Pasted here it is refused
 * as "Key not found", which reads as a typo and sends people to copy the same
 * wrong key again. Its newer MCP-enabled keys are a base64 wrapper round the
 * real `xkeysib-` key, which the REST API also refuses. And a key copied out
 * of an email or a password manager arrives with a line break or quotes in
 * it. None of these needs a round trip to find out.
 */
export function normaliseKey(provider: string, raw: string): { key: string } | { error: string } {
  let k = raw.replace(/\s+/g, '').replace(/^(api-key|apikey|bearer)[:=]?/i, '').replace(/^["'`]|["'`]$/g, '');
  if (provider !== 'brevo' && provider !== 'sendinblue') return { key: k };
  if (/^xsmtpsib-/i.test(k)) {
    return { error: 'That is a Brevo SMTP key (it starts "xsmtpsib-"), which only works for SMTP logins. This mailbox sends through Brevo\'s API, so it needs an API key: Brevo → SMTP & API → API Keys tab → Generate a new API key. It starts "xkeysib-".' };
  }
  if (!/^xkeysib-/i.test(k)) {
    try {
      const inner = (JSON.parse(atob(k)) as { api_key?: unknown }).api_key;
      if (typeof inner === 'string' && /^xkeysib-/.test(inner)) k = inner;
    } catch { /* not the wrapped form; let Brevo judge it */ }
  }
  return { key: k };
}

const JSON_H = { 'Content-Type': 'application/json' };

/** Send one message through the provider. The caller has already gated the content. */
export async function sendViaProvider(p: ProviderCreds, m: MessageInput): Promise<ProviderResult> {
  const provider = p.name.toLowerCase();
  const apiSecret = p.secret.trim();
  const domain = p.domain.trim();
  const bad = (error: string): ProviderResult => ({ ok: false, status: 0, error, id: '' });
  if (!p.key.trim()) return bad(`No ${providerLabel(provider)} API key is saved. Add it in Settings → Email & SMS → Mailboxes.`);
  const nk = normaliseKey(provider, p.key);
  if ('error' in nk) return bad(nk.error);
  const apiKey = nk.key;

  const fromName = m.fromName || 'CRM';
  const fromEmail = m.fromEmail;
  const to = m.to;
  const subject = m.subject || '(no subject)';
  const html = m.html;
  const reply = m.replyTo || fromEmail;
  const fromHeader = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
  const unsub = m.unsubscribeUrl || '';
  const unsubHeaders: Record<string, string> = unsub
    ? { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
    : {};

  let r: Posted;
  switch (provider) {
    /* Brevo — 300/day free, no card. */
    case 'brevo':
    case 'sendinblue':
      r = await call('POST', 'https://api.brevo.com/v3/smtp/email',
        { ...JSON_H, 'api-key': apiKey, Accept: 'application/json' },
        JSON.stringify({
          sender: { name: fromName, email: fromEmail },
          to: [{ email: to }], subject, htmlContent: html, replyTo: { email: reply },
          ...(unsub ? { headers: unsubHeaders } : {}),
        }));
      break;

    /* Resend — its onboarding@resend.dev sender works before a domain is
       verified, which makes it the fastest to a first real send. */
    case 'resend':
      r = await call('POST', 'https://api.resend.com/emails',
        { ...JSON_H, Authorization: `Bearer ${apiKey}` },
        JSON.stringify({ from: fromHeader, to: [to], subject, html, reply_to: reply, ...(unsub ? { headers: unsubHeaders } : {}) }));
      break;

    /* Mailjet authenticates with a key and a secret; a missing secret otherwise
       comes back as a rejected key and sends people to regenerate a good one. */
    case 'mailjet': {
      if (!apiSecret) return bad('Mailjet needs both an API key and an API secret — the secret is on the same page of your Mailjet account.');
      const msg: Record<string, unknown> = {
        From: { Email: fromEmail, Name: fromName },
        To: [{ Email: to }], Subject: subject, HTMLPart: html, ReplyTo: { Email: reply },
      };
      if (unsub) msg.Headers = unsubHeaders;
      r = await call('POST', 'https://api.mailjet.com/v3.1/send', JSON_H, JSON.stringify({ Messages: [msg] }), `${apiKey}:${apiSecret}`);
      break;
    }

    case 'smtp2go': {
      const custom = [{ header: 'Reply-To', value: reply },
        ...Object.entries(unsubHeaders).map(([header, value]) => ({ header, value }))];
      r = await call('POST', 'https://api.smtp2go.com/v3/email/send', JSON_H,
        JSON.stringify({ api_key: apiKey, sender: fromHeader, to: [to], subject, html_body: html, custom_headers: custom }));
      break;
    }

    case 'sendgrid':
      r = await call('POST', 'https://api.sendgrid.com/v3/mail/send',
        { ...JSON_H, Authorization: `Bearer ${apiKey}` },
        JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: fromEmail, name: fromName },
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
      r = await call('POST', 'https://api.postmarkapp.com/email',
        { ...JSON_H, 'X-Postmark-Server-Token': apiKey, Accept: 'application/json' }, JSON.stringify(payload));
      break;
    }

    /* Mailgun needs the sending domain as well as the key, and the EU region
       lives on a different host, so both are asked for rather than assumed. */
    case 'mailgun': {
      if (!domain) return bad('Mailgun needs the sending domain from your Mailgun dashboard as well as the API key.');
      if (!/^[a-z0-9.\-]+$/i.test(domain)) return bad(`"${domain}" is not a valid Mailgun domain.`);
      const form = new URLSearchParams({ from: fromHeader, to, subject, html, 'h:Reply-To': reply });
      for (const [k, v] of Object.entries(unsubHeaders)) form.set(`h:${k}`, v);
      r = await call('POST', `${mailgunBase(domain)}/v3/${domain}/messages`, {}, form, `api:${apiKey}`);
      break;
    }

    /* Mailtrap is a capture inbox for testing: mail lands in its UI and
       reaches nobody, which is exactly what it is for. */
    case 'mailtrap':
      r = await call('POST', 'https://send.api.mailtrap.io/api/send',
        { ...JSON_H, Authorization: `Bearer ${apiKey}` },
        JSON.stringify({ from: { email: fromEmail, name: fromName }, to: [{ email: to }], subject, html, ...(unsub ? { headers: unsubHeaders } : {}) }));
      break;

    case 'activecampaign': {
      const acUrl = activeCampaignUrl(p.url);
      if (typeof acUrl !== 'string') return bad(acUrl.error);
      r = await call('POST', `${acUrl}/api/3/sendEmail`, { ...JSON_H, 'Api-Token': apiKey },
        JSON.stringify({ email: { subject, html, from: fromEmail, fromname: fromName, reply_to: reply, to, sender: { name: fromName, email: fromEmail } } }));
      break;
    }

    default:
      return bad(`"${provider}" is not a sending provider this app knows. Choose one of: Brevo, Resend, Mailjet, SMTP2GO, SendGrid, Postmark, Mailgun, Mailtrap, ActiveCampaign.`);
  }

  if (r.error) return { ok: false, status: 0, error: r.error, id: '' };
  if (r.ok) return { ok: true, status: r.status, error: '', id: messageId(r.text) };
  return { ok: false, status: r.status, error: explain(provider, r.status, r.text), id: '' };
}

const mailgunBase = (domain: string) => (domain.includes('.eu.') ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net');

/* ActiveCampaign posts to the customer's own account subdomain — the one
   provider where a hostile value would turn a request into a forger against
   Cloudflare's network. Matched against their two real domain shapes only. */
function activeCampaignUrl(raw: string): string | { error: string } {
  const u = raw.trim().replace(/\/$/, '');
  if (!u) return { error: 'ActiveCampaign needs your account URL, e.g. https://youraccount.api-us1.com' };
  if (!/^https:\/\/[a-z0-9][a-z0-9-]{0,62}\.(api-us\d+\.com|activehosted\.com)$/i.test(u)) {
    return { error: `"${u}" is not an ActiveCampaign account URL. It looks like https://youraccount.api-us1.com — copy it from Settings → Developer in ActiveCampaign.` };
  }
  return u;
}

export interface VerifyResult {
  ok: boolean;
  /** One sentence for the settings screen: what was proved, or what to fix. */
  message: string;
  /** Proved the key, but something will still stop the first send. */
  warning?: string;
  /** The form field to fix, named as the settings screen tags it. */
  field?: string;
}

const domainOf = (email: string) => email.split('@')[1]?.toLowerCase() ?? '';

/**
 * Prove the key without sending anything, and where the provider will say,
 * that the From address is one it sends from.
 */
export async function verifyProvider(p: ProviderCreds, fromEmail: string): Promise<VerifyResult> {
  const provider = p.name.toLowerCase();
  const label = providerLabel(provider);
  if (!p.key.trim()) return { ok: false, message: `Paste your ${label} API key, then validate.`, field: 'provider.key' };
  const nk = normaliseKey(provider, p.key);
  if ('error' in nk) return { ok: false, message: nk.error, field: 'provider.key' };
  const key = nk.key;
  if (!fromEmail.includes('@')) return { ok: false, message: 'Add the From address this mailbox sends as, then validate.', field: 'from.email' };
  const dom = domainOf(fromEmail);
  const accepted = `${label} accepted the key.`;
  const refused = (r: Posted): VerifyResult => ({ ok: false, message: r.error || explain(provider, r.status, r.text, 'refused the key'), field: r.status === 401 || r.status === 403 ? 'provider.key' : undefined });

  switch (provider) {
    case 'brevo':
    case 'sendinblue': {
      const h = { 'api-key': key, Accept: 'application/json' };
      const acct = await call('GET', 'https://api.brevo.com/v3/account', h);
      if (!acct.ok) return refused(acct);
      /* Brevo sends from a sender it has verified, or any address on a domain
         authenticated with it. Asking both is what tells "the key is fine but
         the first send will bounce" apart from "ready". */
      const [senders, domains] = await Promise.all([
        call('GET', 'https://api.brevo.com/v3/senders', h),
        call('GET', 'https://api.brevo.com/v3/senders/domains', h),
      ]);
      try {
        const s = senders.ok ? (JSON.parse(senders.text) as { senders?: { email?: string; active?: boolean }[] }).senders ?? [] : null;
        const d = domains.ok ? (JSON.parse(domains.text) as { domains?: { domain_name?: string; authenticated?: boolean }[] }).domains ?? [] : null;
        if (s && d) {
          const bySender = s.some(x => x.email?.toLowerCase() === fromEmail.toLowerCase() && x.active !== false);
          const byDomain = d.some(x => x.domain_name?.toLowerCase() === dom && x.authenticated);
          if (!bySender && !byDomain) {
            return { ok: true, message: accepted, warning: `Brevo will refuse to send as ${fromEmail} until it is a verified sender or ${dom} is authenticated — Brevo → Senders, Domains & Dedicated IPs.` };
          }
        }
      } catch { /* the key is proved; the sender list is a courtesy */ }
      return { ok: true, message: `${accepted} ${fromEmail} is one it will send from.` };
    }

    case 'resend': {
      const r = await call('GET', 'https://api.resend.com/domains', { Authorization: `Bearer ${key}` });
      /* A "sending access" key is refused this read, and that refusal is
         itself proof the key is real — a bad key is refused as invalid. */
      if (r.status === 401 && /restricted/i.test(r.text)) {
        return { ok: true, message: `${accepted} It is a sending-only key, so which domains are verified could not be checked.` };
      }
      if (!r.ok) return refused(r);
      try {
        const list = (JSON.parse(r.text) as { data?: { name?: string; status?: string }[] }).data ?? [];
        const mine = list.find(x => x.name?.toLowerCase() === dom);
        if (!mine) return { ok: true, message: accepted, warning: `${dom} is not added in Resend, so it will refuse to send as ${fromEmail}. Add and verify it under Resend → Domains.` };
        if (mine.status !== 'verified') return { ok: true, message: accepted, warning: `${dom} is in Resend but not verified yet (${mine.status}). Sends are refused until its DNS records check out.` };
      } catch { /* proved anyway */ }
      return { ok: true, message: `${accepted} ${dom} is verified there.` };
    }

    case 'sendgrid': {
      const r = await call('GET', 'https://api.sendgrid.com/v3/scopes', { Authorization: `Bearer ${key}` });
      if (!r.ok) return refused(r);
      try {
        const scopes = (JSON.parse(r.text) as { scopes?: string[] }).scopes ?? [];
        if (!scopes.includes('mail.send')) return { ok: false, message: 'SendGrid accepted the key, but it does not have the Mail Send permission. Make a key with "Mail Send" access.' };
      } catch { /* proved anyway */ }
      return { ok: true, message: `${accepted} It has permission to send.` };
    }

    case 'mailgun': {
      const domain = p.domain.trim();
      if (!domain) return { ok: false, message: 'Add the sending domain from your Mailgun dashboard, then validate.', field: 'provider.domain' };
      if (!/^[a-z0-9.\-]+$/i.test(domain)) return { ok: false, message: `"${domain}" is not a valid Mailgun domain.`, field: 'provider.domain' };
      const r = await call('GET', `${mailgunBase(domain)}/v3/domains/${domain}`, {}, undefined, `api:${key}`);
      if (!r.ok) return refused(r);
      try {
        const state = (JSON.parse(r.text) as { domain?: { state?: string } }).domain?.state;
        if (state && state !== 'active') return { ok: true, message: accepted, warning: `${domain} is "${state}" in Mailgun — it sends only once its DNS records are verified.` };
      } catch { /* proved anyway */ }
      return { ok: true, message: `${accepted} ${domain} is active.` };
    }

    case 'mailjet': {
      if (!p.secret.trim()) return { ok: false, message: 'Mailjet needs the API secret as well as the key — both are on the same page of your Mailjet account.', field: 'provider.secret' };
      const r = await call('GET', `https://api.mailjet.com/v3/REST/sender?Email=${encodeURIComponent(fromEmail)}`, {}, undefined, `${key}:${p.secret.trim()}`);
      if (!r.ok) return refused(r);
      try {
        const rows = (JSON.parse(r.text) as { Data?: { Status?: string }[] }).Data ?? [];
        if (!rows.some(x => x.Status === 'Active')) return { ok: true, message: accepted, warning: `${fromEmail} is not an active sender in Mailjet yet — add and confirm it under Account → Senders & Domains.` };
      } catch { /* proved anyway */ }
      return { ok: true, message: `${accepted} ${fromEmail} is an active sender.` };
    }

    case 'postmark': {
      const r = await call('GET', 'https://api.postmarkapp.com/server', { 'X-Postmark-Server-Token': key, Accept: 'application/json' });
      if (!r.ok) return refused(r);
      return { ok: true, message: `${accepted} Postmark sends only from a confirmed sender signature or domain, which a server key cannot check — send yourself a test to be sure.` };
    }

    case 'smtp2go': {
      const r = await call('POST', 'https://api.smtp2go.com/v3/stats/email_summary', JSON_H, JSON.stringify({ api_key: key }));
      if (!r.ok) return refused(r);
      return { ok: true, message: accepted };
    }

    case 'activecampaign': {
      const u = activeCampaignUrl(p.url);
      if (typeof u !== 'string') return { ok: false, message: u.error };
      const r = await call('GET', `${u}/api/3/users/me`, { 'Api-Token': key });
      if (!r.ok) return refused(r);
      return { ok: true, message: accepted };
    }

    default:
      return { ok: false, message: `${label} keys cannot be checked without sending — send yourself a test email to confirm it works.` };
  }
}
