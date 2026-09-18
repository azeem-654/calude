/**
 * One editor for the five things a tenant configures.
 *
 * ── Why one component and not five ──
 *
 * A form, an AI agent, a knowledge article, a widget and a voice agent are all
 * the same interaction: a list, a draft, a save, a delete, and a switch between
 * draft and live. Five copies of that would drift within a month — one would
 * grow a confirmation on delete and the others would not, and a customer would
 * learn that this product behaves differently depending on which screen they
 * are on.
 *
 * What differs is the fields, so that is the only thing `SPECS` holds.
 */
import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Loader, Plus, Trash2, X, AlertTriangle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { deleteOf, embedSnippet, listOf, saveOf } from '../../services/engagement';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

type Kind = 'form' | 'agent' | 'article' | 'widget' | 'voice_agent';

interface FieldSpec {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'tags' | 'fields' | 'check';
  hint?: string;
  options?: { id: string; label: string }[];
  rows?: number;
}

const TOOL_OPTIONS = [
  { id: 'searchKnowledge', label: 'Look things up in your knowledge base' },
  { id: 'captureContact', label: 'Take their name and email' },
  { id: 'getAvailableMeetingSlots', label: 'Offer your real booking times' },
  { id: 'createTicket', label: 'Open a ticket for them' },
  { id: 'handoffToHuman', label: 'Hand over to a person' },
];

const SPECS: Record<Kind, { title: string; blurb: string; nameKey: string; fields: FieldSpec[]; note?: string }> = {
  form: {
    title: 'Forms', nameKey: 'name',
    blurb: 'A form you can put on any website. Every submission is stored whole and becomes a contact.',
    fields: [
      { key: 'name', label: 'Name it', type: 'text', hint: 'Only you see this' },
      { key: 'headline', label: 'Heading a visitor sees', type: 'text' },
      { key: 'blurb', label: 'A line under it', type: 'text' },
      { key: 'fields', label: 'The questions', type: 'fields' },
      { key: 'successMessage', label: 'What it says after sending', type: 'text' },
      { key: 'consentText', label: 'Consent wording', type: 'text', hint: 'Left blank, no tick box is shown and none is required' },
      { key: 'notifyEmails', label: 'Tell these addresses', type: 'text', hint: 'Comma separated' },
    ],
  },
  agent: {
    title: 'AI agents', nameKey: 'name',
    blurb: 'What your assistant knows, how it sounds, and what it is allowed to do.',
    note: 'An agent can only say what you describe here and what is in your published knowledge. It is told not to invent prices, policies or availability, and to hand over instead.',
    fields: [
      { key: 'name', label: 'What it is called', type: 'text' },
      { key: 'businessInfo', label: 'Describe the business', type: 'textarea', rows: 5, hint: 'The single biggest lever on whether it sounds like you. What you do, for whom, where, and anything it must never promise.' },
      { key: 'greeting', label: 'First thing it says', type: 'text' },
      { key: 'personality', label: 'How it sounds', type: 'select', options: [
        { id: 'professional', label: 'Professional' }, { id: 'friendly', label: 'Friendly' },
        { id: 'direct', label: 'Direct' }, { id: 'warm', label: 'Warm' },
      ] },
      { key: 'instructions', label: 'Anything else it should do', type: 'textarea', rows: 3 },
      { key: 'tools', label: 'What it may do', type: 'tags', hint: 'Anything not ticked, it cannot do — however it is asked' },
      { key: 'fallback', label: 'What it says when it does not know', type: 'text' },
      { key: 'hoursFrom', label: 'Open from', type: 'text' },
      { key: 'hoursTo', label: 'Open until', type: 'text' },
      { key: 'timezone', label: 'Timezone', type: 'text' },
    ],
  },
  article: {
    title: 'Knowledge', nameKey: 'title',
    blurb: 'What your assistant is allowed to answer from. Only published articles are ever used.',
    note: 'Retrieval here is by matching words, not by embeddings — so keep each article about one thing, and put the words a customer would use in the title.',
    fields: [
      { key: 'title', label: 'Title', type: 'text', hint: 'Use the words a customer would; the title is weighted three times the body' },
      { key: 'body', label: 'The answer', type: 'textarea', rows: 10 },
      { key: 'kind', label: 'Kind', type: 'select', options: [
        { id: 'article', label: 'Article' }, { id: 'faq', label: 'FAQ' },
        { id: 'policy', label: 'Policy' }, { id: 'product', label: 'Product' },
      ] },
      { key: 'tags', label: 'Tags', type: 'text' },
    ],
  },
  widget: {
    title: 'Widgets', nameKey: 'name',
    blurb: 'The chat box a visitor sees on your website. One line of HTML to install.',
    fields: [
      { key: 'name', label: 'Name it', type: 'text' },
      { key: 'title', label: 'Title in the window', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'text' },
      { key: 'welcome', label: 'Welcome message', type: 'text' },
      { key: 'launcher', label: 'Text on the button', type: 'text' },
      { key: 'accent', label: 'Colour', type: 'text' },
      { key: 'position', label: 'Corner', type: 'select', options: [
        { id: 'right', label: 'Bottom right' }, { id: 'left', label: 'Bottom left' },
      ] },
      { key: 'allowedHosts', label: 'Only on these websites', type: 'text', hint: 'Comma separated, e.g. acme.com. Left blank it works anywhere, which is fine while testing and worth tightening once you are live.' },
      { key: 'consentText', label: 'Consent wording', type: 'text' },
    ],
  },
  voice_agent: {
    title: 'Voice', nameKey: 'name',
    blurb: 'An AI that answers the phone.',
    note: 'No voice provider is connected to this installation, so a voice agent cannot take calls yet. Everything configured here is saved and will work the moment one is — nothing about it is pretending to be live.',
    fields: [
      { key: 'name', label: 'Name it', type: 'text' },
      { key: 'greeting', label: 'What it says when it answers', type: 'text' },
      { key: 'phoneNumber', label: 'Number', type: 'text', hint: 'Needs a provider before it means anything' },
      { key: 'transferTo', label: 'Transfer calls to', type: 'text' },
      { key: 'consentText', label: 'Recording notice', type: 'text', hint: 'Required in many places before a call may be recorded' },
    ],
  },
};

const snake = (k: string) => k.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);

export default function EngageBuilder({ kind, onChange }: { kind: Kind; onChange: () => void }) {
  const { addNotification } = useApp();
  const spec = SPECS[kind];
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await listOf(kind);
    setItems(r.success ? (r.items ?? []) as Record<string, unknown>[] : []);
    setLoading(false);
  }, [kind]);

  useEffect(() => { void load(); setDraft(null); }, [load]);

  const val = (k: string): string => {
    const d = draft ?? {};
    return String(d[k] ?? d[snake(k)] ?? '');
  };
  const set = (k: string, v: unknown) => setDraft(x => ({ ...(x ?? {}), [k]: v }));

  const save = async (status?: string) => {
    if (!draft) return;
    setBusy('save');
    const r = await saveOf(kind, { ...draft, status: status ?? val('status') ?? 'draft' });
    setBusy('');
    if (!r.success) { addNotification(r.error ?? 'Could not save that.', 'error'); return; }
    setDraft(null);
    await load();
    onChange();
  };

  const remove = async (item: Record<string, unknown>) => {
    const label = String(item[spec.nameKey] ?? 'this');
    if (!window.confirm(`Delete "${label}"? Anything it has already captured is kept.`)) return;
    setBusy(String(item.id));
    const r = await deleteOf(kind, String(item.id));
    setBusy('');
    if (!r.success) { addNotification(r.error ?? 'Could not delete that.', 'error'); return; }
    await load();
    onChange();
  };

  const card: React.CSSProperties = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 20 };
  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 11px', border: `1px solid ${LINE}`, borderRadius: 9,
    fontSize: 13.5, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff',
  };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 5 };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: 0, flex: 1 }}>{spec.title}</h3>
          {!draft && (
            <button onClick={() => setDraft({})} style={smallBtn}><Plus size={12} /> New</button>
          )}
        </div>
        <p style={{ fontSize: 13, color: MUTED, margin: '0 0 12px', lineHeight: 1.6, maxWidth: '72ch' }}>{spec.blurb}</p>

        {spec.note && (
          <div style={{
            display: 'flex', gap: 9, alignItems: 'flex-start', padding: '11px 12px', borderRadius: 11,
            background: '#f8fafc', border: `1px solid ${LINE}`, marginBottom: 14,
          }}>
            <AlertTriangle size={15} color="#64748b" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 12, color: '#475569', lineHeight: 1.6 }}>{spec.note}</p>
          </div>
        )}

        {draft && (
          <div style={{ border: `1.5px solid ${ACCENT}`, borderRadius: 14, padding: 16, marginBottom: 14, display: 'grid', gap: 12 }}>
            {spec.fields.map(f => (
              <label key={f.key} style={{ display: 'block' }}>
                <span style={lbl}>{f.label}</span>
                {f.type === 'textarea' ? (
                  <textarea style={{ ...inp, resize: 'vertical', lineHeight: 1.6 }} rows={f.rows ?? 4}
                    value={val(f.key)} onChange={e => set(f.key, e.target.value)} />
                ) : f.type === 'select' ? (
                  <select style={inp} value={val(f.key)} onChange={e => set(f.key, e.target.value)}>
                    {(f.options ?? []).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                ) : f.type === 'tags' ? (
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {TOOL_OPTIONS.map(t => {
                      let on = false;
                      try { on = (JSON.parse(val(f.key) || '[]') as string[]).includes(t.id); } catch { on = false; }
                      return (
                        <button key={t.id} type="button" onClick={() => {
                          let list: string[];
                          try { list = JSON.parse(val(f.key) || '[]') as string[]; } catch { list = []; }
                          set(f.key, JSON.stringify(on ? list.filter(x => x !== t.id) : [...list, t.id]));
                        }} style={{
                          padding: '7px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                          border: `1.5px solid ${on ? ACCENT : LINE}`,
                          background: on ? 'rgba(91,70,229,0.06)' : '#fff',
                          color: on ? ACCENT : '#475569', fontSize: 12, fontWeight: 600,
                        }}>{t.label}</button>
                      );
                    })}
                  </span>
                ) : f.type === 'fields' ? (
                  <FieldEditor value={val(f.key)} onChange={v => set(f.key, v)} />
                ) : (
                  <input style={inp} value={val(f.key)} onChange={e => set(f.key, e.target.value)} />
                )}
                {f.hint && <span style={{ display: 'block', fontSize: 11, color: MUTED, marginTop: 4, lineHeight: 1.5 }}>{f.hint}</span>}
              </label>
            ))}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => void save('live')} disabled={busy === 'save'} style={{ ...smallBtn, background: ACCENT, color: '#fff', border: 'none', padding: '9px 16px', fontSize: 13 }}>
                {busy === 'save' ? <Loader size={12} className="spin" /> : <Check size={12} />} Save and make it live
              </button>
              <button onClick={() => void save('draft')} disabled={busy === 'save'} style={{ ...smallBtn, padding: '9px 14px', fontSize: 13 }}>
                Save as draft
              </button>
              <button onClick={() => setDraft(null)} style={{ ...smallBtn, padding: '9px 14px', fontSize: 13 }}>
                <X size={12} /> Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Loading…</p>
        ) : items.length === 0 && !draft ? (
          <p style={{ fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.6 }}>
            None yet. Press <strong style={{ color: INK }}>New</strong> to make the first one.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {items.map(it => (
              <div key={String(it.id)} style={{
                display: 'flex', gap: 11, alignItems: 'center', flexWrap: 'wrap',
                border: `1px solid ${LINE}`, borderRadius: 12, padding: '11px 13px',
                opacity: it.status === 'live' ? 1 : 0.72,
              }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{String(it[spec.nameKey] ?? '—')}</span>
                <span style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: '0.05em',
                  color: it.status === 'live' ? '#0f7b3d' : MUTED,
                }}>{String(it.status ?? 'draft').toUpperCase()}</span>

                {kind === 'form' && !!it.slug && (
                  <span style={{ fontSize: 11.5, color: MUTED }}>/f/{String(it.slug)}</span>
                )}
                {kind === 'widget' && !!it.public_key && (
                  <button onClick={() => {
                    void navigator.clipboard.writeText(embedSnippet(String(it.public_key)))
                      .then(() => addNotification('Snippet copied. Paste it before </body> on your site.', 'success'))
                      .catch(() => addNotification('Could not copy — select it from the box instead.', 'error'));
                  }} style={smallBtn}><Copy size={11} /> Copy embed code</button>
                )}

                <span style={{ flex: 1 }} />
                <button onClick={() => setDraft(it)} style={smallBtn}>Edit</button>
                <button onClick={() => void remove(it)} disabled={busy === String(it.id)}
                  style={{ ...smallBtn, color: '#b42318' }} aria-label={`Delete ${String(it[spec.nameKey] ?? '')}`}>
                  {busy === String(it.id) ? <Loader size={11} className="spin" /> : <Trash2 size={11} />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The questions on a form.
 *
 * Stored as JSON because nothing queries inside a field definition, and a
 * column per question would be a schema change every time somebody added one.
 */
function FieldEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  let fields: { key: string; label: string; type: string; required?: boolean }[] = [];
  try { fields = JSON.parse(value || '[]') as typeof fields; } catch { fields = []; }

  const write = (next: typeof fields) => onChange(JSON.stringify(next));
  const inp: React.CSSProperties = {
    padding: '7px 9px', border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 12.5,
    fontFamily: 'inherit', outline: 'none', minWidth: 0,
  };

  return (
    <span style={{ display: 'block' }}>
      <span style={{ display: 'grid', gap: 7 }}>
        {fields.map((f, i) => (
          <span key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input style={{ ...inp, flex: '1 1 140px' }} value={f.label} placeholder="Question"
              onChange={e => { const n = [...fields]; n[i] = { ...f, label: e.target.value, key: f.key || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) }; write(n); }} />
            <select style={{ ...inp, flex: '0 0 110px' }} value={f.type}
              onChange={e => { const n = [...fields]; n[i] = { ...f, type: e.target.value }; write(n); }}>
              {['text', 'email', 'phone', 'number', 'textarea', 'select', 'checkbox', 'date'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: MUTED }}>
              <input type="checkbox" checked={!!f.required}
                onChange={e => { const n = [...fields]; n[i] = { ...f, required: e.target.checked }; write(n); }} /> required
            </label>
            <button type="button" onClick={() => write(fields.filter((_, x) => x !== i))}
              style={{ ...smallBtn, color: '#b42318', padding: '5px 8px' }} aria-label={`Remove ${f.label}`}>
              <Trash2 size={11} />
            </button>
          </span>
        ))}
      </span>
      <button type="button" onClick={() => write([...fields, { key: '', label: '', type: 'text' }])}
        style={{ ...smallBtn, marginTop: 8 }}>
        <Plus size={11} /> Add a question
      </button>
      {/* Email is not merely a field type here: it is how a submission is matched
          to a contact, so a form without one captures an enquiry nobody can
          reply to. */}
      {fields.length > 0 && !fields.some(f => f.type === 'email') && (
        <span style={{ display: 'block', fontSize: 11.5, color: '#b45309', marginTop: 7, lineHeight: 1.5 }}>
          No email field. Submissions will be stored, but there will be nobody to reply to and no contact made.
        </span>
      )}
    </span>
  );
}

const smallBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px',
  border: `1px solid ${LINE}`, borderRadius: 8, background: '#fff',
  color: INK, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};
