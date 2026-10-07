/**
 * "Connect to AI Autopilot" — a search the customer built and tested in AI
 * Prospecting becomes a recurring lead source for one AI Autopilot project
 * (services/prospectSources.ts → /api/sources.php).
 *
 * The same wizard opens from both ends: from a search (AI Prospecting's
 * results or its history — `search` given, the project is asked) and from a
 * project ("Connect Prospect Search" — `projectId` given, the search is
 * asked). Five questions, each with a default that works:
 *
 *   1. which project            4. how strictly to check them
 *   2. the workflow and its source   5. where verified leads go next
 *   3. when, and how many verified leads a run
 *
 * The workflow it makes names the search by id; nothing about the search is
 * copied into a second engine. Changing what the search finds asks whether the
 * workflows already using it should follow.
 *
 * Drawn in a portal, light, so the app's own dark mode treats it like every
 * other dialog.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Bot, CheckCircle2, ChevronDown, Info, Loader, Lock, Plus, ShieldCheck, Sparkles, X, Zap,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { fetchBoard, guardrailsFor, saveProject, type Portfolio, type Project } from '../../services/projects';
import { fetchWorkflows, type ProjectWorkflow } from '../../services/autopilot';
import { createList, loadLists } from '../../services/contactLists';
import { flushNow } from '../../services/serverData';
import { currentActor, ownersInUse } from '../../services/contactPermissions';
import { googleAvailability } from '../../services/prospects';
import {
  DAY_NAMES, DEFAULT_MIN_CONFIDENCE, SCHEDULES, SOURCE_POLICY, TARGET_MAX, applySearch, connectSearch, daysFor, defineSearch, describeSchedule,
  listSearches, localTz, runLimits, updateSearch, workflowNameFor,
  type Connection, type Filters, type Schedule, type SearchDef,
} from '../../services/prospectSources';

const INK = '#0f172a', MUTED = '#64748b', LINE = '#e5e7eb', ACCENT = '#5b5bf0', SOFT = '#eef0ff', GOOD = '#15803d', BAD = '#b42318';

export interface SearchSeed { trade: string; place: string; source: string; query?: string; filters?: Partial<Filters> }

const isSourceFlow = (w: ProjectWorkflow) => (w.nodes ?? []).some(n => (n as { config?: Record<string, unknown> }).config?.produces === 'prospects');

export default function ConnectAutopilot({ search, searchId, projectId, onClose, onDone }: {
  search?: SearchSeed; searchId?: string; projectId?: string;
  onClose: () => void; onDone: (c: Connection) => void;
}) {
  const navigate = useNavigate();
  const { contacts, pipelines } = useApp();
  const STEPS = useMemo(() => [...(search || searchId ? [] : ['search']), ...(projectId ? [] : ['project']), 'workflow', 'schedule', 'verify', 'destination'] as const, [search, searchId, projectId]);
  const [step, setStep] = useState(0);
  const at = STEPS[step] as string;

  const [def, setDef] = useState<SearchDef | null>(null);
  const [googleNote, setGoogleNote] = useState('');
  const [saved, setSaved] = useState<(SearchDef & { connections: { id: string; projectName: string }[] })[] | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [pick, setPick] = useState(projectId ?? '');
  const [newProject, setNewProject] = useState({ on: false, name: '', portfolioId: '' });
  const [flows, setFlows] = useState<ProjectWorkflow[]>([]);
  const [verifierOn, setVerifierOn] = useState(false);

  const [name, setName] = useState('');
  const [filters, setFilters] = useState<Filters>({ website: false, email: true, phone: false });
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [schedule, setSchedule] = useState<Schedule>('weekdays');
  const [customDays, setCustomDays] = useState('1111100');
  const [weeklyDay, setWeeklyDay] = useState(0);
  const [runHour, setRunHour] = useState(9);
  const [target, setTarget] = useState(40);
  const [level, setLevel] = useState<'recommended' | 'strict'>('recommended');
  const [minConfidence, setMinConfidence] = useState(DEFAULT_MIN_CONFIDENCE);
  const [rejectRole, setRejectRole] = useState(false);
  const [rejectFreeMail, setRejectFreeMail] = useState(false);
  const [listId, setListId] = useState('new');
  const [tags, setTags] = useState('');
  const [pipelineId, setPipelineId] = useState('');
  const [owner, setOwner] = useState('');
  const [nextWorkflowId, setNextWorkflowId] = useState('');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; field?: string } | null>(null);
  const [ask, setAsk] = useState<null | { connections: Connection[] }>(null);
  const [done, setDone] = useState<Connection | null>(null);

  /* The search, as a definition with an id. */
  const adopt = (d: SearchDef) => {
    setDef(d);
    setFilters(d.filters); setExclusions(d.exclusions);
    setName(workflowNameFor(d.trade, d.place));
    setTags(d.trade.toLowerCase());
  };
  useEffect(() => {
    let live = true;
    if (search) {
      void defineSearch(search).then(r => {
        if (!live) return;
        if (!r.success) { setErr({ text: r.error ?? 'That search could not be saved.' }); return; }
        adopt(r.search); setGoogleNote(r.googleNote);
        if (search.filters) setFilters(f => ({ ...f, website: !!search.filters?.website || f.website, phone: !!search.filters?.phone || f.phone }));
      });
    } else {
      void listSearches().then(r => {
        if (!live) return;
        setSaved(r.searches ?? []);
        if (searchId) { const d = (r.searches ?? []).find(x => x.id === searchId); if (d) adopt(d); }
      });
    }
    void fetchBoard().then(r => { if (live) { setProjects(r.projects as Project[]); setPortfolios(r.portfolios as Portfolio[]); } });
    void googleAvailability().then(g => { if (live) setVerifierOn(!!g?.verifier.available); });
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const project = (projects ?? []).find(p => p.id === pick);
  useEffect(() => {
    if (!pick) return;
    let live = true;
    void fetchWorkflows(pick).then(r => { if (live) setFlows(r.workflows.filter(w => !isSourceFlow(w))); });
    const aud = (project?.brief as { audience?: { listId?: string } } | null | undefined)?.audience;
    if (aud?.listId && loadLists().some(l => l.id === aud.listId && l.type === 'static')) setListId(aud.listId);
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick, projects]);

  const lists = useMemo(() => loadLists().filter(l => l.type === 'static'), []);
  const owners = useMemo(() => [...new Set([currentActor().name, ...ownersInUse(contacts)].filter(Boolean))], [contacts]);
  const days = daysFor(schedule, customDays, weeklyDay);
  const plan = { schedule, runDays: days, runHour };
  const limits = runLimits(target);

  const next = async () => {
    setErr(null);
    if (at === 'search' && !def) { setErr({ text: 'Choose a saved search.', field: 'source.search' }); return; }
    if (at === 'project') {
      if (newProject.on) {
        if (!newProject.name.trim()) { setErr({ text: 'Name the new project.', field: 'source.project' }); return; }
        const pf = newProject.portfolioId || portfolios[0]?.id;
        if (!pf) { setErr({ text: 'A project writes for one of your clients — add a client in AI Autopilot first.', field: 'source.project' }); return; }
        setBusy(true);
        const r = await saveProject({
          name: newProject.name.trim(), portfolioId: pf, kind: 'leadgen', guardrails: guardrailsFor(['find', 'email']),
          objective: def ? `Find and win ${def.trade} in ${def.place}` : 'Find and win new clients',
        });
        setBusy(false);
        if (!r.success || !r.id) { setErr({ text: r.error ?? 'The project could not be made.', field: 'source.project' }); return; }
        const b = await fetchBoard();
        setProjects(b.projects as Project[]);
        setPick(String(r.id)); setNewProject({ on: false, name: '', portfolioId: '' });
      } else if (!pick) { setErr({ text: 'Choose which project uses these prospects.', field: 'source.project' }); return; }
    }
    if (at === 'workflow' && def) {
      if (!name.trim()) { setErr({ text: 'Name the workflow.', field: 'source.name' }); return; }
      const changed = filters.website !== def.filters.website || filters.phone !== def.filters.phone
        || exclusions.join('|').toLowerCase() !== def.exclusions.join('|').toLowerCase();
      if (changed) {
        setBusy(true);
        const r = await updateSearch(def.id, { filters, exclusions });
        setBusy(false);
        if (!r.success) { setErr({ text: r.error ?? 'The search could not be changed.', field: r.field }); return; }
        setDef(r.search);
        /* Other projects already use this search: their workflows follow only if the customer says so. */
        if (r.changed && r.connections.length) { setAsk({ connections: r.connections }); return; }
      }
    }
    if (at === 'schedule' && (!Number.isFinite(target) || target < 1 || target > TARGET_MAX)) { setErr({ text: `Choose between 1 and ${TARGET_MAX}.`, field: 'source.target' }); return; }
    if (step < STEPS.length - 1) setStep(step + 1); else await activate();
  };

  const activate = async () => {
    if (!def || !pick) return;
    setBusy(true); setErr(null);
    let list = listId;
    if (list === 'new') {
      const made = createList({ name: `${def.name} — prospects`, type: 'static', memberIds: [], createdBy: currentActor().name, kind: 'cold', origin: 'prospecting' });
      list = made.id;
      await flushNow();
    }
    const pipe = pipelines.find(p => p.id === pipelineId);
    const r = await connectSearch(def.id, pick, {
      name: name.trim(), schedule, runDays: days, weeklyDay, runHour, tz: localTz(), target, minConfidence,
      verify: { level, rejectRole, rejectFreeMail },
      destination: {
        listId: list, tags: tags.split(',').map(t => t.trim()).filter(Boolean), owner,
        pipelineId: pipe?.id ?? '', stageId: pipe?.stages?.[0]?.id ?? '', nextWorkflowId,
      },
    });
    setBusy(false);
    if (!r.success) { setErr({ text: r.error ?? 'It could not be connected.', field: r.field }); return; }
    setDone(r.connection);
    onDone(r.connection);
  };

  const field = (f: string) => (err?.field === f ? { outline: `2px solid ${BAD}`, outlineOffset: 2 } : {});
  const title: Record<string, string> = {
    search: 'Which saved search should this project use?',
    project: 'Which AI Autopilot project should use these prospects?',
    workflow: 'How should this prospect search work inside your project?',
    schedule: 'How often should Protected Central find new prospects?',
    verify: 'How should each prospect be verified?',
    destination: 'Where should successful prospects go?',
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Connect to AI Autopilot" data-testid="connect-autopilot"
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', padding: 12 }}
      onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div style={{ width: 'min(720px, 100%)', maxHeight: 'calc(100vh - 24px)', overflow: 'auto', background: '#fff', borderRadius: 18, boxShadow: '0 24px 60px rgba(15,23,42,.3)', color: INK, fontFamily: 'inherit' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: `1px solid ${LINE}`, position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#6366f1,#ec4899)', color: '#fff' }}><Bot size={18} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Connect to AI Autopilot</div>
            <div style={{ fontSize: 12, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{def ? `Search: ${def.name}` : 'A saved AI Prospecting search becomes a lead source for a project'}</div>
          </div>
          {!done && <span style={{ fontSize: 12, color: MUTED, whiteSpace: 'nowrap' }}>Step {step + 1} of {STEPS.length}</span>}
          <button type="button" aria-label="Close" onClick={onClose} disabled={busy} style={iconBtn}><X size={16} /></button>
        </header>
        {!done && (
          <div aria-hidden style={{ display: 'flex', gap: 4, padding: '10px 18px 0' }}>
            {STEPS.map((_, i) => <span key={i} style={{ flex: 1, height: 4, borderRadius: 99, background: i <= step ? ACCENT : LINE }} />)}
          </div>
        )}

        <div style={{ padding: 18, display: 'grid', gap: 14 }}>
          {done ? (
            <Done c={done} onClose={onClose} go={to => { onClose(); navigate(to); }} />
          ) : ask ? (
            <div style={{ display: 'grid', gap: 12 }} data-testid="search-changed">
              <h3 style={h3}>Update the connected Autopilot workflow{ask.connections.length === 1 ? '' : 's'} with these search changes?</h3>
              <p style={muted}>This search already feeds {ask.connections.map(c => `“${c.workflowName}” in ${c.projectName}`).join(', ')}. Updating means {ask.connections.length === 1 ? 'it finds' : 'they find'} with the new criteria from the next step on; keeping means {ask.connections.length === 1 ? 'it carries' : 'they carry'} on exactly as now.</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" style={primary} disabled={busy} onClick={async () => { setBusy(true); await applySearch(def!.id, 'update'); setBusy(false); setAsk(null); setStep(step + 1); }}>Update workflow{ask.connections.length === 1 ? '' : 's'}</button>
                <button type="button" style={ghost} disabled={busy} onClick={async () => { await applySearch(def!.id, 'keep'); setAsk(null); setStep(step + 1); }}>Keep existing workflow criteria</button>
              </div>
            </div>
          ) : (
            <>
              <h3 style={h3}>{title[at]}</h3>

              {at === 'search' && (
                <div role="radiogroup" aria-label="Saved searches" data-field="source.search" style={{ display: 'grid', gap: 8, ...field('source.search') }}>
                  {saved === null && <span style={muted}><Loader size={13} className="spin" /> Reading your searches…</span>}
                  {saved && !saved.length && <span style={muted}>No saved searches yet. Run a search in AI Prospecting, check the results, then connect it from there — or from here once it is saved.</span>}
                  {(saved ?? []).map(s => (
                    <Choice key={s.id} on={def?.id === s.id} onPick={() => adopt(s)} title={s.name}
                      sub={`${SOURCE_POLICY[s.source].label}${s.connections.length ? ` · feeds ${s.connections.map(c => c.projectName).join(', ')}` : ''}`} />
                  ))}
                  {saved && <button type="button" style={{ ...ghost, justifySelf: 'start' }} onClick={() => { onClose(); navigate('/prospecting'); }}><Sparkles size={13} /> Build a new search in AI Prospecting</button>}
                </div>
              )}

              {at === 'project' && (
                <div role="radiogroup" aria-label="Projects" data-field="source.project" style={{ display: 'grid', gap: 8, ...field('source.project') }}>
                  {projects === null && <span style={muted}><Loader size={13} className="spin" /> Reading your projects…</span>}
                  {(projects ?? []).map(p => (
                    <Choice key={p.id} on={!newProject.on && pick === p.id} onPick={() => { setPick(p.id); setNewProject(n => ({ ...n, on: false })); }} title={p.name} sub={p.objective || p.portfolioName} />
                  ))}
                  <Choice on={newProject.on} onPick={() => setNewProject(n => ({ ...n, on: true, name: n.name || (def ? `${def.place} ${def.trade} outreach` : '') }))} title="Create new project" sub="A lead-generation project for one of your clients" icon={<Plus size={14} />} />
                  {newProject.on && (
                    <div style={{ display: 'grid', gap: 8, padding: '4px 0 0 30px' }}>
                      <label style={lbl}>Project name<input value={newProject.name} onChange={e => setNewProject(n => ({ ...n, name: e.target.value }))} style={input} /></label>
                      <label style={lbl}>For which client
                        <select value={newProject.portfolioId || portfolios[0]?.id || ''} onChange={e => setNewProject(n => ({ ...n, portfolioId: e.target.value }))} style={input}>
                          {portfolios.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </label>
                      {!portfolios.length && <span style={{ ...muted, color: BAD }}>Add a client in AI Autopilot first — a project writes in a client's name.</span>}
                    </div>
                  )}
                </div>
              )}

              {at === 'workflow' && def && (
                <>
                  <label style={lbl}>Workflow name<input data-field="source.name" value={name} onChange={e => setName(e.target.value)} style={{ ...input, ...field('source.name') }} /></label>
                  <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: 14, display: 'grid', gap: 10, background: '#fafbff' }} data-testid="source-criteria">
                    <span style={kicker}>Prospect source</span>
                    <b style={{ fontSize: 15 }}>{def.trade} · {def.place}</b>
                    <Row k="Business" v={def.trade} />
                    <Row k="Location" v={def.place} />
                    <Row k="Website" v={<Toggle on={filters.website} labels={['Optional', 'Required']} onChange={v => setFilters(f => ({ ...f, website: v }))} />} />
                    <Row k="Email" v={<span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontWeight: 700 }}><Lock size={12} /> Required</span>} />
                    <Row k="Phone" v={<Toggle on={filters.phone} labels={['Optional', 'Required']} onChange={v => setFilters(f => ({ ...f, phone: v }))} />} />
                    <Row k="Confidence" v={<span>{minConfidence}% or more <span style={muted}>(step {STEPS.indexOf('verify') + 1})</span></span>} />
                    <Row k="Exclude" v={<input value={exclusions.join(', ')} onChange={e => setExclusions(e.target.value.split(',').map(x => x.trim()).filter(Boolean))} placeholder="e.g. franchise, hospital" style={{ ...input, padding: '6px 9px' }} aria-label="Exclusions" />} />
                    <Row k="Searched in" v={<span>{SOURCE_POLICY[def.source].label} <span style={muted}>— {SOURCE_POLICY[def.source].licence}</span></span>} />
                    {googleNote && <span style={{ ...muted, display: 'flex', gap: 6 }}><Info size={13} style={{ flexShrink: 0, marginTop: 2 }} /> {googleNote}</span>}
                    <span style={muted}>This workflow stays linked to the search itself (version {def.version}) — change the search later and you are asked whether this workflow should follow.</span>
                  </div>
                </>
              )}

              {at === 'schedule' && (
                <>
                  <div role="radiogroup" aria-label="How often" data-field="source.schedule" style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                    {SCHEDULES.map(sc => <Choice key={sc.id} on={schedule === sc.id} onPick={() => setSchedule(sc.id)} title={sc.label} compact />)}
                  </div>
                  {schedule === 'weekly' && (
                    <label style={lbl}>On<select value={weeklyDay} onChange={e => setWeeklyDay(Number(e.target.value))} style={input}>{DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>
                  )}
                  {schedule === 'custom' && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Days">
                      {DAY_NAMES.map((d, i) => (
                        <button key={d} type="button" aria-pressed={customDays[i] === '1'} onClick={() => setCustomDays(cd => cd.split('').map((c, j) => (j === i ? (c === '1' ? '0' : '1') : c)).join(''))}
                          style={{ ...ghost, background: customDays[i] === '1' ? SOFT : '#fff', borderColor: customDays[i] === '1' ? ACCENT : LINE, color: customDays[i] === '1' ? ACCENT : INK }}>{d}</button>
                      ))}
                    </div>
                  )}
                  {schedule !== 'manual' && (
                    <label style={lbl}>Starting at (your time, {localTz()})
                      <select value={runHour} onChange={e => setRunHour(Number(e.target.value))} style={input}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select>
                    </label>
                  )}
                  <label style={lbl}>How many VERIFIED new leads should we try to add per run?
                    <input data-field="source.target" type="number" min={1} max={TARGET_MAX} value={target} onChange={e => setTarget(Number(e.target.value))} style={{ ...input, width: 140, ...field('source.target') }} />
                  </label>
                  <div style={{ ...note, background: SOFT }}>
                    <b>{target} means {target} new qualifying, verified leads</b> — not {target} candidate records. To find them Protected Central may examine many more:
                    up to {limits.searches} searches and {limits.reads} websites a run. If a run cannot reach {target} within that, it says so and the next run carries on.
                    <br />{describeSchedule(plan)}.
                  </div>
                </>
              )}

              {at === 'verify' && (
                <>
                  <div role="radiogroup" aria-label="Verification level" style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                    <Choice on={level === 'recommended'} onPick={() => setLevel('recommended')} title="Recommended" sub="Address published by the business, its domain and mail server checked, duplicates and opt-outs turned away" />
                    <Choice on={level === 'strict'} onPick={() => verifierOn && setLevel('strict')} title="Strict" disabled={!verifierOn}
                      sub={verifierOn ? 'Also asks the mail server whether each mailbox exists — only deliverable addresses pass' : 'Needs the mailbox verifier, which the owner of this app has not connected'} />
                  </div>
                  <label style={lbl}>Minimum confidence: <b style={{ color: INK }}>{minConfidence}%</b>
                    <input data-field="source.confidence" type="range" min={50} max={100} step={1} value={minConfidence} onChange={e => setMinConfidence(Number(e.target.value))} />
                  </label>
                  <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: 12, display: 'grid', gap: 6 }}>
                    <span style={kicker}>Automatically reject</span>
                    {['Duplicates — already in your CRM or this project', 'Suppressed contacts and unsubscribes', 'Invalid businesses and exclusions', 'Invalid domains', 'Failed verification'].map(x => (
                      <span key={x} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><CheckCircle2 size={14} color={GOOD} /> {x} <span style={{ ...muted, marginLeft: 'auto' }}>always on</span></span>
                    ))}
                  </div>
                  <details style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: '10px 12px' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><ChevronDown size={14} /> Advanced settings</summary>
                    <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                      <label style={check}><input type="checkbox" checked={rejectRole} onChange={e => setRejectRole(e.target.checked)} /> Reject role addresses (info@, sales@…)</label>
                      <label style={check}><input type="checkbox" checked={rejectFreeMail} onChange={e => setRejectFreeMail(e.target.checked)} /> Reject businesses writing from free webmail</label>
                      <div style={{ ...muted, lineHeight: 1.6 }}>
                        <b style={{ color: INK }}>How confidence is worked out</b> — only from checks that ran: found by the search 30, website answered 20, address on its own
                        website 15 (in the directory 8), address matches the website 10, domain and mail server checked 15 (mailbox verified 25, catch-all 3),
                        phone listed 5; a role address −5, free webmail −10. A check that could not run adds nothing.
                      </div>
                    </div>
                  </details>
                </>
              )}

              {at === 'destination' && def && (
                <div style={{ display: 'grid', gap: 10 }}>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 700 }}><CheckCircle2 size={15} color={GOOD} /> Add to Protected Central CRM <span style={{ ...muted, fontWeight: 400 }}>— always, as prospects, with where each was found</span></span>
                  <label style={lbl}>Contact list
                    <select data-field="source.list" value={listId} onChange={e => setListId(e.target.value)} style={{ ...input, ...field('source.list') }}>
                      <option value="new">New list: “{def.name} — prospects”</option>
                      {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </label>
                  <label style={lbl}>Apply tags (comma between)<input value={tags} onChange={e => setTags(e.target.value)} style={input} /></label>
                  <label style={lbl}>Add to pipeline (creates an opportunity for each)
                    <select data-field="source.pipeline" value={pipelineId} onChange={e => setPipelineId(e.target.value)} style={{ ...input, ...field('source.pipeline') }}>
                      <option value="">Don't create opportunities</option>
                      {pipelines.map(p => <option key={p.id} value={p.id}>{p.name} → {p.stages?.[0]?.name ?? 'first stage'}</option>)}
                    </select>
                  </label>
                  <label style={lbl}>Assign team member
                    <select value={owner} onChange={e => setOwner(e.target.value)} style={input}>
                      <option value="">Nobody in particular</option>
                      {owners.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </label>
                  <label style={{ ...lbl, padding: 12, borderRadius: 12, border: `1px solid ${ACCENT}55`, background: SOFT }}>
                    <span style={{ fontWeight: 800, color: INK, display: 'flex', gap: 6, alignItems: 'center' }}><Zap size={14} color={ACCENT} /> Connect next workflow</span>
                    <span>Each verified lead starts in another workflow of {project?.name ?? 'this project'}.</span>
                    <select data-field="source.next" value={nextWorkflowId} onChange={e => setNextWorkflowId(e.target.value)} style={{ ...input, ...field('source.next') }}>
                      <option value="">None for now — they wait on the list</option>
                      {flows.map(w => <option key={w.id} value={w.id}>{w.name}{w.status !== 'active' ? ` (${w.status} — switch it on for leads to start)` : ''}</option>)}
                    </select>
                    {!flows.length && <span style={muted}>This project has no other workflow yet — add one (an outreach sequence, say) and connect it here later.</span>}
                  </label>
                </div>
              )}

              {err && <div role="alert" style={{ ...note, background: '#fef2f2', color: BAD }}>{err.text}</div>}
            </>
          )}
        </div>

        {!done && !ask && (
          <footer style={{ display: 'flex', gap: 8, padding: '12px 18px 16px', borderTop: `1px solid ${LINE}`, position: 'sticky', bottom: 0, background: '#fff' }}>
            {step > 0 && <button type="button" style={ghost} disabled={busy} onClick={() => { setErr(null); setStep(step - 1); }}><ArrowLeft size={14} /> Back</button>}
            <span style={{ flex: 1 }} />
            <button type="button" style={primary} disabled={busy || (at !== 'search' && !def)} onClick={() => void next()} data-testid="connect-next">
              {busy ? <Loader size={14} className="spin" /> : at === 'destination' ? <ShieldCheck size={14} /> : <ArrowRight size={14} />}
              {at === 'destination' ? 'Activate' : 'Continue'}
            </button>
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Done({ c, onClose, go }: { c: Connection; onClose: () => void; go: (to: string) => void }) {
  return (
    <div style={{ display: 'grid', gap: 12 }} data-testid="connect-done">
      <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 16, fontWeight: 800, color: GOOD }}><CheckCircle2 size={20} /> Connected — Autopilot is on it</span>
      <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: 14, display: 'grid', gap: 6 }}>
        <Row k="Project" v={c.projectName} />
        <Row k="Workflow" v={c.workflowName} />
        <Row k="Schedule" v={c.scheduleText} />
        <Row k="Target" v={`${c.target} verified leads a run`} />
        <Row k="Status" v={c.status === 'active' ? 'Active' : c.status} />
        <Row k="Next run" v={c.manualOnly ? 'When you start it' : c.nextRunAt ? new Date(c.nextRunAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={primary} onClick={() => go(`/autopilot?project=${encodeURIComponent(c.projectId)}&tab=prospects&source=${encodeURIComponent(c.id)}`)}>View project</button>
        <button type="button" style={ghost} onClick={() => go(`/autopilot?project=${encodeURIComponent(c.projectId)}&tab=workflows`)}>View workflow</button>
        <button type="button" style={ghost} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function Choice({ on, onPick, title, sub, icon, compact, disabled }: { on: boolean; onPick: () => void; title: string; sub?: string; icon?: React.ReactNode; compact?: boolean; disabled?: boolean }) {
  return (
    <button type="button" role="radio" aria-checked={on} aria-disabled={disabled} onClick={onPick}
      style={{
        display: 'flex', gap: 10, alignItems: 'flex-start', textAlign: 'left', padding: compact ? '10px 12px' : '12px 14px', borderRadius: 12, cursor: disabled ? 'not-allowed' : 'pointer',
        border: `1.5px solid ${on ? ACCENT : LINE}`, background: on ? SOFT : '#fff', color: INK, fontFamily: 'inherit', opacity: disabled ? 0.6 : 1, minWidth: 0,
      }}>
      <span style={{ width: 16, height: 16, borderRadius: 99, border: `2px solid ${on ? ACCENT : '#cbd5e1'}`, display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 1 }}>
        {on && <span style={{ width: 7, height: 7, borderRadius: 99, background: ACCENT }} />}
      </span>
      <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
        <b style={{ fontSize: 13.5, display: 'flex', gap: 6, alignItems: 'center' }}>{icon}{title}</b>
        {sub && <span style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>{sub}</span>}
      </span>
    </button>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px minmax(0, 1fr)', gap: 10, alignItems: 'center', fontSize: 13 }}>
      <span style={{ color: MUTED, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{k}</span>
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{v}</span>
    </div>
  );
}

function Toggle({ on, labels, onChange }: { on: boolean; labels: [string, string]; onChange: (v: boolean) => void }) {
  return (
    <span role="group" style={{ display: 'inline-flex', border: `1px solid ${LINE}`, borderRadius: 9, overflow: 'hidden' }}>
      {labels.map((l, i) => (
        <button key={l} type="button" aria-pressed={on === (i === 1)} onClick={() => onChange(i === 1)}
          style={{ border: 0, padding: '5px 11px', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', background: on === (i === 1) ? ACCENT : '#fff', color: on === (i === 1) ? '#fff' : INK }}>{l}</button>
      ))}
    </span>
  );
}

const h3: React.CSSProperties = { margin: 0, fontSize: 17, fontWeight: 800, lineHeight: 1.35 };
const muted: React.CSSProperties = { fontSize: 12.5, color: MUTED, lineHeight: 1.55 };
const kicker: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: ACCENT, textTransform: 'uppercase' };
const lbl: React.CSSProperties = { display: 'grid', gap: 5, fontSize: 12.5, color: MUTED, fontWeight: 600 };
const check: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: INK };
const input: React.CSSProperties = { padding: '9px 11px', borderRadius: 10, border: `1px solid ${LINE}`, fontSize: 13.5, fontFamily: 'inherit', color: INK, background: '#fff', minWidth: 0, boxSizing: 'border-box', width: '100%' };
const note: React.CSSProperties = { fontSize: 12.5, lineHeight: 1.6, padding: '10px 12px', borderRadius: 10, color: INK };
const primary: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 11, border: 0, background: ACCENT, color: '#fff', fontWeight: 800, fontSize: 13.5, fontFamily: 'inherit', cursor: 'pointer' };
const ghost: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 11, border: `1px solid ${LINE}`, background: '#fff', color: INK, fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' };
const iconBtn: React.CSSProperties = { border: 0, background: 'none', cursor: 'pointer', color: MUTED, display: 'grid', placeItems: 'center', padding: 4 };
