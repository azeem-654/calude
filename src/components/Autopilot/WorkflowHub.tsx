/**
 * Every workflow in the workspace, as a canvas — and the box that writes one.
 *
 * ── What this screen is for ──
 *
 * The builder edits one step at a time and the project dashboards answer "how
 * is each client doing". Neither answers the question somebody asks when they
 * are deciding whether to trust this thing with their customers: **what does it
 * actually do to people, and when**. That is a shape, and this is where the
 * shapes live.
 *
 * ── Why the AI column writes rather than advises ──
 *
 * Describing a follow-up in a sentence and getting a working one back is the
 * feature; a suggestion somebody then has to build by hand is the thing they
 * signed up here to avoid. Everything it produces lands as a **draft**, because
 * every one of these sends something and switching it on for somebody is a
 * permission they never gave.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, Plus, Search, ChevronDown, ChevronRight, Play, Pause,
  Loader, Bot, ExternalLink, Trash2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { writeAutomation } from '../../services/aiWrite';
import { fetchHub, type Hub } from '../../services/autopilot';
import type { Automation, AutomationNode } from '../../types/marketing';
import WorkflowCanvas from './WorkflowCanvas';
import { chain, groupOf, GROUP_LABEL, type WorkflowGroup } from './workflowNodes';
import { AgentsInAction, TodaysTasks, RecentlyPublished } from './HubPanels';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

/** The tint behind a workflow card, by what it is for. Pale on purpose. */
const GROUP_TINT: Record<WorkflowGroup, { bg: string; index: string }> = {
  marketing: { bg: '#f7f9ff', index: '#2563eb' },
  content: { bg: '#fffaf5', index: '#ea580c' },
  sales: { bg: '#f6fbf7', index: '#16a34a' },
};

/**
 * What somebody can ask for, as a starting sentence rather than a template.
 *
 * Every one is a thing a small business does by hand and forgets. They fill the
 * box rather than building anything on click: the point is to show what a
 * usable instruction looks like, and a one-click template teaches nothing.
 */
const QUICK_PROMPTS = [
  'When a form is submitted, tag the person and email them within the hour',
  'Chase an enquiry that has gone quiet after three days',
  'Thank a customer a day after they are tagged as one',
  'Text anybody who has not replied to two emails',
  'Follow up after a missed appointment and offer to rebook',
  'Welcome a new contact with a three-email introduction',
];

export default function WorkflowHub() {
  const navigate = useNavigate();
  const { automations, addAutomation, updateAutomation, deleteAutomation, addNotification } = useApp();

  const [hub, setHub] = useState<Hub | null>(null);
  const [group, setGroup] = useState<'all' | WorkflowGroup>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [taskFilter, setTaskFilter] = useState('all');

  const [prompt, setPrompt] = useState('');
  const [writing, setWriting] = useState(false);

  const read = useCallback(async () => {
    const r = await fetchHub();
    if (r.hub) setHub(r.hub);
  }, []);

  useEffect(() => {
    void read();
    /* Thirty seconds against a five-minute tick: fast enough that a card
       appears without a reload, slow enough not to ask ten times for an answer
       that cannot have changed. Stops while the tab is hidden. */
    const tick = () => { if (document.visibilityState === 'visible') void read(); };
    const t = window.setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, [read]);

  const groups = useMemo(
    () => new Map(automations.map(a => [a.id, groupOf(a.nodes ?? [])])),
    [automations],
  );

  const shown = automations.filter(a => {
    if (group !== 'all' && groups.get(a.id) !== group) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return a.name.toLowerCase().includes(q)
      || (a.nodes ?? []).some(n => (n.label ?? '').toLowerCase().includes(q));
  });

  const count = (g: WorkflowGroup) => automations.filter(a => groups.get(a.id) === g).length;
  const runningNow = hub?.agents.length ?? 0;

  async function build() {
    const text = prompt.trim();
    if (text.length < 8 || writing) return;
    setWriting(true);
    const r = await writeAutomation(text);
    setWriting(false);
    if (!r.ok) {
      addNotification(
        r.needsKey
          /* Named rather than reported as a failure: no key is a thing the
             owner can fix in a minute, and "that could not be built" sends them
             to re-word a sentence that was fine. */
          ? 'No AI key is connected yet, so nothing can be written. Settings → AI Engine.'
          : (r.error || 'That could not be built. Try describing it differently.'),
        'error',
      );
      return;
    }
    if (!r.nodes?.length) {
      addNotification('The answer had no runnable steps in it. Try saying it another way.', 'error');
      return;
    }

    /*
     * Wired into a chain before it is saved.
     *
     * The writer returns steps in order and nothing else: no ids, and no
     * `nextId`. Saved as they arrive, every node would point at nothing and the
     * engine would carry out the first step and stop — a workflow that looks
     * complete on the canvas and does one thing. The order it wrote them in is
     * the order it meant, so that is the chain.
     */
    const nodes = chain(r.nodes.map((n, idx) => ({
      id: `n${idx}`,
      type: n.type as AutomationNode['type'],
      label: n.label,
      config: n.config ?? {},
    }))) as AutomationNode[];

    const a = { name: r.name, nodes };
    addAutomation({
      name: a.name || text.slice(0, 60),
      description: text.slice(0, 200),
      /* A draft, always. Every one of these sends something, and switching it
         on for somebody is exactly the permission they never gave. */
      status: 'draft',
      nodes: a.nodes,
      createdAt: new Date().toISOString(),
      enrolledCount: 0,
      completedCount: 0,
    });
    setPrompt('');
    addNotification(`"${a.name || 'Workflow'}" built as a draft — read it, then switch it on.`);
  }

  function remove(a: Automation) {
    if (!window.confirm(`Delete "${a.name}"? Anybody part-way through it stops where they are.`)) return;
    deleteAutomation(a.id);
    addNotification('Workflow deleted');
  }

  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr) 300px' }} className="ap-hub">
      {/* ── The workflows ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {([['all', `All workflows (${automations.length})`]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setGroup('all')} aria-pressed={group === 'all'} style={filterPill(group === 'all')}>
              {label}
            </button>
          ))}
          {(['marketing', 'content', 'sales'] as WorkflowGroup[]).map(g => (
            <button key={g} onClick={() => setGroup(g)} aria-pressed={group === g} style={filterPill(group === g)}>
              {GROUP_LABEL[g]} ({count(g)})
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <Search size={12} color={MUTED} style={{ position: 'absolute', left: 10 }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search workflows…"
              aria-label="Search workflows"
              style={{
                padding: '7px 11px 7px 28px', borderRadius: 999, border: `1px solid ${LINE}`,
                fontSize: 12, outline: 'none', fontFamily: 'inherit', width: 180, background: '#fff',
              }}
            />
          </span>
          <button onClick={() => navigate('/marketing?tab=automations')} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 10,
            border: 'none', background: ACCENT, color: '#fff', fontSize: 12.5, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <Plus size={13} /> New workflow
          </button>
        </div>

        {!automations.length ? (
          <div style={{
            background: '#fff', border: `1px dashed ${LINE}`, borderRadius: 18,
            padding: '36px 24px', textAlign: 'center',
          }}>
            <span style={{
              width: 44, height: 44, borderRadius: 14, background: '#f5f3ff', color: ACCENT,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
            }}><Bot size={20} /></span>
            <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 800, color: INK }}>No workflows yet</h3>
            <p style={{ margin: '0 auto', maxWidth: 420, fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
              A workflow is what happens on its own when somebody fills in a form, is tagged, or goes
              quiet. Describe one in the box on the right and it will be built as a draft.
            </p>
          </div>
        ) : !shown.length ? (
          <p style={{ margin: 0, fontSize: 12.5, color: MUTED, padding: '18px 2px' }}>
            Nothing matches that.
          </p>
        ) : shown.map((a, i) => {
          const g = groups.get(a.id) ?? 'content';
          const tint = GROUP_TINT[g];
          const live = a.status === 'active';
          const isOpen = open[a.id] !== false;   // open by default: the shape is the point
          return (
            <section key={a.id} style={{
              background: tint.bg, border: `1px solid ${LINE}`, borderRadius: 16,
              padding: 13, display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <header style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                <button onClick={() => setOpen(o => ({ ...o, [a.id]: !isOpen }))} aria-expanded={isOpen}
                  aria-label={isOpen ? `Collapse ${a.name}` : `Expand ${a.name}`}
                  style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}>
                  {isOpen ? <ChevronDown size={15} color={MUTED} /> : <ChevronRight size={15} color={MUTED} />}
                </button>
                <span style={{
                  width: 22, height: 22, borderRadius: 7, background: tint.index, color: '#fff',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, flexShrink: 0,
                }}>{i + 1}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: INK, letterSpacing: '-0.01em' }}>{a.name}</span>
                <span style={{ fontSize: 11.5, color: MUTED, minWidth: 0 }}>{a.description}</span>
                <span style={{ flex: 1 }} />

                <span style={{ fontSize: 10.5, fontWeight: 700, color: live ? '#0f7b3d' : MUTED }}>
                  {live ? 'Active' : a.status === 'paused' ? 'Paused' : 'Draft'}
                </span>
                {/* A real switch, not a badge: this is the control that decides
                    whether it touches anybody, so it belongs on the card. */}
                <button
                  role="switch"
                  aria-checked={live}
                  aria-label={`${live ? 'Pause' : 'Switch on'} ${a.name}`}
                  onClick={() => updateAutomation(a.id, { status: live ? 'paused' : 'active' })}
                  style={{
                    width: 34, height: 19, borderRadius: 999, border: 'none', cursor: 'pointer',
                    background: live ? '#16a34a' : '#cbd5e1', position: 'relative', flexShrink: 0,
                    transition: 'background 0.15s',
                  }}>
                  <span style={{
                    position: 'absolute', top: 2, left: live ? 17 : 2, width: 15, height: 15,
                    borderRadius: 999, background: '#fff', transition: 'left 0.15s',
                  }} />
                </button>
                <button onClick={() => navigate('/marketing?tab=automations')} className="press" style={ghost()}>
                  Edit <ExternalLink size={10} />
                </button>
                <button onClick={() => remove(a)} aria-label={`Delete ${a.name}`} className="press"
                  style={{ ...ghost(), color: '#b42318' }}>
                  <Trash2 size={11} />
                </button>
              </header>

              {isOpen && (
                <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 13, padding: 12 }}>
                  <WorkflowCanvas nodes={a.nodes ?? []} live={live} />
                </div>
              )}
            </section>
          );
        })}

        {/* ── The live panels ── */}
        <div style={{
          display: 'grid', gap: 13, marginTop: 4,
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))',
        }}>
          <AgentsInAction hub={hub} />
          <TodaysTasks hub={hub} filter={taskFilter} onFilter={setTaskFilter} />
          <RecentlyPublished hub={hub} />
        </div>
      </div>

      {/* ── Describe one and it builds it ── */}
      <aside style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
        <section style={{
          background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 15,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{
              width: 28, height: 28, borderRadius: 9, background: '#f5f3ff', color: ACCENT,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}><Bot size={15} /></span>
            <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: INK }}>Build with AI</h3>
          </div>
          <p style={{ margin: '0 0 10px', fontSize: 11.5, color: MUTED, lineHeight: 1.55 }}>
            Describe what should happen on its own, in your own words.
          </p>

          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value.slice(0, 1000))}
            rows={5}
            placeholder="When somebody fills in the quote form, tag them, wait fifteen minutes and email them — then chase after three days if they have not replied."
            aria-label="Describe a workflow"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 11,
              border: `1px solid ${LINE}`, fontSize: 12.5, outline: 'none', resize: 'vertical',
              fontFamily: 'inherit', lineHeight: 1.5,
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 10, color: MUTED, marginTop: 3 }}>
            {prompt.length}/1000
          </div>

          <button onClick={() => void build()} disabled={writing || prompt.trim().length < 8} style={{
            width: '100%', marginTop: 7, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            gap: 7, padding: '11px 16px', borderRadius: 11, border: 'none',
            background: prompt.trim().length >= 8 ? ACCENT : '#cbd5e1', color: '#fff',
            fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
            cursor: writing || prompt.trim().length < 8 ? 'default' : 'pointer',
          }}>
            {writing ? <Loader size={14} className="spin" /> : <Sparkles size={14} />}
            {writing ? 'Building…' : 'Build it'}
          </button>

          <p style={{ margin: '8px 0 0', fontSize: 10.5, color: MUTED, lineHeight: 1.5 }}>
            {/* Said before they press it, not after. */}
            It arrives switched off. Nothing reaches anybody until you read it and switch it on.
          </p>
        </section>

        <section style={{
          background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 15,
        }}>
          <h3 style={{ margin: '0 0 9px', fontSize: 12.5, fontWeight: 800, color: INK }}>Things to ask for</h3>
          <div style={{ display: 'grid', gap: 6 }}>
            {QUICK_PROMPTS.map(q => (
              <button key={q} onClick={() => setPrompt(q)} className="press" style={{
                textAlign: 'left', padding: '8px 10px', borderRadius: 10, border: `1px solid ${LINE}`,
                background: '#fbfbfc', fontSize: 11.5, color: INK, cursor: 'pointer',
                fontFamily: 'inherit', lineHeight: 1.45,
              }}>{q}</button>
            ))}
          </div>
          <p style={{ margin: '9px 0 0', fontSize: 10.5, color: MUTED, lineHeight: 1.5 }}>
            {/* They fill the box rather than building on click: a one-click
                template teaches nothing about what a usable instruction is. */}
            These fill the box above so you can change them before it builds anything.
          </p>
        </section>

        {/* What this workspace has actually used, rather than invented credits. */}
        {hub && (
          <section style={{
            background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 15,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 7 }}>
              <h3 style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: INK }}>Instructions today</h3>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 12, fontWeight: 800, color: INK }}>
                {hub.instructions.used} / {hub.instructions.cap}
              </span>
            </div>
            <div style={{ height: 5, borderRadius: 999, background: '#eef0f4', overflow: 'hidden' }}>
              <div style={{
                width: `${hub.instructions.cap > 0 ? Math.min(100, (hub.instructions.used / hub.instructions.cap) * 100) : 0}%`,
                height: '100%', borderRadius: 999,
                background: hub.instructions.used >= hub.instructions.cap ? '#b42318' : ACCENT,
              }} />
            </div>
            <p style={{ margin: '7px 0 0', fontSize: 10.5, color: MUTED, lineHeight: 1.5 }}>
              Typed instructions to a project, over the last twenty-four hours. Everything Autopilot does
              on its own is unaffected by this.
            </p>
          </section>
        )}

        {/* Running now, counted from real runs rather than asserted. */}
        <p style={{ margin: 0, fontSize: 11, color: MUTED, textAlign: 'center', lineHeight: 1.5 }}>
          {runningNow === 0
            ? 'Nobody is part-way through a workflow right now.'
            : `${runningNow} ${runningNow === 1 ? 'person is' : 'people are'} part-way through a workflow.`}
        </p>
      </aside>
    </div>
  );
}

function filterPill(on: boolean): React.CSSProperties {
  return {
    padding: '6px 13px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'inherit', border: `1px solid ${on ? INK : LINE}`,
    background: on ? INK : '#fff', color: on ? '#fff' : MUTED,
  };
}

function ghost(): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px',
    borderRadius: 999, border: `1px solid ${LINE}`, background: '#fff',
    fontSize: 11, fontWeight: 700, color: INK, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
  };
}
