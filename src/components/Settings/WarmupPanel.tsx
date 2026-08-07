/**
 * WarmupPanel.tsx — the warmup ramp, per-provider throttling, seed mailboxes
 * and sending-identity health.
 *
 * Every number here is measured: the ramp is enforced on real sends, provider
 * status comes from what happened to our own mail, and placement comes from the
 * user telling us where a real seed message landed. There is no simulated
 * conversation network, and the panel says so rather than implying otherwise.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Flame, Play, Pause, Plus, Trash2, Check, X, AlertTriangle, Inbox,
  Server, RefreshCw, Search, Activity, Info,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  loadWarmup, saveWarmup, todayPlan, providerHealth, adjustThrottles, runWarmup,
  loadSeeds, addSeed, removeSeed, recordPlacement, placementSummary, providerName,
  loadIdentities, addIdentity, removeIdentity, loadLog,
  type WarmupState, type Seed,
} from '../../services/warmup';
import { checkAuthentication, checkBlacklists, loadSettings } from '../../services/deliverability';

const INK = '#17191c';

const STATUS_COLORS = {
  good: { color: '#16a34a', bg: '#f0fdf4', label: 'Healthy' },
  watch: { color: '#d97706', bg: '#fffbeb', label: 'Slowing down' },
  blocked: { color: '#dc2626', bg: '#fef2f2', label: 'Paused' },
  idle: { color: '#64748b', bg: '#f8fafc', label: 'No data' },
} as const;

export default function WarmupPanel() {
  const { addNotification } = useApp();
  const [state, setState] = useState<WarmupState>(() => loadWarmup());
  const [seeds, setSeeds] = useState<Seed[]>(() => loadSeeds());
  const [identities, setIdentities] = useState(() => loadIdentities());
  const [newSeed, setNewSeed] = useState('');
  const [newIdentity, setNewIdentity] = useState('');
  const [busy, setBusy] = useState('');
  const [idHealth, setIdHealth] = useState<Record<string, { auth?: string; blacklist?: string; checking?: boolean }>>({});
  const [version, setVersion] = useState(0);

  const plan = useMemo(() => todayPlan(state), [state, version]);
  const health = useMemo(() => providerHealth(), [version]);
  const placement = useMemo(() => placementSummary(seeds), [seeds]);
  const logRows = useMemo(() => loadLog().slice(0, 12), [version]);

  useEffect(() => {
    // Bring the throttles up to date with what has happened since last time,
    // so the panel opens showing the truth rather than a stale snapshot.
    const { state: next } = adjustThrottles(loadWarmup());
    setState(next);
  }, []);

  const patch = (p: Partial<WarmupState>) => {
    const next = { ...state, ...p };
    setState(next);
    saveWarmup(next);
    setVersion(v => v + 1);
  };

  const card: React.CSSProperties = { background: '#fff', borderRadius: 18, border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', padding: 20, marginBottom: 18 };
  const inp: React.CSSProperties = { padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' };
  const h3: React.CSSProperties = { margin: 0, fontSize: 15, fontWeight: 800, color: INK, display: 'flex', alignItems: 'center', gap: 7 };
  const sub: React.CSSProperties = { margin: '3px 0 0', fontSize: 12, color: '#94a3b8', lineHeight: 1.5 };
  const btn = (primary = false): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6, padding: primary ? '9px 15px' : '8px 13px',
    border: primary ? 'none' : '1px solid #e2e8f0', borderRadius: 9,
    background: primary ? INK : '#fff', color: primary ? '#fff' : '#475569',
    fontSize: 12.5, fontWeight: primary ? 700 : 600, cursor: 'pointer',
  });

  const progress = plan.allowance === Infinity ? 0 : Math.min(100, Math.round((plan.sentToday / Math.max(plan.allowance, 1)) * 100));

  return (
    <div>
      {/* Ramp */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <h3 style={h3}><Flame size={15} /> Warmup ramp</h3>
            <p style={sub}>
              A new domain that suddenly sends hundreds of emails looks exactly like a compromised one.
              The ramp starts small and doubles roughly every four days, and it is enforced on every send —
              not just displayed.
            </p>
          </div>
          <button title={state.enabled ? 'Turn the warmup ramp off' : 'Turn the warmup ramp on'} style={btn(true)}
            onClick={() => {
              const enabling = !state.enabled;
              patch({ enabled: enabling, startedAt: enabling && !state.startedAt ? new Date().toISOString() : state.startedAt });
              addNotification(enabling ? 'Warmup started — sending is now capped by the ramp' : 'Warmup stopped — the daily cap no longer applies');
            }}>
            {state.enabled ? <><Pause size={13} /> Stop warmup</> : <><Play size={13} /> Start warmup</>}
          </button>
        </div>

        {state.enabled ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: INK }}>{plan.sentToday}</span>
              <span style={{ fontSize: 14, color: '#94a3b8' }}>of {plan.allowance} today</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: '#4f46e5', background: '#eef2ff', padding: '3px 10px', borderRadius: 999 }}>
                Day {plan.day}
              </span>
            </div>
            <div style={{ height: 7, borderRadius: 4, background: '#eef0f3', overflow: 'hidden', marginTop: 8 }}>
              <div style={{ width: `${progress}%`, height: '100%', background: progress >= 100 ? '#dc2626' : '#4f46e5', transition: 'width .3s' }} />
            </div>
            <p style={{ ...sub, marginTop: 8 }}>{plan.reason}</p>
          </>
        ) : (
          <p style={{ ...sub, marginTop: 14 }}>
            Warmup is off, so nothing limits how much you send. Turn it on for a new domain or a new sending
            address; leave it off once the domain has a track record.
          </p>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: 11.5, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>Start at (per day)</label>
            <input type="number" min="1" max="200" value={state.startVolume} title="Emails per day on day one"
              onChange={e => patch({ startVolume: Math.max(1, Number(e.target.value) || 1) })} style={{ ...inp, width: 120 }} />
          </div>
          <div>
            <label style={{ fontSize: 11.5, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>Ramp up to</label>
            <input type="number" min="10" value={state.targetVolume} title="The ceiling the ramp climbs to"
              onChange={e => patch({ targetVolume: Math.max(10, Number(e.target.value) || 10) })} style={{ ...inp, width: 140 }} />
          </div>
          <div style={{ alignSelf: 'flex-end' }}>
            <button disabled={busy === 'run'} title="Send today's warmup messages now instead of waiting for the background job" style={btn()}
              onClick={async () => {
                setBusy('run');
                const res = await runWarmup();
                setBusy('');
                setState(loadWarmup()); setSeeds(loadSeeds()); setVersion(v => v + 1);
                addNotification(res.sent
                  ? `${res.sent} warmup message${res.sent === 1 ? '' : 's'} sent`
                  : (res.notes[0] || 'Nothing to send right now'), res.sent ? 'success' : 'info');
              }}>
              {busy === 'run' ? <RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Play size={13} />} Run warmup now
            </button>
          </div>
        </div>
      </div>

      {/* Per-provider */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={h3}><Activity size={15} /> Provider health and throttling</h3>
            <p style={sub}>
              Measured from the last 30 days of your own mail. When a provider defers or bounces, its share of
              the daily allowance is cut automatically and restored gradually once it is clean.
            </p>
          </div>
          <button title="Re-derive the throttles from recent results" style={btn()}
            onClick={() => {
              const { state: next, changes } = adjustThrottles(loadWarmup());
              setState(next); setVersion(v => v + 1);
              addNotification(changes.length ? `${changes.length} throttle${changes.length === 1 ? '' : 's'} adjusted` : 'No changes needed');
            }}>
            <RefreshCw size={13} /> Recalculate
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          {health.byProvider.map(p => {
            const slice = plan.perProvider.find(x => x.id === p.id)!;
            const meta = STATUS_COLORS[p.status];
            return (
              <div key={p.id} style={{ border: `1px solid ${meta.color}33`, background: meta.bg, borderRadius: 11, padding: '11px 13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>{p.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{meta.label}</span>
                  {state.enabled && (
                    <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#475569' }}>
                      {slice.sent} / {slice.allowance} today
                      {slice.factor < 1 && <span style={{ color: meta.color, fontWeight: 700 }}> · {Math.round(slice.factor * 100)}% rate</span>}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: '#475569', marginTop: 4, lineHeight: 1.5 }}>{p.note}</div>
                {state.enabled && slice.factor < 1 && (
                  <div style={{ fontSize: 11, color: meta.color, marginTop: 4 }}>{slice.reason}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Seeds + placement */}
      <div style={card}>
        <h3 style={h3}><Inbox size={15} /> Seed mailboxes and inbox placement</h3>
        <p style={sub}>
          Add mailboxes you own at Gmail, Outlook and Yahoo. Warmup sends real messages to them on the ramp's
          schedule; you check where each landed and record it here. That placement is the only measurement that
          says whether your mail is reaching inboxes rather than spam folders.
        </p>

        {placement.checked > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140, padding: '10px 12px', background: '#f8fafc', border: '1px solid #eef0f3', borderRadius: 10 }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Inbox placement</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2, color: placement.inboxRate >= 90 ? '#16a34a' : placement.inboxRate >= 70 ? '#d97706' : '#dc2626' }}>
                {placement.inboxRate}%
              </div>
              <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 1 }}>{placement.inbox} inbox · {placement.spam} spam · {placement.missing} missing</div>
            </div>
            {placement.byProvider.map(p => (
              <div key={p.id} style={{ flex: 1, minWidth: 130, padding: '10px 12px', background: '#f8fafc', border: '1px solid #eef0f3', borderRadius: 10 }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{p.name}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: INK, marginTop: 2 }}>{p.inbox}/{p.total}</div>
                <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 1 }}>reached the inbox</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 9, marginTop: 14, flexWrap: 'wrap' }}>
          <input value={newSeed} onChange={e => setNewSeed(e.target.value)} placeholder="you@gmail.com"
            title="A mailbox you own and can check" style={{ ...inp, flex: 1, minWidth: 200 }} />
          <button title="Add this seed mailbox" style={btn()}
            onClick={() => {
              const res = addSeed(newSeed);
              if (!res.ok) { addNotification(res.error!, 'error'); return; }
              setSeeds(loadSeeds()); setNewSeed('');
              addNotification(`${res.seed!.email} added as a ${providerName(res.seed!.provider)} seed`);
            }}>
            <Plus size={12} /> Add seed
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          {!seeds.length && <p style={{ ...sub, margin: 0 }}>No seed mailboxes yet. Two or three across different providers is enough to see the picture.</p>}
          {seeds.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: INK, wordBreak: 'break-all' }}>{s.email}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  {providerName(s.provider)} · {s.sends} warmup message{s.sends === 1 ? '' : 's'} sent
                  {s.lastCheckedAt && ` · last checked ${new Date(s.lastCheckedAt).toLocaleDateString()}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                {(['inbox', 'spam', 'missing'] as const).map(p => {
                  const active = s.lastPlacement === p;
                  const color = p === 'inbox' ? '#16a34a' : p === 'spam' ? '#dc2626' : '#64748b';
                  return (
                    <button key={p} title={`Record that the last warmup message landed in ${p === 'missing' ? 'neither inbox nor spam' : `the ${p} folder`}`}
                      onClick={() => { recordPlacement(s.id, p); setSeeds(loadSeeds()); addNotification(`${s.email}: recorded as ${p}`); }}
                      style={{ padding: '5px 11px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        border: `1px solid ${active ? color : '#e2e8f0'}`,
                        background: active ? color : '#fff', color: active ? '#fff' : '#475569' }}>
                      {p === 'inbox' ? 'Inbox' : p === 'spam' ? 'Spam' : 'Not received'}
                    </button>
                  );
                })}
                <button onClick={() => { removeSeed(s.id); setSeeds(loadSeeds()); }} title={`Remove ${s.email}`}
                  style={{ padding: 7, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', display: 'flex', color: '#475569' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 14, fontSize: 11.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '9px 11px' }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            This is self-hosted warmup: real messages to mailboxes you own, on a real ramp, with real throttling.
            It does not include a network of third-party accounts that open and reply to each other — that
            requires a paid pool of mailboxes, and pretending to have one would be worse than not having it.
          </span>
        </div>
      </div>

      {/* Sending identities */}
      <div style={card}>
        <h3 style={h3}><Server size={15} /> Sending domains and IPs</h3>
        <p style={sub}>Track every domain or dedicated IP you send from. Each can be checked for authentication and blacklist status independently.</p>

        <div style={{ display: 'flex', gap: 9, marginTop: 14, flexWrap: 'wrap' }}>
          <input value={newIdentity} onChange={e => setNewIdentity(e.target.value)} placeholder="mail.yourdomain.com or 203.0.113.10"
            title="A sending domain or dedicated IP" style={{ ...inp, flex: 1, minWidth: 220 }} />
          <button title="Track this sending identity" style={btn()}
            onClick={() => {
              const res = addIdentity(newIdentity);
              if (!res.ok) { addNotification(res.error!, 'error'); return; }
              setIdentities(loadIdentities()); setNewIdentity('');
              addNotification('Now tracking that sending identity');
            }}>
            <Plus size={12} /> Track
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          {!identities.length && (
            <p style={{ ...sub, margin: 0 }}>
              None tracked yet. Add {loadSettings().sendingDomain || 'your sending domain'} to see its
              authentication and blacklist status alongside the others.
            </p>
          )}
          {identities.map(id => {
            const h = idHealth[id.id] ?? {};
            return (
              <div key={id.id} style={{ padding: '11px 0', borderTop: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#4f46e5', background: '#eef2ff', padding: '2px 8px', borderRadius: 999 }}>
                    {id.kind === 'ip' ? 'IP' : 'Domain'}
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: INK, wordBreak: 'break-all' }}>{id.host}</span>
                  <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                    <button disabled={h.checking} title={`Check ${id.host} for authentication and blacklists`} style={{ ...btn(), padding: '5px 10px' }}
                      onClick={async () => {
                        setIdHealth(m => ({ ...m, [id.id]: { ...m[id.id], checking: true } }));
                        const [auth, bl] = await Promise.all([
                          id.kind === 'domain' ? checkAuthentication(id.host) : Promise.resolve({ ok: false, error: 'Authentication records belong to a domain, not an IP.' }),
                          checkBlacklists(id.host),
                        ]);
                        setIdHealth(m => ({
                          ...m,
                          [id.id]: {
                            checking: false,
                            auth: auth.ok && 'data' in auth && auth.data
                              ? `SPF ${auth.data.spf.status} · DKIM ${auth.data.dkim.status} · DMARC ${auth.data.dmarc.status}`
                              : (auth as { error?: string }).error,
                            blacklist: bl.ok && bl.data ? bl.data.message : bl.error,
                          },
                        }));
                      }}>
                      {h.checking ? <RefreshCw size={11} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Search size={11} />} Check
                    </button>
                    <button onClick={() => { removeIdentity(id.id); setIdentities(loadIdentities()); }} title={`Stop tracking ${id.host}`}
                      style={{ padding: 7, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', display: 'flex', color: '#475569' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                {(h.auth || h.blacklist) && (
                  <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 6, lineHeight: 1.6 }}>
                    {h.auth && <div>{h.auth}</div>}
                    {h.blacklist && <div>{h.blacklist}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Log */}
      {logRows.length > 0 && (
        <div style={card}>
          <h3 style={h3}><Info size={15} /> Warmup activity</h3>
          <div style={{ marginTop: 10 }}>
            {logRows.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 9, padding: '7px 0', borderTop: i ? '1px solid #f8fafc' : 'none' }}>
                <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0, minWidth: 96 }}>
                  {new Date(r.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>{r.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
