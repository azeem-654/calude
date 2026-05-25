const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: '*' }));
app.use(express.json());

/* ── Health check ── */
app.get('/health', (_req, res) => res.json({ ok: true, version: '1.0.0' }));

/* ── SMTP Validation ── */
app.post('/api/validate/smtp', async (req, res) => {
  const { host, port, username, password, secure } = req.body;

  if (!host || !username || !password) {
    return res.json({
      success: false,
      message: 'Missing required SMTP fields',
      suggestions: [
        'Provide host, username, and password.',
        'For Gmail use smtp.gmail.com port 587.',
        'For Outlook use smtp-mail.outlook.com port 587.',
      ],
    });
  }

  const transporter = nodemailer.createTransport({
    host,
    port: parseInt(port) || 587,
    secure: !!secure,
    auth: { user: username, pass: password },
    connectionTimeout: 8000,
    greetingTimeout: 5000,
    socketTimeout: 8000,
  });

  try {
    await transporter.verify();
    res.json({
      success: true,
      message: `SMTP connection to ${host}:${port} verified successfully.`,
      details: `Authenticated as ${username}`,
      suggestions: [],
    });
  } catch (err) {
    const msg = err.message || '';
    let plain = 'Connection failed.';
    const suggestions = [];

    if (msg.includes('ECONNREFUSED')) {
      plain = `Connection refused on ${host}:${port}.`;
      suggestions.push('Check that the host and port are correct.');
      suggestions.push('Port 587 requires STARTTLS, port 465 requires SSL/TLS.');
      suggestions.push('Ensure your firewall allows outbound connections on this port.');
    } else if (msg.includes('ENOTFOUND') || msg.includes('ECONNRESET')) {
      plain = `Host "${host}" could not be reached.`;
      suggestions.push('Double-check the SMTP hostname for typos.');
      suggestions.push('Try pinging the host from your terminal: ping ' + host);
    } else if (msg.includes('535') || msg.includes('Invalid credentials') || msg.includes('Username and Password not accepted')) {
      plain = 'Authentication failed — invalid credentials.';
      suggestions.push('For Gmail: generate an App Password at myaccount.google.com/apppasswords (requires 2FA).');
      suggestions.push('For Outlook: use your full email address as the username.');
      suggestions.push('Verify the password is correct — copy-paste to avoid typos.');
    } else if (msg.includes('ETIMEDOUT')) {
      plain = `Connection timed out to ${host}:${port}.`;
      suggestions.push('Your network or firewall may be blocking outbound SMTP.');
      suggestions.push('Try a different port: 587 (TLS), 465 (SSL), 25 (plain).');
    } else if (msg.includes('certificate') || msg.includes('SSL') || msg.includes('TLS')) {
      plain = 'SSL/TLS certificate error.';
      suggestions.push('Toggle between SSL/TLS (port 465) and STARTTLS (port 587).');
      suggestions.push('Ensure the server\'s certificate is valid and not self-signed.');
    } else {
      plain = msg;
      suggestions.push('Check all SMTP settings and try again.');
    }

    res.json({
      success: false,
      message: plain,
      details: msg,
      suggestions,
      errorCode: err.code || undefined,
    });
  }
});

/* ── OpenAI Validation (proxy) ── */
app.post('/api/validate/openai', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey || !apiKey.startsWith('sk-')) {
    return res.json({
      success: false,
      message: 'Invalid API key format.',
      suggestions: ['OpenAI API keys start with "sk-".', 'Find your key at platform.openai.com/api-keys.'],
    });
  }

  try {
    const r = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 10000,
    });
    if (r.ok) {
      const data = await r.json();
      const count = data.data?.length ?? 0;
      return res.json({ success: true, message: `API key is valid. ${count} models available.`, suggestions: [] });
    }
    const body = await r.json().catch(() => ({}));
    const errMsg = body.error?.message || `HTTP ${r.status}`;
    const suggestions = [];
    if (r.status === 401) {
      suggestions.push('This key is invalid or has been revoked. Generate a new key at platform.openai.com/api-keys.');
    } else if (r.status === 429) {
      suggestions.push('Rate limit or quota exceeded. Check your usage at platform.openai.com/usage.');
      suggestions.push('Add a payment method to increase your quota.');
    }
    return res.json({ success: false, message: errMsg, suggestions });
  } catch (e) {
    return res.json({ success: false, message: 'Could not reach OpenAI API.', details: e.message, suggestions: ['Check your internet connection.'] });
  }
});

/* ── Apollo.io Validation (proxy) ── */
app.post('/api/validate/apollo', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) {
    return res.json({ success: false, message: 'No API key provided.', suggestions: ['Enter your Apollo.io API key from app.apollo.io/settings/integrations/api.'] });
  }

  try {
    const r = await fetch('https://api.apollo.io/v1/auth/health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ api_key: apiKey }),
      timeout: 10000,
    });
    const body = await r.json().catch(() => ({}));
    if (r.ok && body.is_logged_in) {
      return res.json({ success: true, message: 'Apollo.io API key is valid.', suggestions: [] });
    }
    return res.json({
      success: false,
      message: body.message || `Apollo returned HTTP ${r.status}.`,
      suggestions: ['Find your API key at app.apollo.io/settings/integrations/api.', 'Ensure your Apollo plan includes API access.'],
    });
  } catch (e) {
    return res.json({ success: false, message: 'Could not reach Apollo.io API.', details: e.message, suggestions: ['Check your internet connection.'] });
  }
});

/* ── Send Email ── */
app.post('/api/send-email', async (req, res) => {
  const { host, port, username, password, secure, fromName, fromEmail, to, subject, html, text } = req.body;

  if (!host || !username || !password || !to || !subject) {
    return res.json({ success: false, message: 'Missing required fields: host, username, password, to, subject.' });
  }

  const transporter = nodemailer.createTransport({
    host,
    port: parseInt(port) || 587,
    secure: !!secure,
    auth: { user: username, pass: password },
    connectionTimeout: 10000,
    greetingTimeout: 8000,
  });

  try {
    const info = await transporter.sendMail({
      from: fromName ? `"${fromName}" <${fromEmail || username}>` : (fromEmail || username),
      to,
      subject,
      html: html || `<p>${text || subject}</p>`,
      text: text || subject,
    });

    res.json({
      success: true,
      message: `Email sent successfully to ${to}`,
      messageId: info.messageId,
      // Ethereal preview URL (only for ethereal.email)
      previewUrl: nodemailer.getTestMessageUrl(info) || null,
    });
  } catch (err) {
    res.json({ success: false, message: err.message, details: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`CRMPro backend running on http://localhost:${PORT}`);
  console.log('Endpoints:');
  console.log('  GET  /health');
  console.log('  POST /api/validate/smtp');
  console.log('  POST /api/validate/openai');
  console.log('  POST /api/validate/apollo');
  console.log('  POST /api/send-email');
});
