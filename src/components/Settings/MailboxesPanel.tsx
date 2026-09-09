/**
 * Every mailbox this workspace is connected to, in one window.
 *
 * What this replaces was a five-step wizard: pick a provider, fill in outgoing,
 * fill in incoming, test, done. Three things were wrong with it. It could only
 * ever produce one mailbox, because the table was keyed by workspace. It made
 * the two directions feel like consecutive steps of one thing when they are
 * separate connections that fail separately. And it tested at the end, so a
 * customer found out about a wrong password four screens after typing it.
 *
 * So: a list of what is connected, and each one opens two independent sections
 * — Incoming and Outgoing — each with its own Save and its own Validate. You
 * can connect an outbox today and an inbox next week. Nothing is validated
 * automatically, because a validation that runs on a keystroke either fires
 * against half-typed credentials or gets debounced into looking broken; the
 * customer says when they are ready.
 *
 * When a validation fails the server sends back what it objected to *and* the
 * steps that address it (worker/src/lib/mailDiagnosis.ts). Those are shown
 * inline, with the server's own words underneath — a diagnosis that hides its
 * evidence is worse than none, because nobody can tell when it has guessed
 * wrong.
 */
import { useEffect, useState } from 'react';
import {
  Mail, Inbox, Plus, Trash2, Star, CheckCircle2, XCircle, Loader,
  ChevronDown, ChevronRight, ShieldCheck, AlertTriangle, Eye, EyeOff,
} from 'lucide-react';
import {
  listMailboxes, saveMailboxRecord, deleteMailboxById, setPrimaryMailbox,
  validateOutgoing, validateIncoming, cacheMailboxes,
  type MailboxRecord, type MailboxDraft, type Diagnosis,
} from '../../services/mailboxStore';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';

type Direction = 'outgoing' | 'incoming';

/** A blank draft. Ports and encryption are pre-paired so the common case is
 *  right without anybody having to know that 587 means STARTTLS. */
const blank = (): MailboxDraft => ({
  label: '',
  smtp: { host: '', port: 587, encryption: 'tls', username: '', password: '' },
  from: { name: '', email: '', replyTo: '' },
  imap: { host: '', port: 993, encryption: 'ssl', username: '', password: '', folder: 'INBOX' },
  provider: { name: 'smtp', key: '', secret: '', domain: '', url: '' },
});

const toDraft = (m: MailboxRecord): MailboxDraft => ({
  id: m.id,
  label: m.label,
  /* Passwords come back as "is one set", never the value. Empty here means
     "leave the stored one alone", which is what the endpoint reads it as. */
  smtp: { host: m.smtp.host, port: m.smtp.port, encryption: m.smtp.encryption, username: m.smtp.username, password: '' },
  from: { name: m.from.name, email: m.from.email, replyTo: m.from.replyTo },
  imap: { host: m.imap.host, port: m.imap.port, encryption: m.imap.encryption, username: m.imap.username, password: '', folder: m.imap.folder },
  provider: { name: m.provider.name || 'smtp', key: '', secret: '', domain: m.provider.domain, url: m.provider.url },
});

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 11px', border: `1px solid ${LINE}`, borderRadius: 9,
  fontSize: 13, color: INK, outline: 'none', boxSizing: 'border-box',
  background: '#fff', fontFamily: 'inherit',
};
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 };

function Field({ label, value, onChange, placeholder, type = 'text', hint }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; hint?: string;
}) {
  const [show, setShow] = useState(false);
  const isPass = type === 'password';
  return (
    <div>
      <label style={lbl}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={isPass && !show ? 'password' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ ...inp, paddingRight: isPass ? 36 : 11 }}
        />
        {isPass && (
          <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide' : 'Show'}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: MUTED, display: 'flex' }}>
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
      </div>
      {hint && <span style={{ fontSize: 11, color: MUTED, marginTop: 3, display: 'block' }}>{hint}</span>}
    </div>
  );
}

/** The green/amber/grey badge for one direction. */
function StatusChip({ verifiedAt, lastError }: { verifiedAt: string | null; lastError: string }) {
  const state = verifiedAt ? 'ok' : lastError ? 'bad' : 'unknown';
  const cfg = {
    ok: { bg: '#e8f5e9', fg: '#1e6b32', icon: <CheckCircle2 size={12} />, text: 'Validated' },
    bad: { bg: '#fdecea', fg: '#a02216', icon: <XCircle size={12} />, text: 'Failed' },
    unknown: { bg: '#f1f5f9', fg: MUTED, icon: <AlertTriangle size={12} />, text: 'Not validated yet' },
  }[state];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: cfg.bg, color: cfg.fg, fontSize: 11, fontWeight: 700 }}>
      {cfg.icon} {cfg.text}
    </span>
  );
}

/** What went wrong, and what to do — the whole point of validating explicitly. */
function DiagnosisBox({ d }: { d: Diagnosis }) {
  return (
    <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: '#fdf6f5', border: '1px solid #f5c6c0' }}>
      <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#a02216' }}>{d.summary}</p>
      <ol style={{ margin: '8px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {d.steps.map((s, i) => (
          <li key={i} style={{ fontSize: 12.5, color: '#5c2019', lineHeight: 1.5 }}>{s}</li>
        ))}
      </ol>
      {d.raw && (
        <details style={{ marginTop: 9 }}>
          <summary style={{ cursor: 'pointer', fontSize: 11.5, color: '#8a4038', fontWeight: 600 }}>
            What the server actually said
          </summary>
          <code style={{ display: 'block', marginTop: 6, fontSize: 11, color: '#5c2019', wordBreak: 'break-word', lineHeight: 1.5 }}>
            {d.raw}
          </code>
        </details>
      )}
    </div>
  );
}

interface SectionProps {
  direction: Direction;
  draft: MailboxDraft;
  record?: MailboxRecord;
  onChange: (d: MailboxDraft) => void;
  onSaved: (list: MailboxRecord[], id?: string) => void;
}

/**
 * One direction of one mailbox.
 *
 * Save and Validate are separate buttons on purpose. Saving credentials you
 * have not proved is legitimate — you might be halfway through finding the
 * password — and validating is a network round-trip to somebody else's server
 * that should happen when asked, not on a timer.
 */
function DirectionSection({ direction, draft, record, onChange, onSaved }: SectionProps) {
  const [busy, setBusy] = useState<'save' | 'validate' | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string; diagnosis?: Diagnosis } | null>(null);

  const out = direction === 'outgoing';
  const status = out ? record?.outgoing : record?.incoming;

  const save = async (): Promise<string | undefined> => {
    setBusy('save'); setResult(null);
    const r = await saveMailboxRecord(draft);
    setBusy(null);
    if (!r.success) { setResult({ ok: false, message: r.error ?? 'Could not save.' }); return undefined; }
    const id = r.id ?? draft.id;
    onSaved(r.mailboxes ?? [], id);
    setResult({ ok: true, message: 'Saved. Not validated yet — press Validate to prove it works.' });
    return id;
  };

  const validate = async () => {
    /* Save first, always. Validating what is on the server while the form holds
       something else tests the wrong credentials and reports the wrong answer —
       which is worse than not testing, because it is believed. */
    setBusy('save'); setResult(null);
    const r = await saveMailboxRecord(draft);
    if (!r.success) { setBusy(null); setResult({ ok: false, message: r.error ?? 'Could not save.' }); return; }
    const id = r.id ?? draft.id;
    onSaved(r.mailboxes ?? [], id);
    if (!id) { setBusy(null); return; }

    setBusy('validate');
    const v = out ? await validateOutgoing(id) : await validateIncoming(id);
    setBusy(null);
    if (v.mailboxes) onSaved(v.mailboxes, id);
    setResult({
      ok: !!v.success,
      message: v.message ?? v.error ?? (v.success ? 'Validated.' : 'Validation failed.'),
      diagnosis: v.diagnosis,
    });
  };

  return (
    <div style={{ padding: 16, border: `1px solid ${LINE}`, borderRadius: 12, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', color: INK }}>{out ? <Mail size={16} /> : <Inbox size={16} />}</span>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: INK }}>
          {out ? 'Outgoing mail (SMTP)' : 'Incoming mail (IMAP)'}
        </h4>
        {record && <StatusChip verifiedAt={status?.verifiedAt ?? null} lastError={status?.lastError ?? ''} />}
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {/*
          How this address sends, asked once, here.

          This was a separate "Email Sending Provider" card with its own
          storage, so "how does this workspace send?" had two answers that could
          disagree — an SMTP host saved in one place and a Resend key in
          another, with nothing to say which won. A mailbox is an address and
          the way messages leave it; they belong to the same record.
        */}
        {out && (
          <div>
            <label style={lbl}>How this mailbox sends</label>
            <select
              value={draft.provider.name || 'smtp'}
              onChange={e => onChange({ ...draft, provider: { ...draft.provider, name: e.target.value } })}
              style={{ ...inp, maxWidth: 320 }}
            >
              <option value="smtp">Its own SMTP server</option>
              <option value="resend">Resend</option>
              <option value="brevo">Brevo</option>
              <option value="sendgrid">SendGrid</option>
              <option value="mailgun">Mailgun</option>
              <option value="mailjet">Mailjet</option>
              <option value="postmark">Postmark</option>
            </select>
          </div>
        )}

        {out && draft.provider.name !== 'smtp' && draft.provider.name !== '' ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <Field
              label="API key"
              type="password"
              value={draft.provider.key}
              placeholder={record?.provider.hasKey ? 'Stored — leave blank to keep it' : ''}
              hint={record?.provider.hasKey ? 'A key is saved. Leaving this empty keeps it.' : 'From your provider dashboard. It is stored encrypted and never sent back to this page.'}
              onChange={v => onChange({ ...draft, provider: { ...draft.provider, key: v } })}
            />
            {draft.provider.name === 'mailjet' && (
              <Field label="API secret" type="password" value={draft.provider.secret}
                placeholder={record?.provider.hasSecret ? 'Stored — leave blank to keep it' : ''}
                onChange={v => onChange({ ...draft, provider: { ...draft.provider, secret: v } })} />
            )}
            {draft.provider.name === 'mailgun' && (
              <Field label="Sending domain" value={draft.provider.domain} placeholder="mg.yourdomain.com"
                hint="The domain you verified with Mailgun."
                onChange={v => onChange({ ...draft, provider: { ...draft.provider, domain: v } })} />
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="From name" value={draft.from.name} placeholder="Wild West Corp"
                onChange={v => onChange({ ...draft, from: { ...draft.from, name: v } })} />
              <Field label="From address" value={draft.from.email} placeholder="support@yourdomain.com"
                hint="Providers refuse to send from a domain you have not verified with them."
                onChange={v => onChange({ ...draft, from: { ...draft.from, email: v } })} />
            </div>
          </div>
        ) : (
        <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
          <Field
            label={out ? 'SMTP host' : 'IMAP host'}
            value={out ? draft.smtp.host : draft.imap.host}
            placeholder={out ? 'smtp.yourdomain.com' : 'imap.yourdomain.com'}
            onChange={v => onChange(out
              ? { ...draft, smtp: { ...draft.smtp, host: v } }
              : { ...draft, imap: { ...draft.imap, host: v } })}
          />
          <Field
            label="Port"
            value={String(out ? draft.smtp.port : draft.imap.port)}
            onChange={v => onChange(out
              ? { ...draft, smtp: { ...draft.smtp, port: v } }
              : { ...draft, imap: { ...draft.imap, port: v } })}
          />
          <div>
            <label style={lbl}>Encryption</label>
            <select
              value={out ? draft.smtp.encryption : draft.imap.encryption}
              onChange={e => onChange(out
                ? { ...draft, smtp: { ...draft.smtp, encryption: e.target.value } }
                : { ...draft, imap: { ...draft.imap, encryption: e.target.value } })}
              style={inp}
            >
              <option value="tls">STARTTLS</option>
              <option value="ssl">SSL/TLS</option>
              <option value="none">None</option>
            </select>
          </div>
        </div>

        {/* The pairing people get wrong, said once, where they are choosing. */}
        <p style={{ margin: 0, fontSize: 11.5, color: MUTED }}>
          {out
            ? 'Port 587 goes with STARTTLS; 465 goes with SSL/TLS. A mismatch here is the most common reason a correct password is refused.'
            : 'Port 993 goes with SSL/TLS; 143 goes with STARTTLS.'}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field
            label="Username"
            value={out ? draft.smtp.username : draft.imap.username}
            placeholder="you@yourdomain.com or a provider login"
            hint={out ? 'Not always an email address — Resend uses "resend", SendGrid uses "apikey".' : undefined}
            onChange={v => onChange(out
              ? { ...draft, smtp: { ...draft.smtp, username: v } }
              : { ...draft, imap: { ...draft.imap, username: v } })}
          />
          <Field
            label="Password or API key"
            type="password"
            value={out ? draft.smtp.password : draft.imap.password}
            placeholder={
              (out ? record?.smtp.hasPassword : record?.imap.hasPassword)
                ? 'Stored — leave blank to keep it'
                : ''
            }
            hint={
              (out ? record?.smtp.hasPassword : record?.imap.hasPassword)
                ? 'A password is saved. Leaving this empty keeps it.'
                : undefined
            }
            onChange={v => onChange(out
              ? { ...draft, smtp: { ...draft.smtp, password: v } }
              : { ...draft, imap: { ...draft.imap, password: v } })}
          />
        </div>

        {out ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="From name" value={draft.from.name} placeholder="Wild West Corp"
              onChange={v => onChange({ ...draft, from: { ...draft.from, name: v } })} />
            <Field label="From address" value={draft.from.email} placeholder="support@yourdomain.com"
              hint="Most servers refuse to send as an address you did not sign in as."
              onChange={v => onChange({ ...draft, from: { ...draft.from, email: v } })} />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Folder" value={draft.imap.folder} placeholder="INBOX"
              hint="INBOX unless you collect replies somewhere else."
              onChange={v => onChange({ ...draft, imap: { ...draft.imap, folder: v } })} />
          </div>
        )}
        </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button onClick={() => void save()} disabled={busy !== null}
          style={{ padding: '9px 16px', borderRadius: 9, border: `1px solid ${LINE}`, background: '#fff', color: INK, fontSize: 12.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
          {busy === 'save' ? 'Saving…' : 'Save'}
        </button>
        <button onClick={() => void validate()} disabled={busy !== null}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, border: 'none', background: busy ? '#c3c7cd' : INK, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
          {busy === 'validate' ? <Loader size={14} className="spin" /> : <ShieldCheck size={14} />}
          {busy === 'validate' ? 'Validating…' : 'Save & validate'}
        </button>
      </div>

      {result && (
        <>
          <p style={{
            margin: '10px 0 0', fontSize: 12.5, lineHeight: 1.5,
            color: result.ok ? '#1e6b32' : '#a02216', fontWeight: 600,
          }}>
            {result.message}
          </p>
          {result.diagnosis && <DiagnosisBox d={result.diagnosis} />}
        </>
      )}
    </div>
  );
}

export default function MailboxesPanel() {
  const [list, setList] = useState<MailboxRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, MailboxDraft>>({});
  /* A mailbox being added has no id yet, so it needs a key of its own. */
  const [adding, setAdding] = useState<MailboxDraft | null>(null);

  /* A guarded async IIFE rather than an effect that calls setState as it runs.
     The same shape AutomationPanel and InfrastructurePanel settled on: `live`
     stops a reply from a workspace you have already navigated away from
     overwriting the one you are looking at. */
  useEffect(() => {
    let live = true;
    void (async () => {
      const l = await listMailboxes();
      if (!live) return;
      setList(l);
      /* Mirror it for the code that cannot await — campaign sender lists,
         "is mail set up?" badges, the DNS suggestions. No secrets go in. */
      cacheMailboxes(l);
      setDrafts(prev => {
        const next = { ...prev };
        for (const m of l) if (!next[m.id]) next[m.id] = toDraft(m);
        return next;
      });
      setLoading(false);
    })();
    return () => { live = false; };
  }, []);

  const afterSave = (mailboxes: MailboxRecord[], id?: string) => {
    setList(mailboxes);
    cacheMailboxes(mailboxes);
    setDrafts(prev => {
      const next = { ...prev };
      for (const m of mailboxes) if (!next[m.id]) next[m.id] = toDraft(m);
      return next;
    });
    if (id) {
      /* A newly added mailbox now has a real id — move its draft across and
         close the add form, so the customer is editing the saved thing rather
         than a copy that would create a second one on the next save. */
      setAdding(a => {
        if (a && !a.id) {
          setDrafts(p => ({ ...p, [id]: { ...a, id } }));
          setOpenId(id);
          return null;
        }
        return a;
      });
    }
  };

  const remove = async (m: MailboxRecord) => {
    if (!window.confirm(`Disconnect ${m.label || m.from.email || m.smtp.host}? Campaigns using it will stop sending.`)) return;
    const r = await deleteMailboxById(m.id);
    if (r.mailboxes) { setList(r.mailboxes); cacheMailboxes(r.mailboxes); }
  };

  const makePrimary = async (m: MailboxRecord) => {
    const r = await setPrimaryMailbox(m.id);
    if (r.mailboxes) { setList(r.mailboxes); cacheMailboxes(r.mailboxes); }
  };

  const title = (m: MailboxRecord) => m.label || m.from.email || m.smtp.host || m.imap.host || 'Untitled mailbox';

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header>
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>Mailboxes</h3>
        <p style={{ margin: '5px 0 0', fontSize: 13, color: MUTED, lineHeight: 1.6, maxWidth: 620 }}>
          Every address this workspace sends from and collects replies on. Connect as many as you need — a
          support address and a sales address can be separate. Sending and receiving are validated on their
          own, because they fail on their own.
        </p>
      </header>

      {loading && <p style={{ fontSize: 13, color: MUTED }}>Loading…</p>}

      {!loading && list.length === 0 && !adding && (
        <div style={{ padding: 22, border: `1px dashed ${LINE}`, borderRadius: 12, textAlign: 'center', background: '#fafbfc' }}>
          <p style={{ margin: 0, fontSize: 13.5, color: INK, fontWeight: 600 }}>No mailbox connected yet</p>
          <p style={{ margin: '5px 0 0', fontSize: 12.5, color: MUTED }}>
            Nothing can send or collect replies until one is.
          </p>
        </div>
      )}

      {list.map(m => {
        const open = openId === m.id;
        const draft = drafts[m.id] ?? toDraft(m);
        return (
          <div key={m.id} style={{ border: `1px solid ${LINE}`, borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 15px', background: '#fafbfc', flexWrap: 'wrap' }}>
              <button onClick={() => setOpenId(open ? null : m.id)} aria-expanded={open}
                style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'none', cursor: 'pointer', color: INK, padding: 0, flex: 1, minWidth: 0, textAlign: 'left' }}>
                {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {title(m)}
                </span>
                {m.isPrimary && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 999, background: '#eef4ff', color: '#2b5fd9', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                    <Star size={10} /> Primary
                  </span>
                )}
              </button>

              <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>Send</span>
                <StatusChip verifiedAt={m.outgoing.verifiedAt} lastError={m.outgoing.lastError} />
                <span style={{ fontSize: 11, color: MUTED, fontWeight: 600, marginLeft: 4 }}>Receive</span>
                <StatusChip verifiedAt={m.incoming.verifiedAt} lastError={m.incoming.lastError} />
              </span>

              {!m.isPrimary && (
                <button onClick={() => void makePrimary(m)} title="Campaigns and scheduled sends use the primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8, border: `1px solid ${LINE}`, background: '#fff', color: INK, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                  <Star size={11} /> Make primary
                </button>
              )}
              <button onClick={() => void remove(m)} aria-label={`Disconnect ${title(m)}`}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#a02216', display: 'flex', padding: 4 }}>
                <Trash2 size={15} />
              </button>
            </div>

            {open && (
              <div style={{ padding: 15, display: 'grid', gap: 14, background: '#f7f8fa' }}>
                <div>
                  <label style={lbl}>Name it</label>
                  <input value={draft.label} placeholder="Support, Sales, Billing…"
                    onChange={e => setDrafts(p => ({ ...p, [m.id]: { ...draft, label: e.target.value } }))}
                    style={{ ...inp, maxWidth: 320 }} />
                </div>
                <DirectionSection direction="outgoing" draft={draft} record={m}
                  onChange={d => setDrafts(p => ({ ...p, [m.id]: d }))} onSaved={afterSave} />
                <DirectionSection direction="incoming" draft={draft} record={m}
                  onChange={d => setDrafts(p => ({ ...p, [m.id]: d }))} onSaved={afterSave} />
              </div>
            )}
          </div>
        );
      })}

      {adding && (
        <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, overflow: 'hidden', background: '#f7f8fa' }}>
          <div style={{ padding: '13px 15px', background: '#fff', borderBottom: `1px solid ${LINE}` }}>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: INK }}>New mailbox</h4>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: MUTED }}>
              Fill in one direction and save — you can add the other later.
            </p>
          </div>
          <div style={{ padding: 15, display: 'grid', gap: 14 }}>
            <div>
              <label style={lbl}>Name it</label>
              <input value={adding.label} placeholder="Support, Sales, Billing…"
                onChange={e => setAdding({ ...adding, label: e.target.value })}
                style={{ ...inp, maxWidth: 320 }} />
            </div>
            <DirectionSection direction="outgoing" draft={adding} onChange={setAdding} onSaved={afterSave} />
            <DirectionSection direction="incoming" draft={adding} onChange={setAdding} onSaved={afterSave} />
            <div>
              <button onClick={() => setAdding(null)}
                style={{ padding: '8px 14px', borderRadius: 9, border: `1px solid ${LINE}`, background: '#fff', color: INK, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {!adding && (
        <div>
          <button onClick={() => setAdding(blank())}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, border: 'none', background: INK, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={15} /> Add a mailbox
          </button>
        </div>
      )}
    </section>
  );
}
