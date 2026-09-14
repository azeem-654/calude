/**
 * The owner's side of Digital Business Setup — and the only screen in the app
 * where the provider has a name and a cost has a number.
 *
 * Three panels, in the order somebody needs them:
 *
 * 1. **The provider account.** Connect it, test it. The password is write-only:
 *    the server reports that one is set and never what it is, so the field
 *    shows a placeholder and an empty save keeps the stored one.
 * 2. **Prices.** Changed here, at any time, with no effect on an order somebody
 *    has already agreed to — the quote is frozen onto the order at checkout.
 * 3. **Jobs.** Every provisioning run, its steps, and the provider's own error
 *    text. This is what makes "fix it without the customer noticing" possible:
 *    the customer's screen says "we are retrying", and this one says the
 *    registrar rejected the postcode.
 *
 * Nothing here is reachable without being the install owner. That is enforced
 * on the server for every action, not by hiding the route.
 */
import { useEffect, useState } from 'react';
import {
  Server, KeyRound, Loader, Check, AlertCircle, RefreshCw, Tag, ListChecks, ChevronDown, ChevronRight,
  XCircle, MinusCircle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import EarningsPanel from './EarningsPanel';
import {
  adminJobs, listPrices, money, providerState, retryJob, savePriceRow, saveProvider, testProvider,
  type AdminDomain, type AdminOrder, type AdminStep, type PriceRow, type ProviderCheck, type ProviderState,
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
const inp: React.CSSProperties = {
  padding: '9px 11px', border: `1px solid ${LINE}`, borderRadius: 9,
  fontSize: 13, color: INK, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
};
const btn = (disabled: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 15px',
  border: 'none', borderRadius: 9, background: disabled ? '#c7c9d3' : INK, color: '#fff',
  fontSize: 12.5, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
});

/* ── 1. The provider account ─────────────────────────────────────────────── */

function ProviderPanel() {
  const { addNotification } = useApp();
  const [state, setState] = useState<ProviderState | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [resellerId, setResellerId] = useState('');
  const [mailHost, setMailHost] = useState('');
  const [sandbox, setSandbox] = useState(false);
  const [busy, setBusy] = useState('');
  /*
   * Kept apart from `state` on purpose.
   *
   * A plain read returns no checks, and clearing them on every refresh would
   * wipe the answer the moment the panel reloaded. These are the result of the
   * last Test somebody actually ran, and they stay until the next one.
   */
  const [checks, setChecks] = useState<ProviderCheck[]>([]);

  const apply = (s: ProviderState | null) => {
    if (!s) return;
    setState(s);
    if (s.checks?.length) setChecks(s.checks);
    setUsername(s.username);
    setResellerId('');
    setMailHost(s.mailHost);
    setSandbox(s.sandbox);
    /* Cleared after every save. A field that keeps what was typed looks like it
       is still holding a secret the screen can read back, and it cannot. */
    setPassword('');
  };

  useEffect(() => {
    let live = true;
    void (async () => { const s = await providerState(); if (live) apply(s); })();
    return () => { live = false; };
  }, []);

  const save = async () => {
    setBusy('save');
    const r = await saveProvider({ provider: state?.provider || 'openprovider', username, password, resellerId, sandbox, mailHost });
    setBusy('');
    if (r.error) { addNotification(r.error, 'error'); return; }
    apply(r.state);
    addNotification('Saved. Press Test to check it works.', 'success');
  };

  const test = async () => {
    setBusy('test');
    setChecks([]);
    const r = await testProvider();
    setBusy('');
    if (r.error) { addNotification(r.error, 'error'); const s = await providerState(); apply(s); return; }
    apply(r.state);
    const found = r.state?.checks ?? [];
    const bad = found.filter(c => c.state === 'failed');
    /* Named rather than counted. "2 problems" sends somebody hunting; the name
       of the first one is the thing they can act on. */
    addNotification(
      bad.length
        ? `${bad[0].label} — ${bad.length > 1 ? `and ${bad.length - 1} more below` : 'see below'}.`
        : 'All checks passed. Domains can be searched and registered.',
      bad.length ? 'error' : 'success',
    );
  };

  const connected = !!state?.connected;
  const ok = state?.status === 'ok';

  return (
    <section style={card}>
      <div style={head}>
        <Server size={15} color={ACCENT} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>Domain and email provider</div>
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }}>
            Your reseller account. Customers never see this, or its name, anywhere.
          </div>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
          background: ok ? '#e8f5e9' : connected ? '#fff7e6' : '#f1f5f9',
          color: ok ? '#1e6b32' : connected ? '#7a4d00' : MUTED,
        }}>
          {ok ? 'Working' : connected ? 'Not tested' : 'Not connected'}
        </span>
      </div>

      <div style={{ padding: 16, display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 5 }}>Username</label>
            <input value={username} onChange={e => setUsername(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 5 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={state?.hasPassword ? '•••••••••• (kept)' : ''} style={inp} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 5 }}>Reseller ID</label>
            <input value={resellerId} onChange={e => setResellerId(e.target.value)}
              placeholder={connected ? 'kept' : ''} style={inp} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 5 }}>Mail server hostname</label>
            <input value={mailHost} onChange={e => setMailHost(e.target.value)} placeholder="mail.openprovider.eu" style={inp} />
          </div>
        </div>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: '#475569', cursor: 'pointer' }}>
          <input type="checkbox" checked={sandbox} onChange={e => setSandbox(e.target.checked)} style={{ width: 15, height: 15 }} />
          Use the sandbox — searches and registrations are simulated and cost nothing
        </label>
        {/* Said on the control, not in a doc nobody opens. The sandbox is a
            separate account, and its credentials are not the live ones — which
            reads as a wrong password to anybody who does not already know. */}
        {sandbox && (
          <p style={{ margin: '-6px 0 0 23px', fontSize: 11.5, color: '#b45309', lineHeight: 1.6 }}>
            The sandbox is a <strong>separate account</strong> with its own username and password. Your
            live details will not sign in to it — sign up for a sandbox account and use those details
            here, or untick this and test against your real one.
          </p>
        )}

        {checks.length > 0 && (
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '9px 13px', background: '#fafbfc', borderBottom: `1px solid ${LINE}`, fontSize: 11.5, fontWeight: 800, color: INK }}>
              What we checked
            </div>
            <div style={{ display: 'grid' }}>
              {checks.map(c => {
                const tone = c.state === 'ok' ? { fg: '#0f7b3d', Icon: Check }
                  : c.state === 'failed' ? { fg: '#b42318', Icon: XCircle }
                    : c.state === 'warning' ? { fg: '#b45309', Icon: AlertCircle }
                      : { fg: MUTED, Icon: MinusCircle };
                return (
                  <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 13px', borderTop: `1px solid ${LINE}` }}>
                    <tone.Icon size={15} color={tone.fg} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>{c.label}</span>
                        {c.blocking && c.state === 'failed' && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#b42318', background: '#fdf3f3', padding: '2px 7px', borderRadius: 999 }}>
                            Blocks everything
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2, lineHeight: 1.55, wordBreak: 'break-word' }}>{c.detail}</div>
                      {/* The instruction, not just the verdict. This is the
                          whole reason the panel exists. */}
                      {c.fix && (
                        <div style={{ fontSize: 11.5, color: '#1e3a5f', marginTop: 5, lineHeight: 1.6, padding: '8px 10px', background: '#f4f7fb', borderRadius: 8 }}>
                          {c.fix}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {state?.lastError && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, background: '#fdf3f3', border: '1px solid #fecaca' }}>
            <AlertCircle size={14} color="#b42318" style={{ flexShrink: 0, marginTop: 1 }} />
            {/* Verbatim, and only here. */}
            <span style={{ fontSize: 11.5, color: '#991b1b', lineHeight: 1.5 }}>{state.lastError}</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => void save()} disabled={!!busy || !username} style={btn(!!busy || !username)}>
            {busy === 'save' ? <Loader size={13} className="spin" /> : <KeyRound size={13} />} Save
          </button>
          <button onClick={() => void test()} disabled={!!busy || !connected} style={{
            ...btn(!!busy || !connected), background: '#fff', color: INK, border: `1px solid ${LINE}`,
          }}>
            {busy === 'test' ? <Loader size={13} className="spin" /> : <Check size={13} />} Test
          </button>
        </div>

        <p style={{ margin: 0, fontSize: 11.5, color: MUTED, lineHeight: 1.6 }}>
          Openprovider requires the IP addresses that call its API to be allow-listed on your account.
          Cloudflare Workers do not have a fixed one, so enable API access without an IP restriction,
          or the first search will be refused.
        </p>
      </div>
    </section>
  );
}

/* ── 2. Prices ───────────────────────────────────────────────────────────── */

function PricePanel() {
  const { addNotification } = useApp();
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let live = true;
    void (async () => { const p = await listPrices(); if (live) setRows(p); })();
    return () => { live = false; };
  }, []);

  const keyOf = (r: PriceRow) => `${r.kind}:${r.code}`;

  const save = async (r: PriceRow) => {
    const k = keyOf(r);
    const typed = draft[k];
    /* Typed as pounds and pence, stored as integer cents. Parsed once, here. */
    const cents = Math.round(Number(typed) * 100);
    if (!Number.isFinite(cents) || cents < 0) { addNotification('That is not a price.', 'error'); return; }
    setBusy(k);
    const out = await savePriceRow({ kind: r.kind, code: r.code, retailCents: cents, markupPct: r.markupPct, label: r.label });
    setBusy('');
    if (out.error) { addNotification(out.error, 'error'); return; }
    setRows(out.prices);
    setDraft(prev => { const next = { ...prev }; delete next[k]; return next; });
    addNotification(`${r.label || r.code} is now ${money(cents)}.`, 'success');
  };

  return (
    <section style={card}>
      <div style={head}>
        <Tag size={15} color={ACCENT} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>What customers pay</div>
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }}>
            Change any of these whenever you like. An order already placed keeps the price it was sold at.
          </div>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 480 }}>
          <thead>
            <tr style={{ background: '#fafbfc' }}>
              {['Item', 'Billed', 'Price', 'Fallback markup', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '9px 12px', fontSize: 11, fontWeight: 700, color: '#475569', borderBottom: `1px solid ${LINE}`, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const k = keyOf(r);
              const shown = draft[k] ?? (r.retailCents / 100).toFixed(2);
              const dirty = draft[k] !== undefined && Math.round(Number(draft[k]) * 100) !== r.retailCents;
              return (
                <tr key={k}>
                  <td style={{ padding: '9px 12px', borderBottom: `1px solid ${LINE}`, fontSize: 12.5, color: INK, fontWeight: 600 }}>
                    {r.label || (r.kind === 'domain' ? `.${r.code}` : r.code)}
                  </td>
                  <td style={{ padding: '9px 12px', borderBottom: `1px solid ${LINE}`, fontSize: 12, color: MUTED }}>
                    {r.kind === 'domain' ? 'Yearly' : 'Monthly'}
                  </td>
                  <td style={{ padding: '6px 12px', borderBottom: `1px solid ${LINE}`, width: 130 }}>
                    <input value={shown} inputMode="decimal"
                      onChange={e => setDraft(prev => ({ ...prev, [k]: e.target.value.replace(/[^\d.]/g, '') }))}
                      style={{ ...inp, width: 100 }} />
                  </td>
                  <td style={{ padding: '9px 12px', borderBottom: `1px solid ${LINE}`, fontSize: 12, color: MUTED }}>
                    {r.kind === 'domain' ? `${r.markupPct}%` : '—'}
                  </td>
                  <td style={{ padding: '6px 12px', borderBottom: `1px solid ${LINE}`, width: 90 }}>
                    {dirty && (
                      <button onClick={() => void save(r)} disabled={busy === k} style={{ ...btn(busy === k), padding: '6px 12px', fontSize: 12 }}>
                        {busy === k ? <Loader size={12} className="spin" /> : <Check size={12} />} Save
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ margin: 0, padding: '11px 16px', fontSize: 11.5, color: MUTED, lineHeight: 1.6, borderTop: `1px solid ${LINE}` }}>
        The fallback markup only applies to extensions with no price of their own, and to premium names —
        a premium <code>.com</code> can cost hundreds at wholesale and must never sell at the flat price.
      </p>
    </section>
  );
}

/* ── 3. Jobs ─────────────────────────────────────────────────────────────── */

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  done: { bg: '#e8f6ee', fg: '#0f7b3d' },
  failed: { bg: '#fdf3f3', fg: '#b42318' },
  running: { bg: 'rgba(91,70,229,0.09)', fg: ACCENT },
  paid: { bg: '#eef2f8', fg: '#3a4a63' },
  awaiting_payment: { bg: '#fff7e6', fg: '#7a4d00' },
  pending: { bg: '#f7f8fa', fg: MUTED },
  skipped: { bg: '#f2f3f5', fg: MUTED },
  draft: { bg: '#f7f8fa', fg: MUTED },
};

function JobsPanel() {
  const { addNotification } = useApp();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [steps, setSteps] = useState<AdminStep[]>([]);
  const [domains, setDomains] = useState<AdminDomain[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const r = await adminJobs();
    setOrders(r.orders);
    setSteps(r.steps);
    setDomains(r.domains);
    setLoading(false);
  };

  useEffect(() => {
    let live = true;
    void (async () => { const r = await adminJobs(); if (!live) return; setOrders(r.orders); setSteps(r.steps); setDomains(r.domains); setLoading(false); })();
    return () => { live = false; };
  }, []);

  const retry = async (id: string) => {
    setBusy(id);
    const r = await retryJob(id);
    setBusy('');
    if (r.error) { addNotification(r.error, 'error'); return; }
    addNotification('Retried. Any step that had stopped has been tried again.', 'success');
    void load();
  };

  /* What each order actually cost us against what it brought in. The only place
     in the app these two numbers are ever in the same row. */
  const marginOf = (o: AdminOrder) => {
    const dm = domains.find(d => d.domain === o.domain);
    if (!dm || !dm.costCents) return null;
    return o.totalCents - dm.costCents;
  };

  return (
    <section style={card}>
      <div style={head}>
        <ListChecks size={15} color={ACCENT} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>Provisioning jobs</div>
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }}>
            Every setup, what it did, and what really went wrong when it did not.
          </div>
        </div>
        <button onClick={() => void load()} style={{ border: 'none', background: 'none', color: MUTED, cursor: 'pointer', padding: 3, display: 'flex' }}
          aria-label="Reload jobs"><RefreshCw size={14} /></button>
      </div>

      <div style={{ padding: orders.length ? 0 : 16 }}>
        {loading && <p style={{ margin: 0, fontSize: 13, color: MUTED }}>Loading…</p>}
        {!loading && !orders.length && (
          <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
            No setups have been ordered yet. When somebody buys a domain through the project wizard,
            it appears here with every step it went through.
          </p>
        )}

        {orders.map(o => {
          const mine = steps.filter(s => s.orderId === o.id);
          const isOpen = open === o.id;
          const tone = STATUS_TONE[o.status] ?? STATUS_TONE.pending;
          const margin = marginOf(o);
          return (
            <div key={o.id} style={{ borderBottom: `1px solid ${LINE}` }}>
              <button onClick={() => setOpen(isOpen ? null : o.id)} style={{
                display: 'flex', gap: 10, alignItems: 'center', width: '100%', textAlign: 'left',
                padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {isOpen ? <ChevronDown size={14} color={MUTED} /> : <ChevronRight size={14} color={MUTED} />}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: INK }}>{o.domain}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 1 }}>
                    {o.companyName || o.contactEmail} · {new Date(o.createdAt).toLocaleString()}
                  </span>
                </span>
                {margin !== null && (
                  <span title="What you charged minus what it cost you"
                    style={{ fontSize: 11.5, fontWeight: 700, color: margin >= 0 ? '#0f7b3d' : '#b42318', whiteSpace: 'nowrap' }}>
                    {margin >= 0 ? '+' : ''}{money(margin, o.currency)}
                  </span>
                )}
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: tone.bg, color: tone.fg, whiteSpace: 'nowrap' }}>
                  {o.status.replace(/_/g, ' ')}
                </span>
              </button>

              {isOpen && (
                <div style={{ padding: '0 16px 14px 40px', display: 'grid', gap: 9 }}>
                  {mine.map(s => {
                    const st = STATUS_TONE[s.status] ?? STATUS_TONE.pending;
                    return (
                      <div key={s.id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: st.bg, color: st.fg, whiteSpace: 'nowrap', marginTop: 1 }}>
                          {s.status}
                        </span>
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: INK }}>
                            {s.label}{s.attempts > 1 && <span style={{ color: MUTED, fontWeight: 400 }}> · {s.attempts} attempts</span>}
                          </span>
                          {s.detail && <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 1 }}>{s.detail}</span>}
                          {/* The provider's own words. This is the whole reason
                              this screen exists. */}
                          {s.lastError && (
                            <span style={{ display: 'block', fontSize: 11.5, color: '#b42318', marginTop: 3, fontFamily: 'ui-monospace, monospace', lineHeight: 1.5, wordBreak: 'break-word' }}>
                              {s.lastError}
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}

                  {mine.some(s => s.status === 'failed') && (
                    <button onClick={() => void retry(o.id)} disabled={busy === o.id} style={{ ...btn(busy === o.id), alignSelf: 'flex-start', marginTop: 3 }}>
                      {busy === o.id ? <Loader size={13} className="spin" /> : <RefreshCw size={13} />} Retry the failed steps
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function SetupAdmin() {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <ProviderPanel />
      <PricePanel />
      {/* Between prices and jobs on purpose: it is the answer to "did that
          price work", and it is the screen somebody opens before changing one. */}
      <EarningsPanel />
      <JobsPanel />
    </div>
  );
}
