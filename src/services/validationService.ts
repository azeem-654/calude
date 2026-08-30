import { API_BASE } from './apiBase';
import { sessionToken } from './auth';

export interface ValidationResult {
  success: boolean;
  message: string;
  details?: string;
  suggestions: string[];
  errorCode?: string;
}

export type ValidationType = 'smtp' | 'resend' | 'mailtrap' | 'openai' | 'apollo' | 'webhook' | 'api_key';

export function getSmtpSuggestions(error: string): string[] {
  const e = error.toLowerCase();
  const tips: string[] = [];
  if (e.includes('535') || e.includes('authentication') || e.includes('auth')) {
    tips.push('Double-check your password or app password (not your account password)');
    tips.push('For Gmail: enable 2FA and use an App Password from myaccount.google.com/apppasswords');
    tips.push('For Outlook: ensure "Less secure app access" is enabled or use an App Password');
  }
  if (e.includes('connection') || e.includes('timeout') || e.includes('econnrefused') || e.includes('network')) {
    tips.push('Verify the SMTP host address is correct (e.g., smtp.gmail.com, smtp.office365.com)');
    tips.push('Try port 587 with STARTTLS, or port 465 with SSL/TLS');
    tips.push('Check that your firewall or ISP is not blocking outbound SMTP connections');
  }
  if (e.includes('ssl') || e.includes('tls') || e.includes('certificate')) {
    tips.push('Try switching between SSL/TLS (port 465) and STARTTLS (port 587)');
    tips.push('Ensure your email provider supports the selected encryption method');
  }
  if (e.includes('550') || e.includes('relay') || e.includes('not allowed')) {
    tips.push('Your account may not have permission to send via SMTP — check with your provider');
    tips.push('Some providers require you to enable SMTP/IMAP access in account settings');
  }
  if (tips.length === 0) {
    tips.push('Verify all SMTP settings: host, port, username (usually your email), and password');
    tips.push('Check that SMTP access is enabled in your email account settings');
    tips.push('Try a different port: 25 (unencrypted), 465 (SSL), or 587 (STARTTLS)');
  }
  return tips;
}

function getApiKeySuggestions(type: string, error: string): string[] {
  const e = error.toLowerCase();
  const tips: string[] = [];
  if (e.includes('401') || e.includes('unauthorized') || e.includes('invalid api key') || e.includes('invalid key')) {
    tips.push(`Copy the ${type} API key carefully — make sure there are no leading/trailing spaces`);
    tips.push(`Go to your ${type} dashboard and generate a new API key if the existing one is invalid`);
  }
  if (e.includes('403') || e.includes('forbidden') || e.includes('permission')) {
    tips.push(`Your API key may not have the required permissions — check the key scopes in your ${type} dashboard`);
  }
  if (e.includes('429') || e.includes('rate limit') || e.includes('quota')) {
    tips.push(`You've hit the rate limit. Wait a moment and try again`);
    tips.push(`Consider upgrading your ${type} plan for higher limits`);
  }
  if (e.includes('could not reach') || e.includes('fetch') || e.includes('network') || e.includes('timeout')) {
    tips.push(`The request to ${type} did not get through — check your connection and try again`);
    tips.push(`If ${type} is having an outage, the key itself may be fine`);
  }
  if (tips.length === 0) {
    tips.push(`Verify the API key is correct and has not expired`);
    tips.push(`Check your ${type} account is active and in good standing`);
  }
  return tips;
}

export async function validateResend(apiKey: string): Promise<ValidationResult> {
  if (!apiKey?.trim()) {
    return { success: false, message: 'API key is required', suggestions: ['Enter your Resend API key from resend.com/api-keys'] };
  }
  if (!apiKey.startsWith('re_')) {
    return { success: false, message: 'Invalid API key format', suggestions: ['Resend API keys start with "re_" — double-check your key from resend.com/api-keys'], errorCode: 'format' };
  }
  try {
    const res = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      return { success: true, message: 'Resend API key is valid and active', suggestions: [] };
    }
    const body = await res.json().catch(() => ({}));
    const msg = body.message || body.name || `HTTP ${res.status}`;
    return { success: false, message: `Resend authentication failed: ${msg}`, suggestions: getApiKeySuggestions('Resend', msg), errorCode: String(res.status) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Connection error: ${msg}`, suggestions: getApiKeySuggestions('Resend', msg) };
  }
}

export async function validateMailtrap(apiKey: string, inboxId: string): Promise<ValidationResult> {
  if (!apiKey?.trim()) {
    return { success: false, message: 'API key is required', suggestions: ['Find your Mailtrap API key at mailtrap.io/api-tokens'] };
  }
  if (!inboxId?.trim()) {
    return { success: false, message: 'Inbox ID is required', suggestions: ['Find your Inbox ID in the Mailtrap dashboard under your inbox settings'] };
  }
  try {
    const res = await fetch(`https://sandbox.api.mailtrap.io/api/send/${inboxId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: { email: 'test@example.com', name: 'CRM Test' },
        to: [{ email: 'validation@test.com', name: 'Test' }],
        subject: 'Connection Test',
        html: '<p>Test</p>',
      }),
    });
    if (res.ok) {
      return { success: true, message: 'Mailtrap connection verified — test email sent to sandbox', suggestions: [] };
    }
    const body = await res.json().catch(() => ({}));
    const msg = (body.errors || []).join(', ') || body.message || `HTTP ${res.status}`;
    return { success: false, message: `Mailtrap error: ${msg}`, suggestions: getApiKeySuggestions('Mailtrap', msg), errorCode: String(res.status) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Connection error: ${msg}`, suggestions: getApiKeySuggestions('Mailtrap', msg) };
  }
}

/**
 * Check a key by using it. The call is made by our server, not the browser:
 * neither provider sends CORS headers, so a request from the page is refused
 * before it is sent.
 */
async function checkKeyOnServer(provider: 'openai' | 'apollo', label: string, apiKey: string): Promise<ValidationResult> {
  try {
    const res = await fetch(`${API_BASE}/api/validate-key.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken(), provider, apiKey }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json() as { success?: boolean; message?: string; error?: string; status?: number };
    if (data.success) return { success: true, message: data.message || `${label} key is valid`, suggestions: [] };
    const msg = data.error || data.message || `${label} could not be reached (HTTP ${res.status})`;
    return { success: false, message: msg, suggestions: getApiKeySuggestions(label, msg), errorCode: data.status ? String(data.status) : undefined };
  } catch (e) {
    const msg = e instanceof Error && e.name === 'TimeoutError'
      ? `${label} did not answer in time`
      : 'The key check could not be reached';
    return { success: false, message: msg, suggestions: ['Check your internet connection and try again'] };
  }
}

export async function validateOpenAI(apiKey: string): Promise<ValidationResult> {
  if (!apiKey?.trim()) {
    return { success: false, message: 'API key is required', suggestions: ['Get your OpenAI API key from platform.openai.com/api-keys'] };
  }
  if (!apiKey.startsWith('sk-')) {
    return { success: false, message: 'Invalid OpenAI API key format', suggestions: ['OpenAI API keys start with "sk-" — check your key at platform.openai.com/api-keys'], errorCode: 'format' };
  }
  return checkKeyOnServer('openai', 'OpenAI', apiKey.trim());
}

export async function validateApollo(apiKey: string): Promise<ValidationResult> {
  if (!apiKey?.trim()) {
    return { success: false, message: 'API key is required', suggestions: ['Find your Apollo.io API key at app.apollo.io/#/settings/integrations/api'] };
  }
  return checkKeyOnServer('apollo', 'Apollo.io', apiKey.trim());
}

export async function validateWebhook(url: string): Promise<ValidationResult> {
  if (!url?.trim()) {
    return { success: false, message: 'Webhook URL is required', suggestions: ['Paste the full webhook URL including https://'] };
  }
  let parsed: URL;
  try { parsed = new URL(url); } catch {
    return { success: false, message: 'Invalid URL format', suggestions: ['Webhook URLs must start with https:// and be a valid URL'] };
  }
  /* `new URL()` accepts any well-formed URI, so `javascript:alert(1)` passed as
     "valid" — next to a suggestion about returning a 2xx status, which only an
     HTTP endpoint can do. The scheme is the whole point of the check. */
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      success: false,
      message: `"${parsed.protocol}" is not a web address a webhook can be sent to`,
      suggestions: ['A webhook URL must start with https:// (or http:// while testing locally)'],
    };
  }
  if (parsed.protocol === 'http:') {
    return {
      success: true,
      message: 'Valid, but not encrypted',
      details: 'This webhook is http:// — whatever it carries travels in the clear. Use https:// for anything real.',
      suggestions: ['Switch to https:// before sending customer data through this webhook'],
    };
  }
  return {
    success: true,
    message: 'Webhook URL format is valid',
    details: 'Note: actual connectivity cannot be verified from the browser due to CORS. The URL will be called when an event triggers.',
    suggestions: ['Make sure the webhook endpoint returns a 2xx status code on POST requests'],
  };
}

export async function validateSmtp(host: string, port: number, username: string, password: string, secure: boolean): Promise<ValidationResult> {
  if (!host || !username || !password) {
    return { success: false, message: 'Host, username, and password are required', suggestions: ['Fill in all SMTP fields before testing'] };
  }
  /* A browser cannot open an SMTP connection, so the test is run by the server:
     it signs in to the mail server with these credentials and reports what the
     server said. This used to call a local development process that does not
     exist in production, so pressing Test always failed for a customer. */
  try {
    const res = await fetch(`${API_BASE}/api/smtp-test.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: sessionToken(),
        host,
        port: Number(port) || 587,
        username,
        password,
        encryption: secure ? 'ssl' : 'tls',
      }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json() as { success?: boolean; message?: string; error?: string; port?: number };
    if (data.success) {
      return {
        success: true,
        message: data.message || 'SMTP connection successful — ready to send.',
        suggestions: [],
      };
    }
    const err = data.error || data.message || `The mail server refused the connection (HTTP ${res.status}).`;
    return { success: false, message: err, suggestions: getSmtpSuggestions(err) };
  } catch (e) {
    /* Reaching the app's own API failed — that is a different problem from the
       mail server rejecting the credentials, and saying so stops people
       rewriting settings that were never the cause. */
    const reason = e instanceof Error && e.name === 'TimeoutError'
      ? `${host} did not answer within 30 seconds.`
      : 'The connection test could not be reached.';
    return {
      success: false,
      message: reason,
      details: 'The test runs on the server; this attempt did not get an answer back.',
      suggestions: [
        'Check your internet connection and try again',
        `Confirm ${host} is the right server name and that it accepts connections from outside your network`,
      ],
    };
  }
}

export async function validate(type: ValidationType, params: Record<string, string | number | boolean>): Promise<ValidationResult> {
  switch (type) {
    case 'resend': return validateResend(params.apiKey as string);
    case 'mailtrap': return validateMailtrap(params.apiKey as string, params.inboxId as string);
    case 'openai': return validateOpenAI(params.apiKey as string);
    case 'apollo': return validateApollo(params.apiKey as string);
    case 'webhook': return validateWebhook(params.url as string);
    case 'smtp': return validateSmtp(params.host as string, params.port as number, params.username as string, params.password as string, params.secure as boolean);
    default: return { success: false, message: 'Unknown validation type', suggestions: [] };
  }
}
