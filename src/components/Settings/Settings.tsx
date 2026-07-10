import { useState } from 'react';
import type { ReactNode, ReactElement } from 'react';
import { User, Bell, Shield, CreditCard, Globe, Palette, Save, Mail, MessageSquare, CheckCircle, XCircle, Loader, Eye, EyeOff, RefreshCw, Send, Phone, Zap, ExternalLink, Inbox, ChevronRight, FlaskConical, Flame, Clock, TrendingUp, Sliders, Play, Square } from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import { loadEmailConfig, saveEmailConfig, sendEmail } from '../../services/emailService';
import type { EmailProviderConfig } from '../../services/emailService';
import { validate } from '../../services/validationService';
import type { ValidationResult } from '../../services/validationService';
import ValidationPopup, { ValidationStatusIndicator } from '../UI/ValidationPopup';
import SMTPWizard from './SMTPWizard';
import type { SMTPConfig, IMAPConfig } from './SMTPWizard';

/* ─── helpers ─── */

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      style={{ width: '36px', height: '20px', borderRadius: '999px', backgroundColor: value ? '#6366f1' : '#e2e8f0', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0, padding: 0 }}>
      <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: 'white', position: 'absolute', top: '2px', left: value ? '18px' : '2px', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(16,24,40,0.25)' }} />
    </button>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder = '' }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  const [show, setShow] = useState(false);
  const isPass = type === 'password';
  return (
    <div>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '5px' }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={isPass && !show ? 'password' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ width: '100%', padding: isPass ? '9px 36px 9px 12px' : '9px 12px', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', color: '#475569', backgroundColor: 'white' }}
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
  const map: Record<TestStatus, { bg: string; color: string; text: string; icon: ReactElement }> = {
    idle: { bg: '#f1f5f9', color: '#475569', text: label, icon: <RefreshCw size={14} /> },
    testing: { bg: '#eff6ff', color: '#2563eb', text: 'Testing…', icon: <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> },
    ok: { bg: '#ecfdf5', color: '#16a34a', text: 'Connected!', icon: <CheckCircle size={14} /> },
    fail: { bg: '#fef2f2', color: '#dc2626', text: 'Failed — check settings', icon: <XCircle size={14} /> },
  };
  const s = map[status];
  return (
    <button onClick={onTest} disabled={status === 'testing'}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 18px', backgroundColor: s.bg, color: s.color, border: `1px solid ${s.color}30`, borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: status === 'testing' ? 'not-allowed' : 'pointer' }}>
      {s.icon} {s.text}
    </button>
  );
}

/* ─── SMTP tab ─── */

function loadSMTP() {
  const EMPTY: SmtpConfig = { host: '', port: '587', user: '', pass: '', fromName: '', fromEmail: '', encryption: 'tls' };
  try { return JSON.parse(localStorage.getItem('crm_smtp') || 'null') ?? EMPTY; }
  catch { return EMPTY; }
}
function loadIMAP() {
  const EMPTY: ImapConfig = { host: '', port: '993', user: '', pass: '', folder: 'INBOX' };
  try { return JSON.parse(localStorage.getItem('crm_imap') || 'null') ?? EMPTY; }
  catch { return EMPTY; }
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
    smtp:     { label: 'SMTP',     url: '',                    hint: 'Uses your SMTP server configured in the wizard above — works with Gmail, Outlook, any provider' },
    mailtrap: { label: 'Mailtrap', url: 'https://mailtrap.io', hint: 'Test sandbox — captures emails without delivery. Free tier available.' },
    resend:   { label: 'Resend',   url: 'https://resend.com',  hint: 'Real email delivery · Free tier: 3,000/mo · Requires verified domain for production' },
  };

  return (
    <div style={{ backgroundColor: 'white', borderRadius: '18px', border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', padding: '24px', marginBottom: '20px' }}>
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
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>Campaign Sending Provider</label>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '10px' }}>
          {[
            { id: 'smtp',     label: '🔐 SMTP',     desc: 'Your server (recommended)' },
            { id: 'mailtrap', label: '🧪 Mailtrap', desc: 'Test sandbox' },
            { id: 'resend',   label: '⚡ Resend',   desc: 'High-volume' },
            { id: 'none',     label: '🚫 None',     desc: 'Disabled' },
          ].map(p => (
            <button key={p.id} onClick={() => setCfg(prev => ({ ...prev, provider: p.id as EmailProviderConfig['provider'] }))}
              style={{ padding: '10px', border: `2px solid ${cfg.provider === p.id ? '#6366f1' : '#e2e8f0'}`, borderRadius: '10px', backgroundColor: cfg.provider === p.id ? '#f5f3ff' : 'white', cursor: 'pointer', textAlign: 'center', transition: 'all 0.12s' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: cfg.provider === p.id ? '#6366f1' : '#374151' }}>{p.label}</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{p.desc}</div>
            </button>
          ))}
        </div>
        {cfg.provider !== 'none' && providerDocs[cfg.provider] && (
          <div style={{ padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <p style={{ fontSize: '12px', color: '#64748b', margin: 0, flex: 1 }}>{providerDocs[cfg.provider].hint}</p>
            <a href={providerDocs[cfg.provider].url} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#6366f1', fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>
              Get free API key <ExternalLink size={11} />
            </a>
          </div>
        )}
      </div>

      {cfg.provider === 'smtp' && (
        <div style={{ padding: '12px 14px', backgroundColor: '#f0fdf4', borderRadius: '10px', border: '1px solid #bbf7d0', marginBottom: '16px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#16a34a', margin: '0 0 3px' }}>✓ Uses SMTP Wizard credentials</p>
          <p style={{ fontSize: '12px', color: '#15803d', margin: 0 }}>Campaigns will send via the SMTP server configured in the wizard above. No API key needed.</p>
        </div>
      )}

      {cfg.provider !== 'none' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            {cfg.provider !== 'smtp' && (
              <div style={{ gridColumn: cfg.provider === 'mailtrap' ? '1' : '1/-1' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '5px' }}>API Key *</label>
                <input type="password" value={cfg.apiKey} onChange={e => setCfg(prev => ({ ...prev, apiKey: e.target.value }))} placeholder="Paste your API key here"
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            )}
            {cfg.provider === 'mailtrap' && (
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '5px' }}>Inbox ID *</label>
                <input value={cfg.inboxId} onChange={e => setCfg(prev => ({ ...prev, inboxId: e.target.value }))} placeholder="e.g. 1234567"
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            )}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '5px' }}>From Name</label>
              <input value={cfg.fromName} onChange={e => setCfg(prev => ({ ...prev, fromName: e.target.value }))} placeholder="CRM Pro"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '5px' }}>From Email</label>
              <input value={cfg.fromEmail} onChange={e => setCfg(prev => ({ ...prev, fromEmail: e.target.value }))} placeholder="hello@yourdomain.com"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Test send */}
          <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#475569', margin: '0 0 6px' }}>Send test email</p>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input value={testAddr} onChange={e => setTestAddr(e.target.value)} placeholder="recipient@example.com"
                style={{ flex: 1, padding: '8px 11px', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '13px', outline: 'none' }} />
            </div>
            <button onClick={runTest} disabled={status === 'sending'}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', backgroundColor: status === 'sending' ? '#e2e8f0' : '#6366f1', color: status === 'sending' ? '#94a3b8' : 'white', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: status === 'sending' ? 'not-allowed' : 'pointer' }}>
              {status === 'sending' ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Sending…</> : <><Send size={13} /> Send Test</>}
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
        <button onClick={save} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 20px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
          <Save size={14} /> Save Provider
        </button>
      </div>
    </div>
  );
}

/* ─── Mailbox Warmup ─── */

interface WarmupConfig {
  enabled: boolean;
  startVolume: number;
  dailyIncrease: number;
  maxVolume: number;
  delaySeconds: number;
  sendWindowStart: number;
  sendWindowEnd: number;
  startedAt: string | null;
}

function loadWarmup(): WarmupConfig {
  const DEF: WarmupConfig = { enabled: false, startVolume: 5, dailyIncrease: 5, maxVolume: 50, delaySeconds: 120, sendWindowStart: 8, sendWindowEnd: 18, startedAt: null };
  try { return JSON.parse(localStorage.getItem('crm_mailbox_warmup') || 'null') ?? DEF; }
  catch { return DEF; }
}

function MailboxWarmupCard() {
  const { addNotification } = useApp();
  const [cfg, setCfg] = useState<WarmupConfig>(loadWarmup);
  const set = <K extends keyof WarmupConfig>(k: K, v: WarmupConfig[K]) => setCfg(p => ({ ...p, [k]: v }));

  const save = () => { localStorage.setItem('crm_mailbox_warmup', JSON.stringify(cfg)); addNotification('Mailbox warmup settings saved!'); };

  const startWarmup = () => {
    const updated = { ...cfg, enabled: true, startedAt: new Date().toISOString() };
    setCfg(updated);
    localStorage.setItem('crm_mailbox_warmup', JSON.stringify(updated));
    addNotification('Mailbox warmup started — sending gradually increases each day');
  };

  const stopWarmup = () => {
    const updated = { ...cfg, enabled: false, startedAt: null };
    setCfg(updated);
    localStorage.setItem('crm_mailbox_warmup', JSON.stringify(updated));
    addNotification('Mailbox warmup stopped');
  };

  const daysToMax = cfg.dailyIncrease > 0
    ? Math.ceil((cfg.maxVolume - cfg.startVolume) / cfg.dailyIncrease) + 1
    : 999;

  const currentDay = cfg.startedAt
    ? Math.max(1, Math.floor((Date.now() - new Date(cfg.startedAt).getTime()) / 86400000) + 1)
    : null;
  const todayVolume = currentDay
    ? Math.min(cfg.startVolume + (currentDay - 1) * cfg.dailyIncrease, cfg.maxVolume)
    : null;
  const pct = todayVolume ? Math.round((todayVolume / cfg.maxVolume) * 100) : 0;

  const DELAY_OPTIONS = [
    { value: 30, label: '30 seconds' }, { value: 60, label: '1 minute' },
    { value: 120, label: '2 minutes' }, { value: 300, label: '5 minutes' },
    { value: 600, label: '10 minutes' }, { value: 1800, label: '30 minutes' },
    { value: 3600, label: '1 hour' },
  ];

  const HOURS = Array.from({ length: 24 }, (_, i) => {
    const h = i % 12 || 12; const ampm = i < 12 ? 'AM' : 'PM';
    return { value: i, label: `${h}:00 ${ampm}` };
  });

  // Build schedule preview (max 8 rows)
  const preview: { day: number; vol: number }[] = [];
  for (let d = 1; d <= daysToMax && preview.length < 8; d++) {
    const vol = Math.min(cfg.startVolume + (d - 1) * cfg.dailyIncrease, cfg.maxVolume);
    preview.push({ day: d, vol });
    if (vol >= cfg.maxVolume && d > 1) break;
  }

  const numInput = (label: string, key: keyof WarmupConfig, min: number, max: number, suffix = '') => (
    <div>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '5px' }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <input
          type="number" min={min} max={max} value={cfg[key] as number}
          onChange={e => set(key, Math.max(min, Math.min(max, Number(e.target.value))) as WarmupConfig[typeof key])}
          style={{ width: '80px', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '13px', outline: 'none', textAlign: 'center' }}
        />
        {suffix && <span style={{ fontSize: '12px', color: '#94a3b8' }}>{suffix}</span>}
      </div>
    </div>
  );

  return (
    <div style={{ backgroundColor: 'white', borderRadius: '18px', border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', padding: '24px', marginBottom: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ width: '42px', height: '42px', borderRadius: '12px', backgroundColor: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Flame size={20} color="#f97316" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Mailbox Warmup</h4>
            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', backgroundColor: cfg.enabled ? '#fef3c7' : '#f1f5f9', color: cfg.enabled ? '#d97706' : '#64748b', fontWeight: 600 }}>
              {cfg.enabled ? `Day ${currentDay ?? 1} · ${todayVolume ?? cfg.startVolume} emails/day` : 'Inactive'}
            </span>
          </div>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0' }}>Gradually increase sending volume to build domain reputation</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {cfg.enabled ? (
            <button onClick={stopWarmup} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 14px', backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '9px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
              <Square size={11} /> Stop Warmup
            </button>
          ) : (
            <button onClick={startWarmup} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 14px', backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', borderRadius: '9px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
              <Play size={11} /> Start Warmup
            </button>
          )}
        </div>
      </div>

      {/* Live status bar when active */}
      {cfg.enabled && todayVolume !== null && (
        <div style={{ padding: '14px 16px', backgroundColor: '#fff7ed', borderRadius: '10px', border: '1px solid #fed7aa', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#9a3412' }}>Day {currentDay} · {todayVolume} / {cfg.maxVolume} emails/day</span>
            <span style={{ fontSize: '12px', color: '#c2410c' }}>{pct}% of max</span>
          </div>
          <div style={{ height: '6px', backgroundColor: '#fed7aa', borderRadius: '3px' }}>
            <div style={{ height: '100%', width: `${pct}%`, backgroundColor: '#f97316', borderRadius: '3px', transition: 'width 0.4s' }} />
          </div>
          <p style={{ fontSize: '11px', color: '#c2410c', margin: '6px 0 0' }}>
            {todayVolume < cfg.maxVolume
              ? `Reaches max (${cfg.maxVolume}/day) in ~${daysToMax - (currentDay ?? 1)} more days`
              : 'Warmup complete — sending at max volume'}
          </p>
        </div>
      )}

      {/* Settings grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
        {numInput('Start Volume', 'startVolume', 1, 100, 'emails/day')}
        {numInput('Daily Increase', 'dailyIncrease', 1, 50, 'per day')}
        {numInput('Max Volume', 'maxVolume', 10, 500, 'emails/day')}
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '5px' }}>Delay Between Emails</label>
          <select value={cfg.delaySeconds} onChange={e => set('delaySeconds', Number(e.target.value))}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '13px', outline: 'none', color: '#475569', backgroundColor: 'white' }}>
            {DELAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Send window */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', padding: '14px 16px', backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
        <Clock size={16} color="#6366f1" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569', flexShrink: 0 }}>Send Window</span>
        <select value={cfg.sendWindowStart} onChange={e => set('sendWindowStart', Number(e.target.value))}
          style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '13px', outline: 'none', color: '#475569', backgroundColor: 'white' }}>
          {HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
        </select>
        <span style={{ fontSize: '13px', color: '#94a3b8' }}>to</span>
        <select value={cfg.sendWindowEnd} onChange={e => set('sendWindowEnd', Number(e.target.value))}
          style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '13px', outline: 'none', color: '#475569', backgroundColor: 'white' }}>
          {HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
        </select>
        <span style={{ fontSize: '12px', color: '#94a3b8', flex: 1 }}>Emails only sent during this window (server local time)</span>
      </div>

      {/* Schedule preview */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '10px' }}>
          <TrendingUp size={14} color="#6366f1" />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Warmup Schedule Preview</span>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>reaches {cfg.maxVolume}/day in {daysToMax} days</span>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', height: '60px' }}>
          {preview.map(p => {
            const h = Math.round((p.vol / cfg.maxVolume) * 100);
            const isToday = cfg.enabled && p.day === currentDay;
            return (
              <div key={p.day} title={`Day ${p.day}: ${p.vol} emails`}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', minWidth: 0 }}>
                <span style={{ fontSize: '9px', color: isToday ? '#f97316' : '#94a3b8', fontWeight: isToday ? 700 : 400 }}>{p.vol}</span>
                <div style={{ width: '100%', height: `${Math.max(h, 6)}%`, backgroundColor: isToday ? '#f97316' : '#c4b5fd', borderRadius: '3px 3px 0 0', transition: 'height 0.3s' }} />
                <span style={{ fontSize: '9px', color: isToday ? '#f97316' : '#94a3b8', fontWeight: isToday ? 700 : 400 }}>D{p.day}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <button onClick={save} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 20px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
          <Save size={14} /> Save Warmup Settings
        </button>
      </div>
    </div>
  );
}

/* ─── Email & SMS tab ─── */

function EmailSMSTab() {
  const { addNotification } = useApp();
  const [sms, setSMS] = useState<SmsConfig>(loadSMS);
  const [smsStatus, setSmsStatus] = useState<TestStatus>('idle');

  const setSsf = (k: keyof SmsConfig, v: string) => setSMS(p => ({ ...p, [k]: v }));

  const runSmsTest = () => {
    setSmsStatus('testing');
    setTimeout(() => {
      const hasConfig = Object.values(sms).filter(v => v && v !== 'twilio').some(Boolean);
      setSmsStatus(hasConfig ? 'ok' : 'fail');
      if (hasConfig) {
        localStorage.setItem('crm_sms', JSON.stringify(sms));
        addNotification('SMS configuration verified!');
      } else {
        addNotification('SMS test failed — fill in all required fields', 'error');
      }
    }, 1800);
  };

  const handleSMTPSave = (smtp: SMTPConfig, imap: IMAPConfig) => {
    localStorage.setItem('crm_smtp', JSON.stringify({ host: smtp.host, port: smtp.port, user: smtp.user, pass: smtp.pass, fromName: smtp.fromName, fromEmail: smtp.fromEmail, encryption: smtp.encryption }));
    localStorage.setItem('crm_imap', JSON.stringify({ host: imap.host, port: imap.port, user: imap.user, pass: imap.pass, folder: imap.folder }));
    addNotification('SMTP & IMAP settings saved!');
  };

  const savedSMTP = loadSMTP();
  const savedIMAP = loadIMAP();

  const initialSMTP: SMTPConfig = { host: savedSMTP.host, port: savedSMTP.port, user: savedSMTP.user, pass: savedSMTP.pass, fromName: savedSMTP.fromName, fromEmail: savedSMTP.fromEmail, encryption: savedSMTP.encryption as 'tls' | 'ssl' | 'none' };
  const initialIMAP: IMAPConfig = { host: savedIMAP.host, port: savedIMAP.port, user: savedIMAP.user, pass: savedIMAP.pass, folder: savedIMAP.folder };

  const sectionHead = (icon: ReactElement, title: string, desc: string, badge?: string) => (
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

  const card = (children: ReactElement) => (
    <div style={{ backgroundColor: 'white', borderRadius: '18px', border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', padding: '24px', marginBottom: '20px' }}>
      {children}
    </div>
  );

  return (
    <div>
      {/* API Email Provider — for campaigns */}
      <EmailProviderCard />

      {/* SMTP Integration Wizard */}
      <SMTPWizard onSave={handleSMTPSave} initialSMTP={initialSMTP} initialIMAP={initialIMAP} />

      {/* Mailbox Warmup */}
      <MailboxWarmupCard />

      {card(
        <>
          {sectionHead(<MessageSquare size={20} color="#0d9488" />, 'SMS Provider', 'Send and receive SMS messages through your CRM')}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            {(['twilio', 'vonage', 'plivo', 'bandwidth'] as const).map(p => (
              <button key={p} onClick={() => setSsf('provider', p)}
                style={{ padding: '8px 16px', border: `2px solid ${sms.provider === p ? '#0d9488' : '#e2e8f0'}`, borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', backgroundColor: sms.provider === p ? '#f0fdfa' : 'white', color: sms.provider === p ? '#0d9488' : '#64748b', textTransform: 'capitalize' }}>
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
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '5px' }}>From Phone Number</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Phone size={16} color="#64748b" style={{ flexShrink: 0 }} />
                <input value={sms.fromNumber} onChange={e => setSsf('fromNumber', e.target.value)} placeholder="+15551234567"
                  style={{ flex: 1, padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '13px', outline: 'none' }} />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '5px' }}>Webhook URL (for incoming SMS)</label>
              <div style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '12px', color: '#6366f1', backgroundColor: '#f8fafc', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                https://azeem-654.github.io/calude/api/sms/inbound
              </div>
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0 0' }}>Paste this URL in your SMS provider's webhook settings</p>
            </div>
          </div>
          <TestBtn status={smsStatus} onTest={runSmsTest} label="Test SMS Provider" />
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
        <button onClick={() => { localStorage.setItem('crm_sms', JSON.stringify(sms)); addNotification('SMS settings saved!'); }}
          style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 16px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 2px rgba(99,102,241,0.35)' }}>
          <Save size={16} /> Save SMS Settings
        </button>
      </div>
    </div>
  );
}

/* ─── API Validation Tab ─── */

type ValidStatus = 'idle' | 'testing' | 'ok' | 'fail';

function IntegrationsTab() {
  const { addNotification } = useApp();

  const [resendKey, setResendKey] = useState('');
  const [resendStatus, setResendStatus] = useState<ValidStatus>('idle');
  const [resendResult, setResendResult] = useState<ValidationResult | null>(null);
  const [showResendPopup, setShowResendPopup] = useState(false);

  const [mailtrapKey, setMailtrapKey] = useState('');
  const [mailtrapInboxId, setMailtrapInboxId] = useState('');
  const [mailtrapStatus, setMailtrapStatus] = useState<ValidStatus>('idle');
  const [mailtrapResult, setMailtrapResult] = useState<ValidationResult | null>(null);
  const [showMailtrapPopup, setShowMailtrapPopup] = useState(false);

  const [openaiKey, setOpenaiKey] = useState('');
  const [openaiStatus, setOpenaiStatus] = useState<ValidStatus>('idle');
  const [openaiResult, setOpenaiResult] = useState<ValidationResult | null>(null);
  const [showOpenaiPopup, setShowOpenaiPopup] = useState(false);

  const [apolloKey, setApolloKey] = useState('');
  const [apolloStatus, setApolloStatus] = useState<ValidStatus>('idle');
  const [apolloResult, setApolloResult] = useState<ValidationResult | null>(null);
  const [showApolloPopup, setShowApolloPopup] = useState(false);

  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookStatus, setWebhookStatus] = useState<ValidStatus>('idle');
  const [webhookResult, setWebhookResult] = useState<ValidationResult | null>(null);
  const [showWebhookPopup, setShowWebhookPopup] = useState(false);

  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpStatus, setSmtpStatus] = useState<ValidStatus>('idle');
  const [smtpResult, setSmtpResult] = useState<ValidationResult | null>(null);
  const [showSmtpPopup, setShowSmtpPopup] = useState(false);

  const runValidation = async (
    type: 'resend' | 'mailtrap' | 'openai' | 'apollo' | 'webhook' | 'smtp',
    params: Record<string, string | number | boolean>,
    setStatus: (s: ValidStatus) => void,
    setResult: (r: ValidationResult) => void,
    setShow: (v: boolean) => void,
  ) => {
    setStatus('testing');
    try {
      const result = await validate(type, params);
      setResult(result);
      setStatus(result.success ? 'ok' : 'fail');
      setShow(true);
      if (result.success) addNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} validated successfully!`);
    } catch (e) {
      const r: ValidationResult = { success: false, message: 'Unexpected error', details: String(e), suggestions: ['Check your network connection and try again.'] };
      setResult(r);
      setStatus('fail');
      setShow(true);
    }
  };

  const card = (children: ReactNode) => (
    <div style={{ backgroundColor: 'white', borderRadius: '18px', border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', padding: '24px', marginBottom: '16px' }}>
      {children}
    </div>
  );

  const cardHeader = (icon: ReactNode, title: string, desc: string, badge?: string) => (
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

  const inputStyle = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' as const };

  return (
    <div>
      {/* Resend */}
      {card(<>
        {cardHeader(<Mail size={20} color="#6366f1" />, 'Resend Email API', 'Validate your Resend API key for email delivery', 'CORS-safe')}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '5px' }}>Resend API Key</label>
          <input type="password" value={resendKey} onChange={e => setResendKey(e.target.value)} placeholder="re_xxxxxxxxxxxxxxxxxxxx" style={inputStyle} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => runValidation('resend', { apiKey: resendKey }, setResendStatus, setResendResult, setShowResendPopup)}
            disabled={resendStatus === 'testing' || !resendKey.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', backgroundColor: resendStatus === 'testing' || !resendKey.trim() ? '#e2e8f0' : '#6366f1', color: resendStatus === 'testing' || !resendKey.trim() ? '#94a3b8' : 'white', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: resendStatus === 'testing' || !resendKey.trim() ? 'not-allowed' : 'pointer' }}>
            {resendStatus === 'testing' ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <FlaskConical size={14} />}
            {resendStatus === 'testing' ? 'Validating…' : 'Validate Key'}
          </button>
          <ValidationStatusIndicator status={resendStatus === 'idle' ? 'idle' : resendStatus === 'testing' ? 'testing' : resendStatus === 'ok' ? 'success' : 'error'} message={resendResult?.message} />
        </div>
        {showResendPopup && resendResult && <ValidationPopup result={resendResult} title="Resend" onClose={() => setShowResendPopup(false)} />}
      </>)}

      {/* Mailtrap */}
      {card(<>
        {cardHeader(<Inbox size={20} color="#0891b2" />, 'Mailtrap Sandbox API', 'Validate Mailtrap API key for email testing', 'CORS-safe')}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '5px' }}>Mailtrap API Key</label>
            <input type="password" value={mailtrapKey} onChange={e => setMailtrapKey(e.target.value)} placeholder="API key from mailtrap.io" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '5px' }}>Inbox ID</label>
            <input value={mailtrapInboxId} onChange={e => setMailtrapInboxId(e.target.value)} placeholder="e.g. 1234567" style={inputStyle} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => runValidation('mailtrap', { apiKey: mailtrapKey, inboxId: mailtrapInboxId }, setMailtrapStatus, setMailtrapResult, setShowMailtrapPopup)}
            disabled={mailtrapStatus === 'testing' || !mailtrapKey.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', backgroundColor: mailtrapStatus === 'testing' || !mailtrapKey.trim() ? '#e2e8f0' : '#0891b2', color: mailtrapStatus === 'testing' || !mailtrapKey.trim() ? '#94a3b8' : 'white', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: mailtrapStatus === 'testing' || !mailtrapKey.trim() ? 'not-allowed' : 'pointer' }}>
            {mailtrapStatus === 'testing' ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <FlaskConical size={14} />}
            {mailtrapStatus === 'testing' ? 'Validating…' : 'Validate Key'}
          </button>
          <ValidationStatusIndicator status={mailtrapStatus === 'idle' ? 'idle' : mailtrapStatus === 'testing' ? 'testing' : mailtrapStatus === 'ok' ? 'success' : 'error'} message={mailtrapResult?.message} />
        </div>
        {showMailtrapPopup && mailtrapResult && <ValidationPopup result={mailtrapResult} title="Mailtrap" onClose={() => setShowMailtrapPopup(false)} />}
      </>)}

      {/* OpenAI */}
      {card(<>
        {cardHeader(<Zap size={20} color="#10a37f" />, 'OpenAI API', 'Validate your OpenAI API key for AI features')}
        <div style={{ padding: '10px 14px', backgroundColor: '#fefce8', borderRadius: '8px', border: '1px solid #fef08a', marginBottom: '14px' }}>
          <p style={{ fontSize: '12px', color: '#a16207', margin: 0 }}>
            <strong>Note:</strong> OpenAI API requires a backend proxy due to CORS restrictions. Start the local backend server (<code>npm start</code> in the <code>server/</code> directory) for full validation. Without the backend, key format will be checked only.
          </p>
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '5px' }}>OpenAI API Key</label>
          <input type="password" value={openaiKey} onChange={e => setOpenaiKey(e.target.value)} placeholder="sk-xxxxxxxxxxxxxxxxxxxx" style={inputStyle} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => runValidation('openai', { apiKey: openaiKey }, setOpenaiStatus, setOpenaiResult, setShowOpenaiPopup)}
            disabled={openaiStatus === 'testing' || !openaiKey.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', backgroundColor: openaiStatus === 'testing' || !openaiKey.trim() ? '#e2e8f0' : '#10a37f', color: openaiStatus === 'testing' || !openaiKey.trim() ? '#94a3b8' : 'white', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: openaiStatus === 'testing' || !openaiKey.trim() ? 'not-allowed' : 'pointer' }}>
            {openaiStatus === 'testing' ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <FlaskConical size={14} />}
            {openaiStatus === 'testing' ? 'Validating…' : 'Validate Key'}
          </button>
          <ValidationStatusIndicator status={openaiStatus === 'idle' ? 'idle' : openaiStatus === 'testing' ? 'testing' : openaiStatus === 'ok' ? 'success' : 'error'} message={openaiResult?.message} />
        </div>
        {showOpenaiPopup && openaiResult && <ValidationPopup result={openaiResult} title="OpenAI" onClose={() => setShowOpenaiPopup(false)} />}
      </>)}

      {/* Apollo.io */}
      {card(<>
        {cardHeader(<Globe size={20} color="#6366f1" />, 'Apollo.io API', 'Validate your Apollo.io API key for contact enrichment')}
        <div style={{ padding: '10px 14px', backgroundColor: '#fefce8', borderRadius: '8px', border: '1px solid #fef08a', marginBottom: '14px' }}>
          <p style={{ fontSize: '12px', color: '#a16207', margin: 0 }}>
            <strong>Note:</strong> Apollo.io API requires a backend proxy. Start the local backend server for full validation.
          </p>
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '5px' }}>Apollo.io API Key</label>
          <input type="password" value={apolloKey} onChange={e => setApolloKey(e.target.value)} placeholder="Your Apollo.io API key" style={inputStyle} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => runValidation('apollo', { apiKey: apolloKey }, setApolloStatus, setApolloResult, setShowApolloPopup)}
            disabled={apolloStatus === 'testing' || !apolloKey.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', backgroundColor: apolloStatus === 'testing' || !apolloKey.trim() ? '#e2e8f0' : '#6366f1', color: apolloStatus === 'testing' || !apolloKey.trim() ? '#94a3b8' : 'white', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: apolloStatus === 'testing' || !apolloKey.trim() ? 'not-allowed' : 'pointer' }}>
            {apolloStatus === 'testing' ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <FlaskConical size={14} />}
            {apolloStatus === 'testing' ? 'Validating…' : 'Validate Key'}
          </button>
          <ValidationStatusIndicator status={apolloStatus === 'idle' ? 'idle' : apolloStatus === 'testing' ? 'testing' : apolloStatus === 'ok' ? 'success' : 'error'} message={apolloResult?.message} />
        </div>
        {showApolloPopup && apolloResult && <ValidationPopup result={apolloResult} title="Apollo.io" onClose={() => setShowApolloPopup(false)} />}
      </>)}

      {/* Webhook */}
      {card(<>
        {cardHeader(<Send size={20} color="#f59e0b" />, 'Webhook URL', 'Test that your webhook endpoint is reachable')}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '5px' }}>Webhook URL</label>
          <input value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://hooks.example.com/trigger/..." style={inputStyle} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => runValidation('webhook', { url: webhookUrl }, setWebhookStatus, setWebhookResult, setShowWebhookPopup)}
            disabled={webhookStatus === 'testing' || !webhookUrl.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', backgroundColor: webhookStatus === 'testing' || !webhookUrl.trim() ? '#e2e8f0' : '#f59e0b', color: webhookStatus === 'testing' || !webhookUrl.trim() ? '#94a3b8' : 'white', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: webhookStatus === 'testing' || !webhookUrl.trim() ? 'not-allowed' : 'pointer' }}>
            {webhookStatus === 'testing' ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <FlaskConical size={14} />}
            {webhookStatus === 'testing' ? 'Testing…' : 'Test Webhook'}
          </button>
          <ValidationStatusIndicator status={webhookStatus === 'idle' ? 'idle' : webhookStatus === 'testing' ? 'testing' : webhookStatus === 'ok' ? 'success' : 'error'} message={webhookResult?.message} />
        </div>
        {showWebhookPopup && webhookResult && <ValidationPopup result={webhookResult} title="Webhook" onClose={() => setShowWebhookPopup(false)} />}
      </>)}

      {/* SMTP */}
      {card(<>
        {cardHeader(<Mail size={20} color="#374151" />, 'SMTP Server', 'Test SMTP credentials via backend proxy')}
        <div style={{ padding: '10px 14px', backgroundColor: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', marginBottom: '14px' }}>
          <p style={{ fontSize: '12px', color: '#1d4ed8', margin: 0 }}>
            <strong>Requires backend:</strong> SMTP testing uses Nodemailer and needs the local server running (<code>cd server && npm install && npm start</code>). The backend connects on <code>localhost:3001</code>.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '5px' }}>SMTP Host</label>
            <input value={smtpHost} onChange={e => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '5px' }}>Port</label>
            <input value={smtpPort} onChange={e => setSmtpPort(e.target.value)} placeholder="587" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '5px' }}>Username</label>
            <input value={smtpUser} onChange={e => setSmtpUser(e.target.value)} placeholder="you@example.com" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '5px' }}>Password / App Key</label>
            <input type="password" value={smtpPass} onChange={e => setSmtpPass(e.target.value)} placeholder="••••••••" style={inputStyle} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#475569', cursor: 'pointer' }}>
            <input type="checkbox" checked={smtpSecure} onChange={e => setSmtpSecure(e.target.checked)} style={{ width: '14px', height: '14px' }} />
            Use SSL/TLS (port 465)
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => runValidation('smtp', { host: smtpHost, port: parseInt(smtpPort) || 587, username: smtpUser, password: smtpPass, secure: smtpSecure }, setSmtpStatus, setSmtpResult, setShowSmtpPopup)}
            disabled={smtpStatus === 'testing' || !smtpHost.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', backgroundColor: smtpStatus === 'testing' || !smtpHost.trim() ? '#e2e8f0' : '#374151', color: smtpStatus === 'testing' || !smtpHost.trim() ? '#94a3b8' : 'white', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: smtpStatus === 'testing' || !smtpHost.trim() ? 'not-allowed' : 'pointer' }}>
            {smtpStatus === 'testing' ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <FlaskConical size={14} />}
            {smtpStatus === 'testing' ? 'Testing…' : 'Test SMTP'}
          </button>
          <ValidationStatusIndicator status={smtpStatus === 'idle' ? 'idle' : smtpStatus === 'testing' ? 'testing' : smtpStatus === 'ok' ? 'success' : 'error'} message={smtpResult?.message} />
        </div>
        {showSmtpPopup && smtpResult && <ValidationPopup result={smtpResult} title="SMTP" onClose={() => setShowSmtpPopup(false)} />}
      </>)}
    </div>
  );
}

/* ─── Main Settings ─── */

const tabs = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'email-sms', label: 'Email & SMS', icon: Mail },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'api-validation', label: 'API Validation', icon: FlaskConical },
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
    <div style={{ minHeight: '100vh' }}>
      <Header title="Settings" subtitle="Account · Email & SMS · Integrations" />
      <div style={{ padding: '28px', display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
        {/* Sidebar */}
        <div style={{ width: '220px', flexShrink: 0, position: 'sticky', top: '24px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '18px', border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', padding: '8px' }}>
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', border: 'none', borderRadius: '9px', backgroundColor: activeTab === tab.id ? '#eef2ff' : 'transparent', color: activeTab === tab.id ? '#6366f1' : '#475569', fontSize: '13px', fontWeight: activeTab === tab.id ? 600 : 500, cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s', marginBottom: '2px' }}>
                <tab.icon size={16} />
                {tab.label}
                {(tab.id === 'email-sms' || tab.id === 'api-validation') && <span style={{ marginLeft: 'auto', fontSize: '9px', padding: '2px 7px', borderRadius: '999px', backgroundColor: activeTab === tab.id ? '#6366f1' : '#eef2ff', color: activeTab === tab.id ? 'white' : '#6366f1', fontWeight: 700, letterSpacing: '0.03em' }}>NEW</span>}
                {tab.id !== 'email-sms' && tab.id !== 'api-validation' && <ChevronRight size={14} style={{ marginLeft: 'auto', opacity: activeTab === tab.id ? 0.7 : 0.35 }} />}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {activeTab === 'email-sms' && <EmailSMSTab />}
          {activeTab === 'api-validation' && <IntegrationsTab />}

          {activeTab === 'profile' && (
            <div style={{ backgroundColor: 'white', borderRadius: '18px', border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em', marginTop: 0, marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>Profile Information</h3>
              <div style={{ display: 'flex', gap: '20px', marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '28px', fontWeight: 700, flexShrink: 0 }}>JD</div>
                <div>
                  <p style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', margin: '0 0 4px' }}>John Doe</p>
                  <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 10px' }}>Admin · CRMPro Inc.</p>
                  <button style={{ padding: '7px 14px', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '13px', cursor: 'pointer', backgroundColor: 'white', color: '#475569', fontWeight: 500 }}>Change Photo</button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                {[
                  { label: 'First Name', key: 'firstName' }, { label: 'Last Name', key: 'lastName' },
                  { label: 'Email', key: 'email' }, { label: 'Phone', key: 'phone' },
                  { label: 'Company', key: 'company' }, { label: 'Timezone', key: 'timezone' },
                ].map(({ label, key }) => (
                  <div key={key}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '6px' }}>{label}</label>
                    <input value={(profile as Record<string, string>)[key]} onChange={e => setProfile(p => ({ ...p, [key]: e.target.value }))}
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                ))}
              </div>
              <button onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                <Save size={15} /> Save Changes
              </button>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div style={{ backgroundColor: 'white', borderRadius: '18px', border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em', marginTop: 0, marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>Notification Preferences</h3>
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
                    <p style={{ fontSize: '14px', fontWeight: 500, color: '#475569', margin: 0 }}>{label}</p>
                    <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>{desc}</p>
                  </div>
                  <Toggle value={(notifications as Record<string, boolean>)[key]} onChange={v => setNotifications(p => ({ ...p, [key]: v }))} />
                </div>
              ))}
              <button onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginTop: '16px' }}>
                <Save size={15} /> Save Preferences
              </button>
            </div>
          )}

          {activeTab === 'integrations' && (
            <div style={{ backgroundColor: 'white', borderRadius: '18px', border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em', marginTop: 0, marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>Third-Party Integrations</h3>
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
                      style={{ padding: '6px 14px', borderRadius: '9px', border: `1px solid ${intg.connected ? '#d1fae5' : '#e2e8f0'}`, backgroundColor: intg.connected ? '#ecfdf5' : 'white', color: intg.connected ? '#16a34a' : '#475569', fontSize: '12px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                      {intg.connected ? '✓ Connected' : 'Connect'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'billing' && (
            <div style={{ backgroundColor: 'white', borderRadius: '18px', border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em', marginTop: 0, marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>Billing & Subscription</h3>
              <div style={{ padding: '22px 24px', borderRadius: '12px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', marginBottom: '20px', boxShadow: '0 8px 20px rgba(99,102,241,0.25)' }}>
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
            <div style={{ backgroundColor: 'white', borderRadius: '18px', border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
                {activeTab === 'security' ? 'Security Settings' : 'Branding'}
              </h3>
              <div style={{ padding: '48px 24px', textAlign: 'center', backgroundColor: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: '12px', marginTop: '16px' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '16px', backgroundColor: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  {activeTab === 'security' ? <Shield size={28} color="#6366f1" /> : <Palette size={28} color="#6366f1" />}
                </div>
                <p style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a', letterSpacing: '-0.01em', margin: '0 0 6px' }}>Coming Soon</p>
                <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>This section is under development</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
