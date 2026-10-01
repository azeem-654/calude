/**
 * The affiliate program: 40% of every payment from customers you refer, for
 * as long as they keep paying.
 *
 * For an account owner: join (accepting the terms), a link to share, what it
 * brought in — visits, sign-ups, paying customers — and every commission with
 * where it stands (held for the refund window, payable, paid). For the install
 * owner, a second tab: every affiliate, every commission, and marking them
 * paid once the money has been sent.
 *
 * Nothing on this screen creates a commission. They are written by the billing
 * webhook when a referred customer's payment actually arrives
 * (worker/src/lib/affiliate.ts), and they are paid by the owner, by hand.
 */
import { useEffect, useMemo, useState } from 'react';
import { BadgePercent, Check, Copy, Link2, Loader, MousePointerClick, UserPlus, Wallet, CircleDollarSign, Users } from 'lucide-react';
import { isInstallOwner } from '../../services/moderation';
import { siteOrigin } from '../../services/hosts';
import {
  affiliateAdmin, affiliateStatus, joinAffiliate, markCommission, money, savePayoutNote,
  type AdminView, type Commission, type Program, type Totals,
} from '../../services/affiliate';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';
const card: React.CSSProperties = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: 22 };

const STATUS: Record<Commission['status'], [string, string, string]> = {
  pending: ['Held', '#92400e', '#fffbeb'],
  payable: ['Payable', '#1d4ed8', '#eff6ff'],
  paid: ['Paid', '#15803d', '#f0fdf4'],
  void: ['Void', '#6b7280', '#f3f4f6'],
};

const sum = (t: Totals | undefined, k: 'pending' | 'payable' | 'paid') =>
  Object.entries(t ?? {}).map(([c, v]) => money(v[k], c)).join(' + ') || money(0);

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div style={{ ...card, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: MUTED }}><Icon size={15} />{label}</div>
      <div style={{ fontSize: 26, fontWeight: 820, letterSpacing: '-0.03em', color: INK, marginTop: 6 }}>{value}</div>
    </div>
  );
}

function Mine({ p, reload }: { p: Program; reload: (p: Program) => void }) {
  const [agree, setAgree] = useState(false);
  const [note, setNote] = useState(p.payoutNote ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const link = p.code ? `${siteOrigin()}/?ref=${p.code}` : '';

  if (!p.joined) {
    return (
      <div style={{ ...card, maxWidth: 720 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ width: 44, height: 44, borderRadius: 14, background: '#f0fdf4', color: '#16a34a', display: 'grid', placeItems: 'center', flexShrink: 0 }}><BadgePercent size={22} /></span>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 820, letterSpacing: '-0.02em', color: INK }}>Earn {p.rate}% of every payment, for life</h2>
            <p style={{ margin: '6px 0 0', fontSize: 14, color: MUTED, lineHeight: 1.6 }}>
              Share your link. When somebody signs up through it and subscribes, you earn {p.rate}% of every payment they make —
              the first one and every renewal, for as long as they keep paying. Commissions are held for {p.holdDays} days in case of a
              refund, then paid to you.
            </p>
          </div>
        </div>
        <label style={{ display: 'block', marginTop: 18, fontSize: 13, fontWeight: 700, color: INK }}>Where should we pay you? <span style={{ color: MUTED, fontWeight: 500 }}>(PayPal email or bank details — you can change it later)</span></label>
        <input value={note} onChange={e => setNote(e.target.value)} data-field="affiliate.payoutNote" placeholder="you@paypal.com"
          style={{ marginTop: 6, width: '100%', maxWidth: 440, padding: '10px 12px', borderRadius: 10, border: `1px solid ${LINE}`, fontSize: 14 }} />
        <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 14, fontSize: 13, color: MUTED, lineHeight: 1.5, cursor: 'pointer' }}>
          <input type="checkbox" data-field="affiliate.agree" checked={agree} onChange={e => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
          <span>I accept the <a href={`${siteOrigin()}/affiliate-terms`} target="_blank" rel="noopener noreferrer" style={{ color: INK, fontWeight: 700 }}>affiliate terms</a>. I will not refer myself, spam, or bid on the Protected Central name in ads.</span>
        </label>
        {err && <p style={{ margin: '10px 0 0', color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>{err}</p>}
        <button type="button" disabled={busy} onClick={async () => {
          setBusy(true); setErr('');
          const r = await joinAffiliate(note, agree).catch(() => ({ success: false, error: 'Could not reach the server.' } as { success: boolean; error?: string; program?: Program }));
          setBusy(false);
          if (r.success && r.program) reload(r.program); else setErr(r.error ?? 'Could not join.');
        }} style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderRadius: 11, border: 0, background: INK, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
          {busy ? <Loader size={15} className="spin" /> : <UserPlus size={15} />} Join the affiliate program
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 800, color: MUTED, letterSpacing: '.06em', textTransform: 'uppercase' }}>Your link</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <code style={{ flex: '1 1 220px', minWidth: 0, padding: '12px 14px', borderRadius: 12, background: '#f6f7fb', border: `1px solid ${LINE}`, fontSize: 15, fontWeight: 650, color: INK, overflowWrap: 'anywhere' }}>{link}</code>
          <button type="button" onClick={() => { void navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 16px', borderRadius: 11, border: 0, background: INK, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
            {copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 13, color: MUTED }}>{p.rate}% of every payment from customers who sign up through it, for as long as they pay. Held {p.holdDays} days, then payable.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Stat icon={MousePointerClick} label="Visits through your link" value={String(p.stats?.clicks ?? 0)} />
        <Stat icon={UserPlus} label="Sign-ups" value={String(p.stats?.signups ?? 0)} />
        <Stat icon={Users} label="Paying customers" value={String(p.stats?.paying ?? 0)} />
        <Stat icon={Wallet} label="Held (refund window)" value={sum(p.totals, 'pending')} />
        <Stat icon={CircleDollarSign} label="Payable now" value={sum(p.totals, 'payable')} />
        <Stat icon={Check} label="Paid to you" value={sum(p.totals, 'paid')} />
      </div>
      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 800, color: INK }}>Commissions</div>
        <CommissionTable rows={p.commissions ?? []} />
      </div>
      <div style={{ ...card, maxWidth: 640 }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: INK }}>Where we pay you</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <input value={note} onChange={e => setNote(e.target.value)} data-field="affiliate.payoutNote" style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: `1px solid ${LINE}`, fontSize: 14 }} />
          <button type="button" disabled={busy} onClick={async () => { setBusy(true); const r = await savePayoutNote(note); setBusy(false); if (r.success && r.program) reload(r.program); }}
            style={{ padding: '10px 14px', borderRadius: 10, border: `1px solid ${LINE}`, background: '#fff', fontWeight: 700, cursor: 'pointer' }}>Save</button>
        </div>
      </div>
    </div>
  );
}

function CommissionTable({ rows, admin, onMark }: { rows: Commission[]; admin?: boolean; onMark?: (id: string, s: 'paid' | 'void' | 'pending') => void }) {
  if (!rows.length) return <p style={{ margin: '10px 0 0', fontSize: 13.5, color: MUTED }}>None yet. A commission appears here the moment a customer you referred pays.</p>;
  return (
    <div style={{ overflowX: 'auto', marginTop: 10 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
        <thead><tr style={{ textAlign: 'left', color: MUTED }}>
          <th style={{ padding: '8px 6px' }}>Date</th>{admin && <th style={{ padding: '8px 6px' }}>Affiliate</th>}<th style={{ padding: '8px 6px' }}>Customer</th>
          <th style={{ padding: '8px 6px' }}>They paid</th><th style={{ padding: '8px 6px' }}>Commission</th><th style={{ padding: '8px 6px' }}>Status</th>{admin && <th />}
        </tr></thead>
        <tbody>{rows.map(c => {
          const [label, fg, bg] = STATUS[c.status];
          return (
            <tr key={c.id} style={{ borderTop: `1px solid ${LINE}` }}>
              <td style={{ padding: '9px 6px', whiteSpace: 'nowrap' }}>{new Date(c.createdAt).toLocaleDateString()}</td>
              {admin && <td style={{ padding: '9px 6px' }}>{c.affiliate}</td>}
              <td style={{ padding: '9px 6px' }}>{c.customer}</td>
              <td style={{ padding: '9px 6px' }}>{money(c.base, c.currency)}</td>
              <td style={{ padding: '9px 6px', fontWeight: 750 }}>{money(c.amount, c.currency)}</td>
              <td style={{ padding: '9px 6px' }}><span style={{ padding: '3px 9px', borderRadius: 999, background: bg, color: fg, fontWeight: 750, fontSize: 12 }}>{label}</span>
                {c.status === 'pending' && <span style={{ color: MUTED, fontSize: 12, marginLeft: 6 }}>until {new Date(c.payableAt).toLocaleDateString()}</span>}</td>
              {admin && <td style={{ padding: '9px 6px', whiteSpace: 'nowrap' }}>
                {c.status !== 'paid' && c.status !== 'void' && <button type="button" onClick={() => onMark?.(c.id, 'paid')} style={{ marginRight: 6, padding: '5px 10px', borderRadius: 8, border: 0, background: '#16a34a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Mark paid</button>}
                {c.status !== 'void' && c.status !== 'paid' && <button type="button" onClick={() => onMark?.(c.id, 'void')} style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${LINE}`, background: '#fff', fontWeight: 700, cursor: 'pointer' }}>Void</button>}
              </td>}
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

function Manage() {
  const [v, setV] = useState<AdminView | null>(null);
  const [err, setErr] = useState('');
  const load = () => affiliateAdmin().then(r => { if (r.success) setV(r); else setErr(r.error ?? 'Could not load.'); }).catch(() => setErr('Could not reach the server.'));
  useEffect(() => { void load(); }, []);
  if (err) return <p style={{ color: '#b91c1c' }}>{err}</p>;
  if (!v) return <span style={{ display: 'flex', gap: 8, alignItems: 'center', color: MUTED }}><Loader size={14} className="spin" /> Loading…</span>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <Stat icon={Users} label="Affiliates" value={String(v.affiliates.length)} />
        <Stat icon={Wallet} label="Held" value={sum(v.totals, 'pending')} />
        <Stat icon={CircleDollarSign} label="To pay now" value={sum(v.totals, 'payable')} />
        <Stat icon={Check} label="Paid out" value={sum(v.totals, 'paid')} />
      </div>
      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 800, color: INK }}>Commissions</div>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: MUTED }}>Pay the affiliate however you agreed (their payout details are below), then mark it paid. Nothing here sends money.</p>
        <CommissionTable rows={v.commissions} admin onMark={async (id, s) => { await markCommission(id, s); void load(); }} />
      </div>
      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 800, color: INK }}>Affiliates</div>
        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead><tr style={{ textAlign: 'left', color: MUTED }}><th style={{ padding: '8px 6px' }}>Affiliate</th><th style={{ padding: '8px 6px' }}>Code</th><th style={{ padding: '8px 6px' }}>Visits</th><th style={{ padding: '8px 6px' }}>Sign-ups</th><th style={{ padding: '8px 6px' }}>To pay</th><th style={{ padding: '8px 6px' }}>Pay to</th></tr></thead>
            <tbody>{v.affiliates.map(a => (
              <tr key={a.code} style={{ borderTop: `1px solid ${LINE}` }}>
                <td style={{ padding: '9px 6px' }}><b>{a.name || a.email}</b><div style={{ color: MUTED, fontSize: 12 }}>{a.email}</div></td>
                <td style={{ padding: '9px 6px' }}><code>{a.code}</code></td>
                <td style={{ padding: '9px 6px' }}>{a.clicks}</td><td style={{ padding: '9px 6px' }}>{a.signups}</td>
                <td style={{ padding: '9px 6px', fontWeight: 750 }}>{sum(a.totals, 'payable')}</td>
                <td style={{ padding: '9px 6px', color: MUTED }}>{a.payoutNote || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
          {!v.affiliates.length && <p style={{ margin: '10px 0 0', fontSize: 13.5, color: MUTED }}>Nobody has joined yet.</p>}
        </div>
      </div>
    </div>
  );
}

export default function Affiliate() {
  const owner = isInstallOwner();
  const [tab, setTab] = useState<'mine' | 'manage'>('mine');
  const [p, setP] = useState<Program | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { affiliateStatus().then(r => { if (r.success) setP(r.program); else setErr(r.error ?? 'Could not load.'); }).catch(() => setErr('Could not reach the server.')); }, []);
  const tabs = useMemo(() => owner ? [['mine', 'Your link'], ['manage', 'Manage program']] as const : [], [owner]);

  return (
    <div style={{ padding: 'clamp(16px, 3vw, 28px)', maxWidth: 1180, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ width: 40, height: 40, borderRadius: 12, background: '#f0fdf4', color: '#16a34a', display: 'grid', placeItems: 'center' }}><Link2 size={20} /></span>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 820, letterSpacing: '-0.02em', color: INK }}>Affiliate program</h1>
          <p style={{ margin: '2px 0 0', fontSize: 13.5, color: MUTED }}>{p?.rate ?? 40}% of every payment from customers you refer, for as long as they keep paying.</p>
        </div>
        {tabs.length > 0 && (
          <div role="tablist" style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {tabs.map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                style={{ padding: '8px 14px', borderRadius: 10, border: `1px solid ${tab === id ? INK : LINE}`, background: tab === id ? INK : '#fff', color: tab === id ? '#fff' : INK, fontWeight: 700, cursor: 'pointer' }}>{label}</button>
            ))}
          </div>
        )}
      </div>
      {err ? <p style={{ color: '#b91c1c' }}>{err}</p>
        : tab === 'manage' && owner ? <Manage />
          : !p ? <span style={{ display: 'flex', gap: 8, alignItems: 'center', color: MUTED }}><Loader size={14} className="spin" /> Loading…</span>
            : <Mine p={p} reload={setP} />}
    </div>
  );
}
