/**
 * EmailTab.tsx — the contact's email command surface: engagement stats, full
 * history with per-message status, a composer with templates/tokens/attachments/
 * scheduling/AI subjects, and sequence enrolment controls.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Mail, Send, Clock, Paperclip, Sparkles, X, ChevronDown, Check, Eye,
  MousePointerClick, CornerUpLeft, AlertTriangle, Play, Pause, SkipForward, Loader, RefreshCw, ShieldCheck,
} from 'lucide-react';
import type { Contact } from '../../types';
import type { EmailSequence } from '../../types/marketing';
import {
  EMAIL_TEMPLATES, MERGE_TOKENS, emailsForContact, emailStats, databaseAverages,
  sendToContact, syncTracking, recordReply, enrollmentsForContact, enrollInSequence,
  pauseEnrollment, resumeEnrollment, cancelEnrollment, skipStep,
  type ContactEmail, type EmailAttachment, type EmailStatus,
} from '../../services/contactEmail';
import { isEmailConfigured } from '../../services/emailService';
import { hasGeminiKey, generateSubjectLines } from '../../lib/gemini';
import { scanContent, healthFor, localCheck, HEALTH_META } from '../../services/deliverability';

const INK = '#17191c';

const STATUS_META: Record<EmailStatus, { label: string; color: string; bg: string; icon: typeof Mail }> = {
  scheduled: { label: 'Scheduled', color: '#0891b2', bg: '#ecfeff', icon: Clock },
  sending:   { label: 'Sending',   color: '#64748b', bg: '#f1f5f9', icon: Loader },
  sent:      { label: 'Sent',      color: '#6366f1', bg: '#eef2ff', icon: Send },
  opened:    { label: 'Opened',    color: '#22c55e', bg: '#dcfce7', icon: Eye },
  clicked:   { label: 'Clicked',   color: '#f59e0b', bg: '#fef3c7', icon: MousePointerClick },
  replied:   { label: 'Replied',   color: '#ec4899', bg: '#fce7f3', icon: CornerUpLeft },
  bounced:   { label: 'Bounced',   color: '#ef4444', bg: '#fef2f2', icon: AlertTriangle },
  failed:    { label: 'Failed',    color: '#ef4444', bg: '#fef2f2', icon: AlertTriangle },
};

function StatusChip({ status }: { status: EmailStatus }) {
  const m = STATUS_META[status];
  const Icon = m.icon;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: m.bg, color: m.color, fontSize: 10, fontWeight: 800 }}>
      <Icon size={10} /> {m.label}
    </span>
  );
}

/* ── Stats strip ── */

function StatsStrip({ emails }: { emails: ContactEmail[] }) {
  const s = useMemo(() => emailStats(emails), [emails]);
  const avg = useMemo(() => databaseAverages(), []);
  const bandColor = { good: '#22c55e', ok: '#f59e0b', poor: '#ef4444', none: '#94a3b8' }[s.band];
  const bandLabel = { good: 'Engaged', ok: 'Lukewarm', poor: 'Not engaging', none: 'No emails yet' }[s.band];

  const cell = (label: string, value: string, sub?: string) => (
    <div key={label} style={{ flex: 1, padding: '10px 12px', background: '#f8fafc', borderRadius: 10, border: '1px solid #eef0f3' }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: INK, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: bandColor }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>Email health: {bandLabel}</span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {cell('Sent', String(s.sent))}
        {cell('Open rate', `${s.openRate}%`, `avg ${avg.openRate}%`)}
        {cell('Click rate', `${s.clickRate}%`, `avg ${avg.clickRate}%`)}
        {cell('Replies', String(s.replied))}
      </div>
    </div>
  );
}

/* ── Live spam-risk scanner ── */

/**
 * Scores the message as a filter roughly would, while it is being written.
 * Silent while the draft is empty or clean — advice only shows up when there
 * is something worth changing.
 */
function SpamScan({ subject, body }: { subject: string; body: string }) {
  const [open, setOpen] = useState(false);
  const scan = useMemo(() => scanContent(subject, body), [subject, body]);
  if (!subject.trim() && !body.trim()) return null;

  const color = scan.band === 'good' ? '#16a34a' : scan.band === 'ok' ? '#d97706' : '#dc2626';
  const bg = scan.band === 'good' ? '#f0fdf4' : scan.band === 'ok' ? '#fffbeb' : '#fef2f2';

  return (
    <div style={{ border: `1px solid ${color}33`, background: bg, borderRadius: 10, marginBottom: 10, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} disabled={!scan.issues.length}
        title={scan.issues.length ? 'Show what might trigger a spam filter' : 'Nothing flagged'}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', border: 'none', background: 'transparent', cursor: scan.issues.length ? 'pointer' : 'default', textAlign: 'left' }}>
        <ShieldCheck size={13} color={color} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 11.5, fontWeight: 700, color }}>Spam risk {scan.score}/100</span>
        <span style={{ fontSize: 11.5, color: '#475569', flex: 1 }}>{scan.summary}</span>
        {!!scan.issues.length && <ChevronDown size={12} color="#94a3b8" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }} />}
      </button>
      {open && (
        <div style={{ padding: '0 11px 10px' }}>
          {scan.issues.map((issue, i) => (
            <div key={i} style={{ borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: 7, marginTop: 7 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#0f172a' }}>
                {issue.label}
                {issue.matches.length > 0 && (
                  <span style={{ fontWeight: 500, color: '#64748b' }}> — {issue.matches.slice(0, 4).join(', ')}</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#475569', marginTop: 2, lineHeight: 1.5 }}>{issue.advice}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Recipient email health ── */

function RecipientHealth({ email }: { email: string }) {
  if (!email) return null;
  const stored = healthFor(email);
  const verdict = stored?.verdict ?? (localCheck(email).verdict === 'valid' ? 'unknown' : localCheck(email).verdict);
  if (verdict === 'valid' || verdict === 'unknown') return null;
  const m = HEALTH_META[verdict];
  const reason = stored?.reason || localCheck(email).reason;
  return (
    <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', padding: '8px 11px', borderRadius: 9, marginBottom: 10, background: m.bg, border: `1px solid ${m.color}44` }}>
      <AlertTriangle size={13} color={m.color} style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ fontSize: 11.5, color: m.color, lineHeight: 1.5 }}>
        <strong>{m.label} address.</strong> {reason}
        {verdict === 'invalid' && ' Sending is blocked to protect your sender reputation.'}
      </span>
    </div>
  );
}

/* ── Composer ── */

function Composer({ contact, onSent }: { contact: Contact; onSent: () => void }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);
  const [scheduleAt, setScheduleAt] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSubjects, setAiSubjects] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const configured = isEmailConfigured();

  const insertToken = (token: string) => {
    const el = bodyRef.current;
    if (!el) { setBody(b => b + token); return; }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); });
  };

  const applyTemplate = (id: string) => {
    const t = EMAIL_TEMPLATES.find(x => x.id === id);
    if (!t) return;
    setSubject(t.subject);
    setBody(t.body);
    setTemplateOpen(false);
  };

  const suggestSubjects = async () => {
    setAiBusy(true);
    setAiSubjects([]);
    try {
      const lines = await generateSubjectLines({
        contactName: contact.name, company: contact.company, jobTitle: contact.jobTitle,
        intent: subject.trim() || 'a helpful follow-up',
        bodyPreview: body,
      });
      setAiSubjects(lines);
      if (!lines.length) setMsg({ ok: false, text: 'The AI did not return any subject lines — try again.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not reach the AI.' });
    } finally { setAiBusy(false); }
  };

  const submit = async () => {
    if (!subject.trim() || !body.trim()) { setMsg({ ok: false, text: 'Add a subject and a message first.' }); return; }
    if (!contact.email) { setMsg({ ok: false, text: 'This contact has no email address.' }); return; }
    setSending(true);
    setMsg(null);
    const out = await sendToContact(contact, {
      subject: subject.trim(), body: body.trim(), attachments,
      scheduledFor: showSchedule && scheduleAt ? new Date(scheduleAt).toISOString() : undefined,
    });
    setSending(false);
    if (out.ok) {
      setMsg({ ok: true, text: out.email.status === 'scheduled' ? `Scheduled for ${new Date(out.email.scheduledFor!).toLocaleString()}` : 'Email sent and tracking enabled.' });
      setSubject(''); setBody(''); setAttachments([]); setScheduleAt(''); setShowSchedule(false); setAiSubjects([]);
      onSent();
    } else {
      setMsg({ ok: false, text: out.error || 'Send failed.' });
    }
  };

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };

  return (
    <div style={{ border: '1px solid #e6e9f0', borderRadius: 14, padding: 16, background: '#fff' }}>
      <RecipientHealth email={contact.email} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: INK, display: 'flex', alignItems: 'center', gap: 7 }}>
          <Send size={13} /> Compose
        </span>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setTemplateOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
            Templates <ChevronDown size={12} />
          </button>
          {templateOpen && (
            <div style={{ position: 'absolute', right: 0, top: 34, zIndex: 40, width: 250, maxHeight: 280, overflowY: 'auto', background: '#fff', borderRadius: 11, border: '1px solid #e2e8f0', boxShadow: '0 14px 34px -8px rgba(15,23,42,0.22)', padding: 6 }}>
              {EMAIL_TEMPLATES.map(t => (
                <button key={t.id} onClick={() => applyTemplate(t.id)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f1f5f9'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: INK }}>{t.name}</span>
                  <span style={{ display: 'block', fontSize: 10.5, color: '#94a3b8' }}>{t.category} · {t.subject}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {!configured && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '9px 12px', borderRadius: 9, background: '#fff7ed', border: '1px solid #fed7aa', marginBottom: 11 }}>
          <AlertTriangle size={13} color="#c2410c" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 11.5, color: '#9a3412', lineHeight: 1.5 }}>
            Email sending is not configured yet — set up SMTP in Settings → Email &amp; SMS. Messages will be recorded here but cannot leave the app.
          </span>
        </div>
      )}

      <div style={{ marginBottom: 9 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" style={{ ...inp, flex: 1 }} />
          <button onClick={suggestSubjects} disabled={aiBusy || !hasGeminiKey()}
            title={hasGeminiKey() ? 'Suggest subject lines with AI' : 'Add a Gemini API key in Settings → AI Engine'}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '9px 12px', borderRadius: 9, border: 'none', background: hasGeminiKey() ? INK : '#e2e8f0', color: hasGeminiKey() ? '#fff' : '#94a3b8', fontSize: 11.5, fontWeight: 700, cursor: hasGeminiKey() && !aiBusy ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>
            {aiBusy ? <Loader size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Sparkles size={12} color={hasGeminiKey() ? '#c7f441' : '#94a3b8'} />} AI subjects
          </button>
        </div>
        {aiSubjects.length > 0 && (
          <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {aiSubjects.map((s, i) => (
              <button key={i} onClick={() => { setSubject(s); setAiSubjects([]); }}
                style={{ textAlign: 'left', padding: '7px 10px', borderRadius: 8, border: '1px solid #eef0f3', background: '#f8fafc', fontSize: 12, color: INK, cursor: 'pointer' }}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <textarea ref={bodyRef} value={body} onChange={e => setBody(e.target.value)} rows={7}
        placeholder={`Hi ${contact.name.split(' ')[0]},\n\n…`}
        style={{ ...inp, resize: 'vertical', lineHeight: 1.6, marginBottom: 8 }} />

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 700, alignSelf: 'center', marginRight: 2 }}>Insert:</span>
        {MERGE_TOKENS.map(t => (
          <button key={t.token} onClick={() => insertToken(t.token)} title={t.token}
            style={{ padding: '3px 9px', borderRadius: 999, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      {attachments.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {attachments.map((a, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 9px', borderRadius: 8, background: '#f1f5f9', fontSize: 11, color: '#475569' }}>
              <Paperclip size={10} /> {a.name} <span style={{ color: '#94a3b8' }}>{(a.size / 1024).toFixed(0)}KB</span>
              <button onClick={() => setAttachments(list => list.filter((_, j) => j !== i))}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 0 }}><X size={11} /></button>
            </span>
          ))}
        </div>
      )}

      <SpamScan subject={subject} body={body} />

      {showSchedule && (
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Send at</label>
          <input type="datetime-local" value={scheduleAt} onChange={e => setScheduleAt(e.target.value)} style={inp} />
        </div>
      )}

      {msg && (
        <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', padding: '8px 11px', borderRadius: 9, marginBottom: 10,
          background: msg.ok ? '#ecfdf5' : '#fef2f2', border: `1px solid ${msg.ok ? '#a7f3d0' : '#fecaca'}` }}>
          {msg.ok ? <Check size={13} color="#059669" style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertTriangle size={13} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />}
          <span style={{ fontSize: 11.5, color: msg.ok ? '#065f46' : '#991b1b', lineHeight: 1.5 }}>{msg.text}</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
          <Paperclip size={12} /> Attach
          <input type="file" multiple style={{ display: 'none' }} onChange={e => {
            const files = Array.from(e.target.files ?? []);
            setAttachments(list => [...list, ...files.map(f => ({ name: f.name, size: f.size, type: f.type }))]);
            e.target.value = '';
          }} />
        </label>
        <button onClick={() => setShowSchedule(s => !s)} title="Schedule this email"
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 9, border: `1px solid ${showSchedule ? '#6366f1' : '#e2e8f0'}`, background: showSchedule ? '#eef2ff' : '#fff', color: showSchedule ? '#4f46e5' : '#475569', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
          <Clock size={12} /> Schedule
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={submit} disabled={sending} title="Send or schedule now"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 9, border: 'none', background: sending ? '#94a3b8' : INK, color: '#fff', fontSize: 12.5, fontWeight: 800, cursor: sending ? 'not-allowed' : 'pointer' }}>
          {sending ? <Loader size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Send size={13} />}
          {showSchedule && scheduleAt ? 'Schedule' : 'Send'}
        </button>
      </div>
    </div>
  );
}

/* ── Sequence enrolment ── */

function Sequences({ contact, sequences, onChange }: { contact: Contact; sequences: EmailSequence[]; onChange: () => void }) {
  const enrollments = enrollmentsForContact(contact.id);
  const [pick, setPick] = useState('');
  const active = enrollments.filter(e => e.status === 'active' || e.status === 'paused');
  const available = sequences.filter(s => !active.some(e => e.sequenceId === s.id));

  return (
    <div style={{ border: '1px solid #e6e9f0', borderRadius: 14, padding: 16, background: '#fff', marginBottom: 18 }}>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: INK, display: 'flex', alignItems: 'center', gap: 7, marginBottom: 11 }}>
        <RefreshCw size={13} /> Email sequences
      </span>

      {enrollments.length === 0 && (
        <p style={{ margin: '0 0 11px', fontSize: 12, color: '#94a3b8' }}>Not enrolled in any sequence yet.</p>
      )}

      {enrollments.map(e => (
        <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: '#f8fafc', border: '1px solid #eef0f3', marginBottom: 7 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>{e.sequenceName}</div>
            <div style={{ fontSize: 10.5, color: '#94a3b8' }}>
              Step {Math.min(e.currentStep + 1, e.totalSteps)} of {e.totalSteps} · {e.status}
              {e.nextSendAt && e.status === 'active' ? ` · next ${new Date(e.nextSendAt).toLocaleDateString()}` : ''}
            </div>
          </div>
          {e.status === 'active' && (
            <>
              <button onClick={() => { skipStep(e.id, sequences.find(s => s.id === e.sequenceId)); onChange(); }} title="Skip this step"
                style={{ padding: 6, borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#475569', display: 'flex' }}><SkipForward size={12} /></button>
              <button onClick={() => { pauseEnrollment(e.id); onChange(); }} title="Pause"
                style={{ padding: 6, borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#475569', display: 'flex' }}><Pause size={12} /></button>
            </>
          )}
          {e.status === 'paused' && (
            <button onClick={() => { resumeEnrollment(e.id); onChange(); }} title="Resume"
              style={{ padding: 6, borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#16a34a', display: 'flex' }}><Play size={12} /></button>
          )}
          {(e.status === 'active' || e.status === 'paused') && (
            <button onClick={() => { cancelEnrollment(e.id); onChange(); }} title="Remove from sequence"
              style={{ padding: 6, borderRadius: 7, border: '1px solid #fecaca', background: '#fff', cursor: 'pointer', color: '#dc2626', display: 'flex' }}><X size={12} /></button>
          )}
        </div>
      ))}

      {available.length > 0 && (
        <div style={{ display: 'flex', gap: 7, marginTop: 4 }}>
          <select value={pick} onChange={e => setPick(e.target.value)} title="Choose a sequence to enrol this contact in"
            style={{ flex: 1, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 12, background: '#fff', color: '#475569', cursor: 'pointer' }}>
            <option value="">Enrol in a sequence…</option>
            {available.map(s => <option key={s.id} value={s.id}>{s.name} ({s.steps.length} steps)</option>)}
          </select>
          <button onClick={() => {
            const seq = sequences.find(s => s.id === pick);
            if (!seq) return;
            enrollInSequence(contact, seq);
            setPick('');
            onChange();
          }} disabled={!pick}
            style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: pick ? INK : '#e2e8f0', color: pick ? '#fff' : '#94a3b8', fontSize: 12, fontWeight: 700, cursor: pick ? 'pointer' : 'not-allowed' }}>
            Enrol
          </button>
        </div>
      )}
    </div>
  );
}

/* ── History ── */

function History({ emails, onChange }: { emails: ContactEmail[]; onChange: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (!emails.length) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
        <Mail size={28} style={{ opacity: 0.3, marginBottom: 10 }} />
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#475569' }}>No emails yet</p>
        <p style={{ margin: '3px 0 0', fontSize: 12 }}>Everything you send appears here with its status.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {emails.map(e => {
        const open = openId === e.id;
        return (
          <div key={e.id} style={{ border: '1px solid #eef0f3', borderRadius: 11, overflow: 'hidden', background: '#fff' }}>
            <button onClick={() => setOpenId(open ? null : e.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 13px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: e.direction === 'inbound' ? '#ec4899' : '#cbd5e1', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.direction === 'inbound' ? '← ' : ''}{e.subject}
                </span>
                <span style={{ display: 'block', fontSize: 10.5, color: '#94a3b8', marginTop: 2 }}>
                  {new Date(e.sentAt || e.scheduledFor || e.createdAt).toLocaleString()}
                  {e.opens > 0 ? ` · ${e.opens} open${e.opens > 1 ? 's' : ''}` : ''}
                  {e.clicks > 0 ? ` · ${e.clicks} click${e.clicks > 1 ? 's' : ''}` : ''}
                  {e.attachments.length ? ` · ${e.attachments.length} attachment${e.attachments.length > 1 ? 's' : ''}` : ''}
                </span>
              </span>
              <StatusChip status={e.status} />
            </button>

            {open && (
              <div style={{ padding: '0 13px 13px', borderTop: '1px solid #f1f5f9' }}>
                <pre style={{ margin: '11px 0 0', fontSize: 12, color: '#475569', lineHeight: 1.6, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{e.body}</pre>
                {e.clickedUrls.length > 0 && (
                  <p style={{ margin: '9px 0 0', fontSize: 11, color: '#94a3b8' }}>
                    Clicked: {e.clickedUrls.map(u => u.slice(0, 48)).join(', ')}
                  </p>
                )}
                {e.error && <p style={{ margin: '8px 0 0', fontSize: 11, color: '#dc2626' }}>{e.error}</p>}
                {e.direction === 'outbound' && e.status !== 'replied' && e.status !== 'scheduled' && (
                  <button onClick={() => {
                    const snippet = window.prompt('Paste the reply you received:');
                    if (snippet && snippet.trim()) { recordReply(e.id, snippet.trim()); onChange(); }
                  }}
                    style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    <CornerUpLeft size={11} /> Log a reply
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Tab ── */

export default function EmailTab({ contact, sequences, onActivity }: {
  contact: Contact; sequences: EmailSequence[]; onActivity: (desc: string, type?: 'email_sent') => void;
}) {
  const [version, setVersion] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const emails = useMemo(() => emailsForContact(contact.id), [contact.id, version]);
  const refresh = () => setVersion(v => v + 1);

  // Fold in any opens/clicks recorded server-side since we last looked.
  useEffect(() => {
    let alive = true;
    void syncTracking().then(n => { if (alive && n) refresh(); });
    return () => { alive = false; };
  }, [contact.id]);

  const manualSync = async () => {
    setSyncing(true);
    await syncTracking();
    setSyncing(false);
    refresh();
  };

  return (
    <div>
      <StatsStrip emails={emails} />

      <Composer contact={contact} onSent={() => { refresh(); onActivity(`Email sent to ${contact.name}`, 'email_sent'); }} />

      <div style={{ height: 18 }} />
      <Sequences contact={contact} sequences={sequences} onChange={refresh} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>History ({emails.length})</span>
        <button onClick={manualSync} disabled={syncing}
          title="Check the server for new opens and clicks"
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 11, fontWeight: 700, cursor: syncing ? 'wait' : 'pointer' }}>
          {syncing ? <Loader size={11} style={{ animation: 'spin 0.8s linear infinite' }} /> : <RefreshCw size={11} />} Sync tracking
        </button>
      </div>
      <History emails={emails} onChange={refresh} />
    </div>
  );
}
