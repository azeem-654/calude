export interface EmailProviderConfig {
  provider: 'mailtrap' | 'resend' | 'demo' | 'none';
  apiKey: string;
  inboxId: string;
  fromName: string;
  fromEmail: string;
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

export interface DemoEmail {
  id: string;
  to: string;
  toName?: string;
  from: string;
  fromName: string;
  subject: string;
  html: string;
  timestamp: string;
  campaignName?: string;
}

const LS_KEY = 'crm_email_provider';
const DEMO_LS_KEY = 'crm_demo_inbox';

export function loadEmailConfig(): EmailProviderConfig {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || 'null') ?? defaultConfig();
  } catch { return defaultConfig(); }
}

function defaultConfig(): EmailProviderConfig {
  return { provider: 'demo', apiKey: '', inboxId: '', fromName: 'Demo Sender', fromEmail: 'demo@yourcrm.local' };
}

export function saveEmailConfig(cfg: EmailProviderConfig) {
  localStorage.setItem(LS_KEY, JSON.stringify(cfg));
}

/* ─── Demo inbox ─── */
export function loadDemoEmails(): DemoEmail[] {
  try { return JSON.parse(localStorage.getItem(DEMO_LS_KEY) || '[]'); } catch { return []; }
}

export function saveDemoEmail(email: DemoEmail): void {
  const emails = loadDemoEmails();
  emails.unshift(email);
  localStorage.setItem(DEMO_LS_KEY, JSON.stringify(emails.slice(0, 200)));
}

export function clearDemoEmails(): void {
  localStorage.removeItem(DEMO_LS_KEY);
}

/* ─── Send ─── */
export async function sendEmail(config: EmailProviderConfig, payload: EmailPayload): Promise<SendResult> {
  if (config.provider === 'demo') {
    const email: DemoEmail = {
      id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      to: payload.to,
      toName: payload.toName,
      from: config.fromEmail || 'demo@yourcrm.local',
      fromName: config.fromName || 'Demo Sender',
      subject: payload.subject,
      html: payload.html,
      timestamp: new Date().toISOString(),
    };
    saveDemoEmail(email);
    return { success: true, id: email.id };
  }

  if (config.provider === 'none' || !config.apiKey) {
    return { success: false, error: 'No email provider configured. Go to Settings → Email & SMS → Email Provider.' };
  }

  try {
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
        return { success: true, id: data.message_ids?.[0] || 'sent' };
      }
      let msg = `HTTP ${resp.status}`;
      try { const e = await resp.json(); msg = e.errors?.join(', ') || e.message || msg; } catch { /* ignore */ }
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
        return { success: true, id: data.id || 'sent' };
      }
      let msg = `HTTP ${resp.status}`;
      try { const e = await resp.json(); msg = e.message || msg; } catch { /* ignore */ }
      return { success: false, error: msg };
    }

    return { success: false, error: 'Unknown provider' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.toLowerCase().includes('cors')) {
      return {
        success: false,
        error: 'Network/CORS error. For Mailtrap: ensure your API token is valid. For Resend: CORS is blocked in-browser — emails work from a server/backend.',
      };
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
