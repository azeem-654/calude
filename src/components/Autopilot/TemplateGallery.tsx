/**
 * The AI Workflow Template Gallery.
 *
 * ── What this screen is for ──
 *
 * The loudest complaint about every tool in this category is not a missing
 * feature — it is being handed a canvas and left to work out what to put on it.
 * Agencies put the time to feel competent on the market leader at sixty to
 * ninety days. This screen exists so that somebody who has never built an
 * automation can find one that matches a problem they actually have, see
 * exactly what it does, and have it running in a couple of minutes.
 *
 * ── The three rules it is built on ──
 *
 * **Filed by the problem.** Not by app, not by department. Nobody arrives
 * thinking "I need a condition node"; they arrive thinking "people ring and we
 * miss it". So the shelves are jobs, the search covers the symptom, and the
 * line under each title is what goes wrong without it.
 *
 * **The whole workflow is on the row.** Drawn from the template's own `nodes` —
 * the same array the engine walks — so a preview cannot drift from what gets
 * added. Branches are drawn, labelled with what the fork means.
 *
 * **Every number is real.** The counts at the top are counted, and a template
 * that has never been used shows no usage badge rather than a zero or an
 * invented one. See the note on `STATS`.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Sparkles, PenLine, LayoutTemplate, Layers, Zap, Blocks, ArrowLeft,
} from 'lucide-react';
import TemplateRow from './TemplateRow';
import AiAssistantPanel from './AiAssistantPanel';
import TemplatePreviewModal from './TemplatePreviewModal';
import { CATEGORIES, TEMPLATES, type WorkflowTemplate } from './workflowTemplates';
import { difficultyOf, setupMinutes, usesAi } from './templateMeta';
import { buildWorkflow, saveWorkflow, templateUses } from '../../services/autopilot';
import { fetchBoard, type Project } from '../../services/projects';
import { T, ghostBtn, primaryBtn } from './theme';

type Sort = 'popular' | 'quickest' | 'simplest' | 'steps';

const SORTS: { key: Sort; label: string }[] = [
  { key: 'popular', label: 'Most useful first' },
  { key: 'quickest', label: 'Quickest to set up' },
  { key: 'simplest', label: 'Simplest first' },
  { key: 'steps', label: 'Most steps first' },
];

const RANK = { easy: 0, medium: 1, advanced: 2 } as const;

export default function TemplateGallery({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState<Sort>('popular');
  const [preview, setPreview] = useState<WorkflowTemplate | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [uses, setUses] = useState<Record<string, number>>({});
  const [adding, setAdding] = useState('');
  const [building, setBuilding] = useState(false);
  const [answer, setAnswer] = useState('');
  const [answerBad, setAnswerBad] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [board, counts] = await Promise.all([fetchBoard(), templateUses()]);
      if (!live) return;
      setProjects(board.projects);
      /* Pre-chosen when there is only one, because asking somebody to pick from
         a list of one is a question with no information in it. */
      if (board.projects.length === 1) setProjectId(board.projects[0].id);
      setUses(counts);
    })();
    return () => { live = false; };
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = TEMPLATES.filter(t => {
      if (category !== 'all' && t.category !== category) return false;
      if (!q) return true;
      return `${t.name} ${t.description} ${t.blurb} ${t.pain} ${t.keywords.join(' ')} ${t.industry.join(' ')}`
        .toLowerCase().includes(q);
    });

    return [...list].sort((a, b) => {
      if (sort === 'quickest') return setupMinutes(a.nodes) - setupMinutes(b.nodes);
      if (sort === 'simplest') return RANK[difficultyOf(a.nodes)] - RANK[difficultyOf(b.nodes)];
      if (sort === 'steps') return b.nodes.length - a.nodes.length;
      /* "Most useful first": the ones actually used here, then the featured
         ones, then the library's own order — which is already the order the
         research says pays. Real usage outranks our opinion the moment there
         is any. */
      const used = (uses[b.key] ?? 0) - (uses[a.key] ?? 0);
      if (used) return used;
      return Number(!!b.featured) - Number(!!a.featured);
    });
  }, [query, category, sort, uses]);

  /**
   * The counts at the top.
   *
   * Counted, not typed. A gallery is exactly the kind of screen where a round
   * number gets invented — "50,000+ happy users" on an install with one — and
   * the whole product rests on its numbers being checkable. If you want
   * different figures here, this is the one place to change them, and they stop
   * being true the moment you do.
   */
  const STATS = useMemo(() => {
    const ai = TEMPLATES.filter(t => usesAi(t.nodes)).length;
    const quick = TEMPLATES.filter(t => setupMinutes(t.nodes) <= 15).length;
    const usedHere = Object.values(uses).reduce((a, b) => a + b, 0);
    return [
      { icon: Blocks, value: String(TEMPLATES.length), label: 'Workflow templates', sub: 'Every one runs today' },
      { icon: Layers, value: String(CATEGORIES.length), label: 'Jobs covered', sub: 'Filed by the problem' },
      { icon: Sparkles, value: String(ai), label: 'AI-written', sub: 'Content written for you' },
      usedHere > 0
        ? { icon: Zap, value: String(usedHere), label: 'In use here', sub: 'Across your projects' }
        : { icon: Zap, value: String(quick), label: 'Under 15 minutes', sub: 'To set up from scratch' },
    ];
  }, [uses]);

  async function use(t: WorkflowTemplate) {
    if (!projectId) {
      setAnswerBad(true);
      setAnswer('Choose a project on the right first — a workflow belongs to one.');
      return;
    }
    setAdding(t.key);
    const r = await saveWorkflow(projectId, {
      name: t.name, description: t.description, status: 'draft', nodes: t.nodes,
    }, t.key);
    setAdding('');
    setPreview(null);
    setAnswerBad(!r.success);
    setAnswer(r.success
      ? `"${t.name}" added as a draft. Open the project to read it and switch it on.`
      : String(r.error ?? 'That could not be added.'));
    if (r.success) setUses(u => ({ ...u, [t.key]: (u[t.key] ?? 0) + 1 }));
  }

  async function build(text: string) {
    if (!projectId) return;
    setBuilding(true);
    setAnswer('');
    const r = await buildWorkflow(projectId, text);
    setBuilding(false);
    setAnswerBad(!r.ok);
    setAnswer(r.message);
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.ink }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: 'clamp(14px, 2.5vw, 26px)' }}>
        {/* ── Hero ── */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ minWidth: 0, flex: '1 1 420px' }}>
            <button onClick={onBack} style={{ ...ghostBtn, marginBottom: 10 }}>
              <ArrowLeft size={12} /> Back to projects
            </button>
            <h1 style={{
              margin: 0, fontSize: 'clamp(24px, 3.4vw, 34px)', fontWeight: 800,
              letterSpacing: '-0.03em', color: T.ink,
            }}>AI Workflow Template Gallery</h1>
            <p style={{ margin: '6px 0 0', fontSize: 13.5, color: T.muted, lineHeight: 1.6, maxWidth: 620 }}>
              Start from a workflow that already solves the problem, or describe yours and let the AI write
              it. Every template here runs today — and says what it needs before you add it.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 34 }}>
            <button onClick={() => navigate('/autopilot')} style={{ ...ghostBtn, padding: '10px 16px', borderRadius: 11 }}>
              <PenLine size={13} /> Create from Scratch
            </button>
            <button
              onClick={() => document.getElementById('ap-gallery-prompt')?.scrollIntoView({ block: 'center' })}
              className="press ap-btn" style={primaryBtn}>
              <Sparkles size={13} /> Build with AI
            </button>
          </div>
        </div>

        {/* ── The counts ── */}
        <div style={{
          display: 'grid', gap: 10, marginBottom: 16,
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))',
        }}>
          {STATS.map(s => (
            <div key={s.label} style={{
              display: 'flex', gap: 11, alignItems: 'center', padding: '13px 15px',
              background: '#fff', border: `1px solid ${T.line}`, borderRadius: 14,
              boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
            }}>
              <span style={{
                width: 34, height: 34, borderRadius: 11, flexShrink: 0,
                background: T.accentSoft, color: T.accent,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}><s.icon size={15} /></span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 17, fontWeight: 800, color: T.ink, lineHeight: 1.1 }}>
                  {s.value}
                </span>
                <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: T.ink, marginTop: 2 }}>
                  {s.label}
                </span>
                <span style={{ display: 'block', fontSize: 10.5, color: T.muted, marginTop: 1 }}>{s.sub}</span>
              </span>
            </div>
          ))}
        </div>

        {/* ── The gallery and the assistant ── */}
        <div style={{
          display: 'grid', gap: 16, alignItems: 'start',
          gridTemplateColumns: 'minmax(0, 1fr) 340px',
        }} className="ap-gallery">
          <div style={{ minWidth: 0, display: 'grid', gap: 12 }}>
            {/* Search and filters */}
            <div style={{
              background: '#fff', border: `1px solid ${T.line}`, borderRadius: 14, padding: 13,
              display: 'grid', gap: 10, boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
            }}>
              <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                <label style={{ position: 'relative', flex: '1 1 260px', minWidth: 0 }}>
                  <Search size={14} color={T.faint} style={{ position: 'absolute', left: 12, top: 11 }} />
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    aria-label="Search workflow templates"
                    placeholder="What goes wrong? e.g. missed calls, abandoned cart, no-shows"
                    style={{
                      width: '100%', boxSizing: 'border-box', padding: '10px 12px 10px 33px',
                      borderRadius: 10, border: `1px solid ${T.line}`, background: '#fff',
                      fontSize: 12.5, outline: 'none', fontFamily: 'inherit', color: T.ink,
                    }}
                  />
                </label>
                <select value={sort} onChange={e => setSort(e.target.value as Sort)}
                  aria-label="Sort templates" style={{
                    padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.line}`,
                    background: '#fff', color: T.ink, fontSize: 12.5, fontFamily: 'inherit',
                    outline: 'none', flexShrink: 0,
                  }}>
                  {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[{ key: 'all', label: 'All Templates' }, ...CATEGORIES].map(c => {
                  const on = category === c.key;
                  const n = c.key === 'all'
                    ? TEMPLATES.length
                    : TEMPLATES.filter(t => t.category === c.key).length;
                  return (
                    <button key={c.key} onClick={() => setCategory(c.key)} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '6px 13px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: 12, fontWeight: 700,
                      border: `1px solid ${on ? T.accent : T.line}`,
                      background: on ? T.accent : '#fff',
                      color: on ? '#fff' : T.muted,
                    }}>
                      {c.label}
                      <span style={{
                        fontSize: 10, fontWeight: 800, opacity: on ? 0.85 : 0.6,
                      }}>{n}</span>
                    </button>
                  );
                })}
              </div>

              {category !== 'all' && (
                <p style={{ margin: 0, fontSize: 11.5, color: T.muted, lineHeight: 1.55 }}>
                  {CATEGORIES.find(c => c.key === category)?.blurb}
                </p>
              )}
            </div>

            {/* The rows */}
            {!results.length ? (
              <div style={{
                background: '#fff', border: `1px solid ${T.line}`, borderRadius: 14,
                padding: '38px 20px', textAlign: 'center',
              }}>
                <span style={{
                  width: 42, height: 42, borderRadius: 13, background: T.accentSoft, color: T.accent,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 11,
                }}><LayoutTemplate size={19} /></span>
                <h3 style={{ margin: '0 0 5px', fontSize: 15, fontWeight: 800, color: T.ink }}>
                  Nothing here matches “{query}”
                </h3>
                <p style={{ margin: '0 auto', maxWidth: 420, fontSize: 12.5, color: T.muted, lineHeight: 1.6 }}>
                  Try a different word, or describe it to the assistant — it writes one for your client
                  rather than picking the nearest thing.
                </p>
              </div>
            ) : (
              <>
                <p style={{ margin: 0, fontSize: 11.5, color: T.muted }}>
                  {results.length} {results.length === 1 ? 'template' : 'templates'}
                  {category !== 'all' && ` in ${CATEGORIES.find(c => c.key === category)?.label}`}
                </p>
                {results.map(t => (
                  <TemplateRow
                    key={t.key}
                    template={t}
                    uses={uses[t.key] ?? null}
                    adding={adding}
                    onPreview={() => setPreview(t)}
                    onUse={() => void use(t)}
                    /* Customising is the same act as using, followed by opening
                       the editor on it — which is where every field already is. */
                    onCustomise={() => setPreview(t)}
                  />
                ))}
              </>
            )}
          </div>

          <div id="ap-gallery-prompt" style={{ position: 'sticky', top: 14, minWidth: 0 }}>
            <AiAssistantPanel
              projects={projects}
              projectId={projectId}
              onProject={setProjectId}
              onBuild={build}
              building={building}
              answer={answer}
              answerBad={answerBad}
            />
          </div>
        </div>
      </div>

      {preview && (
        <TemplatePreviewModal
          template={preview}
          adding={adding}
          projectName={projects.find(p => p.id === projectId)?.name ?? ''}
          onUse={() => void use(preview)}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
