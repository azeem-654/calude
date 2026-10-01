/**
 * Revenue by project — how much money each Autopilot project brought in.
 *
 * Every figure is from /api/revenue.php, which reads paid orders, Autopilot
 * chases and won deals from this workspace's own rows. Nothing here projects,
 * smooths or fills a gap: a project that sold nothing shows nothing, and the
 * money nobody can honestly credit to a project is drawn as its own grey band
 * ("Unattributed") rather than shared out.
 *
 * ── The chart ──
 *
 * Stacked bars, one per day (30 days) or week (90 / 365), a segment per
 * project. Bars rather than an area because each bucket is a sum of discrete
 * sales, and an area's slope between two days invents sales on the line.
 * Colour follows the project — its place in the workspace's project list, not
 * its rank this period — so switching 30 → 90 days never repaints a project.
 * Eight colours exist; a ninth project is folded into "Other projects" in the
 * chart and still has its own row in the table. The light hues sit under 3:1
 * on white, so the table below is the readable twin, not decoration.
 *
 * Dark mode is the app's own (an inversion of <html>), the same as every
 * screen; this does not opt out of it.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Wallet, ShoppingBag, Receipt, LifeBuoy, Info, Loader } from 'lucide-react';
import {
  loadRevenue, money, moneyShort,
  type RevenueDays, type RevenueReport, type RevenueFigures,
} from '../../services/revenue';
import { motionReduced } from '../../services/motion';

/* The validated categorical order (dataviz reference palette, light). Fixed
   order, never cycled. */
const SLOTS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
/* Neutrals: "no project" must not look like a project. */
const UNATTRIBUTED = '#c3c2b7';
const OTHER = '#898781';

const INK = '#0b0b0b';
const INK2 = '#52514e';
const MUTED = '#898781';
const GRID = '#e1e0d9';
const SURFACE = '#ffffff';

const card: React.CSSProperties = {
  background: SURFACE, borderRadius: 18, border: '1px solid #e6e9f0',
  boxShadow: '0 1px 2px rgba(16,24,40,0.04)', padding: '18px 20px', minWidth: 0,
};

interface Series { key: string; name: string; color: string; total: number; values: number[] }

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

export default function RevenueByProject() {
  const [params] = useSearchParams();
  const focus = params.get('project') ?? '';
  const [days, setDays] = useState<RevenueDays>(30);
  const [currency, setCurrency] = useState('');
  const [report, setReport] = useState<RevenueReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    loadRevenue({ days, currency }).then(r => {
      if (!live) return;
      setLoading(false);
      if (r.ok) { setReport(r.report); setError(''); } else setError(r.error);
    });
    return () => { live = false; };
  }, [days, currency]);

  const cur = report?.currency ?? 'USD';

  /* Colour by the project's place in the list, then keep only those with
     money in the window — so the legend is short and nobody's colour moves. */
  const series = useMemo<Series[]>(() => {
    if (!report) return [];
    const out: Series[] = [];
    const other: Series = { key: 'other', name: 'Other projects', color: OTHER, total: 0, values: report.buckets.map(() => 0) };
    report.projects.forEach((p, i) => {
      if (!p.revenueCents) return;
      if (i < SLOTS.length) {
        out.push({ key: p.id, name: p.name, color: SLOTS[i], total: p.revenueCents, values: p.series });
      } else {
        other.total += p.revenueCents;
        p.series.forEach((v, j) => { other.values[j] += v; });
      }
    });
    if (other.total) out.push(other);
    if (report.unattributed?.revenueCents) {
      out.push({ key: 'unattributed', name: 'Unattributed', color: UNATTRIBUTED, total: report.unattributed.revenueCents, values: report.unattributed.series });
    }
    return out;
  }, [report]);

  const data = useMemo(() => {
    if (!report) return [];
    return report.buckets.map((b, i) => {
      const row: Record<string, number | string> = { label: fmtDay(b.start), start: b.start, end: b.end };
      let top = '';
      for (const s of series) { row[s.key] = s.values[i]; if (s.values[i] > 0) top = s.key; }
      row.__top = top;
      return row;
    });
  }, [report, series]);

  /* Clean ticks — 0 / 50 / 100, not 0 / 65 / 130. Recharts' own choice
     divides the tallest bar into quarters, which reads as false precision. */
  const ticks = useMemo(() => {
    const top = Math.max(0, ...data.map(row => series.reduce((n, s) => n + (Number(row[s.key]) || 0), 0)));
    if (!top) return [0];
    const raw = top / 4;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = ([1, 2, 2.5, 5, 10].find(m => m * mag >= raw) ?? 10) * mag;
    return Array.from({ length: Math.ceil(top / step) + 1 }, (_, i) => i * step);
  }, [data, series]);

  const reduced = motionReduced();
  const totals = report?.totals;
  const nothing = !!report && totals!.revenueCents === 0 && totals!.refundedCents === 0;
  const allUnattributed = !!report && totals!.revenueCents > 0 && report.attribution.none === totals!.revenueCents;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* One filter row, above everything it scopes. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: 0, flex: '1 1 auto' }}>Revenue by project</h2>
        <div role="group" aria-label="Period" style={{ display: 'flex', gap: 4, padding: 4, background: SURFACE, border: '1px solid #e6e9f0', borderRadius: 10 }}>
          {([30, 90, 365] as const).map(n => (
            <button key={n} onClick={() => setDays(n)} aria-pressed={days === n} style={{
              padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: days === n ? '#eceef1' : 'transparent', color: days === n ? '#17191c' : '#64748b',
            }}>{n === 365 ? '12 months' : `${n} days`}</button>
          ))}
        </div>
        {(report?.currencies.length ?? 0) > 1 && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: INK2 }}>
            Currency
            <select value={cur} onChange={e => setCurrency(e.target.value)} data-field="revenue.currency" style={{
              padding: '6px 8px', borderRadius: 8, border: '1px solid #e2e8f0', background: SURFACE, fontSize: 13, color: INK,
            }}>
              {report!.currencies.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select>
          </label>
        )}
      </div>

      {error && (
        <p role="alert" style={{ ...card, margin: 0, color: '#b42318', fontSize: 13 }}>{error}</p>
      )}

      {!report && loading && (
        <p style={{ ...card, margin: 0, display: 'flex', gap: 8, alignItems: 'center', color: MUTED, fontSize: 13 }}>
          <Loader size={14} /> Reading paid orders…
        </p>
      )}

      {report && (
        /* Refetch keeps the frame: the previous figures stay, dimmed, until
           the new ones arrive — no skeleton, no jump. */
        <div style={{ display: 'grid', gap: 16, opacity: loading ? 0.55 : 1, transition: reduced ? undefined : 'opacity .15s' }}>
          {report.currencies.length > 1 && (
            <p style={{ margin: 0, fontSize: 12, color: INK2 }}>
              Every figure is in {cur}. Sales in {report.currencies.filter(c => c.code !== cur).map(c => c.code).join(', ')} are
              not converted or added in — switch currency to see them.
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(170px, 100%), 1fr))', gap: 12 }}>
            <Tile icon={Wallet} label={`Revenue, last ${days === 365 ? '12 months' : `${days} days`}`} value={money(totals!.revenueCents, cur)}
              note={totals!.refundedCents ? `${money(totals!.refundedCents, cur)} refunded, not included` : 'Paid and fulfilled orders'} />
            <Tile icon={ShoppingBag} label="Paid orders" value={totals!.paidOrders.toLocaleString()}
              note={totals!.wonDeals ? `plus ${totals!.wonDeals} won deal${totals!.wonDeals === 1 ? '' : 's'}` : 'Shop and recorded orders'} />
            <Tile icon={Receipt} label="Average order" value={totals!.paidOrders ? money(totals!.averageCents, cur) : '—'}
              note={totals!.paidOrders ? 'Revenue ÷ paid orders' : 'No paid orders yet'} />
            <Tile icon={LifeBuoy} label="Recovered by Autopilot" value={money(totals!.recoveredCents, cur)}
              note={`${totals!.recoveredOrders} unpaid order${totals!.recoveredOrders === 1 ? '' : 's'} paid after a chase`} />
          </div>

          {nothing ? <EmptyState hasProjects={report.projects.length > 0} /> : (
            <figure style={{ ...card, margin: 0 }} aria-label="Revenue over time, by project">
              <figcaption style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'baseline', marginBottom: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>Revenue over time</span>
                <span style={{ fontSize: 12, color: MUTED }}>{report.bucket === 'day' ? 'Per day' : 'Per week'}, by the day the money arrived (UTC)</span>
              </figcaption>
              <Legend series={series} currency={cur} />
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="18%">
                    <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
                    <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#c3c2b7' }} minTickGap={18}
                      tick={{ fontSize: 11, fill: MUTED }} />
                    <YAxis tickLine={false} axisLine={false} width={56} allowDecimals={false} domain={[0, ticks[ticks.length - 1] || 'auto']} ticks={ticks.length > 1 ? ticks : undefined}
                      tick={{ fontSize: 11, fill: MUTED, style: { fontVariantNumeric: 'tabular-nums' } }}
                      tickFormatter={(v: number) => moneyShort(v, cur)} />
                    <Tooltip cursor={{ fill: 'rgba(11,11,11,0.04)' }} isAnimationActive={false}
                      content={(p: { active?: boolean; label?: unknown; payload?: ReadonlyArray<{ payload?: Record<string, number | string> }> }) =>
                        <TipBox active={p.active} row={p.payload?.[0]?.payload} series={series} currency={cur} weekly={report.bucket === 'week'} />} />
                    {series.map(s => (
                      <Bar key={s.key} dataKey={s.key} stackId="rev" fill={s.color} maxBarSize={24}
                        isAnimationActive={!reduced} animationDuration={400}
                        shape={(props: unknown) => <Segment {...(props as SegProps)} seriesKey={s.key} />} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <details style={{ marginTop: 8 }}>
                <summary style={{ fontSize: 12, color: INK2, cursor: 'pointer' }}>Show the figures behind the chart</summary>
                <div style={{ overflowX: 'auto', marginTop: 8 }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: 12, fontVariantNumeric: 'tabular-nums', minWidth: '100%' }}>
                    <thead><tr>
                      <th style={th}>{report.bucket === 'day' ? 'Day' : 'Week of'}</th>
                      {series.map(s => <th key={s.key} style={{ ...th, textAlign: 'right' }}>{s.name}</th>)}
                    </tr></thead>
                    <tbody>{data.map(row => (
                      <tr key={String(row.start)}>
                        <td style={td}>{String(row.label)}</td>
                        {series.map(s => <td key={s.key} style={{ ...td, textAlign: 'right' }}>{Number(row[s.key]) ? money(Number(row[s.key]), cur) : '—'}</td>)}
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </details>
            </figure>
          )}

          {report.projects.length > 0 && (
            <ProjectTable report={report} series={series} focus={focus} />
          )}

          {allUnattributed && (
            <p style={{ ...card, margin: 0, fontSize: 12.5, color: INK2, lineHeight: 1.6 }}>
              None of this period&rsquo;s revenue could be credited to a project yet. Connect a shop to a project (Websites → Shops → the shop&rsquo;s Project box),
              or share the project&rsquo;s own shop link from its Overview — sales through either are credited to it from then on.
            </p>
          )}

          {report.truncated && (
            <p style={{ margin: 0, fontSize: 12, color: '#b54708' }}>
              This period has more than 50,000 orders; only the first 50,000 are counted, so these figures are partial.
            </p>
          )}

          <HowCredited />
        </div>
      )}
    </div>
  );
}

function Tile({ icon: Icon, label, value, note }: { icon: typeof Wallet; label: string; value: string; note: string }) {
  return (
    <div style={{ ...card, padding: '16px 18px' }}>
      <p style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 12, color: INK2, margin: '0 0 8px', fontWeight: 500 }}>
        <Icon size={14} color={MUTED} /> {label}
      </p>
      <p style={{ fontSize: 24, fontWeight: 600, color: INK, margin: '0 0 4px', letterSpacing: '-0.02em', overflowWrap: 'anywhere' }}>{value}</p>
      <p style={{ fontSize: 11.5, color: MUTED, margin: 0, lineHeight: 1.45 }}>{note}</p>
    </div>
  );
}

function Legend({ series, currency }: { series: Series[]; currency: string }) {
  if (series.length < 2) return null;
  return (
    <ul style={{ listStyle: 'none', margin: '0 0 10px', padding: 0, display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
      {series.map(s => (
        <li key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: INK2, minWidth: 0 }}>
          <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{s.name}</span>
          <span style={{ color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{moneyShort(s.total, currency)}</span>
        </li>
      ))}
    </ul>
  );
}

interface SegProps { x?: number; y?: number; width?: number; height?: number; fill?: string; payload?: Record<string, unknown> }

/**
 * One stacked segment. Only the top segment of a bar gets the 4px rounded end;
 * the rest stay square so the stack reads as one bar. A 1px surface-coloured
 * edge on each segment is the gap between neighbours — white doing the
 * separating, not a border drawn round the data.
 */
function Segment({ x = 0, y = 0, width = 0, height = 0, fill, payload, seriesKey }: SegProps & { seriesKey: string }) {
  if (height <= 0 || width <= 0) return null;
  const top = payload?.__top === seriesKey;
  const r = top ? Math.min(4, height, width / 2) : 0;
  const d = r
    ? `M${x},${y + height} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + height} Z`
    : `M${x},${y + height} L${x},${y} L${x + width},${y} L${x + width},${y + height} Z`;
  return <path d={d} fill={fill} stroke={SURFACE} strokeWidth={1} />;
}

/** Values lead, names follow; every series at that bucket, not just the one under the pointer. */
function TipBox({ active, row, series, currency, weekly }: {
  active?: boolean; row?: Record<string, number | string>; series: Series[]; currency: string; weekly: boolean;
}) {
  if (!active || !row) return null;
  const total = series.reduce((n, s) => n + (Number(row[s.key]) || 0), 0);
  const end = new Date(Date.parse(String(row.end)) - 86_400_000).toISOString();
  return (
    <div style={{ background: SURFACE, border: '1px solid #e6e9f0', borderRadius: 10, boxShadow: '0 6px 16px rgba(16,24,40,0.08)', padding: '8px 12px', fontSize: 12, minWidth: 160 }}>
      <p style={{ margin: '0 0 6px', color: INK2 }}>{weekly ? `${fmtDay(String(row.start))} – ${fmtDay(end)}` : String(row.label)}</p>
      <p style={{ margin: '0 0 6px', fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums' }}>{money(total, currency)} <span style={{ fontWeight: 400, color: MUTED }}>in all</span></p>
      {[...series].reverse().map(s => (
        <p key={s.key} style={{ margin: '2px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden style={{ width: 10, height: 2, background: s.color, flexShrink: 0 }} />
          <b style={{ color: INK, fontVariantNumeric: 'tabular-nums' }}>{money(Number(row[s.key]) || 0, currency)}</b>
          <span style={{ color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{s.name}</span>
        </p>
      ))}
    </div>
  );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '7px 10px', fontSize: 11.5, fontWeight: 600, color: INK2, borderBottom: `1px solid ${GRID}`, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: `1px solid ${GRID}`, color: INK, whiteSpace: 'nowrap' };

function ProjectTable({ report, series, focus }: { report: RevenueReport; series: Series[]; focus: string }) {
  const cur = report.currency;
  const whole = report.totals.revenueCents;
  const colour = new Map(series.map(s => [s.key, s.color]));
  const rows: Array<{ key: string; name: string; status?: string; f: RevenueFigures }> = [
    ...report.projects.map(p => ({ key: p.id, name: p.name, status: p.status, f: p as RevenueFigures })),
    ...(report.unattributed ? [{ key: 'unattributed', name: 'Unattributed', f: report.unattributed }] : []),
  ];
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, fontVariantNumeric: 'tabular-nums', minWidth: 720 }}>
          <thead><tr>
            <th style={{ ...th, paddingLeft: 18 }}>Project</th>
            <th style={{ ...th, textAlign: 'right' }}>Revenue</th>
            <th style={{ ...th, textAlign: 'right' }}>Share</th>
            <th style={{ ...th, textAlign: 'right' }}>Paid orders</th>
            <th style={{ ...th, textAlign: 'right' }}>Average</th>
            <th style={{ ...th, textAlign: 'right' }}>Refunded</th>
            <th style={{ ...th, textAlign: 'right' }}>Recovered</th>
            <th style={{ ...th, textAlign: 'right', paddingRight: 18 }}>Won deals</th>
          </tr></thead>
          <tbody>
            {rows.map(r => {
              const on = focus && r.key === focus;
              return (
                <tr key={r.key} data-project={r.key} style={{ background: on ? '#f4f5ff' : undefined }}>
                  <td style={{ ...td, paddingLeft: 18, whiteSpace: 'normal', minWidth: 160 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: colour.get(r.key) ?? (r.key === 'unattributed' ? UNATTRIBUTED : 'transparent'), border: colour.has(r.key) || r.key === 'unattributed' ? 'none' : `1px solid ${GRID}` }} />
                      <span style={{ fontWeight: r.key === 'unattributed' ? 500 : 600, color: r.key === 'unattributed' ? INK2 : INK }}>{r.name}</span>
                      {r.status && r.status !== 'running' && <span style={{ fontSize: 11, color: MUTED }}>{r.status}</span>}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{money(r.f.revenueCents, cur)}</td>
                  <td style={{ ...td, textAlign: 'right', color: INK2 }}>{whole ? `${Math.round((r.f.revenueCents / whole) * 1000) / 10}%` : '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{r.f.paidOrders}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{r.f.paidOrders ? money(r.f.averageCents, cur) : '—'}</td>
                  <td style={{ ...td, textAlign: 'right', color: r.f.refundedCents ? INK : MUTED }}>{r.f.refundedCents ? `${money(r.f.refundedCents, cur)} (${r.f.refundedOrders})` : '—'}</td>
                  <td style={{ ...td, textAlign: 'right', color: r.f.recoveredCents ? INK : MUTED }}>{r.f.recoveredCents ? `${money(r.f.recoveredCents, cur)} (${r.f.recoveredOrders})` : '—'}</td>
                  <td style={{ ...td, textAlign: 'right', paddingRight: 18, color: r.f.wonDeals ? INK : MUTED }}>
                    {r.f.wonDeals ? `${r.f.wonDeals} · ${r.f.wonDealValue.toLocaleString()}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ margin: 0, padding: '10px 18px', fontSize: 11.5, color: MUTED, lineHeight: 1.5, borderTop: `1px solid ${GRID}` }}>
        Won deals are counted from each project&rsquo;s own pipeline and shown at the value typed on the deal. A deal carries no currency, so it is never added to revenue.
      </p>
    </div>
  );
}

function EmptyState({ hasProjects }: { hasProjects: boolean }) {
  return (
    <div style={{ ...card, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <Wallet size={18} color={MUTED} style={{ marginTop: 2, flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>No paid orders in this period</p>
        <p style={{ fontSize: 12.5, color: '#64748b', margin: 0, lineHeight: 1.6 }}>
          This counts money that actually arrived: shop orders paid through your connected processor, and orders you mark
          paid under Online shop → Orders. Won deals in a project&rsquo;s pipeline are shown beside it.
          {hasProjects
            ? ' To credit a sale to a project, connect a shop to that project, or share the project’s own shop link from its Overview.'
            : ' Revenue is credited to Autopilot projects — create one, then connect a shop to it.'}
        </p>
      </div>
    </div>
  );
}

function HowCredited() {
  return (
    <details style={{ ...card }}>
      <summary style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 600, color: '#0f172a', cursor: 'pointer' }}>
        <Info size={14} color={MUTED} /> How revenue is credited to a project
      </summary>
      <div style={{ fontSize: 12.5, color: INK2, lineHeight: 1.65, marginTop: 8 }}>
        <p style={{ margin: '0 0 6px' }}>An order counts once it is paid (or fulfilled), on the day the money arrived. Each order goes to one project, on the first of these that is true:</p>
        <ol style={{ margin: '0 0 6px', paddingLeft: 20 }}>
          <li>the buyer arrived on that project&rsquo;s own shop link (it carries <code>?pj=</code>);</li>
          <li>the shop it was bought in belongs to that project;</li>
          <li>every item in it is a product of that project.</li>
        </ol>
        <p style={{ margin: '0 0 6px' }}>Anything else is <b>Unattributed</b> — it is shown, never shared out by guesswork. Refunds are listed beside revenue and are not in it.</p>
        <p style={{ margin: 0 }}><b>Recovered by Autopilot</b> is an unpaid order that a project&rsquo;s Autopilot sent a fresh payment link for, paid after that email went out. Figures in other currencies are never converted or added together.</p>
      </div>
    </details>
  );
}
