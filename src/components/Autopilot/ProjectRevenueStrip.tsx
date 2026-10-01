/**
 * "Revenue · last 30 days" on a project's Overview, and the link that earns it.
 *
 * The same report as Analytics → Revenue by project, scoped to this project by
 * the server (which refuses a project that is not this workspace's), so the two
 * screens cannot disagree. Beside it, the project's own shop link with `?pj=`:
 * a post or email that carries it credits the sale to this project even when
 * the shop serves several. A draft shop's link is shown as not shareable yet,
 * because a draft answers 404 to a visitor.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, Copy, Check, ArrowRight } from 'lucide-react';
import { loadRevenue, money, projectShopLink, type ProjectRevenue, type RevenueReport } from '../../services/revenue';
import { shopUrl } from '../../services/shop';
import { T } from './theme';

function Sparkline({ values }: { values: number[] }) {
  const w = 96;
  const h = 26;
  const max = Math.max(...values, 0);
  if (!values.length) return null;
  /* A flat line at the floor when nothing sold — an empty box would read as
     "not loaded", and a line drawn mid-height would read as money. */
  const pts = values.map((v, i) => {
    const x = values.length === 1 ? w : (i / (values.length - 1)) * (w - 4) + 2;
    const y = max ? h - 3 - (v / max) * (h - 6) : h - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden style={{ flexShrink: 0 }}>
      <polyline points={pts.join(' ')} fill="none" stroke={max ? T.accent : T.faint} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function ProjectRevenueStrip({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const [report, setReport] = useState<RevenueReport | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    let live = true;
    loadRevenue({ days: 30, projectId }).then(r => {
      if (!live) return;
      if (r.ok) { setReport(r.report); setError(''); } else setError(r.error);
    });
    return () => { live = false; };
  }, [projectId]);

  const me: ProjectRevenue | undefined = report?.projects[0];
  const cur = report?.currency ?? 'USD';

  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(link);
      setTimeout(() => setCopied(''), 1600);
    } catch {
      /* Said rather than pretended: the box stays selectable either way. */
      setError('The browser would not copy — select the link and copy it by hand.');
    }
  };

  return (
    <div data-testid="project-revenue" style={{ border: `1px solid ${T.line}`, borderRadius: 14, padding: '12px 13px', background: T.panel, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h4 style={{ margin: 0, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.07em', color: T.muted, textTransform: 'uppercase', display: 'flex', gap: 6, alignItems: 'center', flex: '1 1 auto' }}>
          <Wallet size={12} /> Revenue · last 30 days
        </h4>
        <button onClick={() => navigate(`/analytics?section=revenue&project=${encodeURIComponent(projectId)}`)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', padding: 0,
          color: T.accent, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
        }}>All projects <ArrowRight size={12} /></button>
      </div>

      {error && <p style={{ margin: '8px 0 0', fontSize: 12, color: T.warn }}>{error}</p>}

      {me && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 8 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: T.ink, letterSpacing: '-0.02em' }}>{money(me.revenueCents, cur)}</span>
          <span style={{ fontSize: 12, color: T.muted }}>
            {me.paidOrders} paid order{me.paidOrders === 1 ? '' : 's'}
            {me.recoveredOrders ? ` · ${money(me.recoveredCents, cur)} recovered by Autopilot` : ''}
            {me.wonDeals ? ` · ${me.wonDeals} deal${me.wonDeals === 1 ? '' : 's'} won` : ''}
          </span>
          <Sparkline values={me.series} />
        </div>
      )}

      {me && me.revenueCents === 0 && (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: T.muted, lineHeight: 1.55 }}>
          Counts paid shop orders and won deals in this project&rsquo;s pipeline.
          {me.shops.length
            ? ' Sales through the shop below are credited here — share its link in this project’s posts and emails.'
            : ' To credit sales here, connect a shop to this project under Websites → Shops.'}
        </p>
      )}

      {me?.shops.map(s => {
        const link = projectShopLink(shopUrl(s.slug), projectId);
        const live = s.status === 'published';
        return (
          <div key={s.slug} style={{ marginTop: 10, display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 11.5, color: T.muted }}>
              This project&rsquo;s shop link{live ? ' — sales from it are credited here' : ' — the shop is a draft, so publish it before sharing'}
            </span>
            <div style={{ display: 'flex', gap: 6, minWidth: 0 }}>
              <input readOnly value={link} aria-label="This project's shop link" onFocus={e => e.currentTarget.select()} style={{
                flex: 1, minWidth: 0, padding: '7px 9px', borderRadius: 9, border: `1px solid ${T.line}`, background: T.raised,
                fontSize: 12, color: live ? T.ink : T.muted, fontFamily: 'inherit',
              }} />
              <button onClick={() => copy(link)} className="press" aria-label="Copy the shop link" style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 9, flexShrink: 0,
                border: `1px solid ${T.line}`, background: T.panel, color: T.ink, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}>{copied === link ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
