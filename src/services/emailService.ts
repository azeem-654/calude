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
export async function sendEmail(config: EmailProviderConfig, payload: EmailPayload): Promise<SendResult> {
  if (config.provider === 'none' || (!config.apiKey && config.provider !== 'smtp')) {
    return { success: false, error: 'No email provider configured. Go to Settings → Email & SMS.' };
  }

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
          host: smtpCfg.host, port: smtpCfg.port, username: smtpCfg.user,
          password: smtpCfg.pass, encryption: smtpCfg.encryption,
          fromName: config.fromName || smtpCfg.fromName,
          fromEmail: config.fromEmail || smtpCfg.fromEmail,
          to: payload.to, toName: payload.toName,
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

export function personalizeHtml(html: string, contact: { name?: string; email?: string }): string {
  const firstName = contact.name?.split(' ')[0] || 'there';
  const lastName = contact.name?.split(' ').slice(1).join(' ') || '';
  return html
    .replace(/\{\{firstName\}\}/g, firstName)
    .replace(/\{\{lastName\}\}/g, lastName)
    .replace(/\{\{email\}\}/g, contact.email || '')
    .replace(/\{\{company\}\}/g, '')
    .replace(/\{\{unsubscribe\}\}/g, '#unsubscribe');
}
