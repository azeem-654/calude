import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';
import { cachedPrimary } from './mailboxStore';
import { API_BASE } from './apiBase';

/**
 * The services that can carry mail out of this app.
 *
 * Everything except `smtp` reaches its provider over HTTPS on port 443 — the
 * one port shared hosting never blocks — and every one of them is sent from
 * the server rather than the browser. See `provider-send.php` for why that
 * distinction is the whole point.
 */
export type EmailProvider =
  | 'smtp'
  | 'brevo' | 'resend' | 'mailjet' | 'smtp2go' | 'sendgrid' | 'postmark' | 'mailgun'
  | 'mailtrap' | 'activecampaign'
  | 'none';

/** The providers that go over HTTPS, i.e. everything that is not raw SMTP. */
export const API_PROVIDERS: EmailProvider[] = [
  'brevo', 'resend', 'mailjet', 'smtp2go', 'sendgrid', 'postmark', 'mailgun', 'mailtrap', 'activecampaign',
];

export interface EmailProviderConfig {
  provider: EmailProvider;
  apiKey: string;
  inboxId: string;
  fromName: string;
  fromEmail: string;
  /** ActiveCampaign account URL, e.g. https://account.api-us1.com */
  apiUrl?: string;
  /** Mailjet issues a key and a secret; both are needed to authenticate. */
  apiSecret?: string;
  /** Mailgun sends through a named domain rather than a bare key. */
  domain?: string;
}

export interface EmailPayload {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  /**
   * Merge data for this recipient. When present, both the subject and the body
   * are personalised here, at the transport — subject lines were the one place
   * callers kept forgetting, and a raw {{firstName}} in an inbox is the most
   * visible mistake an email tool can make.
   */
  merge?: Personalizable;
  /**
   * Where a reply should land, when that is not the sending address.
   *
   * A campaign sent from a mailbox nobody watches loses the replies it was
   * written to get.
   */
  replyTo?: string;
  /**
   * A one-click unsubscribe link, sent as List-Unsubscribe.
   *
   * Gmail and Yahoo have both required this on bulk mail since 2024. Without
   * it a campaign is filtered before anybody decides whether they wanted it.
   */
  unsubscribeUrl?: string;
}

export interface SendResult {
  success: boolean;
  id?: string;
  /** One sentence on what the server objected to. */
  error?: string;
  /** What to do about it, in the order worth trying. */
  steps?: string[];
  /** The server's own words. Shown as well, never instead. */
  raw?: string;
}

const LS_KEY = 'crm_email_provider';

export function loadEmailConfig(): EmailProviderConfig {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    // Migrate old demo configs to none
    if (!saved || saved.provider === 'demo') return defaultConfig();
    return saved;
  } catch { return defaultConfig(); }
}

function defaultConfig(): EmailProviderConfig {
  /* A connected mailbox means this workspace sends over SMTP unless it has
     chosen otherwise. Read from the cached server list rather than from a copy
     of the credentials in the browser. */
  const primary = cachedPrimary();
  if (primary?.smtpHost) {
    return { provider: 'smtp', apiKey: '', inboxId: '', fromName: primary.fromName, fromEmail: primary.fromEmail };
  }
  return { provider: 'none', apiKey: '', inboxId: '', fromName: '', fromEmail: '' };
}

export function saveEmailConfig(cfg: EmailProviderConfig) {
  localStorage.setItem(LS_KEY, JSON.stringify(cfg));
}

/** Returns true if a real sending provider is configured */
export function isEmailConfigured(): boolean {
  const cfg = loadEmailConfig();
  /* A mailbox that has never been validated is not a mailbox that can send,
     and saying so here beats a campaign discovering it one recipient at a
     time. */
  if (cfg.provider === 'smtp') return !!cachedPrimary()?.canSend;
  /* Two providers need more than a key, and saying so up front beats a
     rejected send that blames the key. */
  if (cfg.provider === 'activecampaign') return !!(cfg.apiKey && cfg.apiUrl);
  if (cfg.provider === 'mailjet') return !!(cfg.apiKey && cfg.apiSecret);
  if (cfg.provider === 'mailgun') return !!(cfg.apiKey && cfg.domain);
  return cfg.provider !== 'none' && !!cfg.apiKey;
}

/* ─── Send ─── */
export async function sendEmail(config: EmailProviderConfig, raw: EmailPayload): Promise<SendResult> {
  if (config.provider === 'none' || (!config.apiKey && config.provider !== 'smtp')) {
    return { success: false, error: 'No email provider configured. Go to Settings → Email & SMS.' };
  }

  const payload: EmailPayload = raw.merge
    ? { ...raw, subject: personalizeHtml(raw.subject, raw.merge), html: personalizeHtml(raw.html, raw.merge) }
    : raw;

  try {
    if (config.provider === 'smtp') {
      const primary = cachedPrimary();
      if (!primary?.smtpHost) {
        return { success: false, error: 'No mailbox is connected. Go to Settings → Email & SMS → Mailboxes.' };
      }
      /*
       * The workspace is named; the credentials are not sent.
       *
       * This used to read host, username and *password* out of `crm_smtp` and
       * post them with every message — which meant the browser had to be
       * holding a working password for a campaign to go out at all, and a
       * second device or a cleared cache silently could not send. The mailbox
       * lives on the server, encrypted; the server resolves its own.
       */
      const resp = await fetch(`${API_BASE}/api/smtp-send.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: sessionToken(),
          accountId: getActiveAccountId(),
          fromName: config.fromName || primary.fromName,
          fromEmail: config.fromEmail || primary.fromEmail,
          to: payload.to, toName: payload.toName,
          replyTo: payload.replyTo || '',
          unsubscribeUrl: payload.unsubscribeUrl || '',
          subject: payload.subject, html: payload.html,
        }),
      });
      const data = await resp.json() as { success: boolean; message: string; steps?: string[]; raw?: string };
      /* The server's diagnosis travels with the failure. A raw SMTP line tells
         somebody that something went wrong and nothing about which thing. */
      return data.success
        ? { success: true, id: 'smtp-sent' }
        : { success: false, error: data.message, steps: data.steps, raw: data.raw };
    }

    /**
     * Everything else goes over HTTPS, through this host.
     *
     * It used to go straight from the browser to the provider, which fails for
     * two reasons at once. None of these APIs send an Access-Control-Allow-Origin
     * header, so the browser refuses the request before it leaves — the send
     * reports "network error" however correct the key is. And the key had to be
     * in the page to be sent from the page, which put a licence to send as the
     * customer into local storage, readable by any script or extension loaded
     * alongside it.
     *
     * Sending server-side removes both: no origin is involved, and the key only
     * ever travels between this host and the provider.
     */
    if (API_PROVIDERS.includes(config.provider)) {
      const resp = await fetch(`${API_BASE}/api/provider-send.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: sessionToken(),
          /* Named, not described. With a workspace the server reads the key off
             the mailbox record; `apiKey` stays only so the settings screen can
             test one before it is committed. */
          accountId: getActiveAccountId(),
          provider: config.provider,
          apiKey: config.apiKey,
          apiSecret: config.apiSecret || '',
          apiUrl: config.apiUrl || '',
          domain: config.domain || '',
          fromName: config.fromName,
          fromEmail: config.fromEmail,
          to: payload.to,
          subject: payload.subject,
          html: payload.html,
          replyTo: payload.replyTo || '',
          unsubscribeUrl: payload.unsubscribeUrl || '',
        }),
      });
      const data = await resp.json().catch(() => ({ success: false, message: `HTTP ${resp.status}` })) as
        { success: boolean; message?: string; id?: string };
      return data.success
        ? { success: true, id: data.id || 'sent' }
        : { success: false, error: data.message || `HTTP ${resp.status}` };
    }

    return { success: false, error: 'Unknown provider' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.toLowerCase().includes('cors')) {
      return { success: false, error: 'Network error. Check your connection and provider settings.' };
    }
    return { success: false, error: msg };
  }
}

export interface Personalizable {
  name?: string; email?: string; company?: string; phone?: string;
  jobTitle?: string; website?: string; customFields?: Record<string, string>;
}

/**
 * The merge fields, and the names people actually type for them.
 *
 * `{{name}}` was not one of them, so anybody who wrote the most obvious token
 * in the language had "Hello {{name}}," delivered to a real customer. The
 * aliases exist because a merge field a user has to spell exactly right is a
 * trap, and the cost of guessing wrong is paid in front of the recipient.
 * Matching is case-insensitive and tolerates spaces and underscores for the
 * same reason.
 */
function mergeValues(contact: Personalizable): Record<string, string> {
  const firstName = contact.name?.trim().split(/\s+/)[0] || 'there';
  const lastName = contact.name?.trim().split(/\s+/).slice(1).join(' ') || '';
  return {
    firstname: firstName,
    lastname: lastName,
    fullname: contact.name || '',
    name: contact.name || '',
    email: contact.email || '',
    company: contact.company || '',
    phone: contact.phone || '',
    jobtitle: contact.jobTitle || '',
    title: contact.jobTitle || '',
    website: contact.website || '',
    /* Left for applyUnsubscribe to fill with the server-signed link. This
       used to merge to "#unsubscribe": an anchor that went nowhere, in the one
       place a recipient is entitled to expect a working link. */
    unsubscribe: '{{unsubscribe}}',
  };
}

/** Tokens still unresolved after a merge — what a recipient would have seen. */
export function unresolvedTokens(html: string, contact: Personalizable): string[] {
  const known = mergeValues(contact);
  const custom = Object.keys(contact.customFields ?? {}).map(k => normaliseToken(k));
  const out = new Set<string>();
  for (const m of html.matchAll(/\{\{\s*([\w .-]+?)\s*\}\}/g)) {
    const key = normaliseToken(m[1]);
    if (!(key in known) && !custom.includes(key)) out.add(m[1].trim());
  }
  return [...out];
}

const normaliseToken = (raw: string) => raw.trim().toLowerCase().replace(/[\s_-]/g, '');

/**
 * Fill in the merge fields.
 *
 * Anything left over is removed rather than sent. A token the system does not
 * know is a mistake in the draft, and the two options are showing the mistake
 * to the customer or not showing it — dropping it is the only one that does not
 * embarrass the sender. `unresolvedTokens` exists so the UI can say what was
 * dropped before the send rather than after.
 */
export function personalizeHtml(html: string, contact: Personalizable): string {
  const values = mergeValues(contact);
  const custom = Object.fromEntries(
    Object.entries(contact.customFields ?? {}).map(([k, v]) => [normaliseToken(k), v || '']),
  );

  return html.replace(/\{\{\s*([\w .-]+?)\s*\}\}/g, (_whole, raw: string) => {
    const key = normaliseToken(raw);
    if (key in values) return values[key];
    if (key in custom) return custom[key];
    return '';
  });
}
