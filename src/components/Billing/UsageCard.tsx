/**
 * Usage — every allowance of the plan, used against allowed.
 *
 * Read from /api/allowances.php `status`, which reads the same tables the
 * refusals do (worker/src/lib/allowanceStore.ts), so a bar here and a "no"
 * from the server cannot disagree. Unlimited is said in words and has no bar:
 * a bar at zero would read as "none used of something", which is a claim
 * about a limit that does not exist.
 *
 * Also exported: `MeterStrip`, the compact line of the four meters a person
 * on the AI Autopilot board is most likely to run into.
 */
import { useEffect, useState } from 'react';
import { Gauge, Infinity as InfinityIcon, Loader } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  METERS, fetchAllowances, fill, formatLimit, isUnlimited, meterOf, onAllowances, type AllowanceView, type MeterId, type MeterReading,
} from '../../services/allowances';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';

function useAllowances(): AllowanceView | null | undefined {
  const [v, setV] = useState<AllowanceView | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void fetchAllowances().then(x => { if (alive) setV(x); });
    const off = onAllowances(x => { if (alive) setV(x); });
    return () => { alive = false; off(); };
  }, []);
  return v;
}

const tone = (f: number) => (f >= 1 ? '#b91c1c' : f >= 0.8 ? '#b45309' : '#047857');
const round = (n: number) => (Number.isInteger(n) ? n : Math.round(n * 10) / 10);

function Bar({ r }: { r: Pick<MeterReading, 'used' | 'limit'> }) {
  const f = fill(r);
  return (
    <div aria-hidden="true" style={{ height: 6, borderRadius: 999, background: '#eef0f3', overflow: 'hidden' }}>
      <div style={{ width: `${Math.round(f * 100)}%`, minWidth: r.used > 0 ? 3 : 0, height: '100%', borderRadius: 999, background: tone(f) }} />
    </div>
  );
}

function Row({ r }: { r: MeterReading }) {
  const m = meterOf(r.id)!;
  const unlimited = isUnlimited(r.limit);
  const full = !unlimited && r.used >= r.limit;
  return (
    <div data-meter={r.id} style={{ display: 'grid', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }} title={m.counted}>{m.label}</span>
        <span style={{ fontSize: 13, color: full ? '#b91c1c' : '#3f4247', fontVariantNumeric: 'tabular-nums', fontWeight: full ? 700 : 500 }}>
          {unlimited
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{round(r.used).toLocaleString('en-US')} used · <InfinityIcon size={13} aria-hidden="true" /> Unlimited</span>
            : <>{round(r.used).toLocaleString('en-US')} of {formatLimit(r.limit, m)}</>}
        </span>
      </div>
      {!unlimited && <Bar r={r} />}
      <span style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.45 }}>{r.note ? `${r.note}. ` : ''}{m.counted}</span>
    </div>
  );
}

export default function UsageCard() {
  const v = useAllowances();
  const resets = v?.resetsAt ? new Date(v.resetsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }) : '';
  const groups = [...new Set(METERS.map(m => m.group))];

  return (
    <section aria-labelledby="usage-h" data-usage-card style={{ background: '#fff', borderRadius: 18, padding: 'clamp(18px, 4vw, 28px)', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Gauge size={18} color={INK} strokeWidth={2.4} />
        <h2 id="usage-h" style={{ margin: 0, fontSize: 17, fontWeight: 800, color: INK }}>Usage</h2>
        {v && <span style={{ fontSize: 12.5, fontWeight: 700, color: '#3f4247', background: '#f1f2f4', borderRadius: 999, padding: '3px 10px' }}>{v.planName}</span>}
      </div>
      {v === undefined && <p style={{ color: MUTED, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}><Loader size={14} className="spin" /> Reading what you have used…</p>}
      {v === null && <p role="status" style={{ color: '#92400e', fontSize: 13.5 }}>Your usage could not be read just now. Nothing is lost — it is counted on the server either way.</p>}
      {v && (
        <>
          <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.55, margin: '8px 0 18px' }}>
            {v.kind === 'owner'
              ? 'You run this installation, so nothing you do is limited. What you use is still counted, below.'
              : <>Monthly allowances start again on <strong style={{ color: INK }}>{resets}</strong> (UTC).
                {v.workspaces > 1 ? <> They are shared by your {v.workspaces} workspaces.</> : null}
                {v.kind === 'trial' || v.kind === 'ended' ? ' These are the free trial’s numbers; a plan raises every one.' : ''}</>}
          </p>
          <div style={{ display: 'grid', gap: 22 }}>
            {groups.map(g => (
              <div key={g} style={{ display: 'grid', gap: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, borderBottom: `1px solid ${LINE}`, paddingBottom: 6 }}>{g}</div>
                <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))' }}>
                  {v.meters.filter(r => meterOf(r.id)?.group === g).map(r => <Row key={r.id} r={r} />)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** The four meters the AI Autopilot board is about, on one line. Nothing at all when unreadable. */
const STRIP: MeterId[] = ['autopilot_projects', 'social_posts', 'ai_shorts', 'prospects_found'];
const SHORT: Partial<Record<MeterId, string>> = { autopilot_projects: 'Business Workspaces', social_posts: 'Posts', ai_shorts: 'Shorts', prospects_found: 'Prospects' };

export function MeterStrip() {
  const v = useAllowances();
  if (!v) return null;
  return (
    <Link to="/billing" data-meter-strip aria-label={`Plan usage on ${v.planName} — open Plan & billing`}
      style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', alignItems: 'center', textDecoration: 'none', color: MUTED, fontSize: 12, marginTop: 10 }}>
      <span style={{ fontWeight: 700, color: INK }}>{v.planName}</span>
      {STRIP.map(id => {
        const r = v.meters.find(x => x.id === id);
        if (!r) return null;
        const unlimited = isUnlimited(r.limit);
        const f = fill(r);
        return (
          <span key={id} data-meter={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span>{SHORT[id]}{meterOf(id)?.kind === 'monthly' ? ' this month' : ''}</span>
            <strong style={{ color: !unlimited && f >= 1 ? '#b91c1c' : INK, fontVariantNumeric: 'tabular-nums' }}>
              {round(r.used).toLocaleString('en-US')}{unlimited ? '' : `/${r.limit.toLocaleString('en-US')}`}
            </strong>
            {!unlimited && <span style={{ width: 36, display: 'inline-block' }}><Bar r={r} /></span>}
          </span>
        );
      })}
    </Link>
  );
}
