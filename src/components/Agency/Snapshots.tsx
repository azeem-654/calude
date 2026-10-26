/**
 * Workspace → Industry snapshots (/snapshots).
 *
 * The catalogue of ready-made industry setups (worker/src/lib/snapshots.ts):
 * what each holds, whether it passes its checks, a preview of exactly what an
 * install would add to a workspace, the install, and the history of installs.
 *
 * A customer installs into the workspace they are in. The install owner can
 * also pick any customer's workspace, which is how a customer who signed up
 * before snapshots existed — or from the home page rather than a trade site —
 * is set up. The server decides both (routes/snapshots.ts); the picker being
 * hidden from customers is a courtesy.
 *
 * An install only adds. Everything already in the workspace is left as the
 * customer has it, and items they deleted come back only if "Put back what was
 * removed" is ticked — the preview says which, before anything is written.
 */
import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Layers, Loader } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '../../services/pageTitle';
import { sessionToken } from '../../services/auth';
import { API_BASE } from '../../services/apiBase';
import { getActiveAccountId } from '../../services/tenancy';
import { flushNow, refreshFromCloud } from '../../services/serverData';
import type { ItemStatus, PlanItem, Snapshot } from '../../../worker/src/lib/snapshots';
import { Err, GOOD, INK, LINE, MUTED, WARN, box, btn, input, label, primary } from '../Jobs/JobsRevenue';

type Answer<T> = T & { success: boolean; error?: string; field?: string };
const api = async <T,>(action: string, extra: Record<string, unknown> = {}): Promise<Answer<T>> => {
  try {
    const r = await fetch(`${API_BASE}/api/snapshots.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: sessionToken(), action, ...extra }) });
    return await r.json() as Answer<T>;
  } catch {
    return { success: false, error: 'Could not reach the server. Check your connection and try again.' } as Answer<T>;
  }
};

interface CatalogueSnap extends Snapshot { problems: string[] }
interface WorkspaceRow { accountId: string; email: string; name: string | null; industry: string; installed: string | null }
interface HistoryRow { id: string; snapshotId: string; version: number; mode: string; added: string[]; present: number; skipped: number; byEmail: string; byRole: string; at: string }
interface Preview { items: PlanItem[]; counts: Record<ItemStatus, number>; changes: boolean }

const small: React.CSSProperties = { fontSize: 12.5, color: MUTED, margin: 0, lineHeight: 1.55 };
const chip = (bg: string, fg: string): React.CSSProperties => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: bg, color: fg, fontSize: 11.5, fontWeight: 700 });
const STATUS: Record<ItemStatus, { label: string; bg: string; fg: string }> = {
  add: { label: 'Add', bg: '#dcfce7', fg: GOOD },
  restore: { label: 'Put back', bg: '#e0e7ff', fg: '#4338ca' },
  present: { label: 'Already there', bg: '#f1f5f9', fg: MUTED },
  removed: { label: 'Removed by you', bg: '#fef3c7', fg: WARN },
};
const MODE: Record<string, string> = { signup: 'At sign-up', install: 'Installed', upgrade: 'Upgraded', restore: 'Restored' };
const when = (iso: string) => { try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso; } };

export default function Snapshots() {
  usePageTitle('Industry snapshots');
  const active = getActiveAccountId() ?? '';
  const [cat, setCat] = useState<CatalogueSnap[] | null>(null);
  const [owner, setOwner] = useState(false);
  const [loadErr, setLoadErr] = useState('');
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [target, setTarget] = useState(active);
  const [industry, setIndustry] = useState('');
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [restore, setRestore] = useState(false);
  const [plan, setPlan] = useState<Preview | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    void api<{ owner: boolean; snapshots: CatalogueSnap[] }>('catalogue').then(d => {
      if (!d.success) { setLoadErr(d.error ?? 'Could not load the catalogue.'); return; }
      setCat(d.snapshots); setOwner(d.owner);
      if (d.owner) void api<{ workspaces: WorkspaceRow[] }>('workspaces').then(w => { if (w.success) setWorkspaces(w.workspaces); });
    });
  }, []);

  const loadHistory = useCallback(() => {
    if (!target) return;
    void api<{ industry: string; history: HistoryRow[] }>('history', { accountId: target }).then(d => {
      if (d.success) { setHistory(d.history); setIndustry(d.industry); } else { setHistory([]); setIndustry(''); }
    });
  }, [target]);
  useEffect(loadHistory, [loadHistory]);

  /* A plan is for one snapshot, one workspace and one choice about restoring; change any and it is gone. */
  useEffect(() => { setPlan(null); setErr(''); setDone(''); }, [target, pick, restore]);

  const preview = async (id: string) => {
    setPick(id); setBusy('preview'); setErr(''); setDone('');
    if (target === active) await flushNow();
    const d = await api<Preview>('preview', { accountId: target, snapshotId: id, restore });
    setBusy('');
    if (!d.success) { setErr(d.error ?? 'Could not plan the install.'); return; }
    setPlan({ items: d.items, counts: d.counts, changes: d.changes });
  };

  const install = async () => {
    if (!pick) return;
    setBusy('install'); setErr(''); setDone('');
    /* Anything this browser has not saved yet goes first, so the install merges with it rather than racing it. */
    if (target === active) await flushNow();
    const d = await api<{ added: number; present: number; skipped: number; mode: string }>('install', { accountId: target, snapshotId: pick, restore });
    if (target === active) await refreshFromCloud();
    setBusy('');
    if (!d.success) { setErr(d.error ?? 'The install did not finish.'); loadHistory(); return; }
    setPlan(null);
    setDone(d.added ? `Added ${d.added} item${d.added === 1 ? '' : 's'}${d.present ? `; ${d.present} already there were left as they were` : ''}.` : 'Nothing to add — everything in this snapshot is already in the workspace.');
    loadHistory();
  };

  if (loadErr) return <div style={{ padding: 28 }}><div style={box}><Err text={loadErr} /></div></div>;
  if (!cat) return <div style={{ padding: 28, color: MUTED, fontSize: 13 }}><Loader size={14} className="spin" /> Loading…</div>;

  const targetName = target === active ? 'This workspace' : (workspaces.find(w => w.accountId === target)?.name || workspaces.find(w => w.accountId === target)?.email || target);
  const chosen = cat.find(s => s.id === pick);

  return (
    <div style={{ padding: 'clamp(12px, 3vw, 28px)', maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 14, minWidth: 0 }} data-testid="snapshots">
      <div>
        <h1 style={{ margin: 0, fontSize: 'clamp(20px, 3vw, 24px)', fontWeight: 800, color: INK, display: 'flex', alignItems: 'center', gap: 8 }}><Layers size={20} /> Industry snapshots</h1>
        <p style={{ ...small, marginTop: 6, maxWidth: 720 }}>A ready-made starting point for one trade: a pipeline whose stages carry their checklists, and the contact fields that trade records. Installing adds only what is missing — nothing you already have is changed, and nothing you deleted comes back unless you ask.</p>
      </div>

      <div style={{ ...box, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {owner ? (
            <label style={{ ...label, flex: '1 1 320px' }}>Install into
              <select style={input} data-field="snapshot.workspace" value={target} onChange={e => setTarget(e.target.value)}>
                {active && <option value={active}>This workspace</option>}
                {workspaces.filter(w => w.accountId !== active).map(w => <option key={w.accountId} value={w.accountId}>{w.name || w.email}{w.industry ? ` — ${w.industry}` : ''}</option>)}
              </select>
            </label>
          ) : <p style={{ ...small, flex: '1 1 320px' }}>Installs go into the workspace you are in now.</p>}
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: INK }}>
            <input type="checkbox" data-field="snapshot.restore" checked={restore} onChange={e => setRestore(e.target.checked)} /> Put back what was removed
          </label>
        </div>
        <p style={small}>{targetName}{industry ? <> · set up for <b style={{ color: INK }}>{cat.find(s => s.industry === industry)?.title ?? industry}</b></> : ' · no industry recorded yet'}</p>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' }}>
        {cat.map(s => {
          const last = history.find(h => h.snapshotId === s.id);
          const expanded = open === s.id;
          return (
            <div key={s.id} style={{ ...box, display: 'grid', gap: 8, alignContent: 'start' }} data-testid={`snapshot-${s.id}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: 15, color: INK }}>{s.title}</h3>
                <span style={chip('#eef2ff', '#4338ca')}>Version {s.version}</span>
              </div>
              <p style={small}>{s.summary}</p>
              <p style={small}>{s.pipeline.stages.length} stages · {s.fields.length} contact fields · {s.templates.length} suggested workflows</p>
              {s.problems.length
                ? <p style={{ ...small, color: WARN }} data-testid="snapshot-problems">Does not pass its checks: {s.problems.join(' ')}</p>
                : <p style={{ ...small, color: GOOD, display: 'flex', alignItems: 'center', gap: 4 }}><Check size={12} /> Passes its checks</p>}
              <p style={small}>{last ? `Version ${last.version} installed here ${when(last.at)}${last.version < s.version ? ' — a newer version is available' : ''}.` : 'Not installed here.'}</p>
              <button style={{ ...btn, justifySelf: 'start' }} onClick={() => setOpen(expanded ? null : s.id)} aria-expanded={expanded}>
                {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />} What it holds
              </button>
              {expanded && (
                <div style={{ display: 'grid', gap: 8, borderTop: `1px solid ${LINE}`, paddingTop: 8 }}>
                  <b style={{ fontSize: 12.5, color: INK }}>Pipeline: {s.pipeline.name}</b>
                  <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
                    {s.pipeline.stages.map(st => (
                      <li key={st.id} style={{ fontSize: 12.5, color: INK }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: st.color, marginRight: 6 }} />{st.name}
                        <ul style={{ margin: '2px 0 0', paddingLeft: 16 }}>{st.playbook.map(t => <li key={t} style={{ fontSize: 12, color: MUTED }}>{t}</li>)}</ul>
                      </li>
                    ))}
                  </ol>
                  <b style={{ fontSize: 12.5, color: INK }}>Contact fields</b>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>{s.fields.map(f => <li key={f.key} style={{ fontSize: 12.5, color: MUTED }}>{f.label}</li>)}</ul>
                  <p style={small}>Suggested workflows, from <Link to="/autopilot?view=templates">the template library</Link>: {s.templates.join(', ')}. These are not installed — start them from the library when you are ready.</p>
                  <p style={small}>{s.history.map(h => `v${h.version} (${h.date}): ${h.note}`).join(' ')}</p>
                </div>
              )}
              <button style={{ ...primary, justifySelf: 'start' }} disabled={!!busy || !!s.problems.length || !target} onClick={() => void preview(s.id)} data-testid={`snapshot-preview-${s.id}`}>
                {busy === 'preview' && pick === s.id ? <Loader size={13} className="spin" /> : null} Preview the install
              </button>
            </div>
          );
        })}
      </div>

      {(plan || err || done) && (
        <div style={{ ...box, display: 'grid', gap: 10 }} data-testid="snapshot-plan">
          {chosen && plan && (
            <>
              <h3 style={{ margin: 0, fontSize: 14.5, color: INK }}>{chosen.title} into {targetName}</h3>
              <p style={small}>{plan.counts.add + plan.counts.restore} to add · {plan.counts.present} already there, left exactly as you have them · {plan.counts.removed} removed by you, not added back{restore || !plan.counts.removed ? '' : ' (tick "Put back what was removed" to restore them)'}</p>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
                {plan.items.map(i => (
                  <li key={i.key} style={{ display: 'grid', gridTemplateColumns: '112px minmax(0, 1fr)', gap: 8, alignItems: 'baseline', fontSize: 12.5, color: INK }}>
                    <span style={{ ...chip(STATUS[i.status].bg, STATUS[i.status].fg), justifySelf: 'start' }}>{STATUS[i.status].label}</span>
                    <span style={{ minWidth: 0 }}><span style={{ color: MUTED }}>{i.kind}</span> {i.label}</span>
                  </li>
                ))}
              </ul>
              <div>
                <button style={primary} disabled={!!busy || !plan.changes} onClick={() => void install()} data-testid="snapshot-install">
                  {busy === 'install' ? <Loader size={13} className="spin" /> : <Check size={13} />} {plan.changes ? 'Install' : 'Nothing to add'}
                </button>
              </div>
            </>
          )}
          {err && <Err text={err} />}
          {done && <p style={{ ...small, color: GOOD }} data-testid="snapshot-done"><Check size={12} /> {done}</p>}
        </div>
      )}

      <div style={box}>
        <h3 style={{ margin: '0 0 8px', fontSize: 14.5, color: INK }}>History for {targetName}</h3>
        {history.length === 0 ? <p style={small}>No snapshot has been installed here.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr style={{ textAlign: 'left', color: MUTED }}><th style={{ padding: '4px 8px' }}>When</th><th style={{ padding: '4px 8px' }}>Snapshot</th><th style={{ padding: '4px 8px' }}>What happened</th><th style={{ padding: '4px 8px' }}>By</th></tr></thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id} style={{ borderTop: `1px solid ${LINE}` }}>
                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{when(h.at)}</td>
                    <td style={{ padding: '6px 8px' }}>{cat.find(s => s.id === h.snapshotId)?.title ?? h.snapshotId} v{h.version}</td>
                    <td style={{ padding: '6px 8px' }}>{MODE[h.mode] ?? h.mode}: {h.added.length} added, {h.present} already there{h.skipped ? `, ${h.skipped} left out as removed` : ''}</td>
                    <td style={{ padding: '6px 8px' }}>{h.byRole === 'owner' ? 'Protected Central' : h.byEmail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
