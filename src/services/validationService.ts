export interface ValidationResult {
  success: boolean;
  message: string;
  details?: string;
  suggestions: string[];
  errorCode?: string;
}

export type ValidationType = 'smtp' | 'resend' | 'mailtrap' | 'openai' | 'apollo' | 'webhook' | 'api_key';

function getSmtpSuggestions(error: string): string[] {
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
  if (e.includes('cors') || e.includes('fetch') || e.includes('network')) {
    tips.push(`This API cannot be tested directly from a browser due to CORS restrictions`);
    tips.push(`Run the local backend server to test this integration: cd server && npm install && node index.js`);
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

export async function validateOpenAI(apiKey: string): Promise<ValidationResult> {
  if (!apiKey?.trim()) {
    return { success: false, message: 'API key is required', suggestions: ['Get your OpenAI API key from platform.openai.com/api-keys'] };
  }
  if (!apiKey.startsWith('sk-')) {
    return { success: false, message: 'Invalid OpenAI API key format', suggestions: ['OpenAI API keys start with "sk-" — check your key at platform.openai.com/api-keys'], errorCode: 'format' };
  }
  return {
    success: false,
    message: 'OpenAI validation requires the backend server (CORS restriction)',
    suggestions: [
      'Run the local backend: cd server && npm install && node index.js',
      'Or test manually: import OpenAI in a Node.js script and call openai.models.list()',
      'Check your API key at platform.openai.com/api-keys',
    ],
    errorCode: 'cors',
  };
}

export async function validateApollo(apiKey: string): Promise<ValidationResult> {
  if (!apiKey?.trim()) {
    return { success: false, message: 'API key is required', suggestions: ['Find your Apollo.io API key at app.apollo.io/#/settings/integrations/api'] };
  }
  return {
    success: false,
    message: 'Apollo.io validation requires the backend server (CORS restriction)',
    suggestions: [
      'Run the local backend: cd server && npm install && node index.js',
      'Test manually: GET https://api.apollo.io/v1/auth/health with your key',
      'Verify your key at app.apollo.io/#/settings/integrations/api',
    ],
    errorCode: 'cors',
  };
}

export async function validateWebhook(url: string): Promise<ValidationResult> {
  if (!url?.trim()) {
    return { success: false, message: 'Webhook URL is required', suggestions: ['Paste the full webhook URL including https://'] };
  }
  try { new URL(url); } catch {
    return { success: false, message: 'Invalid URL format', suggestions: ['Webhook URLs must start with https:// and be a valid URL'] };
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
  // Try backend first
  try {
    const res = await fetch('http://localhost:3001/api/validate/smtp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, port, username, password, secure }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    if (data.success) {
      return { success: true, message: 'SMTP connection successful! Ready to send emails.', suggestions: [] };
    }
    return { success: false, message: data.error || 'SMTP connection failed', suggestions: getSmtpSuggestions(data.error || ''), errorCode: data.code };
  } catch {
    // Backend not running — provide smart client-side guidance
    return {
      success: false,
      message: 'SMTP validation requires the backend server',
      details: `Cannot test SMTP directly from a browser. Start the backend server to test your ${host} connection.`,
      suggestions: [
        'Start the backend: cd server && npm install && node index.js',
        `Common settings for ${host.includes('gmail') ? 'Gmail: port 587, STARTTLS' : host.includes('outlook') || host.includes('office365') ? 'Outlook: smtp.office365.com port 587' : 'your provider: check their documentation'}`,
        'Make sure SMTP access is enabled in your email account settings',
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
