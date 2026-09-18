/**
 * Module settings: who gets told, and how it is branded.
 *
 * The white-label question lives here rather than in the widget, because it is
 * an answer about the business rather than about one chat box — and a customer
 * with three widgets should not have to say who they are three times.
 */
import { useEffect, useState } from 'react';
import { Check, Loader } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getSettings, saveSettings } from '../../services/engagement';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

export default function EngageSettings() {
  const { addNotification } = useApp();
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await getSettings();
      const s = (r.settings ?? {}) as Record<string, unknown>;
      setForm({
        businessName: s.business_name ?? '', supportEmail: s.support_email ?? '',
        accent: s.accent ?? '#5b46e5', notifyEmails: s.notify_emails ?? '',
        notifyNewConversation: s.notify_new_conversation !== 0,
        notifyNewTicket: s.notify_new_ticket !== 0,
        notifyNewSubmission: s.notify_new_submission !== 0,
      });
    })();
  }, []);

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 11px', border: `1px solid ${LINE}`, borderRadius: 9,
    fontSize: 13.5, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 5 };

  const toggle = (key: string, label: string, hint: string) => (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
      <input type="checkbox" checked={form[key] !== false} style={{ marginTop: 3 }}
        onChange={e => setForm({ ...form, [key]: e.target.checked })} />
      <span>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: INK }}>{label}</span>
        <span style={{ display: 'block', fontSize: 12, color: MUTED, marginTop: 1, lineHeight: 1.5 }}>{hint}</span>
      </span>
    </label>
  );

  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 22, display: 'grid', gap: 16, maxWidth: 760 }}>
      <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: 0 }}>Settings</h3>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))' }}>
        <label><span style={lbl}>Business name</span>
          <input style={inp} value={String(form.businessName ?? '')} onChange={e => setForm({ ...form, businessName: e.target.value })}
            placeholder="What your customers call you" /></label>
        <label><span style={lbl}>Support email</span>
          <input style={inp} value={String(form.supportEmail ?? '')} onChange={e => setForm({ ...form, supportEmail: e.target.value })} /></label>
      </div>

      <label><span style={lbl}>Tell these addresses</span>
        <input style={inp} value={String(form.notifyEmails ?? '')} onChange={e => setForm({ ...form, notifyEmails: e.target.value })}
          placeholder="you@yourbusiness.com, team@yourbusiness.com" />
        <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 5, lineHeight: 1.55 }}>
          Notifications are sent from your own connected mailbox, so a reply goes to you rather than to us.
          With no mailbox connected they are held rather than dropped, and go out when one is.
        </span></label>

      <div style={{ display: 'grid', gap: 11 }}>
        {toggle('notifyNewConversation', 'A chat starts or needs a person', 'The second one is the one that matters — somebody is waiting.')}
        {toggle('notifyNewTicket', 'A ticket is raised', 'Including ones the assistant opens on a customer’s behalf.')}
        {toggle('notifyNewSubmission', 'A form is submitted', 'Every submission is stored either way; this is only about being told.')}
      </div>

      <button onClick={() => void (async () => {
        setBusy(true);
        const r = await saveSettings(form);
        setBusy(false);
        addNotification(r.success ? 'Saved.' : (r.error ?? 'Could not save.'), r.success ? 'success' : 'error');
      })()} disabled={busy} style={{
        justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px',
        border: 'none', borderRadius: 10, background: ACCENT, color: '#fff', fontSize: 13.5, fontWeight: 700,
        cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
      }}>
        {busy ? <Loader size={14} className="spin" /> : <Check size={14} />} Save
      </button>
    </div>
  );
}
