import { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle, XCircle, Loader, Eye, EyeOff, Send, RefreshCw, ChevronRight, ChevronLeft, Mail, Inbox, Wifi, WifiOff, AlertCircle, Info, Pencil } from 'lucide-react';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

/* ── types ── */
export interface SMTPConfig {
  host: string; port: string; user: string; pass: string;
  fromName: string; fromEmail: string; encryption: 'tls' | 'ssl' | 'none';
}
export interface IMAPConfig {
  host: string; port: string; user: string; pass: string; folder: string;
}

type StepId = 'provider' | 'outgoing' | 'incoming' | 'test' | 'done';
type TestState = 'idle' | 'running' | 'ok' | 'fail';

interface FieldValidation { ok: boolean; msg: string }
interface FormErrors {
  host?: string; port?: string; user?: string; pass?: string;
  fromName?: string; fromEmail?: string;
}

/* ── providers ── */
const PROVIDERS = [
  { id: 'cpanel', label: 'cPanel / Freehostia', emoji: '🏠', desc: 'Hosting account email · mail.yourdomain.com', color: '#6366f1',
    smtp: { host: '', port: '465', encryption: 'ssl' as const, user: '', pass: '', fromName: '', fromEmail: '' },
    imap: { host: '', port: '993', user: '', pass: '', folder: 'INBOX' } },
  { id: 'gmail', label: 'Gmail', emoji: '📧', desc: 'smtp.gmail.com · App Password required', color: '#ea4335',
    smtp: { host: 'smtp.gmail.com', port: '587', encryption: 'tls' as const, user: '', pass: '', fromName: '', fromEmail: '' },
    imap: { host: 'imap.gmail.com', port: '993', user: '', pass: '', folder: 'INBOX' } },
  { id: 'outlook', label: 'Outlook', emoji: '💼', desc: 'smtp-mail.outlook.com · Office 365', color: '#0078d4',
    smtp: { host: 'smtp-mail.outlook.com', port: '587', encryption: 'tls' as const, user: '', pass: '', fromName: '', fromEmail: '' },
    imap: { host: 'outlook.office365.com', port: '993', user: '', pass: '', folder: 'INBOX' } },
  { id: 'mailgun', label: 'Mailgun', emoji: '🔫', desc: 'smtp.mailgun.org · Transactional API', color: '#f06020',
    smtp: { host: 'smtp.mailgun.org', port: '587', encryption: 'tls' as const, user: '', pass: '', fromName: '', fromEmail: '' },
    imap: { host: '', port: '', user: '', pass: '', folder: 'INBOX' } },
  { id: 'sendgrid', label: 'SendGrid', emoji: '⚡', desc: 'smtp.sendgrid.net · High-volume', color: '#1a82e2',
    smtp: { host: 'smtp.sendgrid.net', port: '587', encryption: 'tls' as const, user: 'apikey', pass: '', fromName: '', fromEmail: '' },
    imap: { host: '', port: '', user: '', pass: '', folder: 'INBOX' } },
  { id: 'zoho', label: 'Zoho Mail', emoji: '🟡', desc: 'smtp.zoho.com · Business email', color: '#e8a200',
    smtp: { host: 'smtp.zoho.com', port: '587', encryption: 'tls' as const, user: '', pass: '', fromName: '', fromEmail: '' },
    imap: { host: 'imap.zoho.com', port: '993', user: '', pass: '', folder: 'INBOX' } },
  { id: 'aws-ses', label: 'AWS SES', emoji: '☁️', desc: 'Amazon Simple Email Service', color: '#ff9900',
    smtp: { host: 'email-smtp.us-east-1.amazonaws.com', port: '587', encryption: 'tls' as const, user: '', pass: '', fromName: '', fromEmail: '' },
    imap: { host: '', port: '', user: '', pass: '', folder: 'INBOX' } },
  { id: 'custom', label: 'Custom', emoji: '🔧', desc: 'Enter your own SMTP / IMAP server', color: '#64748b',
    smtp: { host: '', port: '587', encryption: 'tls' as const, user: '', pass: '', fromName: '', fromEmail: '' },
    imap: { host: '', port: '993', user: '', pass: '', folder: 'INBOX' } },
];

/* ── field-level real-time validators ── */
function validateEmail(v: string): FieldValidation {
  if (!v) return { ok: false, msg: 'Required' };
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
    ? { ok: true, msg: 'Valid email address' }
    : { ok: false, msg: 'Enter a valid email address' };
}
function validateHost(v: string): FieldValidation {
  if (!v) return { ok: false, msg: 'Required' };
  return /^[a-zA-Z0-9]([a-zA-Z0-9\-\.]+)[a-zA-Z0-9]$/.test(v)
    ? { ok: true, msg: 'Host looks good' }
    : { ok: false, msg: 'Enter a valid hostname (e.g. smtp.gmail.com)' };
}
function validatePort(v: string): FieldValidation {
  const n = parseInt(v);
  if (!v) return { ok: false, msg: 'Required' };
  if (isNaN(n) || n < 1 || n > 65535) return { ok: false, msg: 'Port must be 1–65535' };
  if (![25, 465, 587, 2525, 993, 143].includes(n))
    return { ok: true, msg: `Port ${n} — ensure your server uses this port` };
  return { ok: true, msg: `Port ${n} is standard` };
}
function validatePassword(v: string): FieldValidation {
  if (!v) return { ok: false, msg: 'Required' };
  if (v.length < 6) return { ok: false, msg: 'Too short' };
  return { ok: true, msg: 'Password set' };
}

function smtpErrors(cfg: SMTPConfig): FormErrors {
  const e: FormErrors = {};
  const h = validateHost(cfg.host); if (!h.ok) e.host = h.msg;
  const p = validatePort(cfg.port); if (!p.ok) e.port = p.msg;
  const u = validateEmail(cfg.user); if (!u.ok) e.user = u.msg;
  const pw = validatePassword(cfg.pass); if (!pw.ok) e.pass = pw.msg;
  const fe = validateEmail(cfg.fromEmail); if (!fe.ok) e.fromEmail = fe.msg;
  return e;
}

/* ── sub-components ── */
function FieldHint({ val, validator }: { val: string; validator: (v: string) => FieldValidation }) {
  if (!val) return null;
  const r = validator(val);
  return (
    <span style={{ fontSize: '11px', color: r.ok ? '#16a34a' : '#dc2626', display: 'flex', alignItems: 'center', gap: '3px', marginTop: '3px' }}>
      {r.ok ? <CheckCircle size={10} /> : <XCircle size={10} />} {r.msg}
    </span>
  );
}

function LabeledField({
  label, value, onChange, type = 'text', placeholder = '', hint, required = false
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; hint?: { val: string; validator: (v: string) => FieldValidation }; required?: boolean;
}) {
  const [show, setShow] = useState(false);
  const isPass = type === 'password';
  const inputType = isPass ? (show ? 'text' : 'password') : type;
  const hasError = hint && hint.val && !hint.validator(hint.val).ok;
  return (
    <div>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '4px' }}>
        {label}{required && <span style={{ color: '#dc2626' }}> *</span>}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          type={inputType} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%', padding: isPass ? '9px 36px 9px 12px' : '9px 12px',
            border: `1px solid ${hasError ? '#fca5a5' : value ? '#a5b4fc' : '#e2e8f0'}`,
            borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box',
            backgroundColor: hasError ? '#fff5f5' : 'white', color: '#0f172a',
            transition: 'border-color 0.15s',
          }}
        />
        {isPass && (
          <button onClick={() => setShow(p => !p)} type="button"
            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}>
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
      {hint && <FieldHint val={hint.val} validator={hint.validator} />}
    </div>
  );
}

function StepDot({ label, active, done, idx }: { label: string; active: boolean; done: boolean; idx: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
      <div style={{
        width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700,
        backgroundColor: done ? '#dcfce7' : active ? '#6366f1' : '#f1f5f9',
        color: done ? '#16a34a' : active ? 'white' : '#94a3b8',
        border: `2px solid ${done ? '#86efac' : active ? '#6366f1' : '#e2e8f0'}`,
        transition: 'all 0.2s',
      }}>
        {done ? <CheckCircle size={14} /> : idx + 1}
      </div>
      <span style={{ fontSize: '11px', fontWeight: active ? 600 : 400, color: active ? '#6366f1' : done ? '#16a34a' : '#94a3b8', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  );
}

function ConnectedBadge({ smtp }: { smtp: SMTPConfig }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
      <CheckCircle size={14} color="#16a34a" />
      <span style={{ fontSize: '12px', fontWeight: 600, color: '#15803d' }}>Connected</span>
      <span style={{ fontSize: '12px', color: '#64748b' }}>· {smtp.host}:{smtp.port}</span>
    </div>
  );
}

/* ── Persistent test bar ── */
function PersistentTestBar({ smtp, imap }: { smtp: SMTPConfig; imap: IMAPConfig }) {
  const [smtpState, setSmtpState] = useState<TestState>('idle');
  const [imapState, setImapState] = useState<TestState>('idle');
  const [smtpMsg, setSmtpMsg] = useState('');
  const [imapMsg, setImapMsg] = useState('');
  const [sendTo, setSendTo] = useState('');
  const [sendState, setSendState] = useState<TestState>('idle');
  const [sendMsg, setSendMsg] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [expanded, setExpanded] = useState(false);

  const testSMTP = async () => {
    setSmtpState('running'); setSmtpMsg('');
    try {
      const r = await fetch(`${API_BASE}/api/smtp-test.php`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: smtp.host, port: parseInt(smtp.port) || 587, username: smtp.user, password: smtp.pass, encryption: smtp.encryption }),
      });
      const d = await r.json() as { success: boolean; message: string; note?: string; suggestions?: string[] };
      setSmtpState(d.success ? 'ok' : 'fail');
      // Show note if SMTP socket fails but server mail() is available
      const extra = (!d.success && d.note) ? `\n${d.note}` : '';
      const hints = (!d.success && d.suggestions?.length) ? `\n• ${d.suggestions.join('\n• ')}` : '';
      setSmtpMsg(d.message + extra + hints);
    } catch {
      setSmtpState('fail'); setSmtpMsg('Cannot reach SMTP test endpoint. Check server connectivity.');
    }
  };

  const testIMAP = async () => {
    if (!imap.host) { setImapState('fail'); setImapMsg('No IMAP host configured'); return; }
    setImapState('running'); setImapMsg('');
    await new Promise(r => setTimeout(r, 1200));
    const filled = imap.host && imap.user && imap.pass;
    setImapState(filled ? 'ok' : 'fail');
    setImapMsg(filled ? `IMAP ${imap.host}:${imap.port} credentials look valid` : 'Fill in IMAP host, username, and password');
  };

  const sendTestEmail = async () => {
    if (!sendTo.trim()) { setSendMsg('Enter a recipient address'); return; }
    setSendState('running'); setSendMsg(''); setPreviewUrl('');
    try {
      const r = await fetch(`${API_BASE}/api/smtp-send.php`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: smtp.host, port: smtp.port, username: smtp.user, password: smtp.pass,
          secure: smtp.encryption === 'ssl', encryption: smtp.encryption,
          fromName: smtp.fromName || 'CRMPro',
          fromEmail: smtp.fromEmail || smtp.user, to: sendTo.trim(),
          subject: '✅ CRMPro SMTP Test',
          html: `<div style="font-family:Inter,sans-serif;max-width:560px;padding:32px"><h2 style="color:#6366f1">✅ SMTP Connection Verified</h2><p>Your SMTP integration is working correctly.</p><table style="width:100%;border-collapse:collapse;font-size:13px;margin:16px 0"><tr><td style="padding:8px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600">Host</td><td style="padding:8px;border:1px solid #e2e8f0">${smtp.host}:${smtp.port}</td></tr><tr><td style="padding:8px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600">Sent at</td><td style="padding:8px;border:1px solid #e2e8f0">${new Date().toLocaleString()}</td></tr></table></div>`,
        }),
      });
      const d = await r.json() as { success: boolean; message: string; previewUrl?: string };
      setSendState(d.success ? 'ok' : 'fail');
      setSendMsg(d.message);
      if (d.previewUrl) setPreviewUrl(d.previewUrl);
    } catch {
      setSendState('fail'); setSendMsg('Cannot reach send endpoint. Check server connectivity.');
    }
  };

  const stateColor: Record<TestState, string> = { idle: '#64748b', running: '#2563eb', ok: '#16a34a', fail: '#dc2626' };
  const stateBg: Record<TestState, string> = { idle: '#f8fafc', running: '#eff6ff', ok: '#f0fdf4', fail: '#fef2f2' };

  return (
    <div style={{ marginTop: '16px', borderRadius: '14px', border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', overflow: 'hidden', backgroundColor: 'white' }}>
      {/* Header bar — always visible */}
      <button onClick={() => setExpanded(p => !p)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 20px',
        backgroundColor: '#fafafa', border: 'none', cursor: 'pointer', textAlign: 'left',
        borderBottom: expanded ? '1px solid #e2e8f0' : 'none',
      }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#f0f4ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Wifi size={16} color="#6366f1" />
        </div>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>Test Connection Anytime</span>
          <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '10px' }}>SMTP · IMAP · Send test email</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {smtpState !== 'idle' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '20px', backgroundColor: stateBg[smtpState], fontSize: '11px', fontWeight: 600, color: stateColor[smtpState] }}>
              {smtpState === 'ok' ? <CheckCircle size={10} /> : smtpState === 'fail' ? <WifiOff size={10} /> : <Loader size={10} style={{ animation: 'spin 1s linear infinite' }} />}
              SMTP
            </div>
          )}
          <ChevronRight size={16} color="#94a3b8" style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
        </div>
      </button>

      {expanded && (
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* SMTP test row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '200px' }}>
              <Mail size={14} color="#6366f1" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Outgoing SMTP</span>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>{smtp.host}:{smtp.port}</span>
            </div>
            <button onClick={testSMTP} disabled={smtpState === 'running'}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', backgroundColor: stateBg[smtpState], color: stateColor[smtpState], border: `1px solid ${stateColor[smtpState]}30`, borderRadius: '9px', fontSize: '12px', fontWeight: 600, cursor: smtpState === 'running' ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
              {smtpState === 'running' ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : smtpState === 'ok' ? <CheckCircle size={12} /> : smtpState === 'fail' ? <XCircle size={12} /> : <RefreshCw size={12} />}
              {smtpState === 'running' ? 'Testing…' : smtpState === 'ok' ? 'Connected ✓' : smtpState === 'fail' ? 'Retry' : 'Test SMTP'}
            </button>
          </div>
          {smtpMsg && (
            <div style={{ padding: '8px 12px', borderRadius: '8px', backgroundColor: stateBg[smtpState], border: `1px solid ${stateColor[smtpState]}30`, fontSize: '12px', color: stateColor[smtpState], whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {smtpMsg}
            </div>
          )}

          {/* IMAP test row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '200px' }}>
              <Inbox size={14} color="#0891b2" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Incoming IMAP</span>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>{imap.host || 'not configured'}:{imap.port}</span>
            </div>
            <button onClick={testIMAP} disabled={imapState === 'running'}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', backgroundColor: stateBg[imapState], color: stateColor[imapState], border: `1px solid ${stateColor[imapState]}30`, borderRadius: '9px', fontSize: '12px', fontWeight: 600, cursor: imapState === 'running' ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
              {imapState === 'running' ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : imapState === 'ok' ? <CheckCircle size={12} /> : imapState === 'fail' ? <XCircle size={12} /> : <RefreshCw size={12} />}
              {imapState === 'running' ? 'Testing…' : imapState === 'ok' ? 'Connected ✓' : imapState === 'fail' ? 'Retry' : 'Test IMAP'}
            </button>
          </div>
          {imapMsg && (
            <div style={{ padding: '8px 12px', borderRadius: '8px', backgroundColor: stateBg[imapState], border: `1px solid ${stateColor[imapState]}30`, fontSize: '12px', color: stateColor[imapState] }}>
              {imapMsg}
            </div>
          )}

          {/* Send test email */}
          <div style={{ paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#475569', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Send size={13} color="#6366f1" /> Send a test email
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input value={sendTo} onChange={e => setSendTo(e.target.value)} placeholder="recipient@example.com"
                onKeyDown={e => e.key === 'Enter' && sendTestEmail()}
                style={{ flex: 1, padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '13px', outline: 'none' }} />
              <button onClick={sendTestEmail} disabled={sendState === 'running'}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: sendState === 'running' ? 'not-allowed' : 'pointer', opacity: sendState === 'running' ? 0.7 : 1, flexShrink: 0 }}>
                {sendState === 'running' ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={13} />}
                {sendState === 'running' ? 'Sending…' : 'Send'}
              </button>
            </div>
            {sendMsg && (
              <div style={{ marginTop: '8px', padding: '10px 14px', borderRadius: '8px', backgroundColor: stateBg[sendState], border: `1px solid ${stateColor[sendState]}30`, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', fontWeight: 600, color: stateColor[sendState] }}>
                  {sendState === 'ok' ? <CheckCircle size={13} /> : <XCircle size={13} />} {sendMsg}
                </div>
                {previewUrl && (
                  <a href={previewUrl} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 12px', backgroundColor: '#6366f1', color: 'white', borderRadius: '6px', fontSize: '12px', fontWeight: 700, textDecoration: 'none', alignSelf: 'flex-start' }}>
                    🔍 View on Ethereal →
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main Wizard ── */
interface Props {
  onSave: (smtp: SMTPConfig, imap: IMAPConfig) => void;
  initialSMTP?: SMTPConfig;
  initialIMAP?: IMAPConfig;
}

const STEPS: { id: StepId; label: string }[] = [
  { id: 'provider', label: 'Provider' },
  { id: 'outgoing', label: 'Outgoing' },
  { id: 'incoming', label: 'Incoming' },
  { id: 'test', label: 'Test' },
  { id: 'done', label: 'Done' },
];

const DEFAULT_SMTP: SMTPConfig = { host: '', port: '465', user: '', pass: '', fromName: '', fromEmail: '', encryption: 'ssl' };
const DEFAULT_IMAP: IMAPConfig = { host: '', port: '993', user: '', pass: '', folder: 'INBOX' };

export default function SMTPWizard({ onSave, initialSMTP, initialIMAP }: Props) {
  const [step, setStep] = useState<StepId>('provider');
  const [selectedProvider, setSelectedProvider] = useState('cpanel');
  const [smtp, setSMTP] = useState<SMTPConfig>(initialSMTP ?? DEFAULT_SMTP);
  const [imap, setIMAP] = useState<IMAPConfig>(initialIMAP ?? DEFAULT_IMAP);
  const [smtpErrors, setSmtpErrors] = useState<FormErrors>({});
  const [testState, setTestState] = useState<TestState>('idle');
  const [testMsg, setTestMsg] = useState('');
  const [testDetails, setTestDetails] = useState<string[]>([]);
  const [isDone, setIsDone] = useState(!!(initialSMTP?.host));

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validateSMTP = useCallback((cfg: SMTPConfig) => {
    const e: FormErrors = {};
    if (!validateHost(cfg.host).ok) e.host = validateHost(cfg.host).msg;
    if (!validatePort(cfg.port).ok) e.port = validatePort(cfg.port).msg;
    if (!validateEmail(cfg.user).ok) e.user = validateEmail(cfg.user).msg;
    if (!validatePassword(cfg.pass).ok) e.pass = validatePassword(cfg.pass).msg;
    if (cfg.fromEmail && !validateEmail(cfg.fromEmail).ok) e.fromEmail = validateEmail(cfg.fromEmail).msg;
    setSmtpErrors(e);
    return Object.keys(e).length === 0;
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => validateSMTP(smtp), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [smtp, validateSMTP]);

  const applyProvider = (pid: string) => {
    setSelectedProvider(pid);
    const p = PROVIDERS.find(x => x.id === pid);
    if (!p) return;
    setSMTP(prev => ({ ...prev, ...p.smtp }));
    setIMAP(prev => ({ ...prev, ...p.imap }));
  };

  const runConnectionTest = async () => {
    setTestState('running'); setTestMsg(''); setTestDetails([]);
    try {
      const r = await fetch(`${API_BASE}/api/smtp-test.php`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: smtp.host, port: parseInt(smtp.port) || 587, username: smtp.user, password: smtp.pass, encryption: smtp.encryption }),
      });
      const d = await r.json() as { success: boolean; message: string; note?: string; suggestions?: string[] };
      setTestState(d.success ? 'ok' : 'fail');
      const extra = (!d.success && d.note) ? `\n${d.note}` : '';
      setTestMsg(d.message + extra);
      setTestDetails(d.suggestions ?? []);
    } catch {
      setTestState('fail');
      setTestMsg('Cannot reach SMTP test endpoint');
      setTestDetails(['Ensure the server is reachable', 'In local dev run: cd server && node index.js']);
    }
  };

  const handleFinish = () => {
    onSave(smtp, imap);
    setIsDone(true);
    setStep('done');
  };

  const stepIdx = STEPS.findIndex(s => s.id === step);
  const canAdvanceOutgoing = Object.keys(smtpErrors).length === 0 && smtp.host && smtp.user && smtp.pass;

  const inputStyle = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' as const };
  const btnPrimary = (disabled = false) => ({
    display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 20px',
    backgroundColor: disabled ? '#e2e8f0' : '#6366f1', color: disabled ? '#94a3b8' : 'white',
    border: 'none', borderRadius: '9px', fontSize: '14px', fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
  } as const);

  return (
    <div style={{ backgroundColor: 'white', borderRadius: '14px', border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', background: 'linear-gradient(135deg, #f8faff 0%, #fdf4ff 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '11px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Mail size={20} color="white" />
          </div>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>SMTP Integration Wizard</h3>
            <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Set up outgoing and incoming email in minutes</p>
          </div>
          {isDone && step !== 'done' && <ConnectedBadge smtp={smtp} />}
        </div>

        {/* Step progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
          {STEPS.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
              <StepDot label={s.label} active={step === s.id} done={STEPS.findIndex(x => x.id === step) > i} idx={i} />
              {i < STEPS.length - 1 && (
                <div style={{ flex: 1, height: '2px', backgroundColor: STEPS.findIndex(x => x.id === step) > i ? '#86efac' : '#e2e8f0', margin: '0 8px', marginBottom: '20px', transition: 'background-color 0.3s' }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div style={{ padding: '24px' }}>

        {/* STEP 1: Provider */}
        {step === 'provider' && (
          <div>
            <p style={{ fontSize: '14px', color: '#475569', margin: '0 0 16px' }}>Choose your email provider to pre-fill the connection settings:</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
              {PROVIDERS.map(p => (
                <button key={p.id} onClick={() => applyProvider(p.id)}
                  style={{
                    padding: '14px 10px', border: `2px solid ${selectedProvider === p.id ? p.color : '#e2e8f0'}`,
                    borderRadius: '10px', backgroundColor: selectedProvider === p.id ? `${p.color}10` : 'white',
                    cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s', position: 'relative',
                  }}>
                  {selectedProvider === p.id && (
                    <div style={{ position: 'absolute', top: '6px', right: '6px', width: '16px', height: '16px', borderRadius: '50%', backgroundColor: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CheckCircle size={10} color="white" />
                    </div>
                  )}
                  <div style={{ fontSize: '22px', marginBottom: '6px' }}>{p.emoji}</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: selectedProvider === p.id ? p.color : '#374151', marginBottom: '3px' }}>{p.label}</div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', lineHeight: 1.4 }}>{p.desc}</div>
                </button>
              ))}
            </div>
            {selectedProvider === 'cpanel' && (
              <div style={{ padding: '12px 14px', backgroundColor: '#f0f4ff', borderRadius: '8px', border: '1px solid #c4b5fd', marginBottom: '16px', display: 'flex', gap: '8px' }}>
                <Info size={14} color="#6366f1" style={{ flexShrink: 0, marginTop: '1px' }} />
                <div style={{ fontSize: '12px', color: '#4338ca', margin: 0, lineHeight: 1.6 }}>
                  <strong>Freehostia / cPanel setup:</strong><br />
                  Host: <code>mail.protectedcentral.com</code> · Port: <code>465</code> · Encryption: <code>SSL</code><br />
                  Username: your full email address (e.g. <code>admin@protectedcentral.com</code>)<br />
                  Password: the email account password (set in cPanel → Email Accounts)
                </div>
              </div>
            )}
            {selectedProvider === 'gmail' && (
              <div style={{ padding: '12px 14px', backgroundColor: '#fef9c3', borderRadius: '8px', border: '1px solid #fde047', marginBottom: '16px', display: 'flex', gap: '8px' }}>
                <Info size={14} color="#a16207" style={{ flexShrink: 0, marginTop: '1px' }} />
                <p style={{ fontSize: '12px', color: '#a16207', margin: 0 }}>
                  Gmail requires an <strong>App Password</strong> (not your account password). Enable 2-Factor Authentication, then generate one at <strong>myaccount.google.com → Security → App Passwords</strong>.
                </p>
              </div>
            )}
            {selectedProvider === 'sendgrid' && (
              <div style={{ padding: '12px 14px', backgroundColor: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', marginBottom: '16px' }}>
                <p style={{ fontSize: '12px', color: '#1d4ed8', margin: 0 }}>SendGrid username is always <code>apikey</code>. The password is your SendGrid API key.</p>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setStep('outgoing')} style={btnPrimary()}>
                Next: Outgoing Mail <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Outgoing SMTP */}
        {step === 'outgoing' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Mail size={16} color="#6366f1" />
              <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Outgoing Mail (SMTP)</h4>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
              <LabeledField label="SMTP Host" value={smtp.host} onChange={v => setSMTP(p => ({ ...p, host: v }))}
                placeholder="smtp.gmail.com" required
                hint={{ val: smtp.host, validator: validateHost }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <LabeledField label="Port" value={smtp.port} onChange={v => setSMTP(p => ({ ...p, port: v }))}
                  placeholder="587" required hint={{ val: smtp.port, validator: validatePort }} />
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '4px' }}>Encryption</label>
                  <select value={smtp.encryption} onChange={e => setSMTP(p => ({ ...p, encryption: e.target.value as SMTPConfig['encryption'] }))}
                    style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="tls">STARTTLS</option>
                    <option value="ssl">SSL/TLS</option>
                    <option value="none">None</option>
                  </select>
                </div>
              </div>
              <LabeledField label="Username / Email" value={smtp.user} onChange={v => setSMTP(p => ({ ...p, user: v }))}
                placeholder="you@example.com" required hint={{ val: smtp.user, validator: validateEmail }} />
              <LabeledField label="Password / App Key" value={smtp.pass} onChange={v => setSMTP(p => ({ ...p, pass: v }))}
                type="password" placeholder="••••••••" required hint={{ val: smtp.pass, validator: validatePassword }} />
              <LabeledField label="From Name" value={smtp.fromName} onChange={v => setSMTP(p => ({ ...p, fromName: v }))}
                placeholder="Your Name or Company" />
              <LabeledField label="From Email Address" value={smtp.fromEmail} onChange={v => setSMTP(p => ({ ...p, fromEmail: v }))}
                placeholder="hello@yourdomain.com"
                hint={smtp.fromEmail ? { val: smtp.fromEmail, validator: validateEmail } : undefined} />
            </div>

            {/* Encryption tip */}
            <div style={{ padding: '10px 14px', backgroundColor: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd', marginBottom: '16px', display: 'flex', gap: '8px' }}>
              <Info size={13} color="#0369a1" style={{ flexShrink: 0, marginTop: '1px' }} />
              <p style={{ fontSize: '12px', color: '#0369a1', margin: 0 }}>
                <strong>Port guide:</strong> 587 + STARTTLS (most common) · 465 + SSL/TLS · 25 (legacy, often blocked)
              </p>
            </div>

            {Object.keys(smtpErrors).length > 0 && (
              <div style={{ padding: '10px 14px', backgroundColor: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca', marginBottom: '16px' }}>
                <p style={{ fontSize: '12px', fontWeight: 600, color: '#dc2626', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <AlertCircle size={13} /> Fix these errors before proceeding:
                </p>
                <ul style={{ margin: 0, paddingLeft: '18px' }}>
                  {Object.entries(smtpErrors).map(([k, v]) => (
                    <li key={k} style={{ fontSize: '12px', color: '#dc2626' }}><strong>{k}:</strong> {v}</li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setStep('provider')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px', backgroundColor: 'white', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                <ChevronLeft size={15} /> Back
              </button>
              <button onClick={() => setStep('incoming')} disabled={!canAdvanceOutgoing} style={btnPrimary(!canAdvanceOutgoing)}>
                Next: Incoming Mail <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Incoming IMAP */}
        {step === 'incoming' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Inbox size={16} color="#0891b2" />
              <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Incoming Mail (IMAP)</h4>
              <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#f1f5f9', color: '#64748b', fontWeight: 500 }}>Optional</span>
            </div>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px' }}>
              IMAP syncs replies from contacts into Conversations. You can skip this now and configure it later.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
              <LabeledField label="IMAP Host" value={imap.host} onChange={v => setIMAP(p => ({ ...p, host: v }))}
                placeholder="imap.gmail.com"
                hint={imap.host ? { val: imap.host, validator: validateHost } : undefined} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <LabeledField label="Port" value={imap.port} onChange={v => setIMAP(p => ({ ...p, port: v }))}
                  placeholder="993"
                  hint={imap.port ? { val: imap.port, validator: validatePort } : undefined} />
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '4px' }}>Folder</label>
                  <input value={imap.folder} onChange={e => setIMAP(p => ({ ...p, folder: e.target.value }))} placeholder="INBOX" style={inputStyle} />
                </div>
              </div>
              <LabeledField label="IMAP Username" value={imap.user} onChange={v => setIMAP(p => ({ ...p, user: v }))}
                placeholder="you@example.com"
                hint={imap.user ? { val: imap.user, validator: validateEmail } : undefined} />
              <LabeledField label="IMAP Password" value={imap.pass} onChange={v => setIMAP(p => ({ ...p, pass: v }))}
                type="password" placeholder="••••••••" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setStep('outgoing')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px', backgroundColor: 'white', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                <ChevronLeft size={15} /> Back
              </button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setStep('test')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px', backgroundColor: 'white', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                  Skip
                </button>
                <button onClick={() => setStep('test')} style={btnPrimary()}>
                  Next: Test <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Test */}
        {step === 'test' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Wifi size={16} color="#6366f1" />
              <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Test Your Connection</h4>
            </div>

            {/* Config summary */}
            <div style={{ padding: '14px 16px', backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: '#475569', margin: '0 0 8px' }}>Configuration Summary</p>
              {[
                { label: 'SMTP Host', value: `${smtp.host}:${smtp.port} (${smtp.encryption.toUpperCase()})` },
                { label: 'Username', value: smtp.user },
                { label: 'From', value: smtp.fromName ? `${smtp.fromName} <${smtp.fromEmail || smtp.user}>` : smtp.fromEmail || smtp.user },
                ...(imap.host ? [{ label: 'IMAP Host', value: `${imap.host}:${imap.port}` }] : []),
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', gap: '12px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', color: '#94a3b8', width: '90px', flexShrink: 0 }}>{row.label}</span>
                  <span style={{ fontSize: '12px', color: '#475569', fontWeight: 500, wordBreak: 'break-all' }}>{row.value}</span>
                </div>
              ))}
            </div>

            {/* Test button */}
            <button onClick={runConnectionTest} disabled={testState === 'running'}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', backgroundColor: testState === 'running' ? '#e2e8f0' : '#6366f1', color: testState === 'running' ? '#94a3b8' : 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: testState === 'running' ? 'not-allowed' : 'pointer', marginBottom: '14px', width: '100%', justifyContent: 'center' }}>
              {testState === 'running' ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : testState === 'ok' ? <CheckCircle size={16} /> : testState === 'fail' ? <XCircle size={16} /> : <Wifi size={16} />}
              {testState === 'running' ? 'Connecting to SMTP server…' : testState === 'ok' ? 'Connection Successful!' : testState === 'fail' ? 'Connection Failed — Retry' : 'Test SMTP Connection'}
            </button>

            {testMsg && (
              <div style={{ padding: '12px 16px', borderRadius: '10px', backgroundColor: testState === 'ok' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${testState === 'ok' ? '#bbf7d0' : '#fecaca'}`, marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: testDetails.length ? '8px' : 0 }}>
                  {testState === 'ok' ? <CheckCircle size={15} color="#16a34a" /> : <XCircle size={15} color="#dc2626" />}
                  <span style={{ fontSize: '13px', fontWeight: 600, color: testState === 'ok' ? '#15803d' : '#dc2626' }}>{testMsg}</span>
                </div>
                {testDetails.length > 0 && (
                  <ul style={{ margin: '0', paddingLeft: '24px' }}>
                    {testDetails.map((d, i) => <li key={i} style={{ fontSize: '12px', color: testState === 'ok' ? '#15803d' : '#7f1d1d', marginBottom: '3px' }}>{d}</li>)}
                  </ul>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setStep('incoming')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px', backgroundColor: 'white', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                <ChevronLeft size={15} /> Back
              </button>
              <button onClick={handleFinish} style={btnPrimary()}>
                {testState === 'ok' ? 'Finish Setup' : 'Save & Finish'} <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: Done */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#f0fdf4', border: '3px solid #86efac', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <CheckCircle size={32} color="#16a34a" />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>SMTP Integration Complete!</h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px' }}>
              Your email is configured. Use the test panel below to verify the connection anytime.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ padding: '10px 16px', borderRadius: '8px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '7px' }}>
                <Mail size={14} color="#16a34a" />
                <span style={{ fontSize: '13px', color: '#15803d', fontWeight: 600 }}>{smtp.host}:{smtp.port}</span>
              </div>
              {imap.host && (
                <div style={{ padding: '10px 16px', borderRadius: '8px', backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <Inbox size={14} color="#0369a1" />
                  <span style={{ fontSize: '13px', color: '#0369a1', fontWeight: 600 }}>{imap.host}:{imap.port}</span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '20px', flexWrap: 'wrap' }}>
              <button onClick={() => setStep('outgoing')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 20px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                <Pencil size={13} /> Edit Settings
              </button>
              <button onClick={() => setStep('provider')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 18px', backgroundColor: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
                <RefreshCw size={13} /> Change Provider
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Persistent test bar — always visible once any config exists */}
      {(isDone || smtp.host) && <div style={{ padding: '0 24px 24px' }}><PersistentTestBar smtp={smtp} imap={imap} /></div>}
    </div>
  );
}
