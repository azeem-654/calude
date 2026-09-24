/**
 * Editing an email step, where the step is.
 *
 * ── What it replaces ──
 *
 * A subject box, a six-line textarea and four buttons that appended a merge
 * field to the *end* of whatever was there. Checking what a person would
 * actually receive meant switching the workflow on and waiting.
 *
 * ── What it does ──
 *
 *   - Merge fields insert where the cursor is, about the person and about the
 *     business (`{{myCompany}}`, `{{bookingLink}}` — filled at send time by
 *     worker/src/lib/mergeFields.ts, from the contact record as it is then).
 *   - A link button, a word count, and a warning for the things that sink an
 *     email: no greeting, a merge field spelled wrong, a subject in capitals.
 *   - "Improve with AI": say what to change ("shorter", "mention the free
 *     audit"), and the step is rewritten from the project's own business
 *     profile, which the server reads — the same writer the wizard uses.
 *   - Preview as one of your real contacts, with the fields filled in.
 *   - Send yourself a test through the workspace's own mailbox.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, PenLine, Sparkles, Send, Link2, Loader, AlertTriangle, Check } from 'lucide-react';
import type { WorkflowNode } from '../../services/autopilot';
import { writeEmails } from '../../services/intake';
import { fetchBoard } from '../../services/projects';
import { getSession } from '../../services/auth';
import { getActiveAccountId } from '../../services/tenancy';
import { API_BASE } from '../../services/apiBase';
import { T } from './theme';

/** Which project the step belongs to, for the AI and the preview's business fields. */
export const StepContext = createContext<{ projectId?: string; workflowName?: string; workflowPurpose?: string }>({});

type Set = (key: string, value: string) => void;

const PERSON = [
  { token: '{{firstName}}', label: 'First name' },
  { token: '{{lastName}}', label: 'Last name' },
  { token: '{{company}}', label: 'Their company' },
  { token: '{{jobTitle}}', label: 'Job title' },
];
const BUSINESS = [
  { token: '{{myCompany}}', label: 'Your company' },
  { token: '{{bookingLink}}', label: 'Booking link' },
  { token: '{{website}}', label: 'Your website' },
  { token: '{{senderName}}', label: 'Your name' },
];
const KNOWN = new Set(['firstName', 'lastName', 'name', 'company', 'jobTitle', 'email', 'phone', 'myCompany', 'website', 'bookingLink', 'senderName']);

interface Contact { id?: string; name?: string; firstName?: string; lastName?: string; email?: string; company?: string; jobTitle?: string; phone?: string }

function readContacts(): Contact[] {
  try { return (JSON.parse(window.localStorage.getItem('crm_contacts') || '[]') as Contact[]).filter(c => c && (c.name || c.firstName)); }
  catch { return []; }
}

/** The same filling-in the server does (lib/mergeFields.ts), for the preview. */
function fill(text: string, c: Contact, biz: Record<string, string>): string {
  const full = (c.name ?? '').trim();
  const map: Record<string, string> = {
    firstName: (c.firstName ?? full.split(' ')[0] ?? '').trim(),
    lastName: (c.lastName ?? full.split(' ').slice(1).join(' ')).trim(),
    name: full, company: c.company ?? '', jobTitle: c.jobTitle ?? '', email: c.email ?? '', phone: c.phone ?? '',
    ...biz,
  };
  return text
    .split('\n')
    .filter(l => ![...l.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].some(m => ['myCompany', 'website', 'bookingLink', 'senderName'].includes(m[1]) && !map[m[1]]))
    .join('\n')
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => map[k] ?? '');
}

const box: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.line}`,
  fontSize: 13.5, fontFamily: 'inherit', color: T.ink, background: '#fff', outline: 'none',
};
const chip: React.CSSProperties = {
  padding: '4px 9px', borderRadius: 999, border: `1px solid ${T.line}`, background: '#fff',
  fontSize: 11.5, fontWeight: 700, color: T.accent, cursor: 'pointer', fontFamily: 'inherit',
};
const small: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: T.muted };
const tab = (on: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: 0,
  background: on ? T.ink : 'transparent', color: on ? '#fff' : T.muted, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
});

export default function EmailStepEditor({ node, set }: { node: WorkflowNode; set: Set }) {
  const ctx = useContext(StepContext);
  const subject = String(node.config?.subject ?? '');
  const body = String(node.config?.body ?? '');
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastFocus = useRef<'subject' | 'body'>('body');
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const contacts = useMemo(readContacts, []);
  const [who, setWho] = useState(0);
  const [biz, setBiz] = useState<Record<string, string>>({});
  const [ask, setAsk] = useState('');
  const [busy, setBusy] = useState<'' | 'ai' | 'test'>('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  /* The business fields for the preview, from the project's own profile. */
  useEffect(() => {
    if (!ctx.projectId) return;
    let alive = true;
    void fetchBoard().then(b => {
      if (!alive) return;
      const proj = (b.projects as { id: string; portfolioId?: string }[]).find(p => p.id === ctx.projectId);
      const pf = (b.portfolios as { id: string; name: string; profile?: Record<string, string> }[])
        .find(p => p.id === proj?.portfolioId);
      if (pf) setBiz({ myCompany: pf.profile?.companyName || pf.name, website: pf.profile?.website ?? '', senderName: getSession()?.user?.name ?? '', bookingLink: '' });
    });
    return () => { alive = false; };
  }, [ctx.projectId]);

  const insert = (token: string) => {
    const target = lastFocus.current;
    const el = target === 'subject' ? subjectRef.current : bodyRef.current;
    const value = target === 'subject' ? subject : body;
    const at = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? at;
    const next = `${value.slice(0, at)}${token}${value.slice(end)}`;
    set(target, next);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = at + token.length;
      el?.setSelectionRange(pos, pos);
    });
  };

  const addLink = () => {
    const url = window.prompt('Link address (https://…)');
    if (!url) return;
    lastFocus.current = 'body';
    insert(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  };

  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const unknown = [...`${subject}\n${body}`.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => m[1]).filter(k => !KNOWN.has(k));
  const warnings = [
    unknown.length ? `${[...new Set(unknown)].map(u => `{{${u}}}`).join(', ')} is not a field — it would be sent empty.` : '',
    body && !/\{\{\s*(firstName|name)\s*\}\}/.test(body) ? 'No greeting by name — emails that use one are opened more.' : '',
    subject && subject === subject.toUpperCase() && /[A-Z]{4}/.test(subject) ? 'A subject in capitals reads as spam to people and filters alike.' : '',
    words > 220 ? `${words} words — under about 150 is read more often.` : '',
  ].filter(Boolean);

  const improve = async () => {
    if (!ctx.projectId) { setMsg({ ok: false, text: 'Open this from a project to use its business profile.' }); return; }
    setBusy('ai'); setMsg(null);
    const r = await writeEmails({
      projectId: ctx.projectId,
      strategy: { workflow: ctx.workflowName ?? '', purpose: ctx.workflowPurpose ?? '', booking: /bookingLink/.test(body), instruction: ask.trim() || undefined },
      emails: [{ id: node.id, intent: node.label, subject, body }],
    });
    setBusy('');
    const e = r.emails.find(x => x.id === node.id);
    if (r.ok && e) {
      set('subject', e.subject);
      set('body', e.body);
      setAsk('');
      setMsg({ ok: true, text: 'Rewritten from your business profile. Check it, and change anything that is not right.' });
    } else setMsg({ ok: false, text: r.noAi ? 'The AI is not available right now — edit the email directly.' : r.error || 'Could not rewrite it.' });
  };

  const sendTest = async () => {
    const me = getSession()?.user;
    if (!me?.email) return;
    setBusy('test'); setMsg(null);
    const self: Contact = { name: me.name, email: me.email, company: biz.myCompany };
    try {
      const r = await fetch(`${API_BASE}/api/smtp-send.php`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: getSession()?.token, accountId: getActiveAccountId(), to: me.email,
          subject: `[Test] ${fill(subject, self, biz)}`,
          html: fill(body, self, biz).split(/\n{2,}/).map(p => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`).join(''),
        }),
      }).then(x => x.json() as Promise<{ success?: boolean; error?: string }>);
      setMsg(r.success ? { ok: true, text: `Sent to ${me.email}. The real one fills the fields from each contact.` } : { ok: false, text: r.error ?? 'Could not send the test.' });
    } catch { setMsg({ ok: false, text: 'Could not reach the server.' }); }
    setBusy('');
  };

  const person = contacts[who] ?? { name: 'Alex Morgan', firstName: 'Alex', company: 'Example Ltd' };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 4, background: T.line, borderRadius: 11, padding: 3, width: 'fit-content' }}>
        <button type="button" style={tab(mode === 'write')} onClick={() => setMode('write')}><PenLine size={13} /> Write</button>
        <button type="button" style={tab(mode === 'preview')} onClick={() => setMode('preview')}><Eye size={13} /> Preview</button>
      </div>

      {mode === 'write' ? (
        <>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={small}>Subject</span>
            <input ref={subjectRef} value={subject} onFocus={() => { lastFocus.current = 'subject'; }}
              onChange={e => set('subject', e.target.value)} placeholder="Thanks for getting in touch, {{firstName}}" style={box} aria-label="Subject" />
          </label>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ ...small, display: 'flex', justifyContent: 'space-between' }}>
              <span>Message</span><span style={{ fontWeight: 600 }}>{words} word{words === 1 ? '' : 's'}</span>
            </span>
            <textarea ref={bodyRef} value={body} rows={12} onFocus={() => { lastFocus.current = 'body'; }}
              onChange={e => set('body', e.target.value)} aria-label="Message"
              placeholder={'Hello {{firstName}},\n\nI’m writing from {{myCompany}} …'}
              style={{ ...box, resize: 'vertical', lineHeight: 1.6, minHeight: 220 }} />
          </label>
          <div style={{ display: 'grid', gap: 6 }}>
            <span style={small}>About the person</span>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {PERSON.map(t => <button key={t.token} type="button" style={chip} onMouseDown={e => e.preventDefault()} onClick={() => insert(t.token)}>{t.label}</button>)}
            </div>
            <span style={small}>About your business</span>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {BUSINESS.map(t => <button key={t.token} type="button" style={chip} onMouseDown={e => e.preventDefault()} onClick={() => insert(t.token)}>{t.label}</button>)}
              <button type="button" style={{ ...chip, color: T.ink }} onMouseDown={e => e.preventDefault()} onClick={addLink}><Link2 size={11} style={{ verticalAlign: -1 }} /> Link</button>
            </div>
            <span style={{ fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
              Filled in for each person when it sends, from their contact record at that moment. A line with an empty business field — no booking page yet, say — is left out rather than sent half-filled.
            </span>
          </div>
        </>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {contacts.length > 1 && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: T.muted }}>
              As
              <select value={who} onChange={e => setWho(Number(e.target.value))} style={{ ...box, width: 'auto', padding: '6px 10px' }} aria-label="Preview as">
                {contacts.slice(0, 50).map((c, i) => <option key={c.id ?? i} value={i}>{c.name || c.firstName}{c.company ? ` — ${c.company}` : ''}</option>)}
              </select>
            </label>
          )}
          <div style={{ border: `1px solid ${T.line}`, borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
            <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5 }}>
              <div style={{ color: T.muted }}>To: {person.name || person.firstName} {person.email ? `<${person.email}>` : ''}</div>
              <div style={{ fontWeight: 800, color: T.ink, marginTop: 3 }}>{fill(subject, person, biz) || '(no subject)'}</div>
            </div>
            <div style={{ padding: 14, fontSize: 13.5, lineHeight: 1.65, color: T.ink, whiteSpace: 'pre-wrap' }}>
              {fill(body, person, { ...biz, bookingLink: biz.bookingLink || 'https://app.protectedcentral.com/book/…' }) || 'Nothing written yet.'}
            </div>
          </div>
          {!contacts.length && <span style={{ fontSize: 11.5, color: T.muted }}>Shown with an example person — add contacts to preview as one of them.</span>}
        </div>
      )}

      {warnings.length > 0 && (
        <div style={{ display: 'grid', gap: 4, padding: '9px 11px', borderRadius: 10, background: '#fff8eb', border: '1px solid #fde3b0' }}>
          {warnings.map(w => <span key={w} style={{ display: 'flex', gap: 6, fontSize: 12, color: '#92400e', lineHeight: 1.45 }}><AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} /> {w}</span>)}
        </div>
      )}

      <div style={{ display: 'grid', gap: 7, padding: 12, borderRadius: 12, background: '#f7f6ff', border: '1px solid #e2ddff' }}>
        <span style={{ ...small, color: T.accent, display: 'flex', gap: 6, alignItems: 'center' }}><Sparkles size={13} /> Improve with AI</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input value={ask} onChange={e => setAsk(e.target.value)} placeholder="e.g. shorter, friendlier, mention the free audit"
            style={{ ...box, flex: '1 1 200px', padding: '8px 11px' }} aria-label="What to change"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void improve(); } }} />
          <button type="button" onClick={() => void improve()} disabled={busy === 'ai'} style={{ ...chip, padding: '8px 13px', background: T.accent, color: '#fff', borderColor: T.accent }}>
            {busy === 'ai' ? <Loader size={12} className="spin" /> : 'Rewrite'}
          </button>
        </div>
        <span style={{ fontSize: 11, color: T.muted }}>Written from your business profile. It never adds prices, discounts or claims that are not in it.</span>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => void sendTest()} disabled={busy === 'test' || !subject || !body} style={{ ...chip, color: T.ink, padding: '7px 12px' }}>
          {busy === 'test' ? <Loader size={12} className="spin" /> : <Send size={12} style={{ verticalAlign: -1 }} />} Send me a test
        </button>
      </div>

      {msg && (
        <div role={msg.ok ? 'status' : 'alert'} style={{ display: 'flex', gap: 7, fontSize: 12.5, lineHeight: 1.5, color: msg.ok ? '#166534' : '#991b1b' }}>
          {msg.ok ? <Check size={14} style={{ flexShrink: 0, marginTop: 2 }} /> : <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />} {msg.text}
        </div>
      )}
    </div>
  );
}
