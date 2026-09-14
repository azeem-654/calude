/**
 * Watching it happen.
 *
 * ── Why the whole list is drawn before anything has run ──
 *
 * A progress view that grows a row at a time tells somebody what has happened
 * and never what is left, which is the only thing they want to know while they
 * wait. The endpoint returns the plan as well as the steps, so all seven are on
 * screen from the first render and each one fills in.
 *
 * ── Polling, and stopping ──
 *
 * Every three seconds while there is anything left to do, and then not at all.
 * A finished order that keeps polling is a tab quietly asking a question with a
 * known answer for as long as somebody leaves it open — and the interval is
 * cleared on the answer, not on unmount alone, because people leave this screen
 * up after it finishes to admire it.
 *
 * A failed step says so plainly and says what happens next, because something
 * does: the runner retries on its own schedule. What it never shows is the
 * provider's own error text — that is the owner's to read, in the admin view.
 */
import { useEffect, useRef, useState } from 'react';
import { Check, Loader, AlertCircle, Clock, Minus, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { setupStatus, money, type ProvisionStep, type SetupOrder } from '../../services/digitalSetup';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

const POLL_MS = 3000;

function Row({ label, status, detail }: { label: string; status: ProvisionStep['status']; detail: string }) {
  const tone = status === 'done' ? { bg: '#e8f6ee', fg: '#0f7b3d' }
    : status === 'failed' ? { bg: '#fdf3f3', fg: '#b42318' }
      : status === 'running' ? { bg: 'rgba(91,70,229,0.09)', fg: ACCENT }
        : status === 'skipped' ? { bg: '#f2f3f5', fg: MUTED }
          : { bg: '#f7f8fa', fg: MUTED };

  return (
    <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '11px 0' }}>
      <span style={{
        width: 24, height: 24, borderRadius: 999, flexShrink: 0, marginTop: 1,
        background: tone.bg, color: tone.fg, display: 'grid', placeItems: 'center',
      }}>
        {status === 'done' ? <Check size={13} />
          : status === 'failed' ? <AlertCircle size={13} />
            : status === 'running' ? <Loader size={13} className="spin" />
              : status === 'skipped' ? <Minus size={13} />
                : <Clock size={13} />}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{
          display: 'block', fontSize: 13, fontWeight: 700,
          color: status === 'pending' ? MUTED : INK,
        }}>{label}</span>
        {detail && (
          <span style={{
            display: 'block', fontSize: 11.5, marginTop: 2, lineHeight: 1.55,
            color: status === 'failed' ? '#b42318' : MUTED,
          }}>{detail}</span>
        )}
      </span>
    </div>
  );
}

export default function SetupProgress({ orderId, onDone }: {
  orderId: string;
  onDone?: (order: SetupOrder) => void;
}) {
  const navigate = useNavigate();
  const [order, setOrder] = useState<SetupOrder | null>(null);
  const [steps, setSteps] = useState<ProvisionStep[]>([]);
  const [plan, setPlan] = useState<Array<{ seq: number; step: string; label: string }>>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  /* Held in a ref so the poll can stop itself without the effect re-running and
     starting a second one. */
  const timer = useRef<number | undefined>(undefined);
  const told = useRef(false);

  useEffect(() => {
    let live = true;

    const tick = async () => {
      const r = await setupStatus(orderId);
      if (!live) return;
      setLoading(false);
      setError(r.error);
      setOrder(r.order);
      setSteps(r.steps);
      if (r.plan.length) setPlan(r.plan);

      const finished = r.order?.status === 'done' || r.order?.status === 'failed';
      if (finished) {
        window.clearInterval(timer.current);
        if (r.order && r.order.status === 'done' && !told.current) {
          told.current = true;
          onDone?.(r.order);
        }
      }
    };

    void tick();
    timer.current = window.setInterval(() => void tick(), POLL_MS);
    return () => { live = false; window.clearInterval(timer.current); };
  }, [orderId, onDone]);

  /* The plan is the skeleton; a step that has run replaces its row. Drawn from
     the plan rather than the steps so the list is complete from the first
     paint, before the runner has written a single row. */
  const byStep = new Map(steps.map(s => [s.step, s]));
  const rows = (plan.length ? plan : steps.map(s => ({ seq: s.seq, step: s.step, label: s.label })))
    .map(p => byStep.get(p.step) ?? { seq: p.seq, step: p.step, status: 'pending' as const, label: p.label, detail: '', finishedAt: null });

  const done = rows.filter(r => r.status === 'done' || r.status === 'skipped').length;
  const failed = rows.some(r => r.status === 'failed');
  const allDone = order?.status === 'done';

  if (loading) {
    return <p style={{ fontSize: 13, color: MUTED, padding: '20px 0' }}>Loading your setup…</p>;
  }
  if (error) {
    return <p style={{ fontSize: 13, color: '#b42318', padding: '20px 0' }}>{error}</p>;
  }

  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 16, background: '#fff', overflow: 'hidden', maxWidth: 560 }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${LINE}`, background: '#fafbfc' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: INK }}>
          {allDone ? `${order?.domain} is live` : failed ? 'We hit a snag' : `Setting up ${order?.domain}`}
        </div>
        <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>
          {allDone
            ? 'Everything you ordered is set up and running.'
            : failed
              ? 'Most of it is done. We are retrying the rest automatically.'
              : `${done} of ${rows.length} steps finished — this usually takes a couple of minutes.`}
        </div>

        {/* A bar that means the thing it looks like: steps finished, not time. */}
        <div style={{ height: 5, borderRadius: 999, background: '#eceef3', marginTop: 10, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 999,
            width: `${Math.round((done / Math.max(rows.length, 1)) * 100)}%`,
            background: failed ? '#f0a02a' : allDone ? '#1e9e54' : ACCENT,
            transition: 'width 0.4s ease',
          }} />
        </div>
      </div>

      <div style={{ padding: '4px 16px 12px' }}>
        {rows.map(r => <Row key={r.step} label={r.label} status={r.status} detail={r.detail} />)}
      </div>

      {order && order.lines.length > 0 && (
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${LINE}`, background: '#fafbfc', display: 'flex', gap: 10, alignItems: 'baseline' }}>
          <span style={{ flex: 1, fontSize: 12, color: MUTED }}>Paid</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>
            {money(order.totalCents, order.currency)}
            {order.monthlyCents > 0 && ` · then ${money(order.monthlyCents, order.currency)}/mo`}
          </span>
        </div>
      )}

      {allDone && (
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${LINE}` }}>
          <button onClick={() => navigate('/autopilot')} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px',
            border: 'none', borderRadius: 9, background: INK, color: '#fff',
            fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            See your content plan <ArrowRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
