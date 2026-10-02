/**
 * A form's own public page — `/f/<slug>`.
 *
 * Customer Engagement → Forms has always shown each form's address as
 * `/f/<slug>`, and OWNER-CHECKLIST tells the owner to hand that address out,
 * but nothing rendered it: a stranger following the link met the sign-in
 * screen, and a signed-in one was bounced to the dashboard. The only way a form
 * ever reached anybody was as a block inside a website or funnel.
 *
 * Everything that matters already lives on the server (`engage.php` `form` and
 * `submit`): the form is found by its slug, which maps to exactly one
 * workspace, so this page never names a workspace and cannot be pointed at
 * another one. A draft form answers "not available", and so does this page.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { API_BASE } from '../../services/apiBase';
import { usePageTitle } from '../../services/pageTitle';

interface Field { key?: string; label: string; type: string; required?: boolean }
interface PublicForm { name: string; headline?: string; blurb?: string; fields: Field[]; submitLabel?: string; consentText?: string }

/* The key an answer is filed under. `email`, `phone` and `name` are read by
   name to make the contact — the same rule as the form block in BlockRender —
   so "Your email address" still has to arrive as `email`. */
function keyFor(f: Field, i: number): string {
  const t = f.type.toLowerCase();
  if (t === 'email') return 'email';
  if (t === 'phone' || t === 'tel') return 'phone';
  const slugged = (f.key || f.label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (['name', 'full_name', 'your_name'].includes(slugged)) return 'name';
  if (['company', 'business'].includes(slugged)) return 'company';
  return slugged || `field_${i}`;
}

const INPUT_TYPE: Record<string, string> = { email: 'email', phone: 'tel', number: 'number', date: 'date' };

export default function FormPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [form, setForm] = useState<PublicForm | null>(null);
  const [state, setState] = useState<'loading' | 'missing' | 'unreachable' | 'ready' | 'sending' | 'sent'>('loading');
  const [values, setValues] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  usePageTitle(form?.headline || form?.name || '');

  useEffect(() => {
    let live = true;
    fetch(`${API_BASE}/api/engage.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'form', formSlug: slug }),
    })
      .then(r => r.json())
      .then((d: { success?: boolean; form?: Omit<PublicForm, 'fields'> & { fields?: unknown } }) => {
        if (!live) return;
        if (!d.success || !d.form) { setState('missing'); return; }
        let fields: Field[] = [];
        try {
          const raw = typeof d.form.fields === 'string' ? JSON.parse(d.form.fields) : d.form.fields;
          fields = Array.isArray(raw) ? (raw as Field[]).filter(f => f && f.label) : [];
        } catch { fields = []; }
        setForm({ ...d.form, fields });
        setState('ready');
      })
      .catch(() => { if (live) setState('unreachable'); });
    return () => { live = false; };
  }, [slug]);

  const send = async () => {
    if (!form) return;
    setError('');
    const missing = form.fields.find((f, i) => f.required && !(values[keyFor(f, i)] ?? '').trim());
    if (missing) { setError(`${missing.label} is needed.`); return; }
    if (form.consentText?.trim() && !consent) { setError('Please tick the box to agree before sending.'); return; }
    setState('sending');
    try {
      const r = await fetch(`${API_BASE}/api/engage.php`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit', formSlug: slug, answers: values,
          /* Sent as ticked only when it was: the server refuses a form with
             consent wording that arrives without it. */
          consent: form.consentText?.trim() ? consent : true,
          context: { page: window.location.href, referrer: document.referrer.slice(0, 300) },
        }),
      });
      const d = await r.json() as { success?: boolean; message?: string; error?: string; redirect?: string };
      if (!d.success) { setState('ready'); setError(d.error || 'That could not be sent. Try again.'); return; }
      if (d.redirect && /^https?:\/\//i.test(d.redirect)) { window.location.href = d.redirect; return; }
      setDone(d.message || 'Thank you — we have got that.');
      setState('sent');
    } catch {
      setState('ready');
      setError('That could not be sent — check your connection and try again. Nothing was received.');
    }
  };

  const input: React.CSSProperties = {
    width: '100%', padding: '11px 13px', border: '1px solid #d5d8dd', borderRadius: 9,
    fontSize: 15, boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff', color: '#0f172a',
  };

  const shell = (children: React.ReactNode) => (
    <div style={{ minHeight: '100vh', background: '#f2f4f6', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: 'clamp(16px, 6vh, 64px) 16px', boxSizing: 'border-box', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: 16, padding: 'clamp(20px, 5vw, 32px)', boxShadow: '0 6px 24px rgba(16,24,40,.08)', boxSizing: 'border-box' }}>
        {children}
      </div>
    </div>
  );

  if (state === 'loading') return shell(<p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>Loading…</p>);
  if (state === 'missing') return shell(<>
    <h1 style={{ fontSize: 19, margin: '0 0 8px', color: '#0f172a' }}>This form is not available</h1>
    <p style={{ fontSize: 14, lineHeight: 1.6, color: '#475569', margin: 0 }}>The address may be mistyped, or the form is not live yet. Ask whoever sent it for an up-to-date link.</p>
  </>);
  if (state === 'unreachable' || !form) return shell(<>
    <h1 style={{ fontSize: 19, margin: '0 0 8px', color: '#0f172a' }}>This form could not be loaded</h1>
    <p style={{ fontSize: 14, lineHeight: 1.6, color: '#475569', margin: 0 }}>Check your connection and reload the page.</p>
  </>);
  if (state === 'sent') return shell(
    <p role="status" style={{ margin: 0, padding: '16px 18px', borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', fontSize: 15, lineHeight: 1.55 }}>{done}</p>,
  );

  return shell(
    <form onSubmit={e => { e.preventDefault(); void send(); }} noValidate>
      <h1 style={{ fontSize: 22, margin: '0 0 6px', color: '#0f172a', letterSpacing: '-0.01em' }}>{form.headline || form.name}</h1>
      {form.blurb && <p style={{ fontSize: 14.5, lineHeight: 1.6, color: '#475569', margin: '0 0 18px' }}>{form.blurb}</p>}
      {form.fields.length === 0 && (
        <p style={{ fontSize: 14, color: '#b45309', margin: '0 0 14px' }}>This form has no questions yet.</p>
      )}
      {form.fields.map((f, i) => {
        const k = keyFor(f, i);
        const id = `pf-${i}`;
        if (f.type === 'checkbox') {
          return (
            <label key={i} htmlFor={id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 14, color: '#374151', marginBottom: 14 }}>
              <input id={id} type="checkbox" checked={values[k] === 'yes'}
                onChange={e => setValues(v => ({ ...v, [k]: e.target.checked ? 'yes' : '' }))} style={{ marginTop: 3 }} />
              <span>{f.label}{f.required && <span style={{ color: '#b42318' }}> *</span>}</span>
            </label>
          );
        }
        return (
          <div key={i} style={{ marginBottom: 14 }}>
            <label htmlFor={id} style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
              {f.label}{f.required && <span style={{ color: '#b42318' }}> *</span>}
            </label>
            {f.type === 'textarea' ? (
              <textarea id={id} rows={4} value={values[k] ?? ''} data-field={k}
                onChange={e => setValues(v => ({ ...v, [k]: e.target.value }))} style={{ ...input, resize: 'vertical' }} />
            ) : (
              <input id={id} type={INPUT_TYPE[f.type] ?? 'text'} value={values[k] ?? ''} data-field={k}
                autoComplete={k === 'email' ? 'email' : k === 'phone' ? 'tel' : k === 'name' ? 'name' : undefined}
                onChange={e => setValues(v => ({ ...v, [k]: e.target.value }))} style={input} />
            )}
          </div>
        );
      })}
      {form.consentText?.trim() && (
        <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13, color: '#475569', lineHeight: 1.5, margin: '4px 0 14px' }}>
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} data-field="consent" style={{ marginTop: 3 }} />
          <span>{form.consentText}</span>
        </label>
      )}
      {error && <p role="alert" style={{ margin: '0 0 12px', fontSize: 13.5, color: '#b42318' }}>{error}</p>}
      <button type="submit" disabled={state === 'sending'} style={{
        width: '100%', padding: '13px 0', background: state === 'sending' ? '#94a3b8' : '#17191c', color: '#fff',
        border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: state === 'sending' ? 'default' : 'pointer', fontFamily: 'inherit',
      }}>
        {state === 'sending' ? 'Sending…' : (form.submitLabel || 'Send')}
      </button>
    </form>,
  );
}
