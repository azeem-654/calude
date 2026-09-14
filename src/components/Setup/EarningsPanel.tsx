/**
 * What was sold, what it cost, what it made — and what is left to spend.
 *
 * ── Why yearly and monthly are never added together ──
 *
 * A domain is a year and a mailbox is a month. One blended total is true of no
 * month and no year, and it is exactly the number somebody would copy into a
 * spreadsheet and plan against. So this reports two figures and refuses to
 * produce a third; annualising is a decision, and it belongs to whoever is
 * making it, not to a subtotal.
 *
 * ── Why the supplier balance is on this screen ──
 *
 * Because it is the other half of the same question. "I made $400 this month"
 * and "I have $9 left to buy the next domain with" are one thought, and putting
 * them on different screens is how the second one gets noticed by a customer
 * before it gets noticed by the operator.
 *
 * Every figure here is owner-only. Nothing in this file is reachable by a
 * customer, and the endpoint refuses anyone else regardless.
 */
import { useEffect, useState } from 'react';
import { TrendingUp, Wallet, RefreshCw, AlertCircle, Package } from 'lucide-react';
import {
  adminEarnings, money,
  type EarningsTotal, type SoldItem,
} from '../../services/digitalSetup';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

const card: React.CSSProperties = {
  border: `1px solid ${LINE}`, borderRadius: 16, background: '#fff', overflow: 'hidden',
};
const head: React.CSSProperties = {
  padding: '13px 16px', borderBottom: `1px solid ${LINE}`, background: '#fafbfc',
  display: 'flex', alignItems: 'center', gap: 9,
};
const th: React.CSSProperties = {
  textAlign: 'left', padding: '9px 12px', fontSize: 11, fontWeight: 700,
  color: '#475569', borderBottom: `1px solid ${LINE}`, whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '9px 12px', borderBottom: `1px solid ${LINE}`, fontSize: 12.5, color: INK,
};

const KIND_LABEL: Record<string, string> = {
  domain: 'Domains',
  mailbox: 'Mailboxes',
  hosting: 'Website hosting',
  crm: 'CRM workspaces',
  content: 'Content engine',
};

function Figure({ label, value, sub, tone }: {
  label: string; value: string; sub: string; tone?: 'good' | 'bad' | 'plain';
}) {
  const colour = tone === 'good' ? '#0f7b3d' : tone === 'bad' ? '#b42318' : INK;
  return (
    <div style={{ padding: '13px 15px', border: `1px solid ${LINE}`, borderRadius: 12, background: '#fff', minWidth: 0 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: MUTED }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 800, color: colour, marginTop: 3, letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: 11, color: MUTED, marginTop: 2, lineHeight: 1.5 }}>{sub}</div>
    </div>
  );
}

export default function EarningsPanel() {
  const [items, setItems] = useState<SoldItem[]>([]);
  const [totals, setTotals] = useState<EarningsTotal[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const r = await adminEarnings();
    setItems(r.items);
    setTotals(r.totals);
    setBalance(r.supplierBalanceCents);
    setLoading(false);
  };

  useEffect(() => {
    let live = true;
    void (async () => {
      const r = await adminEarnings();
      if (!live) return;
      setItems(r.items); setTotals(r.totals); setBalance(r.supplierBalanceCents); setLoading(false);
    })();
    return () => { live = false; };
  }, []);

  const yearly = totals.filter(t => t.period === 'year');
  const monthly = totals.filter(t => t.period === 'month');
  const sum = (rows: EarningsTotal[], f: 'retailCents' | 'costCents') => rows.reduce((n, r) => n + r[f], 0);

  const yearRevenue = sum(yearly, 'retailCents');
  const yearCost = sum(yearly, 'costCents');
  const monthRevenue = sum(monthly, 'retailCents');
  const monthCost = sum(monthly, 'costCents');

  /*
   * The balance is compared against what the next few domains would cost, not
   * against a flat threshold. "Low" for somebody selling one domain a month is
   * not "low" for somebody selling fifty.
   */
  const avgDomainCost = (() => {
    const d = yearly.find(t => t.kind === 'domain');
    return d && d.count > 0 ? Math.round(d.costCents / d.count) : 0;
  })();
  const domainsAfforded = balance !== null && avgDomainCost > 0 ? Math.floor(balance / avgDomainCost) : null;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* ── The two questions, answered apart ── */}
      <section style={card}>
        <div style={head}>
          <TrendingUp size={15} color={ACCENT} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>What you have made</div>
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }}>
              Taken from what the supplier actually charged, not from what was quoted.
            </div>
          </div>
          <button onClick={() => void load()} aria-label="Reload earnings"
            style={{ border: 'none', background: 'none', color: MUTED, cursor: 'pointer', padding: 3, display: 'flex' }}>
            <RefreshCw size={14} />
          </button>
        </div>

        <div style={{ padding: 16, display: 'grid', gap: 12 }}>
          {loading && <p style={{ margin: 0, fontSize: 13, color: MUTED }}>Loading…</p>}

          {!loading && !items.length && (
            <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
              Nothing has been sold yet. Once a customer buys a domain through the project wizard, every
              item appears here with what it cost you beside what they paid.
            </p>
          )}

          {!loading && items.length > 0 && (
            <>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                <Figure
                  label="Billed yearly"
                  value={money(yearRevenue)}
                  sub={`${money(yearCost)} cost · ${money(yearRevenue - yearCost)} margin`}
                  tone={yearRevenue - yearCost >= 0 ? 'good' : 'bad'}
                />
                <Figure
                  label="Recurring each month"
                  value={money(monthRevenue)}
                  sub={monthCost > 0 ? `${money(monthCost)} cost · ${money(monthRevenue - monthCost)} margin` : 'Nothing costs you per unit'}
                  tone={monthRevenue - monthCost >= 0 ? 'good' : 'bad'}
                />
                <Figure
                  label="Items sold"
                  value={String(items.length)}
                  sub={`across ${new Set(items.map(i => i.accountId)).size} customer${new Set(items.map(i => i.accountId)).size === 1 ? '' : 's'}`}
                />
              </div>

              <p style={{ margin: 0, fontSize: 11.5, color: MUTED, lineHeight: 1.6 }}>
                The two figures are kept apart on purpose: a domain is a year and a mailbox is a month,
                and adding them produces a number that is true of neither.
              </p>
            </>
          )}
        </div>
      </section>

      {/* ── What is left to spend ── */}
      <section style={card}>
        <div style={head}>
          <Wallet size={15} color={ACCENT} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>Your supplier balance</div>
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }}>
              What is left to buy the next domain with.
            </div>
          </div>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 11 }}>
          {balance === null ? (
            <p style={{ margin: 0, fontSize: 12.5, color: MUTED }}>
              Could not read it — connect the provider above, or check it in their control panel.
            </p>
          ) : (
            <>
              <div style={{ fontSize: 24, fontWeight: 800, color: balance <= 0 ? '#b42318' : INK, letterSpacing: '-0.02em' }}>
                {(balance / 100).toFixed(2)}
                <span style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginLeft: 7 }}>on your provider account</span>
              </div>

              {/* Measured in domains rather than currency: "about four more" is
                  a thing somebody can act on, where a number is not. */}
              {domainsAfforded !== null && (
                <div style={{ fontSize: 12.5, color: domainsAfforded < 3 ? '#b42318' : MUTED }}>
                  Roughly <strong>{domainsAfforded}</strong> more {domainsAfforded === 1 ? 'domain' : 'domains'} at
                  what you have been paying.
                </div>
              )}

              {balance <= 0 && (
                <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '11px 12px', borderRadius: 11, background: '#fdf3f3', border: '1px solid #fecaca' }}>
                  <AlertCircle size={15} color="#b42318" style={{ flexShrink: 0, marginTop: 1 }} />
                  <p style={{ margin: 0, fontSize: 11.5, color: '#991b1b', lineHeight: 1.6 }}>
                    Nothing can be registered. Checkout refuses new domain orders while this is short,
                    rather than taking a customer's money for something that would then fail — so the
                    effect of leaving it empty is lost sales, not angry customers.
                  </p>
                </div>
              )}

              <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '11px 12px', borderRadius: 11, background: '#f4f7fb' }}>
                <AlertCircle size={15} color="#1e3a5f" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, fontSize: 11.5, color: '#1e3a5f', lineHeight: 1.6 }}>
                  Your provider can top this up on its own. In their control panel, under recurring
                  payments, set a balance to maintain and an amount to add — it then charges your card
                  automatically whenever the balance drops below it. That is what keeps a hundred-domain
                  order from failing on a ten-dollar balance.
                </p>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── Every line, with both prices ── */}
      <section style={card}>
        <div style={head}>
          <Package size={15} color={ACCENT} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>Everything you have sold</div>
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }}>
              What it cost you, and what the customer paid.
            </div>
          </div>
        </div>

        {totals.length > 0 && (
          <div style={{ overflowX: 'auto', borderBottom: `1px solid ${LINE}` }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520 }}>
              <thead>
                <tr style={{ background: '#fafbfc' }}>
                  {['By type', 'Billed', 'Count', 'Cost', 'Revenue', 'Margin'].map(h => <th key={h} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {totals.map(t => {
                  const margin = t.retailCents - t.costCents;
                  return (
                    <tr key={`${t.kind}:${t.period}`}>
                      <td style={{ ...td, fontWeight: 700 }}>{KIND_LABEL[t.kind] ?? t.kind}</td>
                      <td style={{ ...td, color: MUTED }}>{t.period === 'year' ? 'Yearly' : t.period === 'month' ? 'Monthly' : 'Once'}</td>
                      <td style={td}>{t.count}</td>
                      <td style={{ ...td, color: MUTED }}>{money(t.costCents)}</td>
                      <td style={td}>{money(t.retailCents)}</td>
                      <td style={{ ...td, fontWeight: 700, color: margin >= 0 ? '#0f7b3d' : '#b42318' }}>
                        {margin >= 0 ? '+' : ''}{money(margin)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 620 }}>
            <thead>
              <tr style={{ background: '#fafbfc' }}>
                {['Item', 'Type', 'Customer', 'Cost', 'Sold for', 'Margin', 'When'].map(h => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {items.map(i => {
                const margin = i.retailCents - i.costCents;
                return (
                  <tr key={i.id}>
                    <td style={{ ...td, fontWeight: 600, wordBreak: 'break-all' }}>{i.item}</td>
                    <td style={{ ...td, color: MUTED }}>{KIND_LABEL[i.kind] ?? i.kind}</td>
                    <td style={{ ...td, color: MUTED }}>{i.companyName || '—'}</td>
                    <td style={{ ...td, color: MUTED }}>{i.costCents ? money(i.costCents) : '—'}</td>
                    <td style={td}>{money(i.retailCents)}</td>
                    <td style={{ ...td, fontWeight: 700, color: margin >= 0 ? '#0f7b3d' : '#b42318' }}>
                      {margin >= 0 ? '+' : ''}{money(margin)}
                    </td>
                    <td style={{ ...td, color: MUTED, whiteSpace: 'nowrap' }}>
                      {new Date(i.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
              {!items.length && !loading && (
                <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: MUTED, padding: '18px 12px' }}>
                  Nothing sold yet.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <p style={{ margin: 0, padding: '11px 16px', fontSize: 11.5, color: MUTED, lineHeight: 1.6, borderTop: `1px solid ${LINE}` }}>
          A dash in the cost column means it costs you nothing per unit — mailboxes are unlimited on your
          email plan, and hosting and the CRM run on the same server as the app. The plan and the server
          are overheads, not a cost of goods, so they are not divided up and charged against each sale.
        </p>
      </section>
    </div>
  );
}
