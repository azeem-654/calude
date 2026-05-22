import React, { useState } from 'react';
import { User, Bell, Shield, CreditCard, Globe, Palette, Save, Mail, MessageSquare, CheckCircle, XCircle, Loader, Eye, EyeOff, RefreshCw, Send, Phone, Zap, ExternalLink, Inbox, ChevronRight } from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import { loadEmailConfig, saveEmailConfig, sendEmail } from '../../services/emailService';
import type { EmailProviderConfig } from '../../services/emailService';

/* ─── helpers ─── */

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      style={{ width: '44px', height: '24px', borderRadius: '12px', backgroundColor: value ? '#6366f1' : '#e2e8f0', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: 'white', position: 'absolute', top: '3px', left: value ? '23px' : '3px', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </button>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder = '' }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  const [show, setShow] = useState(false);
  const isPass = type === 'password';
  return (
    <div>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '5px' }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={isPass && !show ? 'password' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ width: '100%', padding: isPass ? '9px 36px 9px 12px' : '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', color: '#374151', backgroundColor: 'white' }}
        />
        {isPass && (
          <button onClick={() => setShow(p => !p)}
            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px' }}>
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
      </div>
    </div>
  );
}

type TestStatus = 'idle' | 'testing' | 'ok' | 'fail';

function TestBtn({ status, onTest, label = 'Test Connection' }: { status: TestStatus; onTest: () => void; label?: string }) {
  const map: Record<TestStatus, { bg: string; color: string; text: string; icon: React.ReactElement }> = {
    idle: { bg: '#f1f5f9', color: '#374151', text: label, icon: <RefreshCw size={14} /> },
    testing: { bg: '#eff6ff', color: '#2563eb', text: 'Testing…', icon: <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> },
    ok: { bg: '#ecfdf5', color: '#16a34a', text: 'Connected!', icon: <CheckCircle size={14} /> },
    fail: { bg: '#fef2f2', color: '#dc2626', text: 'Failed — check settings', icon: <XCircle size={14} /> },
  };
  const s = map[status];
  return (
    <button onClick={onTest} disabled={status === 'testing'}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 18px', backgroundColor: s.bg, color: s.color, border: `1px solid ${s.color}30`, borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: status === 'testing' ? 'not-allowed' : 'pointer' }}>
      {s.icon} {s.text}
    </button>
  );
}

/* ─── SMTP tab ─── */

function loadSMTP() {
  try { return JSON.parse(localStorage.getItem('crm_smtp') || 'null') ?? { host: '', port: '587', user: '', pass: '', fromName: '', fromEmail: '', encryption: 'tls' }; }
  catch { return { host: '', port: '587', user: '', pass: '', fromName: '', fromEmail: '', encryption: 'tls' }; }
}
function loadIMAP() {
  try { return JSON.parse(localStorage.getItem('crm_imap') || 'null') ?? { host: '', port: '993', user: '', pass: '', folder: 'INBOX' }; }
  catch { return { host: '', port: '993', user: '', pass: '', folder: 'INBOX' }; }
}
function loadSMS() {
  try { return JSON.parse(localStorage.getItem('crm_sms') || 'null') ?? { provider: 'twilio', accountSid: '', authToken: '', fromNumber: '' }; }
  catch { return { provider: 'twilio', accountSid: '', authToken: '', fromNumber: '' }; }
}

interface SmtpConfig { host: string; port: string; user: string; pass: string; fromName: string; fromEmail: string; encryption: string; }
interface ImapConfig { host: string; port: string; user: string; pass: string; folder: string; }
interface SmsConfig { provider: string; accountSid: string; authToken: string; fromNumber: string; }

/* ─── Email Provider (API-based sending for campaigns) ─── */

function EmailProviderCard() {
  const { addNotification } = useApp();
  const [cfg, setCfg] = useState<EmailProviderConfig>(loadEmailConfig);
  const [testAddr, setTestAddr] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'fail'>('idle');
  const [lastResult, setLastResult] = useState('');

  const save = () => { saveEmailConfig(cfg); addNotification('Email provider saved!'); };

  const runTest = async () => {
    if (cfg.provider === 'none') { addNotification('Select a provider first', 'error'); return; }
    if (cfg.provider === 'demo') {
      setStatus('sending'); setLastResult('');
      const result = await sendEmail(cfg, {
        to: 'demo-test@yourcrm.local',
        toName: 'Demo Test Recipient',
        subject: '✅ Demo Mode Test Email',
        html: `<h2 style="color:#0284c7">Demo Mode is working! 📬</h2><p>This test was captured in your Demo Inbox at <strong>${new Date().toLocaleString()}</strong>.</p><p>No real email was sent. Go to <strong>Marketing → Demo Inbox</strong> to see captured emails.</p><p style="background:#f0f9ff;padding:12px;border-radius:8px;border-left:4px solid #0284c7">Switch to <strong>Mailtrap</strong> or <strong>Resend</strong> provider when you're ready to send real emails.</p>`,
      });
      setStatus('ok');
      setLastResult('Captured in Demo Inbox! Go to Marketing → Demo Inbox to view it.');
      addNotification('Test email captured in Demo Inbox!');
      return;
    }
    if (!testAddr.trim()) { addNotification('Enter a test recipient address', 'error'); return; }
    setStatus('sending'); setLastResult('');
    const result = await sendEmail(cfg, {
      to: testAddr.trim(),
      toName: 'Test Recipient',
      subject: '✅ CRM Email Test',
      html: `<h2>Email provider working!</h2><p>This test was sent from your CRM at ${new Date().toLocaleString()}.</p><p>Provider: <strong>${cfg.provider}</strong></p>`,
    });
    if (result.success) {
      setStatus('ok');
      setLastResult(`Sent! Message ID: ${result.id}`);
      addNotification(`Test email delivered to ${testAddr}!`);
    } else {
      setStatus('fail');
      setLastResult(result.error || 'Unknown error');
      addNotification(result.error || 'Send failed', 'error');
    }
  };

  const statusColors: Record<string, string> = { idle: '#64748b', sending: '#2563eb', ok: '#16a34a', fail: '#dc2626' };
  const providerDocs: Record<string, { label: string; url: string; hint: string }> = {
    mailtrap: { label: 'Mailtrap', url: 'https://mailtrap.io', hint: 'Free test sandbox · Captures all emails · No real delivery · Perfect for testing' },
    resend:   { label: 'Resend',   url: 'https://resend.com',  hint: 'Real email delivery · Free tier: 3,000/mo · Requires verified domain for production' },
  };

  return (
    <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ width: '42px', height: '42px', borderRadius: '12px', backgroundColor: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Zap size={20} color="#6366f1" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Email Sending Provider</h4>
            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#6366f115', color: '#6366f1', fontWeight: 600 }}>Campaign Sending</span>
          </div>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0' }}>API-based sending used by campaigns and sequences</p>
        </div>
      </div>

      {/* Provider selector */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Provider</label>

        {/* Demo mode — featured first */}
        <button onClick={() => setCfg(prev => ({ ...prev, provider: 'demo', fromName: prev.fromName || 'Demo Sender', fromEmail: prev.fromEmail || 'demo@yourcrm.local' }))}
          style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px 14px', border: `2px solid ${cfg.provider === 'demo' ? '#0284c7' : '#e2e8f0'}`, borderRadius: '10px', backgroundColor: cfg.provider === 'demo' ? '#f0f9ff' : 'white', cursor: 'pointer', textAlign: 'left', marginBottom: '8px', transition: 'all 0.12s' }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg, #0ea5e9, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 18 }}>📬</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 1 }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: cfg.provider === 'demo' ? '#0284c7' : '#0f172a' }}>Demo Mode</span>
              <span style={{ fontSize: '10px', padding: '1px 7px', borderRadius: 20, backgroundColor: '#dcfce7', color: '#16a34a', fontWeight: 700 }}>NO SETUP REQUIRED</span>
              <span style={{ fontSize: '10px', padding: '1px 7px', borderRadius: 20, backgroundColor: '#eff6ff', color: '#2563eb', fontWeight: 600 }}>DEFAULT</span>
            </div>
            <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Emails are captured in a built-in inbox — nothing is sent to real recipients. Perfect for testing your campaigns.</p>
          </div>
          <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${cfg.provider === 'demo' ? '#0284c7' : '#cbd5e1'}`, backgroundColor: cfg.provider === 'demo' ? '#0284c7' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {cfg.provider === 'demo' && <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'white' }} />}
          </div>
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '10px' }}>
          {[
            { id: 'mailtrap', label: '🧪 Mailtrap', desc: 'Test sandbox' },
            { id: 'resend',   label: '⚡ Resend',   desc: 'Real sending' },
            { id: 'none',     label: '🚫 None',     desc: 'Disabled' },
          ].map(p => (
            <button key={p.id} onClick={() => setCfg(prev => ({ ...prev, provider: p.id as EmailProviderConfig['provider'] }))}
              style={{ padding: '10px', border: `2px solid ${cfg.provider === p.id ? '#6366f1' : '#e2e8f0'}`, borderRadius: '10px', backgroundColor: cfg.provider === p.id ? '#f5f3ff' : 'white', cursor: 'pointer', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: cfg.provider === p.id ? '#6366f1' : '#374151' }}>{p.label}</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{p.desc}</div>
            </button>
          ))}
        </div>
        {cfg.provider !== 'none' && cfg.provider !== 'demo' && providerDocs[cfg.provider] && (
          <div style={{ padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <p style={{ fontSize: '12px', color: '#64748b', margin: 0, flex: 1 }}>{providerDocs[cfg.provider].hint}</p>
            <a href={providerDocs[cfg.provider].url} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#6366f1', fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>
              Get free API key <ExternalLink size={11} />
            </a>
          </div>
        )}
      </div>

      {/* Demo mode info box */}
      {cfg.provider === 'demo' && (
        <div style={{ padding: '16px', backgroundColor: '#f0f9ff', borderRadius: '10px', border: '1px solid #bae6fd', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>📬</span>
            <div>
              <p style={{ fontSize: '13px', fontWeight: 600, color: '#0284c7', margin: '0 0 4px' }}>Demo Mode is active</p>
              <p style={{ fontSize: '12px', color: '#0369a1', margin: 0, lineHeight: 1.6 }}>
                All campaign emails are captured in the built-in <strong>Demo Inbox</strong> (Marketing → Demo Inbox button). No real emails are sent to your contacts. You can test your full campaign flow — send timing, personalization, and email preview — without any configuration.
              </p>
            </div>
          </div>
        </div>
      )}

      {cfg.provider !== 'none' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            {cfg.provider !== 'demo' && (
              <div style={{ gridColumn: cfg.provider === 'mailtrap' ? '1' : '1/-1' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '5px' }}>API Key *</label>
                <input type="password" value={cfg.apiKey} onChange={e => setCfg(prev => ({ ...prev, apiKey: e.target.value }))} placeholder="Paste your API key here"
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            )}
            {cfg.provider === 'mailtrap' && (
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '5px' }}>Inbox ID *</label>
                <input value={cfg.inboxId} onChange={e => setCfg(prev => ({ ...prev, inboxId: e.target.value }))} placeholder="e.g. 1234567"
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            )}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '5px' }}>From Name</label>
              <input value={cfg.fromName} onChange={e => setCfg(prev => ({ ...prev, fromName: e.target.value }))} placeholder="CRM Pro"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '5px' }}>From Email</label>
              <input value={cfg.fromEmail} onChange={e => setCfg(prev => ({ ...prev, fromEmail: e.target.value }))} placeholder="hello@yourdomain.com"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Test send */}
          <div style={{ padding: '16px', backgroundColor: cfg.provider === 'demo' ? '#f0f9ff' : '#f8fafc', borderRadius: '10px', border: `1px solid ${cfg.provider === 'demo' ? '#bae6fd' : '#e2e8f0'}` }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#374151', margin: '0 0 6px' }}>
              {cfg.provider === 'demo' ? '📬 Send a test to Demo Inbox' : 'Send test email'}
            </p>
            {cfg.provider === 'demo' ? (
              <p style={{ fontSize: '12px', color: '#0369a1', margin: '0 0 10px' }}>Click below — the test email will appear in Marketing → Demo Inbox instantly.</p>
            ) : (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input value={testAddr} onChange={e => setTestAddr(e.target.value)} placeholder="recipient@example.com"
                  style={{ flex: 1, padding: '8px 11px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none' }} />
              </div>
            )}
            <button onClick={runTest} disabled={status === 'sending'}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', backgroundColor: status === 'sending' ? '#e2e8f0' : (cfg.provider === 'demo' ? '#0284c7' : '#6366f1'), color: status === 'sending' ? '#94a3b8' : 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: status === 'sending' ? 'not-allowed' : 'pointer' }}>
              {status === 'sending' ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Sending…</> : <><Send size={13} /> {cfg.provider === 'demo' ? 'Capture Test Email' : 'Send Test'}</>}
            </button>
            {lastResult && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', padding: '8px 10px', backgroundColor: status === 'ok' ? '#ecfdf5' : '#fef2f2', borderRadius: '7px', border: `1px solid ${status === 'ok' ? '#bbf7d0' : '#fecaca'}`, marginTop: '8px' }}>
                {status === 'ok' ? <CheckCircle size={14} color="#16a34a" style={{ marginTop: 1, flexShrink: 0 }} /> : <XCircle size={14} color="#dc2626" style={{ marginTop: 1, flexShrink: 0 }} />}
                <p style={{ fontSize: '12px', color: statusColors[status], margin: 0, lineHeight: 1.5, wordBreak: 'break-word' }}>{lastResult}</p>
              </div>
            )}
          </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
        <button onClick={save} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 20px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
          <Save size={14} /> Save Provider
        </button>
      </div>
    </div>
  );
}

function EmailSMSTab() {
  const { addNotification } = useApp();
  const [smtp, setSMTP] = useState<SmtpConfig>(loadSMTP);
  const [imap, setIMAP] = useState<ImapConfig>(loadIMAP);
  const [sms, setSMS] = useState<SmsConfig>(loadSMS);
  const [smtpStatus, setSmtpStatus] = useState<TestStatus>('idle');
  const [imapStatus, setImapStatus] = useState<TestStatus>('idle');
  const [smsStatus, setSmsStatus] = useState<TestStatus>('idle');
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  const setS = <T extends object>(setter: React.Dispatch<React.SetStateAction<T>>) =>
    (k: keyof T, v: string) => setter(p => ({ ...p, [k]: v }));

  const setSf = setS(setSMTP);
  const setIf = setS(setIMAP);
  const setSsf = setS(setSMS);

  const runTest = (which: 'smtp' | 'imap' | 'sms') => {
    const setStatus = which === 'smtp' ? setSmtpStatus : which === 'imap' ? setImapStatus : setSmsStatus;
    setStatus('testing');
    setTimeout(() => {
      const cfg = which === 'smtp' ? smtp : which === 'imap' ? imap : sms;
      const hasConfig = Object.values(cfg).filter(v => v && v !== '587' && v !== '993' && v !== 'INBOX' && v !== 'tls' && v !== 'twilio').some(Boolean);
      setStatus(hasConfig ? 'ok' : 'fail');
      if (hasConfig) {
        localStorage.setItem(`crm_${which}`, JSON.stringify(cfg));
        addNotification(`${which.toUpperCase()} connection verified!`);
      } else {
        addNotification(`${which.toUpperCase()} test failed — fill in all required fields`, 'error');
      }
    }, 1800);
  };

  const handleSave = () => {
    localStorage.setItem('crm_smtp', JSON.stringify(smtp));
    localStorage.setItem('crm_imap', JSON.stringify(imap));
    localStorage.setItem('crm_sms', JSON.stringify(sms));
    addNotification('Email & SMS settings saved!');
  };

  const sendTest = () => {
    if (!testEmail) { addNotification('Enter a recipient email address', 'error'); return; }
    setSendingTest(true);
    setTimeout(() => {
      setSendingTest(false);
      addNotification(`Test email sent to ${testEmail}!`);
    }, 1500);
  };

  const sectionHead = (icon: React.ReactElement, title: string, desc: string, badge?: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ width: '42px', height: '42px', borderRadius: '12px', backgroundColor: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0 }}>{title}</h4>
          {badge && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#ecfdf5', color: '#15803d', fontWeight: 600 }}>{badge}</span>}
        </div>
        <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0' }}>{desc}</p>
      </div>
    </div>
  );

  const card = (children: React.ReactNode) => (
    <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px', marginBottom: '20px' }}>
      {children}
    </div>
  );

  const presets = [
    { label: 'Gmail', host: 'smtp.gmail.com', port: '587', encryption: 'tls', imapHost: 'imap.gmail.com', imapPort: '993' },
    { label: 'Outlook', host: 'smtp-mail.outlook.com', port: '587', encryption: 'tls', imapHost: 'outlook.office365.com', imapPort: '993' },
    { label: 'Mailgun', host: 'smtp.mailgun.org', port: '587', encryption: 'tls', imapHost: '', imapPort: '' },
    { label: 'SendGrid', host: 'smtp.sendgrid.net', port: '587', encryption: 'tls', imapHost: '', imapPort: '' },
    { label: 'AWS SES', host: 'email-smtp.us-east-1.amazonaws.com', port: '587', encryption: 'tls', imapHost: '', imapPort: '' },
    { label: 'Zoho', host: 'smtp.zoho.com', port: '587', encryption: 'tls', imapHost: 'imap.zoho.com', imapPort: '993' },
  ];

  return (
    <div>
      {/* API Email Provider — for campaigns */}
      <EmailProviderCard />

      {/* Quick-preset bar */}
      {card(
        <>
          {sectionHead(<Mail size={20} color="#6366f1" />, 'Outgoing Email (SMTP)', 'Traditional SMTP for transactional emails')}
          <div style={{ marginBottom: '16px' }}>
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>Quick-fill presets</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {presets.map(p => (
                <button key={p.label} onClick={() => {
                  setSMTP(prev => ({ ...prev, host: p.host, port: p.port, encryption: p.encryption }));
                  setIMAP(prev => ({ ...prev, host: p.imapHost, port: p.imapPort }));
                }}
                  style={{ padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', backgroundColor: smtp.host === p.host ? '#f5f3ff' : 'white', color: smtp.host === p.host ? '#6366f1' : '#374151', fontWeight: 500 }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
            <Field label="SMTP Host" value={smtp.host} onChange={v => setSf('host', v)} placeholder="smtp.gmail.com" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <Field label="Port" value={smtp.port} onChange={v => setSf('port', v)} placeholder="587" />
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '5px' }}>Encryption</label>
                <select value={smtp.encryption} onChange={e => setSf('encryption', e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', backgroundColor: 'white', boxSizing: 'border-box' }}>
                  <option value="tls">STARTTLS</option>
                  <option value="ssl">SSL/TLS</option>
                  <option value="none">None</option>
                </select>
              </div>
            </div>
            <Field label="SMTP Username" value={smtp.user} onChange={v => setSf('user', v)} placeholder="you@example.com" />
            <Field label="SMTP Password / App Key" value={smtp.pass} onChange={v => setSf('pass', v)} type="password" placeholder="••••••••" />
            <Field label="From Name" value={smtp.fromName} onChange={v => setSf('fromName', v)} placeholder="CRMPro Sales" />
            <Field label="From Email Address" value={smtp.fromEmail} onChange={v => setSf('fromEmail', v)} placeholder="hello@yourdomain.com" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <TestBtn status={smtpStatus} onTest={() => runTest('smtp')} />
            {smtpStatus === 'ok' && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1 }}>
                <input value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="Send test email to…"
                  style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', width: '220px' }} />
                <button onClick={sendTest} disabled={sendingTest}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: sendingTest ? 'not-allowed' : 'pointer', opacity: sendingTest ? 0.7 : 1 }}>
                  {sendingTest ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />} Send Test
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {card(
        <>
          {sectionHead(<Inbox size={20} color="#0891b2" />, 'Incoming Email (IMAP)', 'Sync replies and incoming emails into Conversations', 'Bi-directional')}
          <div style={{ padding: '12px 16px', backgroundColor: '#f0f9ff', borderRadius: '10px', border: '1px solid #bae6fd', marginBottom: '16px' }}>
            <p style={{ fontSize: '12px', color: '#0369a1', margin: 0 }}>
              <strong>How it works:</strong> The CRM polls this mailbox every 5 minutes. Replies from contacts are automatically matched to their conversation thread and appear in the Conversations tab in real-time.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
            <Field label="IMAP Host" value={imap.host} onChange={v => setIf('host', v)} placeholder="imap.gmail.com" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <Field label="Port" value={imap.port} onChange={v => setIf('port', v)} placeholder="993" />
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '5px' }}>Folder</label>
                <input value={imap.folder} onChange={e => setIf('folder', e.target.value)} placeholder="INBOX"
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <Field label="IMAP Username" value={imap.user} onChange={v => setIf('user', v)} placeholder="you@example.com" />
            <Field label="IMAP Password / App Key" value={imap.pass} onChange={v => setIf('pass', v)} type="password" placeholder="••••••••" />
          </div>
          <TestBtn status={imapStatus} onTest={() => runTest('imap')} label="Test IMAP Connection" />
        </>
      )}

      {card(
        <>
          {sectionHead(<MessageSquare size={20} color="#0d9488" />, 'SMS Provider', 'Send and receive SMS messages through your CRM')}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            {(['twilio', 'vonage', 'plivo', 'bandwidth'] as const).map(p => (
              <button key={p} onClick={() => setSsf('provider', p)}
                style={{ padding: '8px 16px', border: `2px solid ${sms.provider === p ? '#0d9488' : '#e2e8f0'}`, borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', backgroundColor: sms.provider === p ? '#f0fdfa' : 'white', color: sms.provider === p ? '#0d9488' : '#64748b', textTransform: 'capitalize' }}>
                {p === 'vonage' ? 'Vonage (Nexmo)' : p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>

          {sms.provider === 'twilio' && (
            <div style={{ padding: '12px 16px', backgroundColor: '#f0fdfa', borderRadius: '10px', border: '1px solid #99f6e4', marginBottom: '16px' }}>
              <p style={{ fontSize: '12px', color: '#0f766e', margin: 0 }}>
                Get your Account SID and Auth Token from <strong>console.twilio.com</strong> → Account → API Keys. Buy a phone number in the Twilio console to use as the sender.
              </p>
            </div>
          )}
          {sms.provider === 'vonage' && (
            <div style={{ padding: '12px 16px', backgroundColor: '#f0fdfa', borderRadius: '10px', border: '1px solid #99f6e4', marginBottom: '16px' }}>
              <p style={{ fontSize: '12px', color: '#0f766e', margin: 0 }}>
                Get your API Key and Secret from <strong>dashboard.nexmo.com</strong> → API Settings.
              </p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
            <Field label={sms.provider === 'twilio' ? 'Account SID' : 'API Key'} value={sms.accountSid} onChange={v => setSsf('accountSid', v)} placeholder={sms.provider === 'twilio' ? 'ACxxxxxxxxxxxxxxxx' : 'api-key'} />
            <Field label={sms.provider === 'twilio' ? 'Auth Token' : 'API Secret'} value={sms.authToken} onChange={v => setSsf('authToken', v)} type="password" placeholder="••••••••" />
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '5px' }}>From Phone Number</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Phone size={16} color="#64748b" style={{ flexShrink: 0 }} />
                <input value={sms.fromNumber} onChange={e => setSsf('fromNumber', e.target.value)} placeholder="+15551234567"
                  style={{ flex: 1, padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none' }} />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '5px' }}>Webhook URL (for incoming SMS)</label>
              <div style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', color: '#6366f1', backgroundColor: '#f8fafc', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                https://azeem-654.github.io/calude/api/sms/inbound
              </div>
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0 0' }}>Paste this URL in your SMS provider's webhook settings</p>
            </div>
          </div>
          <TestBtn status={smsStatus} onTest={() => runTest('sms')} label="Test SMS Provider" />
        </>
      )}

      {/* Delivery status / log preview */}
      {card(
        <>
          {sectionHead(<Send size={20} color="#f59e0b" />, 'Message Delivery Log', 'Recent outgoing messages and delivery status')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {[
              { to: 'sarah@example.com', subject: 'Welcome to your trial!', channel: 'email', status: 'delivered', time: '2 min ago' },
              { to: '+15559990001', subject: 'Follow-up reminder', channel: 'sms', status: 'delivered', time: '5 min ago' },
              { to: 'mike@techcorp.com', subject: 'Your 50% off trial upgrade', channel: 'email', status: 'opened', time: '12 min ago' },
              { to: 'emily@startup.io', subject: 'Quick question, Emily', channel: 'email', status: 'bounced', time: '1 hour ago' },
              { to: '+15559990002', subject: 'Hi, this is a reminder…', channel: 'sms', status: 'failed', time: '2 hours ago' },
            ].map((row, i) => {
              const sc: Record<string, { bg: string; color: string }> = {
                delivered: { bg: '#f0fdf4', color: '#16a34a' },
                opened: { bg: '#eff6ff', color: '#2563eb' },
                bounced: { bg: '#fef2f2', color: '#dc2626' },
                failed: { bg: '#fef2f2', color: '#dc2626' },
              };
              const s = sc[row.status];
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: '1px solid #f8fafc' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: row.channel === 'email' ? '#eff6ff' : '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {row.channel === 'email' ? <Mail size={14} color="#2563eb" /> : <MessageSquare size={14} color="#0d9488" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.subject}</p>
                    <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0' }}>To: {row.to}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                    <span style={{ fontSize: '11px', padding: '2px 10px', borderRadius: '10px', backgroundColor: s.bg, color: s.color, fontWeight: 600, textTransform: 'capitalize' }}>{row.status}</span>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>{row.time}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <button onClick={handleSave}
          style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '11px 24px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
          <Save size={16} /> Save All Settings
        </button>
      </div>
    </div>
  );
}

/* ─── Main Settings ─── */

const tabs = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'email-sms', label: 'Email & SMS', icon: Mail },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'integrations', label: 'Integrations', icon: Globe },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'branding', label: 'Branding', icon: Palette },
];

export default function Settings() {
  const { addNotification } = useApp();
  const [activeTab, setActiveTab] = useState('email-sms');
  const [profile, setProfile] = useState({ firstName: 'John', lastName: 'Doe', email: 'john@crmpro.com', phone: '+1 (555) 123-4567', company: 'CRMPro Inc.', timezone: 'America/New_York' });
  const [notifications, setNotifications] = useState({ emailNew: true, emailReplied: true, smsNew: false, dealClosed: true, appointmentReminder: true, weeklyReport: true });
  const [billing] = useState({ plan: 'Pro', price: '$297/mo', nextBilling: '2024-06-21', seats: 5 });
  const [integrations, setIntegrations] = useState([
    { name: 'Stripe', description: 'Payment processing', connected: true, logo: '💳' },
    { name: 'Google Calendar', description: 'Sync appointments', connected: true, logo: '📅' },
    { name: 'Twilio', description: 'SMS & voice calls', connected: true, logo: '📱' },
    { name: 'SendGrid', description: 'Email delivery', connected: false, logo: '📧' },
    { name: 'Zapier', description: 'Automation workflows', connected: false, logo: '⚡' },
    { name: 'Facebook Ads', description: 'Lead generation', connected: false, logo: '📘' },
  ]);

  const handleSave = () => addNotification('Settings saved successfully!');

  return (
    <div>
      <Header title="Settings" subtitle="Account · Email & SMS · Integrations" />
      <div style={{ padding: '24px 28px', display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
        {/* Sidebar */}
        <div style={{ width: '220px', flexShrink: 0, position: 'sticky', top: '24px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', border: 'none', backgroundColor: activeTab === tab.id ? '#f0f4ff' : 'white', color: activeTab === tab.id ? '#6366f1' : '#374151', fontSize: '14px', fontWeight: activeTab === tab.id ? 600 : 400, cursor: 'pointer', textAlign: 'left', borderLeft: activeTab === tab.id ? '3px solid #6366f1' : '3px solid transparent', transition: 'all 0.1s', borderBottom: '1px solid #f1f5f9' }}>
                <tab.icon size={16} />
                {tab.label}
                {tab.id === 'email-sms' && <span style={{ marginLeft: 'auto', fontSize: '9px', padding: '2px 6px', borderRadius: '8px', backgroundColor: '#6366f1', color: 'white', fontWeight: 700 }}>NEW</span>}
                {tab.id !== 'email-sms' && <ChevronRight size={14} style={{ marginLeft: 'auto', opacity: 0.4 }} />}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {activeTab === 'email-sms' && <EmailSMSTab />}

          {activeTab === 'profile' && (
            <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '20px' }}>Profile Information</h3>
              <div style={{ display: 'flex', gap: '20px', marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '28px', fontWeight: 700, flexShrink: 0 }}>JD</div>
                <div>
                  <p style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', margin: '0 0 4px' }}>John Doe</p>
                  <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 10px' }}>Admin · CRMPro Inc.</p>
                  <button style={{ padding: '7px 14px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', backgroundColor: 'white', color: '#374151', fontWeight: 500 }}>Change Photo</button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                {[
                  { label: 'First Name', key: 'firstName' }, { label: 'Last Name', key: 'lastName' },
                  { label: 'Email', key: 'email' }, { label: 'Phone', key: 'phone' },
                  { label: 'Company', key: 'company' }, { label: 'Timezone', key: 'timezone' },
                ].map(({ label, key }) => (
                  <div key={key}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>{label}</label>
                    <input value={(profile as Record<string, string>)[key]} onChange={e => setProfile(p => ({ ...p, [key]: e.target.value }))}
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                ))}
              </div>
              <button onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                <Save size={15} /> Save Changes
              </button>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '20px' }}>Notification Preferences</h3>
              {[
                { key: 'emailNew', label: 'New email received', desc: 'Get notified when a new email arrives' },
                { key: 'emailReplied', label: 'Email replied', desc: 'When a contact replies to your email' },
                { key: 'smsNew', label: 'New SMS', desc: 'Incoming text messages' },
                { key: 'dealClosed', label: 'Deal closed', desc: 'When a deal is marked as won or lost' },
                { key: 'appointmentReminder', label: 'Appointment reminders', desc: '30 minutes before scheduled appointments' },
                { key: 'weeklyReport', label: 'Weekly report', desc: 'Performance summary every Monday' },
              ].map(({ key, label, desc }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: 500, color: '#374151', margin: 0 }}>{label}</p>
                    <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>{desc}</p>
                  </div>
                  <Toggle value={(notifications as Record<string, boolean>)[key]} onChange={v => setNotifications(p => ({ ...p, [key]: v }))} />
                </div>
              ))}
              <button onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginTop: '16px' }}>
                <Save size={15} /> Save Preferences
              </button>
            </div>
          )}

          {activeTab === 'integrations' && (
            <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '20px' }}>Third-Party Integrations</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {integrations.map((intg, idx) => (
                  <div key={intg.name} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', borderRadius: '10px', border: `1px solid ${intg.connected ? '#bbf7d0' : '#e2e8f0'}`, backgroundColor: intg.connected ? '#f0fdf4' : 'white' }}>
                    <span style={{ fontSize: '28px' }}>{intg.logo}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', margin: 0 }}>{intg.name}</p>
                      <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>{intg.description}</p>
                    </div>
                    <button onClick={() => {
                      setIntegrations(prev => prev.map((it, i) => i === idx ? { ...it, connected: !it.connected } : it));
                      addNotification(intg.connected ? `${intg.name} disconnected` : `${intg.name} connected!`, intg.connected ? 'info' : 'success');
                    }}
                      style={{ padding: '6px 14px', borderRadius: '8px', border: `1px solid ${intg.connected ? '#d1fae5' : '#e2e8f0'}`, backgroundColor: intg.connected ? '#ecfdf5' : 'white', color: intg.connected ? '#16a34a' : '#374151', fontSize: '12px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                      {intg.connected ? '✓ Connected' : 'Connect'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'billing' && (
            <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '20px' }}>Billing & Subscription</h3>
              <div style={{ padding: '20px', borderRadius: '10px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ fontSize: '12px', opacity: 0.8, margin: '0 0 4px' }}>Current Plan</p>
                    <p style={{ fontSize: '24px', fontWeight: 800, margin: 0 }}>{billing.plan} <span style={{ fontSize: '14px', fontWeight: 400 }}>{billing.price}</span></p>
                    <p style={{ fontSize: '12px', opacity: 0.8, margin: '8px 0 0' }}>Next billing: {billing.nextBilling} · {billing.seats} seats</p>
                  </div>
                  <button style={{ padding: '8px 16px', backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>Upgrade</button>
                </div>
              </div>
            </div>
          )}

          {(activeTab === 'security' || activeTab === 'branding') && (
            <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
                {activeTab === 'security' ? 'Security Settings' : 'Branding'}
              </h3>
              <div style={{ padding: '40px', textAlign: 'center', border: '2px dashed #e2e8f0', borderRadius: '10px', color: '#94a3b8', marginTop: '16px' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>{activeTab === 'security' ? '🔒' : '🎨'}</div>
                <p style={{ fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Coming Soon</p>
                <p style={{ fontSize: '13px' }}>This section is under development</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
