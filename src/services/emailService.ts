import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';

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
  error?: string;
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
  // Pre-fill from SMTP wizard config if available
  try {
    const smtp = JSON.parse(localStorage.getItem('crm_smtp') || 'null');
    if (smtp?.host && smtp?.user) {
      return { provider: 'smtp', apiKey: '', inboxId: '', fromName: smtp.fromName || '', fromEmail: smtp.fromEmail || smtp.user };
    }
  } catch { /* ignore */ }
  return { provider: 'none', apiKey: '', inboxId: '', fromName: '', fromEmail: '' };
}

export function saveEmailConfig(cfg: EmailProviderConfig) {
  localStorage.setItem(LS_KEY, JSON.stringify(cfg));
}

/** Returns true if a real sending provider is configured */
export function isEmailConfigured(): boolean {
  const cfg = loadEmailConfig();
  if (cfg.provider === 'smtp') {
    try {
      const smtp = JSON.parse(localStorage.getItem('crm_smtp') || 'null');
      return !!(smtp?.host && smtp?.user && smtp?.pass);
    } catch { return false; }
  }
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
      const smtpCfg = JSON.parse(localStorage.getItem('crm_smtp') || 'null');
      if (!smtpCfg?.host || !smtpCfg?.user) {
        return { success: false, error: 'SMTP not configured. Go to Settings → Email & SMS → SMTP Setup.' };
      }
      const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';
      const resp = await fetch(`${API_BASE}/api/smtp-send.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: sessionToken(),
          /* Named so the server can fall back to this workspace's stored
             mailbox when the browser has no password — a second device, or a
             cache that was cleared. The explicit credentials below still win
             when they are present, which is what the setup wizard relies on. */
          accountId: getActiveAccountId(),
          host: smtpCfg.host, port: smtpCfg.port, username: smtpCfg.user,
          password: smtpCfg.pass, encryption: smtpCfg.encryption,
          fromName: config.fromName || smtpCfg.fromName,
          fromEmail: config.fromEmail || smtpCfg.fromEmail,
          to: payload.to, toName: payload.toName,
          replyTo: payload.replyTo || '',
          unsubscribeUrl: payload.unsubscribeUrl || '',
          subject: payload.subject, html: payload.html,
        }),
      });
      const data = await resp.json() as { success: boolean; message: string };
      return data.success ? { success: true, id: 'smtp-sent' } : { success: false, error: data.message };
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
      const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';
      const resp = await fetch(`${API_BASE}/api/provider-send.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: sessionToken(),
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
