/**
 * Autopilot — everything it has done, in one place, with a way into each of it.
 *
 * The app has a lot of modules and every one of them is operated by hand. This
 * is the screen for the other way round: you say what you want to happen, and
 * this is the account of what was done about it.
 *
 * Three things are on it, in the order somebody actually wants them:
 *
 *   1. What needs you. An action a guardrail held back is the only thing on
 *      this page that is blocked on a person, so it goes first — under it, a
 *      customer would find out they were the bottleneck by scrolling.
 *   2. What it did. Every action, newest first, each linking into the real
 *      record in the module that owns it.
 *   3. What it is about to do.
 *
 * Every row carries its *reason*. "Sent 40 emails" is a claim; "because these
 * 40 were tagged new-lead and had not been contacted in 30 days" is something
 * you can check and disagree with. A system that acts on your business without
 * being asked each time has to be arguable, or it is just opaque.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Rocket, Play, Pause, Check, X, ExternalLink, Loader, AlertTriangle,
  CircleDot, ChevronRight,
} from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import {
  fetchAutopilot, startAutopilot, setAutopilotStatus, approveAction, rejectAction,
  type AutopilotAction, type AutopilotRun, type ActionStatus,
} from '../../services/autopilot';
import { LINK_LABEL } from '../../types/aiSalesAgent';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';

/** How each state should read at a glance. A skip is not a failure and must not
 *  look like one — "they opted out" is the system working correctly. */
const STATE: Record<ActionStatus, { label: string; fg: string; bg: string }> = {
  done:     { label: 'Done',        fg: '#1e6b32', bg: '#e8f5e9' },
  awaiting: { label: 'Needs you',   fg: '#8a6d00', bg: '#fff8e1' },
  pending:  { label: 'Queued',      fg: '#3a4a63', bg: '#eef2f8' },
  skipped:  { label: 'Skipped',     fg: MUTED,     bg: '#f1f5f9' },
  failed:   { label: 'Did not work', fg: '#a02216', bg: '#fdecea' },
};

const when = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return d.toLocaleDateString();
};

function ActionRow({ action, onApprove, onReject, busy }: {
  action: AutopilotAction;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  busy?: boolean;
}) {
  const navigate = useNavigate();
  const s = STATE[action.status] ?? STATE.pending;
  const counts = Object.entries(action.counts ?? {});

  return (
    <li style={{ display: 'flex', gap: 12, padding: '13px 15px', borderBottom: `1px solid ${LINE}`, alignItems: 'flex-start' }}>
      <span style={{ flexShrink: 0, marginTop: 2, padding: '2px 9px', borderRadius: 999, background: s.bg, color: s.fg, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
        {s.label}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: INK, lineHeight: 1.45 }}>{action.summary}</p>

        {action.because && (
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
            because {action.because}
          </p>
        )}

        {action.detail && action.status !== 'done' && (
          <p style={{ margin: '4px 0 0', fontSize: 12, color: action.status === 'failed' ? '#a02216' : MUTED, lineHeight: 1.5 }}>
            {action.detail}
          </p>
        )}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 7 }}>
          {/* The link is the point. It opens the record in the module that owns
              it — never a copy of it rendered here, which would be a second
              version of the truth that could drift. */}
          {action.link?.route && (
            <button
              onClick={() => navigate(action.link!.route)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', border: `1px solid ${LINE}`, borderRadius: 8, background: '#fff', color: INK, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
            >
              {LINK_LABEL[action.link.kind] ?? 'Open'}
              {action.link.label ? ` · ${action.link.label}` : ''}
              <ExternalLink size={11} />
            </button>
          )}

          {counts.map(([k, v]) => (
            <span key={k} style={{ fontSize: 11.5, color: MUTED, fontWeight: 600 }}>
              {v} {k}
            </span>
          ))}

          <span style={{ fontSize: 11.5, color: '#9aa3af' }}>{when(action.actedAt ?? action.createdAt)}</span>
        </div>
      </div>

      {action.status === 'awaiting' && onApprove && onReject && (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={() => onApprove(action.id)} disabled={busy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', border: 'none', borderRadius: 8, background: INK, color: '#fff', fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
            <Check size={12} /> Do it
          </button>
          <button onClick={() => onReject(action.id)} disabled={busy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', border: `1px solid ${LINE}`, borderRadius: 8, background: '#fff', color: MUTED, fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
            <X size={12} /> Skip
          </button>
        </div>
      )}
    </li>
  );
}

export default function Autopilot() {
  const { addNotification } = useApp();
  const [run, setRun] = useState<AutopilotRun | null>(null);
  const [actions, setActions] = useState<AutopilotAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [objective, setObjective] = useState('');
  const [busy, setBusy] = useState(false);
  /* Bumped to ask again, rather than calling setState inside the effect that
     fetches — the shape this codebase settled on in AutomationPanel. */
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    void (async () => {
      const r = await fetchAutopilot();
      if (!live) return;
      setRun(r.run);
      setActions(r.actions);
      setLoading(false);
    })();
    return () => { live = false; };
  }, [reload]);

  const again = useCallback(() => setReload(n => n + 1), []);

  const start = async () => {
    setBusy(true);
    const r = await startAutopilot(objective);
    setBusy(false);
    if (!r.success) { addNotification(r.error ?? 'Could not start Autopilot.', 'error'); return; }
    setObjective('');
    again();
    addNotification('Autopilot is working out what to do. The first plan appears here shortly.', 'success');
  };

  const toggle = async () => {
    if (!run) return;
    setBusy(true);
    const next = run.status === 'paused' ? 'running' : 'paused';
    const r = await setAutopilotStatus(next);
    setBusy(false);
    if (!r.success) { addNotification(r.error ?? 'Could not change that.', 'error'); return; }
    again();
    addNotification(next === 'paused' ? 'Autopilot paused. Nothing further will be sent or published.' : 'Autopilot resumed.', 'success');
  };

  const decide = async (id: string, yes: boolean) => {
    setBusy(true);
    const r = yes ? await approveAction(id) : await rejectAction(id);
    setBusy(false);
    if (!r.success) { addNotification(r.error ?? 'Could not record that.', 'error'); return; }
    if (r.actions) setActions(r.actions);
  };

  const awaiting = actions.filter(a => a.status === 'awaiting');
  const queued = actions.filter(a => a.status === 'pending');
  const history = actions.filter(a => !['awaiting', 'pending'].includes(a.status));

  const card: React.CSSProperties = {
    background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, overflow: 'hidden',
  };
  const cardHead: React.CSSProperties = {
    padding: '13px 15px', borderBottom: `1px solid ${LINE}`, display: 'flex',
    alignItems: 'center', gap: 8, background: '#fafbfc',
  };

  /* ── Not set up yet ── */
  if (!loading && (!run || run.status === 'off')) {
    return (
      <div style={{ minHeight: '100vh' }}>
        <Header title="Autopilot" subtitle="Say what you want to happen. It does the rest." />
        <div style={{ padding: '46px 24px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ ...card, maxWidth: 620, width: '100%', padding: 28 }}>
            <div style={{ width: 54, height: 54, borderRadius: 16, background: INK, display: 'grid', placeItems: 'center', marginBottom: 16 }}>
              <Rocket size={24} color="#fff" />
            </div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>
              What do you want to happen?
            </h2>
            <p style={{ margin: '8px 0 18px', fontSize: 13.5, color: MUTED, lineHeight: 1.65 }}>
              One sentence, in your own words. Autopilot reads your company portfolio, works out what it would
              take, and does it — the site, the offer, the emails and texts, the follow-ups, the appointments.
              Everything it does appears on this page with a link straight to the real record.
            </p>
            <textarea
              value={objective}
              onChange={e => setObjective(e.target.value)}
              rows={3}
              placeholder="Book more boiler services for homeowners within 20 miles of Leeds"
              style={{ width: '100%', padding: '11px 13px', border: `1px solid ${LINE}`, borderRadius: 11, fontSize: 13.5, color: INK, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
              <button onClick={() => void start()} disabled={busy || objective.trim().length < 8}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 20px', border: 'none', borderRadius: 11, background: objective.trim().length < 8 ? '#c3c7cd' : INK, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: objective.trim().length < 8 ? 'default' : 'pointer' }}>
                {busy ? <Loader size={15} /> : <Play size={15} />} Start Autopilot
              </button>
              {/* Said before they commit, not discovered afterwards. */}
              <span style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, flex: 1, minWidth: 220 }}>
                The first email and the first text wait for your approval. After you allow a channel once, it
                runs without asking again.
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Header
        title="Autopilot"
        subtitle={run?.objective || 'Working from your company portfolio'}
      />

      <div style={{ padding: '18px clamp(16px, 3vw, 32px) 60px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 980, margin: '0 auto' }}>
        {loading && <p style={{ fontSize: 13, color: MUTED }}>Loading…</p>}

        {run && (
          <div style={{ ...card, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: run.status === 'running' ? '#1e6b32' : run.status === 'paused' ? '#8a6d00' : INK }}>
              <CircleDot size={14} />
              {run.status === 'running' ? 'Running' : run.status === 'paused' ? 'Paused' : 'Working out the plan'}
            </span>
            {run.lastActedAt && (
              <span style={{ fontSize: 12, color: MUTED }}>last did something {when(run.lastActedAt)}</span>
            )}
            {run.lastError && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#a02216', fontWeight: 600 }}>
                <AlertTriangle size={13} /> {run.lastError}
              </span>
            )}
            <button onClick={() => void toggle()} disabled={busy}
              style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: `1px solid ${LINE}`, borderRadius: 10, background: '#fff', color: INK, fontSize: 12.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
              {run.status === 'paused' ? <><Play size={13} /> Resume</> : <><Pause size={13} /> Pause</>}
            </button>
          </div>
        )}

        {/* ── Blocked on a person, so it goes first ── */}
        {awaiting.length > 0 && (
          <div style={{ ...card, borderColor: '#f0d68a' }}>
            <div style={{ ...cardHead, background: '#fff8e1' }}>
              <AlertTriangle size={15} color="#8a6d00" />
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#8a6d00' }}>
                {awaiting.length} thing{awaiting.length === 1 ? '' : 's'} need{awaiting.length === 1 ? 's' : ''} you
              </h3>
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {awaiting.map(a => (
                <ActionRow key={a.id} action={a} busy={busy}
                  onApprove={id => void decide(id, true)} onReject={id => void decide(id, false)} />
              ))}
            </ul>
          </div>
        )}

        {/* ── What it did ── */}
        <div style={card}>
          <div style={cardHead}>
            <Rocket size={15} color={INK} />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: INK }}>What Autopilot did</h3>
          </div>
          {history.length === 0 ? (
            <p style={{ margin: 0, padding: '22px 15px', fontSize: 13, color: MUTED }}>
              Nothing yet. The first plan is usually ready within a few minutes of starting.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {history.map(a => <ActionRow key={a.id} action={a} />)}
            </ul>
          )}
        </div>

        {/* ── What is next ── */}
        {queued.length > 0 && (
          <div style={card}>
            <div style={cardHead}>
              <ChevronRight size={15} color={MUTED} />
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: INK }}>Next up</h3>
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {queued.map(a => <ActionRow key={a.id} action={a} />)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
