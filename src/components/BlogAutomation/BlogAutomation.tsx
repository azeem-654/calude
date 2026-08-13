import { useMemo, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, Globe, Plus, Search, Sparkles, Target, Trash2,
} from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import {
  deleteProject, emptyProject, loadProjects, portfolioChars, readiness,
  takeSaveError, upsertProject,
} from '../../services/blogAutomation';
import type { BlogProject } from '../../types/blogAutomation';
import PortfolioIntake from './PortfolioIntake';
import ProfileReview from './ProfileReview';
import MonthPlanner from './MonthPlanner';
import WriteDesk from './WriteDesk';

/**
 * Blog Automation — the shell.
 *
 * The module exists to get the customer's own site ranking, so the shell leads
 * with that rather than with a content count: what the project is for, how
 * ready it is to start ranking for anything, and the one thing still missing.
 *
 * Parts 1 and 2 cover the front half: take a portfolio in, read a ranking
 * strategy out of it, let a human correct it, and plan a month around it. The
 * writing, the images and the publishing are Parts 3 to 5, and the empty states
 * say so rather than pretending they are coming today.
 */

const INK = '#17191c';
const MUTED = '#6b7480';
const LINE = '#e3e6eb';
const PLANE = '#eef0f4';
const LIME = '#c7f441';
const ON_LIME = '#0e1117';
const LIME_EDGE = '#a8d327';

type View = 'list' | 'intake' | 'profile' | 'plan' | 'write';

export default function BlogAutomation() {
  const { addNotification } = useApp();
  const [version, setVersion] = useState(0);
  const [view, setView] = useState<View>('list');
  const [openId, setOpenId] = useState('');
  const [newName, setNewName] = useState('');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const projects = useMemo(() => loadProjects(), [version]);
  const current = projects.find(p => p.id === openId);

  const bump = () => setVersion(v => v + 1);

  function persist(next: BlogProject, message?: string) {
    if (!upsertProject(next)) {
      addNotification(takeSaveError() || 'That could not be saved.', 'error');
      return false;
    }
    bump();
    if (message) addNotification(message, 'success');
    return true;
  }

  function create() {
    const name = newName.trim();
    if (!name) { addNotification('Give the project a name first.', 'error'); return; }
    const project = emptyProject(name);
    if (persist(project, `Project "${project.name}" created`)) {
      setNewName('');
      setOpenId(project.id);
      setView('intake');
    }
  }

  function remove(p: BlogProject) {
    if (!window.confirm(`Delete "${p.name}" and everything in it?`)) return;
    if (!deleteProject(p.id)) {
      addNotification(takeSaveError() || 'That could not be deleted.', 'error');
      return;
    }
    if (openId === p.id) { setOpenId(''); setView('list'); }
    bump();
    addNotification('Project deleted');
  }

  /* ── A project is open ── */
  if (current && view !== 'list') {
    return (
      <div style={{ minHeight: '100vh' }}>
        <Header title="Blog Automation" subtitle="Rank the customer's own pages" />
        <div style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <button onClick={() => { setView('list'); setOpenId(''); }} className="press" style={ghost()}>
              ← All projects
            </button>
            <span style={{ fontSize: 18, fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>{current.name}</span>
            <span style={{ flex: 1 }} />
            {([['intake', 'Portfolio'], ['profile', 'Ranking strategy'], ['plan', 'Month plan'], ['write', 'Write']] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className="press"
                style={view === v ? primary() : ghost()}
              >
                {label}
              </button>
            ))}
          </div>

          {view === 'intake' && (
            <PortfolioIntake
              project={current}
              onChange={next => persist(next)}
              onDistilled={next => { persist(next, 'Strategy built from the portfolio'); setView('profile'); }}
            />
          )}
          {view === 'profile' && (
            <ProfileReview project={current} onChange={next => persist({ ...next, edited: true })} />
          )}
          {view === 'plan' && <MonthPlanner project={current} />}
          {view === 'write' && <WriteDesk project={current} />}
        </div>
      </div>
    );
  }

  /* ── The list ── */
  return (
    <div style={{ minHeight: '100vh' }}>
      <Header title="Blog Automation" subtitle="Rank the customer's own pages" />
      <div style={{ padding: 28 }}>

        <div style={{
          backgroundColor: PLANE, borderRadius: 26, border: `1px solid ${LINE}`, padding: 22, marginBottom: 18,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
            <Target size={16} color={INK} />
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: INK, letterSpacing: '-0.025em' }}>
              Blogs that make the site rank
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.6, maxWidth: 720 }}>
            Give it the writing you already have. It reads out what you sell, who you sell to, and the
            search terms worth chasing — grouped into clusters, each pointed at a page that has to earn.
            Then it plans a month of posts around them, writes them, and publishes them to your domain.
            Every draft is yours to edit before anything is published.
          </p>

          <div style={{ display: 'flex', gap: 9, marginTop: 16, flexWrap: 'wrap' }}>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') create(); }}
              placeholder="Project name — usually the client or the site"
              aria-label="New project name"
              style={{
                flex: '1 1 280px', minWidth: 220, padding: '11px 15px', borderRadius: 999,
                border: `1px solid ${LINE}`, backgroundColor: '#fff', fontSize: 13,
                color: INK, outline: 'none', fontFamily: 'inherit',
              }}
            />
            <button onClick={create} className="press" style={primary()}>
              <Plus size={14} /> New project
            </button>
          </div>
        </div>

        {projects.length === 0 ? (
          <div style={{
            backgroundColor: '#fff', borderRadius: 22, border: `1px dashed ${LINE}`,
            padding: '46px 26px', textAlign: 'center',
          }}>
            <span style={{
              width: 54, height: 54, borderRadius: 18, backgroundColor: INK, color: LIME,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
            }}>
              <Search size={24} />
            </span>
            <h3 style={{ margin: '0 0 7px', fontSize: 17, fontWeight: 800, color: INK }}>
              Nothing to rank yet
            </h3>
            <p style={{ margin: '0 auto', maxWidth: 460, fontSize: 13, color: MUTED, lineHeight: 1.65 }}>
              Start a project for the site you want ranking, then paste in a few hundred words you have
              already written — an about page, a service page, an old post. That is enough to read a
              voice and a keyword strategy from.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
            {projects.map((p, i) => {
              const r = readiness(p);
              const chars = portfolioChars(p.portfolio);
              return (
                <article
                  key={p.id}
                  className="tilt-card rail-in"
                  style={{
                    ['--i' as string]: i,
                    backgroundColor: '#fff', borderRadius: 22, border: `1px solid ${LINE}`, padding: 18,
                    display: 'flex', flexDirection: 'column', gap: 11,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{
                        margin: 0, fontSize: 16, fontWeight: 800, color: INK, letterSpacing: '-0.02em',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{p.name}</h3>
                      <p style={{ margin: '3px 0 0', fontSize: 11, color: MUTED }}>
                        {p.domain
                          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Globe size={11} />{p.domain}</span>
                          : 'No domain set'}
                      </p>
                    </div>
                    <button
                      onClick={() => remove(p)}
                      aria-label={`Delete ${p.name}`}
                      className="press"
                      style={{
                        width: 28, height: 28, borderRadius: 999, border: `1px solid ${LINE}`,
                        backgroundColor: '#fff', color: '#c2410c', cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 14, fontSize: 11, color: MUTED, flexWrap: 'wrap' }}>
                    <span><strong style={{ color: INK }}>{p.clusters.length}</strong> clusters</span>
                    <span><strong style={{ color: INK }}>{p.clusters.reduce((n, c) => n + c.keywords.length, 0)}</strong> keywords</span>
                    <span><strong style={{ color: INK }}>{p.moneyPages.length}</strong> pages to rank</span>
                    <span><strong style={{ color: INK }}>{(chars / 1000).toFixed(1)}k</strong> chars read</span>
                  </div>

                  {/* Readiness as a checklist with a next step, not a bare number. */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: MUTED, marginBottom: 5 }}>
                      <span>Ready to plan</span>
                      <span style={{ fontWeight: 800, color: INK }}>{r.percent}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, backgroundColor: '#e6e9ee', overflow: 'hidden' }}>
                      <div className="bar-grow" style={{
                        width: `${Math.max(r.percent, 2)}%`, height: '100%',
                        borderRadius: 999, backgroundColor: '#65a30d',
                      }} />
                    </div>
                    <p style={{ margin: '7px 0 0', fontSize: 11, color: MUTED, lineHeight: 1.5 }}>{r.next}</p>
                  </div>

                  <div style={{ marginTop: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => { setOpenId(p.id); setView('intake'); }} className="press" style={primary()}>
                      {p.portfolio.length ? 'Portfolio' : 'Add portfolio'} <ArrowRight size={13} />
                    </button>
                    {p.clusters.length > 0 && (
                      <>
                        <button onClick={() => { setOpenId(p.id); setView('profile'); }} className="press" style={ghost()}>
                          Strategy <ArrowUpRight size={12} />
                        </button>
                        <button onClick={() => { setOpenId(p.id); setView('plan'); }} className="press" style={ghost()}>
                          Plan <ArrowUpRight size={12} />
                        </button>
                        <button onClick={() => { setOpenId(p.id); setView('write'); }} className="press" style={ghost()}>
                          Write <ArrowUpRight size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* What this part does and does not do yet — said plainly. */}
        <div style={{
          marginTop: 18, padding: '14px 18px', borderRadius: 18,
          backgroundColor: '#fff', border: `1px solid ${LINE}`,
        }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: INK, display: 'flex', alignItems: 'center', gap: 7 }}>
            <Sparkles size={13} /> What works today
          </p>
          <p style={{ margin: '5px 0 0', fontSize: 11.5, color: MUTED, lineHeight: 1.65 }}>
            Portfolio intake, the ranking strategy, a month planned around it — one post per keyword,
            pillars before the posts that link to them, every post pointed at a page that earns — and
            now the writing: every post drafted, measured against nine on-page SEO checks, and fully
            editable before it goes anywhere. Images and publishing to your domain are the last two
            parts, and nothing here pretends otherwise.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Buttons ── */

function primary(): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 17px',
    borderRadius: 999, border: `1px solid ${LIME_EDGE}`, backgroundColor: LIME,
    color: ON_LIME, fontSize: 12, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
  };
}

function ghost(): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px',
    borderRadius: 999, border: `1px solid ${LINE}`, backgroundColor: '#fff',
    color: INK, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  };
}
