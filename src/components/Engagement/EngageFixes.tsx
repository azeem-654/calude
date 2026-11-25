/**
 * Customer Support → Problem fixes (install owner only): every problem a
 * customer reported from the app, the owner's yes or no, and what the Claude
 * Code session that took it did (worker/src/lib/problemFix.ts).
 *
 * The phone's push and the email both land here (`?tab=fixes&id=<report>`),
 * so "should I start fixing it?" is answered from wherever the owner is.
 * Below the list is the one setting it needs: the API trigger of the owner's
 * Claude Code scheduled task, and the prompt to save on that task once.
 */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bug, CheckCircle2, Copy, ExternalLink, Loader, Mic, Image as ImageIcon, RefreshCw, Rocket, FlaskConical, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { fixApi, type FixConfigView, type FixStatus, type OwnerReport } from '../../services/problemFix';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

const STATUS: Record<FixStatus, { label: string; bg: string; fg: string }> = {
  waiting: { label: 'Waiting for you', bg: '#fff7e6', fg: '#9a5b00' },
  fixing: { label: 'Claude is fixing it', bg: '#eef2ff', fg: '#3e3aa8' },
  ready: { label: 'Fixed on testing', bg: '#eef2ff', fg: '#3e3aa8' },
  fixed: { label: 'Fixed · customer told', bg: '#e9f7ef', fg: '#0f7b3d' },
  declined: { label: 'Left for a person', bg: '#f1f5f9', fg: '#475569' },
  failed: { label: 'Needs you', bg: '#fdf2f2', fg: '#b42318' },
};

const ago = (iso: string | null) => {
  if (!iso) return '—';
  const m = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export default function EngageFixes() {
  const { addNotification } = useApp();
  const [params] = useSearchParams();
  const focus = params.get('id') ?? '';
  const [rows, setRows] = useState<OwnerReport[]>([]);
  const [cfg, setCfg] = useState<FixConfigView | null>(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [acting, setActing] = useState('');

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setBusy(true);
    const [l, c] = await Promise.all([fixApi('list'), fixApi('config')]);
    if (l.success) { setRows((l.reports as OwnerReport[]) ?? []); setErr(''); } else setErr(String(l.error ?? 'Could not load the reports.'));
    if (c.success) setCfg(c as unknown as FixConfigView);
    setBusy(false);
  }, []);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void load(true); }, 30_000);
    return () => window.clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (!focus || busy) return;
    document.getElementById(`fix-${focus}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focus, busy]);

  const act = async (r: OwnerReport, action: 'decide' | 'mark_fixed', answer?: 'live' | 'testing' | 'decline') => {
    setActing(`${r.id}:${answer ?? action}`);
    const res = await fixApi(action, { id: r.id, answer });
    setActing('');
    addNotification(String(res.message ?? res.error ?? (res.success ? 'Done.' : 'That did not work.')), res.success ? 'success' : 'error');
    void load(true);
  };

  const waiting = rows.filter(r => r.status === 'waiting' || r.status === 'failed').length;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: INK, display: 'flex', alignItems: 'center', gap: 8 }}><Bug size={17} /> Problem fixes</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
            Problems customers report from the app. Say yes and a Claude Code cloud session starts fixing it, and the customer is told to check back in 10–15 minutes.
            {waiting ? <b style={{ color: '#9a5b00' }}> {waiting} waiting for your answer.</b> : null}
          </p>
        </div>
        <button type="button" onClick={() => void load()} style={ghost} disabled={busy}><RefreshCw size={13} /> Refresh</button>
      </div>

      {cfg && !cfg.connected && (
        <div role="note" style={{ ...card, background: '#fff7e6', borderColor: '#f3d38b', color: '#7a4b00', fontSize: 13, lineHeight: 1.55 }}>
          Claude Code is not connected yet, so a yes is recorded but no session starts. Connect it below — it takes two minutes.
        </div>
      )}

      {busy && !rows.length ? (
        <div style={{ ...card, color: MUTED, fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}><Loader size={15} className="spin" /> Loading…</div>
      ) : err ? (
        <div role="alert" style={{ ...card, color: '#b42318', fontSize: 13 }}>{err}</div>
      ) : !rows.length ? (
        <div style={{ ...card, color: MUTED, fontSize: 13, lineHeight: 1.55 }}>
          No problems reported yet. Customers report them from the <b>Report a problem</b> button beside the help button, with a screenshot and, if they like, a voice note.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map(r => {
            const st = STATUS[r.status] ?? STATUS.waiting;
            const can = r.status === 'waiting' || r.status === 'failed';
            return (
              <div key={r.id} id={`fix-${r.id}`} data-testid="fix-row" data-status={r.status}
                style={{ ...card, borderColor: r.id === focus ? ACCENT : LINE, boxShadow: r.id === focus ? `0 0 0 3px ${ACCENT}22` : undefined }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ padding: '3px 9px', borderRadius: 999, background: st.bg, color: st.fg, fontSize: 11.5, fontWeight: 700 }}>{st.label}</span>
                  <b style={{ fontSize: 13.5, color: INK }}>{r.name || r.email}</b>
                  <span style={{ fontSize: 12, color: MUTED }}>{r.reference ? `${r.reference} · ` : ''}{ago(r.createdAt)}</span>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 13.5, lineHeight: 1.55, color: INK, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.description}</p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6, fontSize: 12, color: MUTED }}>
                  {r.page && <span style={{ overflowWrap: 'anywhere' }}>Screen: {r.page}</span>}
                  <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><ImageIcon size={12} /> {r.pictures} picture{r.pictures === 1 ? '' : 's'}</span>
                  {r.hasAudio && <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Mic size={12} /> voice note</span>}
                  <span>{r.email}</span>
                </div>
                {r.note && (
                  <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 10, background: '#f8fafc', border: `1px solid ${LINE}`, fontSize: 12.5, lineHeight: 1.55, color: INK, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    <b>Claude:</b> {r.note}
                  </div>
                )}
                {r.error && <div style={{ marginTop: 8, fontSize: 12.5, color: '#b42318', overflowWrap: 'anywhere' }}>{r.error}</div>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  {can && <>
                    <button type="button" style={primarySm} disabled={!!acting} onClick={() => void act(r, 'decide', 'live')}>
                      {acting === `${r.id}:live` ? <Loader size={13} className="spin" /> : <Rocket size={13} />} {r.status === 'failed' ? 'Try again — put it live' : 'Yes — fix it and put it live'}
                    </button>
                    <button type="button" style={ghost} disabled={!!acting} onClick={() => void act(r, 'decide', 'testing')}>
                      {acting === `${r.id}:testing` ? <Loader size={13} className="spin" /> : <FlaskConical size={13} />} Fix on testing first
                    </button>
                    <button type="button" style={ghost} disabled={!!acting} onClick={() => void act(r, 'decide', 'decline')}><X size={13} /> No — leave it for a person</button>
                  </>}
                  {(r.status === 'ready' || r.status === 'fixing') && (
                    <button type="button" style={r.status === 'ready' ? primarySm : ghost} disabled={!!acting} onClick={() => void act(r, 'mark_fixed')}
                      title="Once the fix is live: the customer gets the email and the in-app message to refresh and check.">
                      <CheckCircle2 size={13} /> It&rsquo;s live — tell the customer
                    </button>
                  )}
                  {r.sessionUrl && <a href={r.sessionUrl} target="_blank" rel="noreferrer" style={{ ...ghost, textDecoration: 'none' }}><ExternalLink size={13} /> Open the session</a>}
                  <a href="/engagement?tab=tickets" style={{ ...ghost, textDecoration: 'none' }}>Ticket &amp; pictures</a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {cfg && <Connection cfg={cfg} onSaved={() => void load(true)} />}
    </div>
  );
}

function Connection({ cfg, onSaved }: { cfg: FixConfigView; onSaved: () => void }) {
  const { addNotification } = useApp();
  const [url, setUrl] = useState(cfg.url);
  const [token, setToken] = useState('');
  const [hours, setHours] = useState<string>(cfg.digestHours.join(', '));
  const [diagnose, setDiagnose] = useState(cfg.diagnose);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    const digestHours = hours.split(/[,\s]+/).filter(Boolean).map(Number);
    const r = await fixApi('config_save', { url: url.trim(), tokenValue: token.trim(), digestHours, diagnose });
    setSaving(false);
    if (!r.success) { setError({ message: String(r.error ?? 'Not saved.'), field: r.field }); return; }
    setToken('');
    addNotification('Saved.', 'success');
    onSaved();
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(cfg.prompt); addNotification('Prompt copied.', 'success'); } catch { addNotification('Select the prompt and copy it.', 'info'); }
  };

  return (
    <div style={{ ...card, display: 'grid', gap: 12 }} id="fix-connection">
      <div>
        <h4 style={{ margin: 0, fontSize: 14.5, color: INK }}>Claude Code connection</h4>
        <p style={{ margin: '4px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.55 }}>
          {cfg.connected
            ? cfg.status === 'ok' ? 'Connected — the last session it was asked to start, started.'
              : cfg.status === 'error' ? `The last start was refused: ${cfg.lastError}`
                : 'Saved. It is proved the first time you say yes to a report.'
            : 'Not connected.'}
        </p>
      </div>
      <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: INK, lineHeight: 1.65 }}>
        <li>At claude.ai/code → Scheduled tasks, make a task on this repository and paste the prompt below as its instructions.</li>
        <li>Give its cloud environment network access to <b>{cfg.host}</b> (Limited, Allowed domains) so the session can fetch the report and say how it went.</li>
        <li>Add an <b>API</b> trigger, press Generate token, and paste the trigger address and the token here. The token is shown once; it is kept encrypted and never shown again.</li>
      </ol>
      <label style={lbl} htmlFor="fix-url">Trigger address</label>
      <input id="fix-url" data-field="fix.url" style={inp} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://api.anthropic.com/v1/claude_code/routines/trig_…/fire"
        aria-invalid={error?.field === 'fix.url' || undefined} />
      <label style={lbl} htmlFor="fix-token">Token</label>
      <input id="fix-token" data-field="fix.token" style={inp} type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)}
        placeholder={cfg.tokenSet ? 'Saved — leave blank to keep it' : 'sk-ant-…'} aria-invalid={error?.field === 'fix.token' || undefined} />
      <label style={lbl} htmlFor="fix-hours">Twice a day, list reports nobody answered, at (hours, UTC)</label>
      <input id="fix-hours" data-field="fix.hours" style={{ ...inp, maxWidth: 200 }} value={hours} onChange={e => setHours(e.target.value)} placeholder="9, 17" />
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: INK, lineHeight: 1.5 }}>
        <input type="checkbox" checked={diagnose} onChange={e => setDiagnose(e.target.checked)} style={{ marginTop: 3 }} />
        <span>At those times, also have Claude Code look into the waiting reports — read-only, no code changed — and show what it finds beside each one.</span>
      </label>
      {error && <p role="alert" style={{ margin: 0, fontSize: 12.5, color: '#b42318' }}>{error.message}</p>}
      <div><button type="button" style={primarySm} onClick={() => void save()} disabled={saving}>{saving ? <Loader size={13} className="spin" /> : null} Save</button></div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={lbl}>The prompt for the scheduled task</span>
          <button type="button" style={ghost} onClick={() => void copy()}><Copy size={13} /> Copy</button>
        </div>
        <pre style={{ margin: '6px 0 0', padding: 10, borderRadius: 10, background: '#f8fafc', border: `1px solid ${LINE}`, fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: INK }}>{cfg.prompt}</pre>
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 14, minWidth: 0 };
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: MUTED };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: `1px solid ${LINE}`, borderRadius: 10, fontSize: 13.5, outline: 'none', background: '#fff', color: INK };
const ghost: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 11px', borderRadius: 10, border: `1px solid ${LINE}`, background: '#fff', color: INK, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' };
const primarySm: React.CSSProperties = { ...ghost, background: ACCENT, borderColor: ACCENT, color: '#fff' };
