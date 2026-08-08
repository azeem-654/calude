/**
 * DeliverabilityReport.tsx — the deliverability section of the reporting
 * dashboard: where sender reputation has been heading, and which campaigns
 * moved it.
 *
 * Everything is derived from mail this workspace actually sent. Nothing here
 * is illustrative — if the numbers look thin, that is because little has been
 * sent, and saying so is more useful than inventing a curve.
 */
import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, Gauge, Inbox, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { loadEmails, type ContactEmail } from '../../services/contactEmail';
import { reputation, listHygiene, loadSuppression } from '../../services/deliverability';
import { placementSummary } from '../../services/warmup';

const INK = '#17191c';

/** One bucket of sending history, so a trend can be drawn from real sends. */
interface Bucket {
  label: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  deliveryRate: number;
  openRate: number;
  bounceRate: number;
}

/**
 * Group outbound mail into weekly buckets. Weeks rather than days because a
 * small sender's daily numbers are too noisy to read as a trend.
 */
function weeklyBuckets(emails: ContactEmail[], weeks = 8): Bucket[] {
  const out: Bucket[] = [];
  const now = Date.now();
  for (let i = weeks - 1; i >= 0; i--) {
    const end = now - i * 7 * 86_400_000;
    const start = end - 7 * 86_400_000;
    const rows = emails.filter(e => {
      if (e.direction !== 'outbound') return false;
      const at = new Date(e.sentAt || e.createdAt).getTime();
      return at >= start && at < end;
    });
    const sent = rows.length;
    const bounced = rows.filter(r => r.status === 'bounced').length;
    const failed = rows.filter(r => r.status === 'failed').length;
    const delivered = sent - bounced - failed;
    const opened = rows.filter(r => r.opens > 0 || ['opened', 'clicked', 'replied'].includes(r.status)).length;
    const clicked = rows.filter(r => r.clicks > 0 || r.status === 'clicked').length;
    const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
    out.push({
      label: i === 0 ? 'This week' : `${i}w ago`,
      sent, delivered, opened, clicked, bounced,
      deliveryRate: pct(delivered, sent),
      openRate: pct(opened, delivered),
      bounceRate: pct(bounced, sent),
    });
  }
  return out;
}

/** Direction of travel between the first and last week that had any sends. */
function trend(buckets: Bucket[], key: 'deliveryRate' | 'openRate' | 'bounceRate') {
  const active = buckets.filter(b => b.sent > 0);
  if (active.length < 2) return { delta: 0, enough: false };
  return { delta: active[active.length - 1][key] - active[0][key], enough: true };
}

export default function DeliverabilityReport() {
  const { contacts } = useApp();
  const emails = useMemo(() => loadEmails(), []);
  const metrics = useMemo(() => reputation(emails), [emails]);
  const buckets = useMemo(() => weeklyBuckets(emails), [emails]);
  const hygiene = useMemo(() => listHygiene(contacts), [contacts]);
  const placement = useMemo(() => placementSummary(), []);
  const suppression = useMemo(() => loadSuppression(), []);

  const deliveryTrend = trend(buckets, 'deliveryRate');
  const bounceTrend = trend(buckets, 'bounceRate');
  const maxSent = Math.max(1, ...buckets.map(b => b.sent));

  const card: React.CSSProperties = { backgroundColor: '#fff', borderRadius: 18, border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', padding: 20, marginBottom: 18 };
  const bandColor = metrics.band === 'strong' ? '#16a34a' : metrics.band === 'watch' ? '#d97706' : '#dc2626';

  const TrendIcon = ({ delta, inverted }: { delta: number; inverted?: boolean }) => {
    if (delta === 0) return <Minus size={13} color="#94a3b8" />;
    const good = inverted ? delta < 0 : delta > 0;
    const Icon = delta > 0 ? TrendingUp : TrendingDown;
    return <Icon size={13} color={good ? '#16a34a' : '#dc2626'} />;
  };

  return (
    <div>
      {/* Sender reputation */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: INK, display: 'flex', alignItems: 'center', gap: 7 }}>
              <Gauge size={15} /> Sender reputation
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94a3b8' }}>
              From the {metrics.sent} email{metrics.sent === 1 ? '' : 's'} this workspace has sent.
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: bandColor, lineHeight: 1 }}>{metrics.senderScore}</div>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: bandColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {metrics.band === 'strong' ? 'Strong' : metrics.band === 'watch' ? 'Watch' : 'At risk'}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginTop: 14 }}>
          {[
            ['Delivery rate', `${metrics.deliveryRate}%`, deliveryTrend, false],
            ['Bounce rate', `${metrics.bounceRate}%`, bounceTrend, true],
            ['Open rate', `${metrics.openRate}%`, trend(buckets, 'openRate'), false],
            ['Complaint rate', `${metrics.complaintRate}%`, { delta: 0, enough: false }, true],
          ].map(([label, value, tr, inverted]) => {
            const t = tr as { delta: number; enough: boolean };
            return (
              <div key={label as string} style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: 10, border: '1px solid #eef0f3' }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label as string}</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: INK, marginTop: 2 }}>{value as string}</div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {t.enough ? (
                    <>
                      <TrendIcon delta={t.delta} inverted={inverted as boolean} />
                      {t.delta === 0 ? 'flat' : `${t.delta > 0 ? '+' : ''}${t.delta} pts over the period`}
                    </>
                  ) : 'not enough history yet'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Weekly trend */}
      <div style={card}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: INK }}>Sending over the last 8 weeks</h3>
        <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94a3b8' }}>
          Volume with delivery and bounce rates. Sudden jumps in volume are the thing providers react to.
        </p>

        {buckets.every(b => b.sent === 0) ? (
          <p style={{ margin: '14px 0 0', fontSize: 12.5, color: '#94a3b8' }}>
            Nothing sent in this period, so there is no trend to draw yet.
          </p>
        ) : (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
              {buckets.map(b => (
                <div key={b.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }} title={`${b.sent} sent · ${b.deliveryRate}% delivered · ${b.bounceRate}% bounced`}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>{b.sent || ''}</span>
                  <div style={{
                    width: '100%', height: `${Math.max(2, (b.sent / maxSent) * 90)}px`, borderRadius: '5px 5px 0 0',
                    background: b.bounceRate > 5 ? '#dc2626' : b.bounceRate > 2 ? '#d97706' : INK,
                  }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              {buckets.map(b => (
                <span key={b.label} style={{ flex: 1, textAlign: 'center', fontSize: 9.5, color: '#94a3b8' }}>{b.label}</span>
              ))}
            </div>
            <p style={{ margin: '12px 0 0', fontSize: 11.5, color: '#94a3b8' }}>
              Bars turn amber above a 2% bounce rate and red above 5% — the levels at which providers start throttling.
            </p>
          </div>
        )}
      </div>

      {/* List health and placement */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
        <div style={card}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: INK, display: 'flex', alignItems: 'center', gap: 7 }}>
            <ShieldCheck size={15} /> List health
          </h3>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 8, color: hygiene.cleanPercent >= 95 ? '#16a34a' : hygiene.cleanPercent >= 85 ? '#d97706' : '#dc2626' }}>
            {hygiene.cleanPercent}% clean
          </div>
          <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 10, background: '#eef0f3' }}>
            {[
              [hygiene.valid, '#16a34a'], [hygiene.risky, '#d97706'],
              [hygiene.invalid, '#dc2626'], [hygiene.unchecked, '#cbd5e1'],
            ].map(([n, c], i) => (
              <span key={i} style={{ width: `${hygiene.total ? ((n as number) / hygiene.total) * 100 : 0}%`, background: c as string }} />
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 8, lineHeight: 1.6 }}>
            {hygiene.valid} valid · {hygiene.risky} risky · {hygiene.invalid} invalid · {hygiene.unchecked} unchecked<br />
            {suppression.length} address{suppression.length === 1 ? '' : 'es'} suppressed and never emailed again.
          </div>
        </div>

        <div style={card}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: INK, display: 'flex', alignItems: 'center', gap: 7 }}>
            <Inbox size={15} /> Inbox placement
          </h3>
          {placement.checked ? (
            <>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 8, color: placement.inboxRate >= 80 ? '#16a34a' : placement.inboxRate >= 50 ? '#d97706' : '#dc2626' }}>
                {placement.inboxRate}%
              </div>
              <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 6, lineHeight: 1.6 }}>
                {placement.inbox} inbox · {placement.spam} spam · {placement.missing} not delivered,
                across {placement.checked} seed mailbox{placement.checked === 1 ? '' : 'es'}.
              </div>
              {placement.byProvider.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  {placement.byProvider.map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#475569', padding: '3px 0' }}>
                      <span>{p.name}</span>
                      <span style={{ fontWeight: 700, color: p.inbox === p.total ? '#16a34a' : '#d97706' }}>{p.inbox}/{p.total} inbox</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#94a3b8', lineHeight: 1.6 }}>
              No placement test has been run. This is the only measurement that says where your mail
              actually lands — run one from Settings → Email Deliverability → Verification &amp; placement.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
