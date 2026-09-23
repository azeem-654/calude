/**
 * Choosing how to make a workflow, before making one.
 *
 * ── The problem this is aimed at ──
 *
 * The single most consistent complaint about the big automation platforms is
 * not that they lack features — it is that you are handed a canvas and left to
 * work out what to build on it. Agencies on r/gohighlevel put the time to feel
 * competent at sixty to ninety days. n8n has some eleven thousand community
 * templates, which is not a library so much as a search problem.
 *
 * Three doors, then, and the middle one is the one most people should take:
 *
 *   **From a template** — a shelf of things a business like this already does
 *   by hand, filed by the job rather than by the feature.
 *   **Describe it** — for the case a template does not cover.
 *   **From scratch** — for somebody who already knows the shape they want.
 *
 * ── Why the preview is the point ──
 *
 * The lesson from every template gallery worth using: somebody has to be able
 * to see exactly what they are about to get, before they get it. So choosing a
 * template opens it — the whole graph drawn, the problem it solves, what has to
 * be connected for it to run, and what it is honest to expect — and *then*
 * offers the button. Nothing is added by browsing.
 *
 * ── What it refuses to do ──
 *
 * Dress the outcome up. Every template says what it needs before it is chosen
 * rather than after it has silently failed, and every expectation is a range
 * labelled an assumption. A template that texts on a workspace with no SMS
 * provider says so on the preview, not in a delivery log a week later.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, Search, Sparkles, PenLine, LayoutTemplate, ChevronRight, ChevronLeft,
  Check, AlertTriangle, Loader, Zap, Info,
} from 'lucide-react';
import WorkflowCanvas from './WorkflowCanvas';
import { CATEGORIES, TEMPLATES, type WorkflowTemplate } from './workflowTemplates';
import { lookFor } from './workflowNodes';
import { DIFFICULTY_LABEL, difficultyOf, outputsOf, setupMinutes } from './templateMeta';
import { T, ghostBtn, primaryBtn } from './theme';

type Route = 'pick' | 'library' | 'preview';

export default function WorkflowWizard({
  projectName, onScratch, onDescribe, onUseTemplate, onClose, adding,
}: {
  projectName: string;
  onScratch: () => void;
  /** Sends them to the AI column with the box focused. */
  onDescribe: () => void;
  onUseTemplate: (key: string) => void;
  onClose: () => void;
  /** The key currently being saved, so the button can say so. */
  adding: string;
}) {
  const navigate = useNavigate();
  const [route, setRoute] = useState<Route>('pick');
  const [category, setCategory] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<WorkflowTemplate | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TEMPLATES.filter(t => {
      if (category !== 'all' && t.category !== category) return false;
      if (!q) return true;
      /* Searched across the problem and the keywords as well as the name.
         Somebody types "missed calls"; the template is called "Text back a
         call nobody answered" and its blurb says `missed-call` with a hyphen,
         so name-and-copy alone returns nothing for the most obvious phrase in
         the whole category. */
      return `${t.name} ${t.blurb} ${t.pain} ${t.description} ${t.keywords.join(' ')}`
        .toLowerCase().includes(q);
    });
  }, [category, query]);

  const shelf = (key: string) => CATEGORIES.find(c => c.key === key);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add a workflow"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(15,17,23,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div style={{
        width: 'min(1040px, 100%)', maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        background: T.panel, borderRadius: 18, overflow: 'hidden',
        boxShadow: '0 24px 70px -20px rgba(16,24,40,0.45)',
      }}>
        {/* ── Header ── */}
        <header style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
          borderBottom: `1px solid ${T.line}`, flexShrink: 0,
        }}>
          {route !== 'pick' && (
            <button onClick={() => { setRoute(route === 'preview' ? 'library' : 'pick'); setPicked(null); }}
              aria-label="Back" style={{ ...ghostBtn, padding: '6px 10px' }}>
              <ChevronLeft size={13} /> Back
            </button>
          )}
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, color: T.ink }}>
              {route === 'preview' && picked ? picked.name : 'Add a workflow'}
            </span>
            <span style={{ display: 'block', fontSize: 11.5, color: T.muted, marginTop: 1 }}>
              {route === 'preview' && picked
                ? shelf(picked.category)?.label ?? ''
                : `For ${projectName}. Nothing is switched on by adding it.`}
            </span>
          </span>
          <button onClick={onClose} aria-label="Close" style={{
            border: 'none', background: 'none', padding: 4, cursor: 'pointer', color: T.muted, display: 'flex',
          }}><X size={17} /></button>
        </header>

        <div style={{ overflowY: 'auto', padding: 16, flex: 1, minHeight: 0 }}>
          {/* ── Door one: how ── */}
          {route === 'pick' && (
            <div style={{ display: 'grid', gap: 11 }}>
              <Door
                icon={LayoutTemplate}
                title="Start from a template"
                sub="Recommended"
                body={`${TEMPLATES.length} workflows a business like this already does by hand — answering an enquiry fast, chasing a quote, asking for a review. Read the whole thing before you add it.`}
                onClick={() => setRoute('library')}
                primary
              />
              <Door
                icon={Sparkles}
                title="Describe it and let the AI write it"
                body={`Say what you want in a sentence and it writes the steps for ${projectName}, in this client's voice. It arrives as a draft like everything else.`}
                onClick={onDescribe}
              />
              <Door
                icon={Search}
                title="Browse the full gallery"
                body={`Every template with its whole workflow drawn, filed by the problem it solves, beside the assistant. Opens the ${TEMPLATES.length}-template gallery.`}
                onClick={() => navigate('/autopilot?view=templates')}
              />
              <Door
                icon={PenLine}
                title="Build it from scratch"
                body="An empty workflow with a trigger, and the step editor. For when you already know the shape you want."
                onClick={onScratch}
              />
            </div>
          )}

          {/* ── Door two: the library ── */}
          {route === 'library' && (
            <div style={{ display: 'grid', gap: 12 }}>
              <label style={{ position: 'relative', display: 'block' }}>
                <Search size={14} color={T.faint} style={{ position: 'absolute', left: 12, top: 11 }} />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="What goes wrong? e.g. missed calls, quotes nobody chased"
                  aria-label="Search the template library"
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '10px 12px 10px 33px',
                    borderRadius: 10, border: `1px solid ${T.line}`, background: '#fff',
                    fontSize: 12.5, outline: 'none', fontFamily: 'inherit', color: T.ink,
                  }}
                />
              </label>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[{ key: 'all', label: 'Everything' }, ...CATEGORIES].map(c => {
                  const on = category === c.key;
                  return (
                    <button key={c.key} onClick={() => setCategory(c.key)} style={{
                      padding: '5px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: 11.5, fontWeight: 700,
                      border: `1px solid ${on ? T.accent : T.line}`,
                      background: on ? T.accentSoft : '#fff',
                      color: on ? T.accent : T.muted,
                    }}>{c.label}</button>
                  );
                })}
              </div>

              {category !== 'all' && (
                <p style={{ margin: 0, fontSize: 11.5, color: T.muted, lineHeight: 1.55 }}>
                  {shelf(category)?.blurb}
                </p>
              )}

              {!results.length ? (
                <p style={{ margin: 0, padding: '26px 4px', fontSize: 12.5, color: T.muted, textAlign: 'center', lineHeight: 1.6 }}>
                  Nothing here matches “{query}”. Try a different word, or describe it to the AI instead —
                  it writes one for this client rather than picking the nearest thing.
                </p>
              ) : (
                <div style={{
                  display: 'grid', gap: 9,
                  gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))',
                }}>
                  {results.map(t => (
                    <button key={t.key} onClick={() => { setPicked(t); setRoute('preview'); }}
                      className="press" style={{
                        display: 'flex', flexDirection: 'column', gap: 5, textAlign: 'left',
                        padding: '12px 13px', border: `1px solid ${T.line}`, borderRadius: 13,
                        background: T.raised, cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: T.ink, flex: 1, minWidth: 0 }}>
                          {t.name}
                        </span>
                        <ChevronRight size={13} color={T.faint} style={{ flexShrink: 0 }} />
                      </span>
                      {/* The problem, not the feature. Somebody scanning a
                          library recognises their own complaint faster than
                          they recognise a mechanism. */}
                      <span style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>{t.pain}</span>
                      <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 2, alignItems: 'center' }}>
                        {t.nodes.slice(0, 5).map(node => {
                          const look = lookFor(node.type);
                          const Ic = look.icon;
                          return (
                            <span key={node.id} title={node.label} style={{
                              width: 19, height: 19, borderRadius: 6, flexShrink: 0,
                              background: T.lineSoft, color: T.muted,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            }}><Ic size={10} /></span>
                          );
                        })}
                        {/* The same derivation the gallery shows, so the two
                            screens cannot disagree about how hard a template is
                            or how long it takes. */}
                        <span style={{ fontSize: 10, color: T.faint }}>
                          {t.nodes.length} steps · {DIFFICULTY_LABEL[difficultyOf(t.nodes)]} · {setupMinutes(t.nodes)} min
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Door three: the preview ── */}
          {route === 'preview' && picked && (
            <div style={{ display: 'grid', gap: 14 }}>
              <p style={{ margin: 0, fontSize: 13, color: T.ink, lineHeight: 1.6 }}>{picked.blurb}</p>

              {/* The whole graph, drawn exactly as it will be on the card.
                  Not a screenshot and not a summary: the same component, so a
                  preview cannot drift from what is added. */}
              <div style={{
                border: `1px solid ${T.line}`, borderRadius: 13, padding: 12, background: T.raised,
              }}>
                <span style={{
                  display: 'block', fontSize: 10.5, fontWeight: 800, color: T.muted,
                  letterSpacing: '0.03em', marginBottom: 9,
                }}>THE WHOLE WORKFLOW</span>
                <WorkflowCanvas nodes={picked.nodes} live={false} />
              </div>

              <Panel icon={AlertTriangle} tone="warn" title="What it needs before it can run">
                <ul style={{ margin: 0, paddingLeft: 17, display: 'grid', gap: 3 }}>
                  {picked.needs.map(x => <li key={x} style={{ fontSize: 12, lineHeight: 1.55 }}>{x}</li>)}
                </ul>
              </Panel>

              <Panel icon={Zap} tone="plain" title="What comes out of it">
                <ul style={{ margin: 0, paddingLeft: 17, display: 'grid', gap: 3 }}>
                  {outputsOf(picked.nodes).map(x => (
                    <li key={x} style={{ fontSize: 12, lineHeight: 1.55 }}>{x}</li>
                  ))}
                </ul>
              </Panel>

              <Panel icon={Zap} tone="plain" title="What it is reasonable to expect">
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>{picked.outcome}</p>
              </Panel>

              {picked.evidence && (
                <Panel icon={Info} tone="plain" title="What the industry says">
                  <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>{picked.evidence.claim}</p>
                  {/* The source travels with the number, always. All of these
                      are vendor or agency published rather than independent
                      research, and a figure with no source attached would be
                      this product vouching for somebody else's marketing. */}
                  <p style={{ margin: '5px 0 0', fontSize: 10.5, color: T.faint }}>
                    {picked.evidence.source} — published by the industry, not measured by us.
                  </p>
                </Panel>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        {route === 'preview' && picked && (
          <footer style={{
            display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap',
            padding: '12px 16px', borderTop: `1px solid ${T.line}`, flexShrink: 0,
          }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
              It arrives switched off and every step is yours to change. Nothing reaches anybody until you
              read it and switch it on.
            </span>
            <button onClick={() => setRoute('library')} style={ghostBtn}>Keep looking</button>
            <button
              onClick={() => onUseTemplate(picked.key)}
              disabled={!!adding}
              className="press ap-btn"
              style={{ ...primaryBtn, opacity: adding ? 0.7 : 1 }}
            >
              {adding === picked.key
                ? <><Loader size={13} className="spin" /> Adding…</>
                : <><Check size={13} /> Add it to this project</>}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

/** One of the three ways in. */
function Door({ icon: Icon, title, sub, body, onClick, primary }: {
  icon: typeof Sparkles;
  title: string;
  sub?: string;
  body: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button onClick={onClick} className="press" style={{
      display: 'flex', gap: 12, alignItems: 'flex-start', textAlign: 'left', width: '100%',
      padding: '14px 15px', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
      border: `1px solid ${primary ? T.accent : T.line}`,
      background: primary ? T.accentSoft : T.raised,
    }}>
      <span style={{
        width: 34, height: 34, borderRadius: 11, flexShrink: 0,
        background: primary ? T.accent : '#fff', color: primary ? '#fff' : T.accent,
        border: primary ? 'none' : `1px solid ${T.line}`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}><Icon size={16} /></span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 800, color: T.ink }}>{title}</span>
          {sub && (
            <span style={{
              padding: '1px 8px', borderRadius: 999, fontSize: 9.5, fontWeight: 800,
              background: T.accent, color: '#fff',
            }}>{sub}</span>
          )}
        </span>
        <span style={{ display: 'block', fontSize: 11.5, color: T.muted, marginTop: 3, lineHeight: 1.55 }}>
          {body}
        </span>
      </span>
      <ChevronRight size={15} color={T.faint} style={{ flexShrink: 0, marginTop: 9 }} />
    </button>
  );
}

/** A labelled block on the preview. */
function Panel({ icon: Icon, title, tone, children }: {
  icon: typeof Info;
  title: string;
  tone: 'warn' | 'plain';
  children: React.ReactNode;
}) {
  const warn = tone === 'warn';
  return (
    <div style={{
      border: `1px solid ${warn ? `${T.warn}44` : T.line}`, borderRadius: 13, padding: '11px 13px',
      background: warn ? T.warnSoft : T.raised, color: T.ink,
    }}>
      <span style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
        fontSize: 11.5, fontWeight: 800, color: warn ? T.warn : T.ink,
      }}>
        <Icon size={12} /> {title}
      </span>
      {children}
    </div>
  );
}
