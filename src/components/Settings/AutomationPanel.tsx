/**
 * Settings → Automation.
 *
 * The answer to "did my campaign go out", and the place to call one off before
 * it does.
 *
 * Every number on this screen comes from the server, because every one of them
 * is about something that happened with nobody watching. The schedule runs on
 * a cron; a browser cannot know whether it ran, only whether it is running now.
 * That is also why the health line leads with when the schedule last ran rather
 * than with how much it sent — a quiet week is not a broken cron, and a screen
 * that conflates the two teaches people to ignore it.
 */
import { useEffect, useState } from 'react';
import {
  Loader, CalendarClock, CheckCircle, XCircle, AlertTriangle, RefreshCw,
  Activity, Users, Ban,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  automationHealth, cancelSchedule, planUsage,
  type Health, type Schedule, type PlanUsage,
} from '../../services/automation';

const INK = '#17191c';
const MUTED = '#5b6472';
const LINE = '#e6e9f0';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 18, boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
      {children}
    </div>
  );
}

function ScheduleRow({ s, onCancel }: { s: Schedule; onCancel?: (id: string) => void }) {
  const tone = s.status === 'failed'
    ? { bg: '#fdecec', fg: '#b42318', border: '#f7cdc9' }
    : s.status === 'done'
      ? { bg: '#fbfdfb', fg: '#1e6b32', border: '#cfe6d2' }
      : { bg: '#fff', fg: MUTED, border: LINE };

  /* Cancelled is not failed. Somebody calling a campaign off deliberately, then
     seeing it listed in red as a failure, is being told they broke something. */
  const status = s.status === 'pending'
    ? `Starts ${when(s.startAt)}`
    : s.status === 'cancelled'
      ? `Called off ${when(s.ranAt)}`
      : `${s.status === 'done' ? 'Ran' : 'Failed'} ${when(s.ranAt)}`;

  return (
    <li style={{
      padding: '11px 12px', borderRadius: 12,
      background: tone.bg, border: `1px solid ${tone.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ flex: 1, minWidth: 140, fontSize: 13, fontWeight: 700, color: INK }}>
          {s.label || 'Campaign'}
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: tone.fg, whiteSpace: 'nowrap' }}>
          {status}
        </span>
        {s.status === 'pending' && onCancel && (
          <button onClick={() => onCancel(s.id)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', cursor: 'pointer',
            background: '#f1f3f7', color: '#b42318', fontSize: 11.5, fontWeight: 700,
            padding: '6px 10px', borderRadius: 9,
          }}>
            <Ban size={11} /> Call it off
          </button>
        )}
      </div>
      <p style={{ margin: '5px 0 0', fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
        {s.detail || (s.audience.status?.length
          ? `Will enrol ${s.audience.status.join(', ')} contacts.`
          : 'Will enrol everyone with an email address.')}
      </p>
    </li>
  );
}

export default function AutomationPanel() {
  const { addNotification } = useApp();
  const [health, setHealth] = useState<Health | null>(null);
  const [plan, setPlan] = useState<PlanUsage | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  /* Bumped to ask again — by the button, and after calling a schedule off. One
     loader rather than two copies of the same three requests. */
  const [reload, setReload] = useState(0);

  /*
   * `alive` because both of these are network round trips and this panel is one
   * tab among twelve: somebody clicking through Settings quickly leaves a
   * request in flight for a component that is already gone.
   */
  useEffect(() => {
    let alive = true;
    (async () => {
      const [h, p] = await Promise.all([automationHealth(), planUsage()]);
      if (!alive) return;
      setHealth(h);
      setPlan(p);
      setError(h.error ?? '');
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [reload]);

  const off = async (id: string) => {
    const r = await cancelSchedule(id);
    addNotification(r.success ? 'Called off.' : (r.error ?? 'That could not be cancelled.'), r.success ? 'success' : 'error');
    setReload(k => k + 1);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: MUTED, fontSize: 13, padding: 20 }}>
        <Loader size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Asking the server what it has been doing…
      </div>
    );
  }

  const ticks = health?.ticks ?? [];
  const sent = ticks.reduce((n, t) => n + t.sent, 0);
  const failed = ticks.reduce((n, t) => n + t.failed, 0);
  const problems = ticks.flatMap(t => t.notes.filter(n => n.kind === 'problem').map(n => ({ at: t.at, text: n.text })));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>Automation</h2>
        <p style={{ margin: '5px 0 0', fontSize: 13, color: MUTED, lineHeight: 1.55, maxWidth: 640 }}>
          What the schedule has been doing while you were not here — what started, what sent, and anything it could not
          do. Campaigns run on the server, so this is the only place that can tell you.
        </p>
      </div>

      {error && (
        <div style={{ fontSize: 12.5, color: '#b42318', background: '#fdecec', border: '1px solid #f7cdc9', borderRadius: 10, padding: '9px 11px' }}>
          {error}
        </div>
      )}

      {/* ── Is it alive ── */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <span style={{
            width: 38, height: 38, borderRadius: 12, flexShrink: 0, display: 'grid', placeItems: 'center',
            background: health?.healthy ? '#e8f5e9' : '#fff9e6',
            color: health?.healthy ? '#1e6b32' : '#8a6d00',
          }}>
            {health?.healthy ? <Activity size={17} /> : <AlertTriangle size={17} />}
          </span>
          <div style={{ flex: 1, minWidth: 180 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: INK }}>
              {health?.healthy ? 'The schedule is running' : 'The schedule is quiet'}
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
              {health?.note} Last run {when(health?.lastTickAt ?? null)}.
            </p>
          </div>
          <button onClick={() => setReload(k => k + 1)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', cursor: 'pointer',
            background: '#f1f3f7', color: INK, fontSize: 12.5, fontWeight: 700, padding: '8px 13px', borderRadius: 10,
          }}>
            <RefreshCw size={12} /> Check again
          </button>
        </div>

        {/* Counted over the window the tick log actually keeps, and labelled as
            such — a figure with no period on it invites the wrong reading. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 14 }}>
          {[
            { label: 'Sent', value: sent, icon: CheckCircle },
            { label: 'Failed', value: failed, icon: XCircle },
            { label: 'Campaigns started', value: ticks.reduce((n, t) => n + t.started, 0), icon: CalendarClock },
          ].map(m => (
            <div key={m.label} style={{ padding: '11px 12px', borderRadius: 12, background: '#f7f8fa' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: MUTED }}>
                <m.icon size={12} /> {m.label}
              </span>
              <span style={{ display: 'block', fontSize: 22, fontWeight: 800, color: INK, marginTop: 2, letterSpacing: '-0.03em' }}>
                {m.value}
              </span>
            </div>
          ))}
        </div>
        <p style={{ margin: '9px 0 0', fontSize: 11.5, color: MUTED }}>
          Across the last {ticks.length} run{ticks.length === 1 ? '' : 's'} of the schedule, this workspace only.
        </p>
      </Card>

      {/* ── What is queued ── */}
      <Card>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: INK }}>Waiting to start</h3>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
          Campaigns set to begin on their own. Calling one off leaves the campaign alone — it just stops it starting
          by itself.
        </p>
        {health?.pending.length
          ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {health.pending.map(s => <ScheduleRow key={s.id} s={s} onCancel={off} />)}
            </ul>
          )
          : <p style={{ margin: 0, fontSize: 12.5, color: MUTED }}>Nothing scheduled. Build a campaign from the dashboard and you can set a start date at the end.</p>}
      </Card>

      {/* ── What already happened ── */}
      {(health?.recent.length ?? 0) > 0 && (
        <Card>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800, color: INK }}>Already started</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {health!.recent.map(s => <ScheduleRow key={s.id} s={s} />)}
          </ul>
        </Card>
      )}

      {/* ── What went wrong ── */}
      {problems.length > 0 && (
        <Card>
          <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: INK }}>Things it could not do</h3>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
            Exactly what the schedule said, for this workspace. Most of these are one setting away from fixed.
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {problems.slice(0, 25).map((p, i) => (
              <li key={i} style={{ display: 'flex', gap: 9, padding: '9px 11px', borderRadius: 11, background: '#fff9e6', border: '1px solid #f6e2a8' }}>
                <AlertTriangle size={13} color="#8a6d00" style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, color: '#5c4a00', lineHeight: 1.5 }}>{p.text}</span>
                  <span style={{ display: 'block', fontSize: 11, color: MUTED, marginTop: 2 }}>{when(p.at)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── The plan, from the side that enforces it ── */}
      {plan && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, display: 'grid', placeItems: 'center', background: '#f1f3f7', color: INK }}>
              <Users size={17} />
            </span>
            <div style={{ flex: 1, minWidth: 180 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: INK }}>Sub-accounts</h3>
              <p style={{ margin: '3px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
                {plan.note} This is the number the server enforces, not a display of what the browser thinks.
              </p>
            </div>
            <span style={{
              fontSize: 12, fontWeight: 800, padding: '5px 11px', borderRadius: 999,
              background: '#f1f3f7', color: INK, whiteSpace: 'nowrap',
            }}>
              {plan.limit < 0 ? `${plan.used} open` : `${plan.used} / ${plan.limit}`}
            </span>
          </div>

          {plan.limit >= 0 && (
            <div style={{ height: 6, borderRadius: 999, background: '#e9ecf2', overflow: 'hidden', marginTop: 13 }}>
              <div style={{
                height: '100%', borderRadius: 999,
                width: `${plan.limit === 0 ? 100 : Math.min(100, (plan.used / plan.limit) * 100)}%`,
                background: plan.remaining === 0 ? '#f6c445' : '#3f9142',
              }} />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
