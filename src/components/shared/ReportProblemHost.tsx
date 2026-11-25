/**
 * The app's "Report a problem": a button that is always on screen, the sheet
 * it opens, and where the customer follows their report afterwards.
 *
 * ── The button (owner, 2026-11-25) ──
 *
 * "Report a problem" sits just to the left of the help button, on every
 * signed-in screen, for somebody who is stuck or has found a bug. It is
 * placed by measuring the help widget's launcher (public/widget.js draws it,
 * and its width changes with the screen and the green dot), so the two never
 * overlap; with no widget it takes the corner. It steps aside while a modal
 * dialog is open, as the corner card does (CornerHelp.tsx): a wizard's
 * footer button lives in that corner. The help widget's own **Report a
 * problem** option still opens the same sheet (`window.ProtectedCentralReport`).
 *
 * ── After sending ──
 *
 * The report is a ticket and, now, a fix the owner is asked to start
 * (worker/src/lib/problemFix.ts). While it is open the button says so —
 * "Fix in progress" once a session is really working on it, never before —
 * and pressing it shows what the customer was told: wait 10–15 minutes and
 * refresh, then "fixed — check it" with the strategy-call link. The same
 * words reach them in the corner card and by email, from the server.
 *
 * Signed out (the marketing site) nothing is drawn or registered and the
 * widget shows its own form. Not on a reseller's own address either, where
 * the product is somebody else's brand (as HelpLauncher).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bug, CalendarCheck, CheckCircle2, Loader, RefreshCw, Wrench, X } from 'lucide-react';
import ReportProblem from '../Protron/ReportProblem';
import { FIX_EVENT, isOpen, myReports, type MyReport } from '../../services/problemFix';
import { isWhiteLabelHost } from '../../services/hosts';
import '../Protron/protron.css';

declare global { interface Window { ProtectedCentralReport?: { open: () => void } } }

const SEEN_KEY = 'pc_fix_seen';
const FRESH_MS = 48 * 3_600_000;

function seenFixed(): string[] {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]') as string[]; } catch { return []; }
}
function markSeen(id: string) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([id, ...seenFixed().filter(x => x !== id)].slice(0, 20))); } catch { /* private window */ }
}

/** Whether a modal dialog is open anywhere (the same test as CornerHelp). */
function useModalOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const check = () => setOpen(!!document.querySelector('[aria-modal="true"]'));
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal'] });
    return () => mo.disconnect();
  }, []);
  return open;
}

/** Where the help launcher is, so this sits to its left at the same height. */
function useBesideHelp(): { right: number; bottom: number } {
  const [at, setAt] = useState({ right: 12, bottom: 12 });
  useEffect(() => {
    const place = () => {
      const l = document.querySelector('.pc-launch-app, [data-pc-help-placeholder]') as HTMLElement | null;
      const r = l?.getBoundingClientRect();
      const next = r && r.width > 0
        ? { right: Math.round(window.innerWidth - r.left + 8), bottom: Math.round(window.innerHeight - r.bottom + (r.height - 34) / 2) }
        : { right: 12, bottom: 12 };
      setAt(cur => (cur.right === next.right && cur.bottom === next.bottom ? cur : next));
    };
    place();
    const t = window.setInterval(place, 1200);
    window.addEventListener('resize', place);
    return () => { window.clearInterval(t); window.removeEventListener('resize', place); };
  }, []);
  return at;
}

export default function ReportProblemHost() {
  const [open, setOpen] = useState<'' | 'sheet' | 'status'>('');
  const [sent, setSent] = useState('');
  const [reports, setReports] = useState<MyReport[]>([]);
  const [call, setCall] = useState('');
  const [seen, setSeen] = useState<string[]>(seenFixed);
  /* Held while the panel is open: marking a fix as seen must not swap the panel for the sheet. */
  const [viewing, setViewing] = useState<MyReport | null>(null);
  const modal = useModalOpen();
  const at = useBesideHelp();
  const busy = useRef(false);
  const wl = isWhiteLabelHost();

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const r = await myReports();
    busy.current = false;
    setReports(r.reports);
    setCall(r.strategyCall);
  }, []);

  useEffect(() => {
    const api = { open: () => { setSent(''); setOpen('sheet'); } };
    window.ProtectedCentralReport = api;
    return () => { if (window.ProtectedCentralReport === api) delete window.ProtectedCentralReport; };
  }, []);

  /* Their reports: once on load, at once after sending, and every minute
     while one is still open and the page is in front of them. */
  const live = reports.find(r => isOpen(r.status));
  useEffect(() => {
    if (wl) return;
    void refresh();
    const now = () => void refresh();
    window.addEventListener(FIX_EVENT, now);
    return () => window.removeEventListener(FIX_EVENT, now);
  }, [refresh, wl]);
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 60_000);
    return () => window.clearInterval(t);
  }, [live, refresh]);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(''); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open]);

  const fixedNew = reports.find(r => r.status === 'fixed' && !seen.includes(r.id) && Date.now() - Date.parse(r.updatedAt) < FRESH_MS);
  const shown = live ?? fixedNew;
  const working = !!live && (live.status === 'fixing' || live.status === 'ready');

  const press = () => {
    setSent('');
    if (shown) {
      setViewing(shown);
      setOpen('status');
      if (shown.status === 'fixed') { markSeen(shown.id); setSeen(seenFixed()); }
    } else setOpen('sheet');
  };

  if (wl) return null;
  return (
    <>
      {!open && !modal && (
        <button type="button" onClick={press} data-no-shot="" data-testid="report-problem-button"
          className="pc-report-btn" data-state={fixedNew && !live ? 'fixed' : working ? 'working' : live ? 'waiting' : ''}
          title={shown ? `${shown.title}${shown.reference ? ` (${shown.reference})` : ''}` : 'Stuck, or found a bug? Report it with a screenshot or a voice note'}
          aria-label={shown ? `Your report: ${shown.title}` : 'Report a problem'}
          style={{ right: at.right, bottom: at.bottom }}>
          {fixedNew && !live ? <CheckCircle2 size={15} /> : working ? <Wrench size={15} /> : <Bug size={15} />}
          <span className="pc-report-btn-label">{fixedNew && !live ? 'Fixed — check it' : working ? 'Fix in progress' : live ? 'Report received' : 'Report a problem'}</span>
        </button>
      )}
      {open && (
        /* data-no-shot: the screenshot is of the screen behind, not of this. */
        <div data-no-shot="" role="presentation" style={{
          position: 'fixed', inset: 0, zIndex: 2147483100, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
          /* Blurred behind: the dark theme draws panels as glass, and the page's words showed through. */
          padding: 16, background: 'rgba(15,23,42,.18)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', boxSizing: 'border-box',
        }} onClick={e => { if (e.target === e.currentTarget) setOpen(''); }}>
          <div style={{
            width: 'min(420px, 100%)', maxHeight: 'min(680px, calc(100vh - 32px))', display: 'flex', flexDirection: 'column',
            borderRadius: 18, overflow: 'hidden', boxShadow: '0 24px 60px -18px rgba(15,23,42,.55)', background: '#f7f8fa',
          }}>
            {open === 'status' && viewing ? (
              <Status r={reports.find(x => x.id === viewing.id) ?? viewing} call={call} onClose={() => setOpen('')} onAnother={() => setOpen('sheet')} />
            ) : sent ? (
              <div role="status" data-testid="report-sent" style={PANEL}>
                <div style={HEAD}>
                  <b style={TITLE}><CheckCircle2 size={17} color="#16a34a" /> Report sent</b>
                  <button type="button" className="pt-icon" aria-label="Close" style={{ color: '#374151' }} onClick={() => setOpen('')}><X size={16} /></button>
                </div>
                <p style={TEXT}>{sent}</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="pt-btn" onClick={() => { setOpen(''); window.ProtectedCentralChat?.open('status'); }}>Check ticket status</button>
                  <button type="button" className="pt-btn pt-btn-primary" onClick={() => setOpen('')}>Done</button>
                </div>
              </div>
            ) : (
              <ReportProblem initial="" onClose={() => setOpen('')} onSent={message => {
                setSent(message);
                window.dispatchEvent(new Event(FIX_EVENT));
              }} />
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** What the customer was told about their report, and what they can do now. */
function Status({ r, call, onClose, onAnother }: { r: MyReport; call: string; onClose: () => void; onAnother: () => void }) {
  const working = r.status === 'fixing' || r.status === 'ready';
  const fixed = r.status === 'fixed';
  return (
    <div role="status" data-testid="report-status" data-status={r.status} style={PANEL}>
      <div style={HEAD}>
        <b style={TITLE}>
          {fixed ? <CheckCircle2 size={17} color="#16a34a" /> : working ? <Loader size={16} className="spin" color="#5b46e5" /> : <Bug size={16} color="#5b46e5" />}
          {r.title}
        </b>
        <button type="button" className="pt-icon" aria-label="Close" style={{ color: '#374151' }} onClick={onClose}><X size={16} /></button>
      </div>
      <p style={{ ...TEXT, color: '#6b7280', fontSize: 12 }}>
        {r.reference ? `${r.reference} · ` : ''}“{r.description}”
      </p>
      <p style={TEXT}>{r.body}</p>
      {call && (fixed || working) && (
        <p style={{ ...TEXT, fontSize: 12.5 }}>
          {fixed ? 'Want to talk to one of us about the fix?' : 'Want to talk to one of us right now?'} You can book a free strategy call.
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(fixed || working) && (
          <button type="button" className="pt-btn pt-btn-primary" onClick={() => window.location.reload()}><RefreshCw size={14} /> Refresh the page</button>
        )}
        {call && (fixed || working) && (
          <a className="pt-btn" href={call} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}><CalendarCheck size={14} /> Book a strategy call</a>
        )}
        <button type="button" className="pt-btn" onClick={onAnother}><Bug size={14} /> Report another problem</button>
      </div>
    </div>
  );
}

const PANEL: React.CSSProperties = { padding: 18, display: 'grid', gap: 10, color: '#111827' };
const HEAD: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 };
const TITLE: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 15 };
const TEXT: React.CSSProperties = { margin: 0, fontSize: 13, lineHeight: 1.55, color: '#374151', overflowWrap: 'anywhere' };
