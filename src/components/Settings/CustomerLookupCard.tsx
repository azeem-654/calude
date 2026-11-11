/**
 * One customer on one screen, for the install owner (OPS-2;
 * worker/src/routes/customerView.ts): plan and usage, what failed for them
 * lately, crashes on their screens, and the audit trail — theirs and yours on
 * them. Read-only.
 */
import { useState } from 'react';
import { Loader, Search } from 'lucide-react';
import { sessionToken } from '../../services/auth';

type Row = Record<string, string | number | null>;
interface Customer {
  email: string; name: string; role: string; accountId: string | null; createdAt: string; trialEndsAt: string | null;
  workspaces: { id: string; createdAt: string; industry: string }[];
  plan: { planId: string; source: string; updatedAt: string } | null;
  usage: { planName: string; meters: { id: string; used: number; limit: number }[] } | null;
  autopilot: Row[]; jobs: Row[]; sends: Row[]; crashes: Row[]; audit: Row[]; operatorActions: Row[];
}

const when = (s: unknown) => (s ? new Date(String(s)).toLocaleString() : '');
const box: React.CSSProperties = { border: '1px solid #e6e9f0', borderRadius: 12, padding: '10px 12px', minWidth: 0 };
const h4: React.CSSProperties = { margin: '0 0 6px', fontSize: 12.5, fontWeight: 700, color: '#0f172a' };
const small: React.CSSProperties = { fontSize: 12, color: '#475569', lineHeight: 1.5, overflowWrap: 'anywhere' };

function List({ title, rows, line, none }: { title: string; rows: Row[]; line: (r: Row) => string; none: string }) {
  return (
    <div style={box}>
      <h4 style={h4}>{title}</h4>
      {rows.length === 0 ? <div style={{ ...small, color: '#64748b' }}>{none}</div>
        : <ul style={{ margin: 0, paddingLeft: 16, display: 'grid', gap: 3 }}>{rows.map((r, i) => <li key={i} style={small}>{line(r)}</li>)}</ul>}
    </div>
  );
}

export default function CustomerLookupCard() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [c, setC] = useState<Customer | null>(null);

  const look = async () => {
    setBusy(true); setErr('');
    const d = await fetch('/api/customer-view.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken(), email }),
    }).then(r => r.json() as Promise<{ success: boolean; customer?: Customer; error?: string }>).catch(() => ({ success: false, error: 'Could not reach the server.' } as { success: boolean; customer?: Customer; error?: string }));
    setBusy(false);
    if (d.success && d.customer) setC(d.customer); else { setC(null); setErr(d.error ?? 'Not found.'); }
  };

  const used = (c?.usage?.meters ?? []).filter(m => m.used > 0);
  return (
    <div style={{ background: 'white', borderRadius: 18, border: '1px solid #e6e9f0', padding: 22, marginBottom: 20 }}>
      <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: '#0f172a' }}>Look up a customer</h3>
      <p style={{ margin: '3px 0 12px', fontSize: 12.5, color: '#64748b', lineHeight: 1.55 }}>
        Their plan and usage, what failed for them lately, and every change you made to their account. Only you see this.
      </p>
      <form onSubmit={e => { e.preventDefault(); void look(); }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="customer@example.com" aria-label="Customer email"
          data-field="customer.email" style={{ flex: '1 1 220px', minWidth: 0, padding: '8px 10px', borderRadius: 9, border: '1px solid #e6e9f0', fontSize: 13, fontFamily: 'inherit' }} />
        <button type="submit" disabled={busy || !email.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: 'none', background: '#0f172a', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
          {busy ? <Loader size={13} className="spin" /> : <Search size={13} />} Look up
        </button>
      </form>
      {err && <p role="alert" style={{ margin: '8px 0 0', fontSize: 12.5, color: '#b42318' }}>{err}</p>}
      {c && (
        <div style={{ marginTop: 14, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          <div style={box}>
            <h4 style={h4}>{c.name || c.email}</h4>
            <div style={small}>{c.email} · {c.role}{c.accountId ? ` · ${c.accountId}` : ''}</div>
            <div style={small}>Joined {when(c.createdAt)}{c.trialEndsAt ? ` · trial ends ${when(c.trialEndsAt)}` : ''}</div>
            <div style={small}>Plan: {c.usage?.planName ?? '—'}{c.plan ? ` (${c.plan.source}, ${when(c.plan.updatedAt)})` : ''}</div>
            <div style={small}>{c.workspaces.length} workspace{c.workspaces.length === 1 ? '' : 's'}</div>
          </div>
          <List title="Used this period" rows={used.map(m => ({ m: m.id, u: m.used, l: m.limit }))} line={r => `${r.m}: ${r.u} of ${Number(r.l) < 0 ? 'unlimited' : r.l}`} none="Nothing used yet." />
          <List title="Failed Autopilot steps" rows={c.autopilot} line={r => `${when(r.at)} · ${r.kind}: ${r.summary}${r.detail ? ` — ${String(r.detail).slice(0, 120)}` : ''}`} none="None." />
          <List title="Failed video jobs" rows={c.jobs} line={r => `${when(r.at)} · ${r.kind}: ${String(r.error ?? '').slice(0, 140)}`} none="None." />
          <List title="Sends that did not arrive" rows={c.sends} line={r => `${when(r.at)} · ${r.channel} to ${r.recipient}: ${r.status}${r.detail ? ` — ${String(r.detail).slice(0, 100)}` : ''}`} none="None." />
          <List title="Screen crashes and dead ends" rows={c.crashes} line={r => `${when(r.at)} · ${r.path} · ${r.kind === 'crash' ? `crashed (${r.field})` : `asked for ${r.field}`} · ${r.hits}×`} none="None." />
          <List title="Their account activity" rows={c.audit} line={r => `${when(r.at)} · ${r.kind}${r.detail ? ` — ${r.detail}` : ''}`} none="Nothing recorded." />
          <List title="Your changes to their account" rows={c.operatorActions} line={r => `${when(r.at)} · ${r.kind}: ${r.detail}`} none="None." />
        </div>
      )}
    </div>
  );
}
