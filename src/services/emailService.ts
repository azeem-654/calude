import { sessionToken } from './auth';

export interface EmailProviderConfig {
  provider: 'smtp' | 'mailtrap' | 'resend' | 'activecampaign' | 'none';
  apiKey: string;
  inboxId: string;
  fromName: string;
  fromEmail: string;
  /** ActiveCampaign account URL, e.g. https://account.api-us1.com */
  apiUrl?: string;
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
  if (cfg.provider === 'activecampaign') return !!(cfg.apiKey && cfg.apiUrl);
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

    if (config.provider === 'mailtrap') {
      if (!config.inboxId) return { success: false, error: 'Mailtrap Inbox ID is required.' };
      const resp = await fetch(`https://sandbox.api.mailtrap.io/api/send/${config.inboxId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: { email: config.fromEmail || 'crm@example.com', name: config.fromName || 'CRM' },
          to: [{ email: payload.to, name: payload.toName || payload.to }],
          subject: payload.subject,
          html: payload.html,
        }),
      });
      if (resp.ok) {
        const data = await resp.json().catch(() => ({}));
        return { success: true, id: (data as { message_ids?: string[] }).message_ids?.[0] || 'sent' };
      }
      let msg = `HTTP ${resp.status}`;
      try { const e = await resp.json() as { errors?: string[]; message?: string }; msg = e.errors?.join(', ') || e.message || msg; } catch { /* ignore */ }
      return { success: false, error: msg };
    }

    if (config.provider === 'resend') {
      const from = config.fromEmail
        ? `${config.fromName || 'CRM'} <${config.fromEmail}>`
        : 'CRM <onboarding@resend.dev>';
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [payload.to], subject: payload.subject, html: payload.html }),
      });
      if (resp.ok) {
        const data = await resp.json().catch(() => ({}));
        return { success: true, id: (data as { id?: string }).id || 'sent' };
      }
      let msg = `HTTP ${resp.status}`;
      try { const e = await resp.json() as { message?: string }; msg = e.message || msg; } catch { /* ignore */ }
      return { success: false, error: msg };
    }

    if (config.provider === 'activecampaign') {
      if (!config.apiUrl) return { success: false, error: 'ActiveCampaign account URL is required.' };
      const base = config.apiUrl.replace(/\/$/, '');
      try {
        // Create a transactional email via ActiveCampaign API
        const resp = await fetch(`${base}/api/3/sendEmail`, {
          method: 'POST',
          headers: { 'Api-Token': config.apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: {
              subject: payload.subject,
              html: payload.html,
              from: config.fromEmail || 'noreply@yourcrm.com',
              fromname: config.fromName || 'CRM',
              reply_to: config.fromEmail || '',
              to: payload.to,
              sender: { name: config.fromName || 'CRM', email: config.fromEmail || 'noreply@yourcrm.com' },
            },
          }),
        });
        if (resp.ok) return { success: true, id: 'ac-sent' };
        const txt = await resp.text().catch(() => `HTTP ${resp.status}`);
        return { success: false, error: `ActiveCampaign error: ${txt}` };
      } catch (err) {
        return { success: false, error: `ActiveCampaign: ${err instanceof Error ? err.message : String(err)}` };
      }
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
