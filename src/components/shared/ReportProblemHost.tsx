/**
 * The app's "Report a problem" sheet, opened from the help button.
 *
 * It was a button inside the floating Protron. On live the floating Protron
 * is gone (owner, 2026-11-15: "remove only the floating Protron from the live
 * site and move its capacity into the live chat button"), so the help
 * widget's **Report a problem** option opens it instead: the widget calls
 * `window.ProtectedCentralReport.open()`, which this registers while somebody
 * is signed in. The sheet itself is unchanged (Protron/ReportProblem.tsx) —
 * a screenshot of the screen they were on, their words, their own pictures —
 * and the report is now also a ticket (lib/problemReport.ts) they can follow
 * under Help → Check ticket status.
 *
 * Signed out (the marketing site) nothing is registered and the widget shows
 * its own form, which cannot take a screenshot of the page but takes theirs.
 */
import { useEffect, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import ReportProblem from '../Protron/ReportProblem';
import '../Protron/protron.css';

declare global { interface Window { ProtectedCentralReport?: { open: () => void } } }

export default function ReportProblemHost() {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState('');

  useEffect(() => {
    const api = { open: () => { setSent(''); setOpen(true); } };
    window.ProtectedCentralReport = api;
    return () => { if (window.ProtectedCentralReport === api) delete window.ProtectedCentralReport; };
  }, []);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open]);

  if (!open) return null;
  return (
    /* data-no-shot: the screenshot is of the screen behind, not of this. */
    <div data-no-shot="" role="presentation" style={{
      position: 'fixed', inset: 0, zIndex: 2147483100, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
      padding: 16, background: 'rgba(15,23,42,.18)', boxSizing: 'border-box',
    }} onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div style={{
        width: 'min(420px, 100%)', maxHeight: 'min(640px, calc(100vh - 32px))', display: 'flex', flexDirection: 'column',
        borderRadius: 18, overflow: 'hidden', boxShadow: '0 24px 60px -18px rgba(15,23,42,.55)', background: '#f7f8fa',
      }}>
        {sent ? (
          <div role="status" data-testid="report-sent" style={{ padding: 18, display: 'grid', gap: 10, color: '#111827' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <b style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 15 }}><CheckCircle2 size={17} color="#16a34a" /> Report sent</b>
              <button type="button" className="pt-icon" aria-label="Close" style={{ color: '#374151' }} onClick={() => setOpen(false)}><X size={16} /></button>
            </div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: '#374151' }}>{sent}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="pt-btn" onClick={() => { setOpen(false); window.ProtectedCentralChat?.open('status'); }}>Check ticket status</button>
              <button type="button" className="pt-btn pt-btn-primary" onClick={() => setOpen(false)}>Done</button>
            </div>
          </div>
        ) : (
          <ReportProblem initial="" onClose={() => setOpen(false)} onSent={message => setSent(message)} />
        )}
      </div>
    </div>
  );
}
