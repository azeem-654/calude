/**
 * A project's prospecting sources — AI Prospecting searches connected to it
 * (services/prospectSources.ts → /api/sources.php, run by the finder engine).
 *
 *   useSources        the project's connections, polled every few seconds while
 *                     a run is on and twice a minute otherwise.
 *   SourceCard        one connection on the Prospects tab (ProjectLeads.tsx):
 *                     its search, schedule, state in plain words, today's
 *                     verified count against its target, the candidate being
 *                     checked right now and what was turned away and why.
 *   CommandBox        plain-language changes ("change it to 25 per day").
 *   ProspectingToday  the Overview's summary: verified today per source.
 *   SourceFlow        how a source's workflow is drawn: schedule → search →
 *                     candidates → verify → duplicates → suppression →
 *                     confidence, YES to the CRM and on, NO to a replacement.
 *
 * Everything shown is read from the server: the live panel is the finder's own
 * record of the check it is on (`live`), polled every few seconds while a run
 * is on and twice a minute otherwise — never an animation of work.
 */
import { askConfirm } from '../shared/ConfirmDialog';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, CheckCircle2, Circle, Clock, ExternalLink, Loader, Pause, Play, Search, Send, Trash2, XCircle,
} from 'lucide-react';
import { T, primaryBtn } from './theme';
import type { Project } from '../../services/projects';
import {
  REJECT_LABEL, applySearch, disconnectSource, projectSources, runSourceNow, setSourceStatus, sourceCommand, updateSource,
  type Connection, type LiveItem, type RejectReason,
} from '../../services/prospectSources';

const btn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: `1px solid ${T.line}`,
  background: T.panel, color: T.ink, font: 'inherit', fontSize: 12.5, fontWeight: 650, cursor: 'pointer',
};
const card: React.CSSProperties = { background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14, display: 'grid', gap: 10, minWidth: 0 };
const kicker: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', color: T.accent, textTransform: 'uppercase' };
const when = (iso: string) => {
  const d = new Date(iso);
  return !iso || Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

export function useSources(projectId: string) {
  const [conns, setConns] = useState<Connection[] | null>(null);
  const [recent, setRecent] = useState<Record<string, string | number>[]>([]);
  const [log, setLog] = useState<{ finder_id: string; kind: string; detail: string; at: string }[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const r = await projectSources(projectId);
    if (!r.success) { setError(r.error ?? 'Could not read this business workspace\'s prospecting sources.'); return; }
    setError(''); setConns(r.connections); setRecent(r.recent ?? []); setLog(r.log ?? []);
  }, [projectId]);
  const running = (conns ?? []).some(c => c.today.running && c.today.added < c.target);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, running ? 4000 : 30_000);
    return () => window.clearInterval(t);
  }, [load, running]);
  return { conns, recent, log, error, load, setConns };
}

/* ── The Overview's summary ── */

export function ProspectingToday({ project, onOpen }: { project: Project; onOpen: (sourceId: string) => void }) {
  const { conns } = useSources(project.id);
  if (!conns?.length) return null;
  const added = conns.reduce((a, c) => a + c.today.added, 0);
  const target = conns.reduce((a, c) => a + c.target, 0);
  return (
    <section style={{ ...card, gap: 8 }} aria-label="Prospecting today" data-testid="prospecting-today">
      <span style={kicker}>Prospecting today</span>
      <b style={{ fontSize: 20, color: T.ink, fontVariantNumeric: 'tabular-nums' }}>{added} / {target} <span style={{ fontSize: 13, fontWeight: 600, color: T.muted }}>verified leads</span></b>
      <span style={{ fontSize: 11.5, color: T.muted }}>Sources</span>
      <div style={{ display: 'grid', gap: 6 }}>
        {conns.map(c => (
          <button key={c.id} type="button" onClick={() => onOpen(c.id)}
            style={{ ...btn, justifyContent: 'space-between', width: '100%', fontWeight: 600 }}>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.searchName}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', color: c.today.added >= c.target ? T.good : T.ink }}>{c.today.added} / {c.target}</span>
          </button>
        ))}
      </div>
      {conns.length > 1 && <span style={{ fontSize: 12, color: T.muted }}>Total today: <b style={{ color: T.ink }}>{added}</b> verified prospects</span>}
    </section>
  );
}

/* ── The candidate being checked, check by check ── */

function CheckLine({ state, label, detail }: { state: string; label: string; detail: string }) {
  const icon = state === 'pass' ? <CheckCircle2 size={13} color={T.good} />
    : state === 'fail' ? <XCircle size={13} color={T.bad} />
      : state === 'run' ? <Loader size={13} color={T.accent} className="spin" />
        : state === 'skip' ? <Circle size={13} color={T.faint} /> : <Clock size={13} color={T.faint} />;
  return (
    <li style={{ display: 'grid', gridTemplateColumns: '16px minmax(0, 1fr)', gap: 6, fontSize: 12.5, alignItems: 'start' }}>
      <span style={{ marginTop: 1 }}>{icon}</span>
      <span style={{ color: state === 'wait' ? T.muted : T.ink, minWidth: 0 }}>{label}{state === 'wait' ? ' — waiting' : state === 'run' ? ' …' : ''}
        {detail && state !== 'wait' && <span style={{ color: T.muted }}> · {detail}</span>}</span>
    </li>
  );
}

function Outcome({ it }: { it: LiveItem }) {
  return (
    <li style={{ display: 'grid', gap: 3, padding: '8px 10px', borderRadius: 10, background: it.ok ? T.goodSoft : T.raised }}>
      <span style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, fontWeight: 700, color: T.ink, flexWrap: 'wrap' }}>
        {it.ok ? <CheckCircle2 size={13} color={T.good} /> : <XCircle size={13} color={T.muted} />}
        {it.name}
        <span style={{ fontWeight: 600, color: it.ok ? T.good : T.muted }}>{it.ok ? `✓ Verified · ${it.confidence}%` : `Turned away — ${it.reason}`}</span>
      </span>
      {it.done.length > 0 && (
        <span style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11.5, color: T.muted }}>{it.done.map(d => <span key={d}>✓ {d}</span>)}</span>
      )}
    </li>
  );
}

function LiveRun({ c }: { c: Connection }) {
  const cur = c.live.current;
  const pct = Math.min(100, Math.round((c.today.added / Math.max(1, c.target)) * 100));
  const rejected = Object.entries(c.today.rejected).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  return (
    <div style={{ display: 'grid', gap: 10 }} data-testid="source-live">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: T.muted }}>Today's target</span>
        <b style={{ fontSize: 18, color: T.ink, fontVariantNumeric: 'tabular-nums' }} data-testid="source-progress">{c.today.added} / {c.target}</b>
        <span style={{ fontSize: 12, color: T.muted }}>verified leads · {c.today.examined} candidates examined</span>
      </div>
      <div style={{ height: 7, borderRadius: 99, background: T.lineSoft, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? T.good : T.accent, transition: 'width .4s' }} />
      </div>
      {cur && (
        <div style={{ border: `1px solid ${T.accent}55`, background: T.accentSoft, borderRadius: 12, padding: 10, display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: T.accent, letterSpacing: '.06em', textTransform: 'uppercase' }}>Currently</span>
          <b style={{ fontSize: 13.5, color: T.ink }}>{cur.name}</b>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
            {cur.checks.map((k, i) => <CheckLine key={i} {...k} />)}
          </ul>
        </div>
      )}
      {c.live.recent.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }} aria-label="Latest outcomes">
          {c.live.recent.slice(0, 6).map((it, i) => <Outcome key={`${it.name}-${i}`} it={it} />)}
        </ul>
      )}
      {rejected.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11.5, color: T.muted }}>Turned away today:</span>
          {rejected.map(([r, n]) => (
            <span key={r} style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: T.raised, color: T.ink }}>{REJECT_LABEL[r as RejectReason] ?? r} · {n}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── One source's settings, in place ── */

function Settings({ c, onSaved, onCancel }: { c: Connection; onSaved: (c: Connection) => void; onCancel: () => void }) {
  const [target, setTarget] = useState(c.target);
  const [minConfidence, setMin] = useState(c.minConfidence);
  const [schedule, setSchedule] = useState(c.schedule);
  const [runHour, setRunHour] = useState(c.runHour);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true); setErr('');
    const r = await updateSource(c.id, { target, minConfidence, schedule, runHour, runDays: c.runDays, tz: c.tz } as never);
    setBusy(false);
    if (!r.success) { setErr(r.error ?? 'It could not be saved.'); return; }
    onSaved(r.connection);
  };
  const sel: React.CSSProperties = { padding: '7px 9px', border: `1px solid ${T.line}`, borderRadius: 9, font: 'inherit', fontSize: 13, color: T.ink, background: T.panel };
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', padding: 10, borderRadius: 12, background: T.raised }}>
      <label style={{ display: 'grid', gap: 4, fontSize: 11.5, color: T.muted }}>Verified leads a run
        <input data-field="source.target" type="number" min={1} max={100} value={target} onChange={e => setTarget(Number(e.target.value))} style={{ ...sel, width: 90 }} /></label>
      <label style={{ display: 'grid', gap: 4, fontSize: 11.5, color: T.muted }}>Schedule
        <select value={schedule} onChange={e => setSchedule(e.target.value as Connection['schedule'])} style={sel}>
          <option value="daily">Every day</option><option value="weekdays">Every weekday</option><option value="weekly">Weekly</option>
          <option value="custom">Custom days</option><option value="manual">Manual only</option>
        </select></label>
      <label style={{ display: 'grid', gap: 4, fontSize: 11.5, color: T.muted }}>From
        <select value={runHour} onChange={e => setRunHour(Number(e.target.value))} style={sel}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select></label>
      <label style={{ display: 'grid', gap: 4, fontSize: 11.5, color: T.muted }}>Minimum confidence
        <input data-field="source.confidence" type="number" min={50} max={100} value={minConfidence} onChange={e => setMin(Number(e.target.value))} style={{ ...sel, width: 90 }} /></label>
      <button type="button" style={{ ...primaryBtn, display: 'inline-flex', gap: 6, alignItems: 'center' }} disabled={busy} onClick={() => void save()}>{busy ? <Loader size={13} className="spin" /> : null} Save</button>
      <button type="button" style={btn} onClick={onCancel}>Cancel</button>
      {err && <span role="alert" style={{ fontSize: 12.5, color: T.bad, width: '100%' }}>{err}</span>}
    </div>
  );
}

/* ── One connected search, as a lead source on the Prospects tab ── */

/** A connection's state in words: what it is doing and, when it is not, why and what to do. */
function sourceState(c: Connection): { word: string; tone: string; soft: string; says: string } {
  if (c.status === 'paused') return { word: 'Paused', tone: T.warn, soft: T.warnSoft, says: c.statusReason || 'Nothing is searched until you resume it. What it already found stays.' };
  if (c.status === 'exhausted') {
    return {
      word: 'All searches done for now', tone: T.muted, soft: T.raised,
      says: 'This search has been worked to the end of its list, so there is nobody new to find with it. Widen it in AI Prospecting (another place or kind of business) and update the workflow.',
    };
  }
  if (c.today.running && c.today.added < c.target) return { word: 'Running now', tone: T.good, soft: T.goodSoft, says: `${c.today.added} of ${c.target} verified leads found in today's run so far.` };
  return {
    word: 'On schedule', tone: T.good, soft: T.goodSoft,
    says: c.manualOnly ? 'Runs when you press Run now.' : `Next run: ${when(c.nextRunAt)}.`,
  };
}

export function SourceCard({ c, focused, busy, onAct, onReplace, onSaid }: {
  c: Connection; focused: boolean; busy: string;
  onAct: (id: string, what: string, fn: () => Promise<{ success?: boolean; error?: string; connection?: Connection; step?: { detail: string } }>) => Promise<void>;
  onReplace: (c: Connection) => void; onSaid: (s: string) => void;
}) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const st = sourceState(c);
  return (
    <article id={`source-${c.id}`} style={{ ...card, gap: 8, borderColor: focused ? T.accent : T.line, scrollMarginTop: 80 }} data-testid="source-card">
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <span aria-hidden style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 10, background: T.accentSoft, flex: '0 0 auto' }}>
          <Search size={16} color={T.accent} />
        </span>
        <div style={{ display: 'grid', gap: 4, minWidth: 0, flex: '1 1 180px' }}>
          <span style={kicker}>Connected search</span>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 14.5, color: T.ink }}>{c.searchName}</b>
            <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 9px', borderRadius: 999, color: st.tone, background: st.soft }}>{st.word}</span>
          </span>
          <span style={{ fontSize: 12.5, color: T.muted }}>{c.trade} · {c.place} · {c.target} verified leads / {c.schedule === 'weekdays' ? 'weekday' : c.schedule === 'daily' ? 'day' : 'run'} · {c.minConfidence}% confidence or more</span>
          <span style={{ fontSize: 12, color: T.muted }}>Workflow: <b style={{ color: T.ink }}>{c.workflowName}</b> · {c.scheduleText} · last run {when(c.lastRunAt)}</span>
          <span style={{ fontSize: 12.5, color: c.status === 'paused' && c.statusReason ? T.warn : T.muted, lineHeight: 1.55 }}>{st.says}</span>
          {c.searchVersion < c.latestVersion && (
            <span style={{ fontSize: 12.5, color: T.ink, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              The search has changed since this was connected.
              <button type="button" style={btn} onClick={() => void onAct(c.id, 'apply', async () => { const r = await applySearch(c.searchId, 'update', [c.id]); return r; })}>Update workflow</button>
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" style={btn} onClick={() => navigate(`/prospecting?search=${encodeURIComponent(c.searchId)}`)}>View Search <ArrowRight size={13} /></button>
          {c.status !== 'exhausted' && (
            <button type="button" style={btn} disabled={!!busy} onClick={() => void onAct(c.id, 'run', () => runSourceNow(c.id))} data-testid="source-run">
              {busy === `run:${c.id}` ? <Loader size={13} className="spin" /> : <Play size={13} />} Run now</button>
          )}
          <button type="button" style={btn} disabled={!!busy} onClick={() => void onAct(c.id, 'status', () => setSourceStatus(c.id, c.status === 'active' ? 'paused' : 'active'))}>
            {c.status === 'active' ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Resume</>}</button>
          <button type="button" style={btn} onClick={() => setEditing(!editing)}>Settings</button>
          <button type="button" style={{ ...btn, color: T.bad }} aria-label={`Disconnect ${c.searchName}`} disabled={!!busy}
            onClick={async () => {
              if (await askConfirm({
                title: `Disconnect “${c.searchName}” from this business workspace?`,
                message: 'Its workflow is removed; everybody it already added stays in Contacts and on the list.',
                confirmLabel: 'Disconnect', danger: true,
              })) void onAct(c.id, 'off', () => disconnectSource(c.id));
            }}>
            <Trash2 size={13} /></button>
        </div>
      </div>
      {editing && <Settings c={c} onCancel={() => setEditing(false)} onSaved={n => { onReplace(n); setEditing(false); onSaid('Saved.'); }} />}
      <LiveRun c={c} />
    </article>
  );
}

/** "Change it to 25 per day" — plain-language changes to the connected searches. */
export function CommandBox({ project, conns, onReplace, onAct, onConnect, onSaid }: {
  project: Project; conns: Connection[];
  onReplace: (c: Connection) => void; onConnect: (searchId?: string) => void; onSaid: (s: string) => void;
  onAct: (id: string, what: string, fn: () => Promise<{ success?: boolean; error?: string; connection?: Connection; step?: { detail: string } }>) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [picked, setPicked] = useState('');
  const [busy, setBusy] = useState(false);
  const tell = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true); onSaid('');
    const r = await sourceCommand(project.id, t, picked || undefined);
    setBusy(false);
    if (!r.success) { onSaid(r.error ?? 'That did not work.'); return; }
    onSaid(r.said);
    if (r.connection) onReplace(r.connection);
    if (r.open === 'connect') onConnect(r.searchId || undefined);
    if (r.open === 'run_now' && r.finderId) await onAct(r.finderId, 'run', () => runSourceNow(r.finderId!));
    if (r.understood) setText('');
  };
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>Tell AI Autopilot what to change about a connected search</span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {conns.length > 1 && (
          <select value={picked} onChange={e => setPicked(e.target.value)} aria-label="Which source"
            style={{ padding: '8px 10px', border: `1px solid ${T.line}`, borderRadius: 9, font: 'inherit', fontSize: 13, color: T.ink, background: T.panel, maxWidth: '100%' }}>
            <option value="">Which source?</option>
            {conns.map(c => <option key={c.id} value={c.id}>{c.searchName}</option>)}
          </select>
        )}
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void tell(); }} data-field="source.command"
          placeholder='"Change it to 25 per day", "Only accept leads above 90% confidence"' aria-label="Tell AI Autopilot"
          style={{ flex: '1 1 260px', minWidth: 0, padding: '8px 10px', border: `1px solid ${T.line}`, borderRadius: 9, font: 'inherit', fontSize: 13, color: T.ink, background: T.panel }} />
        <button type="button" style={btn} disabled={busy || !text.trim()} onClick={() => void tell()}>{busy ? <Loader size={13} className="spin" /> : <Send size={13} />} Do it</button>
      </div>
    </div>
  );
}

/* ── How a source's workflow is drawn ── */

export function SourceFlow({ nodes, conn }: { nodes: { type: string; label?: string; config?: Record<string, unknown> }[]; conn?: Connection }) {
  const navigate = useNavigate();
  const trigger = nodes.find(n => n.type === 'trigger');
  const step = nodes.find(n => n.config?.produces === 'prospects');
  const searchName = String(step?.config?.searchName ?? conn?.searchName ?? '');
  const searchId = String(step?.config?.searchId ?? conn?.searchId ?? '');
  const min = Number(step?.config?.minConfidence ?? conn?.minConfidence ?? 85);
  const box = (label: string, sub?: string, accent = false): React.ReactNode => (
    <div style={{ border: `1px solid ${accent ? T.accent : T.line}`, background: accent ? T.accentSoft : T.panel, borderRadius: 11, padding: '8px 12px', minWidth: 0, display: 'grid', gap: 2 }}>
      <b style={{ fontSize: 12, letterSpacing: '.04em', color: T.ink, textTransform: 'uppercase' }}>{label}</b>
      {sub && <span style={{ fontSize: 11.5, color: T.muted, overflowWrap: 'anywhere' }}>{sub}</span>}
    </div>
  );
  const down = <span aria-hidden style={{ justifySelf: 'center', color: T.faint, fontSize: 14, lineHeight: 1 }}>↓</span>;
  const d = conn?.destination;
  return (
    <div style={{ display: 'grid', gap: 6, maxWidth: 560 }} data-testid="source-flow">
      {box(trigger?.label ? String(trigger.label) : 'Daily trigger', 'Trigger')}
      {down}
      <div style={{ border: `1px solid ${T.accent}`, background: T.accentSoft, borderRadius: 11, padding: '10px 12px', display: 'grid', gap: 4 }}>
        <b style={{ fontSize: 12, letterSpacing: '.04em', color: T.ink, textTransform: 'uppercase' }}>{searchName || 'Prospect search'}</b>
        <span style={{ fontSize: 11.5, color: T.muted }}>SOURCE: AI Prospecting · SEARCH: {searchName}</span>
        {searchId && (
          <button type="button" onClick={() => navigate(`/prospecting?search=${encodeURIComponent(searchId)}`)}
            style={{ justifySelf: 'start', border: 0, background: 'none', padding: 0, color: T.accent, fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            View Prospect Search <ExternalLink size={11} />
          </button>
        )}
      </div>
      {down}{box('Find new candidates', 'Only businesses this business workspace has never examined')}
      {down}{box('Verify', 'Website, the address it publishes, domain and mail server')}
      {down}{box('Duplicate check', 'Against your CRM and this business workspace')}
      {down}{box('Suppression check', 'Your suppression list and every unsubscribe')}
      {down}{box('Confidence condition', `${min}% or more`)}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10, marginTop: 4 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: T.good }}>YES</span>
          {box('Add to CRM', 'As a prospect, with where it was found')}
          {(d?.tags?.length ?? 0) > 0 && <>{down}{box('Apply tag', d!.tags.join(', '))}</>}
          {d?.pipelineId && <>{down}{box('Create opportunity')}</>}
          {d?.nextWorkflowId && <>{down}{box('Start next workflow', 'In this business workspace', true)}</>}
        </div>
        <div style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: T.bad }}>NO</span>
          {box('Reject', 'Kept with its reason, never examined again')}
          {down}{box('Find replacement', 'Until the run\'s target is in')}
        </div>
      </div>
      {conn && <span style={{ fontSize: 11.5, color: T.muted }}>Today {conn.today.added} / {conn.target} verified · {conn.today.examined} examined</span>}
    </div>
  );
}
