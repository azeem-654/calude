/**
 * Platform services → AI & cloud usage: how much of each free tier and of the
 * Cloudflare plan is used and left, which model each module is routed to, and
 * the caps that keep one workspace from using it all.
 *
 * One read (`/api/platform.php` `usage`, owner only — lib/usageReport.ts). The
 * AI figures are counted by the Worker as it makes each call (Google gives a
 * key no usage API); the free limits beside them are the providers' published
 * figures, editable here. Cloudflare's lines are Cloudflare's own, or say why
 * they are missing. Nothing is estimated on screen.
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Loader, RefreshCw, XCircle } from 'lucide-react';
import { API_BASE } from '../../services/apiBase';
import { sessionToken } from '../../services/auth';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';

type Tier = 'lite' | 'flash' | 'pro' | 'gemma';
interface Limits { gemini: Record<Tier, { rpm: number; rpd: number; tpm: number }>; openrouter: { rpd: number; rpdWithCredit: number; rpm: number }; source: string }
interface Cap { hour: number; day: number; tokensDay: number; blocked?: boolean }
interface Caps extends Cap { overrides: Record<string, Partial<Cap>> }
interface Report {
  day: string; month: string; limits: Limits; caps: Caps;
  gemini: { key: string; own: boolean; model: string; tier: Tier; requests: number; ok: number; limited: number; tokensIn: number; tokensOut: number; freePerDay: number | null; left: number | null }[];
  openrouter: { key: string; requests: number; freePerDay: number; left: number; freeTier: boolean | null; spent: number | null; limit: number | null; remaining: number | null; error: string }[];
  monthTotals: { provider: string; model: string; requests: number; limited: number; tokensIn: number; tokensOut: number }[];
  routing: { id: string; label: string; taskLabel: string; why: string; gemini: string[]; openrouter: string[]; today: number; month: number; tokensToday: number }[];
  workspaces: { accountId: string; owner: string; requests: number; limited: number; tokens: number; cap: Cap; overridden: boolean }[];
  cloud: { configured: boolean; why?: string; since: string; lines: { key: string; label: string; used: number | null; included: number | null; unit: string; period: string; error?: string }[] };
  registrar: { connected: boolean; provider?: string; ok?: boolean; balance?: number | null; reserved?: number | null; currency?: string; error?: string };
  modelsKnown: boolean; hasGoogleKey: boolean; hasOpenRouterKey: boolean;
}

const fmt = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(0)}k` : n.toLocaleString();
const bytes = (n: number) => n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
const amount = (n: number, unit: string) => unit === 'bytes' ? bytes(n) : unit === 'ms' ? `${fmt(Math.round(n / 1000))} s` : fmt(n);

async function call<T>(action: string, extra: Record<string, unknown> = {}): Promise<T & { success?: boolean; error?: string }> {
  const r = await fetch(`${API_BASE}/api/platform.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: sessionToken(), action, ...extra }) });
  return r.json();
}

/** A used-of-allowed meter: the share in words always beside the bar, so the colour is never the only signal. */
function Meter({ used, total, label }: { used: number; total: number | null; label: string }) {
  const pct = total ? Math.min(100, (used / total) * 100) : 0;
  const state = !total ? 'none' : pct >= 90 ? 'crit' : pct >= 70 ? 'warn' : 'ok';
  const color = state === 'crit' ? '#d92d20' : state === 'warn' ? '#dc8a06' : '#2f6fde';
  const Icon = state === 'crit' ? XCircle : state === 'warn' ? AlertTriangle : CheckCircle;
  return (
    <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 12.5 }}>
        <span style={{ color: INK, fontWeight: 600, flex: '1 1 160px', minWidth: 0, overflowWrap: 'anywhere' }}>{label}</span>
        <span style={{ color: '#334155', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>{total ? <>{state !== 'ok' && <Icon size={11} style={{ color }} />}{Math.round(pct)}% used</> : 'no limit known'}</span>
      </div>
      {total ? (
        <div role="meter" aria-valuemin={0} aria-valuemax={total} aria-valuenow={used} aria-label={label} style={{ height: 6, borderRadius: 4, background: '#eef1f6', overflow: 'hidden' }}>
          <div style={{ width: `${Math.max(pct, used ? 1 : 0)}%`, height: '100%', background: color, borderRadius: 4 }} />
        </div>
      ) : null}
    </div>
  );
}

const card: React.CSSProperties = { background: '#fff', borderRadius: 18, border: `1px solid ${LINE}`, padding: 'clamp(16px, 3vw, 24px)', minWidth: 0, display: 'grid', gap: 14 };
const h4: React.CSSProperties = { fontSize: 13.5, fontWeight: 700, color: INK, margin: 0 };
const small: React.CSSProperties = { fontSize: 12, color: MUTED, lineHeight: 1.55, margin: 0 };
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: `1px solid ${LINE}`, background: '#fff', color: INK, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const num: React.CSSProperties = { width: 88, padding: '6px 8px', borderRadius: 8, border: `1px solid ${LINE}`, fontSize: 12.5, fontFamily: 'inherit' };
const tile: React.CSSProperties = { border: `1px solid ${LINE}`, borderRadius: 12, padding: '10px 12px', display: 'grid', gap: 2, minWidth: 0 };

export default function UsageDashboard() {
  const [r, setR] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [caps, setCaps] = useState<Caps | null>(null);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [saved, setSaved] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const d = await call<Report>('usage');
      if (d.success) { setR(d); setCaps(d.caps); setLimits(d.limits); setError(''); } else setError(d.error ?? 'Could not read the usage.');
    } catch { setError('Could not reach the server.'); } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const saveCaps = async (next: Caps) => {
    setSaved('');
    const d = await call<{ caps: Caps }>('save_caps', { caps: next });
    if (d.success) { setCaps(d.caps); setSaved('Caps saved — they apply within a minute.'); void load(); } else setSaved(d.error ?? 'Not saved.');
  };
  const saveLimits = async () => {
    if (!limits) return;
    const d = await call<{ limits: Limits }>('save_limits', { limits });
    if (d.success) { setLimits(d.limits); setSaved('Free-tier figures saved.'); void load(); } else setSaved(d.error ?? 'Not saved.');
  };

  const g = r?.gemini ?? [];
  const install = g.filter(x => !x.own);
  const reqToday = install.reduce((a, x) => a + x.requests, 0) + (r?.openrouter ?? []).reduce((a, x) => a + x.requests, 0);
  const tokToday = install.reduce((a, x) => a + x.tokensIn + x.tokensOut, 0);
  const limitedToday = install.reduce((a, x) => a + x.limited, 0);

  return (
    <div style={card} data-testid="usage-dashboard">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0, flex: 1, minWidth: 180 }}>AI &amp; cloud usage</h3>
        <button onClick={() => void load()} disabled={busy} style={btn}>{busy ? <Loader size={12} className="spin" /> : <RefreshCw size={12} />} Refresh</button>
      </div>
      <p style={small}>
        Every AI request the platform makes is counted here as it happens (Google gives a key no way to ask what is left), against
        each provider's free daily allowance. A model at its free limit is moved to the back automatically, so the next model is
        used instead. Days are UTC{r ? ` — today is ${r.day}` : ''}.
      </p>
      {error && <div role="alert" style={{ fontSize: 12.5, color: '#b42318', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 12px' }}>{error}</div>}
      {!r && !error && <div style={{ fontSize: 12.5, color: MUTED }}><Loader size={12} className="spin" /> Reading…</div>}

      {r && <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          <div style={tile}><span style={small}>AI requests today</span><strong style={{ fontSize: 20, color: INK }}>{fmt(reqToday)}</strong></div>
          <div style={tile}><span style={small}>Gemini tokens today</span><strong style={{ fontSize: 20, color: INK }}>{fmt(tokToday)}</strong></div>
          <div style={tile}><span style={small}>Refused at a limit (429)</span><strong style={{ fontSize: 20, color: limitedToday ? '#b42318' : INK }}>{fmt(limitedToday)}</strong></div>
        </div>

        <section style={{ display: 'grid', gap: 10 }}>
          <h4 style={h4}>Gemini — today, per key and model</h4>
          {!r.hasGoogleKey && <p style={small}>No Google AI key is set. Add one under AI keys below.</p>}
          {r.hasGoogleKey && !install.length && <p style={small}>No Gemini requests yet today.</p>}
          {install.map(x => (
            <div key={`${x.key}-${x.model}`} style={{ display: 'grid', gap: 3 }}>
              <Meter used={x.requests} total={x.freePerDay} label={`${x.key} · ${x.model}`} />
              <span style={small}>{fmt(x.requests)} of {fmt(x.freePerDay ?? 0)} free requests today · {fmt(x.left ?? 0)} left · {fmt(x.tokensIn + x.tokensOut)} tokens{x.limited ? ` · ${x.limited} refused at a limit` : ''}</span>
            </div>
          ))}
          {g.some(x => x.own) && <p style={small}>Customers' own keys today: {fmt(g.filter(x => x.own).reduce((a, x) => a + x.requests, 0))} requests (their quota, not yours).</p>}
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <h4 style={h4}>OpenRouter (backup, free models)</h4>
          {!r.hasOpenRouterKey && <p style={small}>No OpenRouter key in the pool. Add one under AI keys as a free backup.</p>}
          {r.openrouter.map(o => (
            <div key={o.key} style={{ display: 'grid', gap: 3 }}>
              <Meter used={o.requests} total={o.freePerDay} label={o.key} />
              <span style={small}>
                {fmt(o.requests)} of {fmt(o.freePerDay)} free-model requests today · {fmt(o.left)} left
                {o.freeTier === true ? ' · free tier (buying $10 of credit raises this to 1,000 a day)' : o.freeTier === false ? ' · has credit' : ''}
                {o.spent !== null ? ` · OpenRouter reports $${o.spent.toFixed(2)} spent` : ''}{o.limit !== null ? ` of a $${o.limit} limit` : ''}
              </span>
              {o.error && <span style={{ ...small, color: '#b42318' }}>{o.error}</span>}
            </div>
          ))}
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <h4 style={h4}>Cloudflare — Workers Paid plan, this month (since {r.cloud.since})</h4>
          {!r.cloud.configured && <p style={small}>{r.cloud.why}</p>}
          {r.cloud.lines.map(l => (
            <div key={l.key} style={{ display: 'grid', gap: 3 }}>
              {l.used !== null ? <Meter used={l.used} total={l.included} label={l.label} /> : <span style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>{l.label}</span>}
              <span style={{ ...small, color: l.error ? '#b42318' : MUTED }}>
                {l.error ? `Could not be read: ${l.error}` : `${amount(l.used ?? 0, l.unit)} of ${l.included ? amount(l.included, l.unit) : '—'} included ${l.period === 'day' ? 'today' : l.period === 'now' ? '(stored now)' : 'this month'} · ${l.included ? `${amount(Math.max(0, l.included - (l.used ?? 0)), l.unit)} left` : ''}${l.included && (l.used ?? 0) > l.included ? ' — over the included amount, billed per unit' : ''}`}
              </span>
            </div>
          ))}
        </section>

        <section style={{ display: 'grid', gap: 6 }}>
          <h4 style={h4}>Domains — {r.registrar.connected ? r.registrar.provider : 'registrar'}</h4>
          <p style={{ ...small, color: r.registrar.connected && !r.registrar.ok ? '#b42318' : MUTED }}>
            {!r.registrar.connected ? 'No registrar is connected (Settings → Domains).'
              : r.registrar.ok ? `Balance: ${r.registrar.balance?.toFixed(2)} ${r.registrar.currency ?? ''}${r.registrar.reserved ? ` (${r.registrar.reserved.toFixed(2)} reserved)` : ''}`
                : r.registrar.error}
          </p>
        </section>

        <section style={{ display: 'grid', gap: 8 }}>
          <h4 style={h4}>Which model does each module use</h4>
          <p style={small}>Chosen per job from the models your keys can use today (newest of each kind). The first is tried first; a model at its free limit drops to the back.{!r.modelsKnown && r.hasGoogleKey ? ' Google\'s model list could not be read just now, so the general list is used.' : ''}</p>
          <div style={{ display: 'grid', gap: 6 }}>
            {r.routing.filter(m => m.id !== 'general' || m.month).map(m => (
              <div key={m.id} style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: '8px 10px', display: 'grid', gap: 2, minWidth: 0 }} title={m.why}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <strong style={{ fontSize: 12.5, color: INK, flex: '1 1 180px' }}>{m.label}</strong>
                  <span style={{ fontSize: 11.5, color: MUTED }}>{m.taskLabel} · {fmt(m.today)} today · {fmt(m.month)} this month</span>
                </div>
                <span style={{ fontSize: 12, color: '#334155', overflowWrap: 'anywhere' }}>
                  {m.gemini.length ? <><b>{m.gemini[0]}</b>{m.gemini.slice(1).map(x => ` → ${x}`).join('')}</> : 'Gemini: no key'}
                  {m.openrouter.length ? ` · backup: ${m.openrouter.join(', ')}` : ''}
                </span>
              </div>
            ))}
          </div>
        </section>

        {caps && (
          <section style={{ display: 'grid', gap: 10 }}>
            <h4 style={h4}>Caps per customer workspace</h4>
            <p style={small}>Every workspace using your keys stops at these, so one customer cannot use up the free tiers for everyone. A token cap of 0 means none. Customers with their own key are capped too (it protects the platform), but their tokens are not yours.</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
              <label style={{ display: 'grid', gap: 3, fontSize: 12, color: MUTED }}>Requests / hour<input type="number" min={1} style={num} data-field="caps.hour" value={caps.hour} onChange={e => setCaps({ ...caps, hour: Number(e.target.value) })} /></label>
              <label style={{ display: 'grid', gap: 3, fontSize: 12, color: MUTED }}>Requests / day<input type="number" min={1} style={num} data-field="caps.day" value={caps.day} onChange={e => setCaps({ ...caps, day: Number(e.target.value) })} /></label>
              <label style={{ display: 'grid', gap: 3, fontSize: 12, color: MUTED }}>Tokens / day<input type="number" min={0} style={num} data-field="caps.tokensDay" value={caps.tokensDay} onChange={e => setCaps({ ...caps, tokensDay: Number(e.target.value) })} /></label>
              <button style={btn} onClick={() => void saveCaps(caps)} data-testid="save-caps">Save caps</button>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>Busiest workspaces today</span>
              {!r.workspaces.length && <p style={small}>No workspace has used AI today.</p>}
              {r.workspaces.map(w => {
                const o = caps.overrides[w.accountId] ?? {};
                const setO = (p: Partial<Cap>) => setCaps({ ...caps, overrides: { ...caps.overrides, [w.accountId]: { ...o, ...p } } });
                return (
                  <div key={w.accountId} style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: '8px 10px', display: 'grid', gap: 6, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12.5 }}>
                      <strong style={{ color: INK, flex: '1 1 180px', overflowWrap: 'anywhere' }}>{w.owner || w.accountId}</strong>
                      <span style={{ color: MUTED }}>{fmt(w.requests)} requests · {fmt(w.tokens)} tokens{w.limited ? ` · ${w.limited} refused` : ''}</span>
                    </div>
                    <Meter used={w.requests} total={w.cap.day} label="Of this workspace's daily cap" />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: MUTED }}>
                      <label>Day cap <input type="number" min={1} style={num} value={o.day ?? ''} placeholder={String(caps.day)} onChange={e => setO({ day: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
                      <label>Tokens/day <input type="number" min={0} style={num} value={o.tokensDay ?? ''} placeholder={String(caps.tokensDay)} onChange={e => setO({ tokensDay: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
                      <label><input type="checkbox" checked={!!o.blocked} onChange={e => setO({ blocked: e.target.checked || undefined })} /> Switch AI off</label>
                      <button style={btn} onClick={() => void saveCaps(caps)}>Save</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {limits && (
          <details>
            <summary style={{ fontSize: 12.5, fontWeight: 700, color: INK, cursor: 'pointer' }}>Free-tier figures used above</summary>
            <p style={{ ...small, marginTop: 6 }}>{limits.source}</p>
            <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
              {(['lite', 'flash', 'pro', 'gemma'] as Tier[]).map(t => (
                <div key={t} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: MUTED }}>
                  <span style={{ width: 110, color: INK, fontWeight: 600 }}>{t === 'gemma' ? 'Gemma' : `Gemini ${t === 'lite' ? 'Flash-Lite' : t === 'flash' ? 'Flash' : 'Pro'}`}</span>
                  <label>per day <input type="number" min={0} style={num} value={limits.gemini[t].rpd} onChange={e => setLimits({ ...limits, gemini: { ...limits.gemini, [t]: { ...limits.gemini[t], rpd: Number(e.target.value) } } })} /></label>
                  <label>per minute <input type="number" min={0} style={num} value={limits.gemini[t].rpm} onChange={e => setLimits({ ...limits, gemini: { ...limits.gemini, [t]: { ...limits.gemini[t], rpm: Number(e.target.value) } } })} /></label>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: MUTED }}>
                <span style={{ width: 110, color: INK, fontWeight: 600 }}>OpenRouter free</span>
                <label>per day <input type="number" min={0} style={num} value={limits.openrouter.rpd} onChange={e => setLimits({ ...limits, openrouter: { ...limits.openrouter, rpd: Number(e.target.value) } })} /></label>
                <label>with credit <input type="number" min={0} style={num} value={limits.openrouter.rpdWithCredit} onChange={e => setLimits({ ...limits, openrouter: { ...limits.openrouter, rpdWithCredit: Number(e.target.value) } })} /></label>
              </div>
              <div><button style={btn} onClick={() => void saveLimits()}>Save figures</button></div>
            </div>
          </details>
        )}
        {saved && <p role="status" style={{ ...small, color: INK }}>{saved}</p>}
      </>}
    </div>
  );
}
