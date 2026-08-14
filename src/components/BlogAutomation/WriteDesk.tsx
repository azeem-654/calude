import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Check, Code2, Eye, FileText, Image as ImageIcon, Loader2, Pencil,
  RefreshCw, Search, Sparkles, Square, X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { monthKey, monthLabel, planFor, takePlanSaveError, upsertPlan } from '../../services/blogPlanner';
import {
  cancelJob, jobForPlan, jobProgress, startJob, takeJobSaveError, upsertJob, writeNextPost,
} from '../../services/blogWriteJob';
import { remeasure, sanitizeHtml, writeWithAI } from '../../services/blogWriter';
import { coverOf, makeCover, planImageStats, readableBytes } from '../../services/blogImages';
import ImagePanel from './ImagePanel';
import type { BlogProject, MonthPlan, PlannedPost, WriteJob } from '../../types/blogAutomation';

/**
 * Where the month gets written, and argued with.
 *
 * Two rules shape this screen. Nothing is ever locked: every article is
 * editable as rendered text or as HTML, and an edit re-runs the SEO checks
 * against what is now there rather than what the generator meant to write. And
 * nothing is ever hidden: a draft the model downgraded, a check that failed, a
 * post that errored — all of it is on screen with the reason, because a month
 * of articles you cannot see inside is a month you cannot trust to publish.
 *
 * The run itself is one post per pass against a stored job, so closing the tab
 * halfway through costs nothing and reopening carries on where it stopped.
 */

const INK = '#17191c';
const MUTED = '#6b7480';
const LINE = '#e3e6eb';
const PLANE = '#eef0f4';
const LIME = '#c7f441';
const ON_LIME = '#0e1117';
const LIME_EDGE = '#a8d327';
const GOOD = '#0ca30c';
const WARN = '#fab219';
const BAD = '#d03b3b';

interface Props {
  project: BlogProject;
}

type Mode = 'read' | 'edit' | 'html';

export default function WriteDesk({ project }: Props) {
  const { addNotification } = useApp();
  const [version, setVersion] = useState(0);
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [openId, setOpenId] = useState('');
  const [mode, setMode] = useState<Mode>('read');
  const [draft, setDraft] = useState('');
  const [busyPost, setBusyPost] = useState('');
  /* The plan this session is actively writing, so switching month shows that
     month's progress rather than borrowing the running one's controls. */
  const [runningPlanId, setRunningPlanId] = useState('');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => planFor(project.id, month), [project.id, month, version]);
  const planId = plan?.id;
  /* Storage is the single source of truth for the job, so an interrupted run
     reappears intact on the next visit without an effect to rehydrate it. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const job = useMemo(() => (planId ? jobForPlan(planId) ?? null : null), [planId, version]);

  // The cancel flag. The loop reads the ref rather than `isRunning` because a
  // pass is already in flight when Stop is pressed and a state value captured
  // at the top of that pass would still say "running" — so the queue would
  // drain to the end before noticing. The state beside it exists only so the
  // buttons re-render; the ref is what actually stops the loop.
  const running = useRef(false);
  const setRunning = (on: boolean, forPlan = '') => { running.current = on; setRunningPlanId(on ? forPlan : ''); };

  const bump = () => setVersion(v => v + 1);

  const posts = plan?.posts ?? [];
  const written = posts.filter(p => p.article).length;

  function persistPlan(next: MonthPlan, message?: string) {
    if (!upsertPlan(next)) {
      addNotification(takePlanSaveError() || 'The plan could not be saved.', 'error');
      return false;
    }
    bump();
    if (message) addNotification(message, 'success');
    return true;
  }

  function persistJob(next: WriteJob) {
    if (!upsertJob(next)) addNotification(takeJobSaveError() || 'The job could not be saved.', 'error');
    bump();
  }

  /* ── The run ── */

  async function drive(initial: WriteJob) {
    setRunning(true, initial.planId);
    let current = initial;
    persistJob(current);

    while (running.current && current.status === 'running' && current.queue.length) {
      const result = await writeNextPost(current, project);
      current = result.job;
      persistJob(current);
      if (result.saveError) addNotification(result.saveError, 'error');
      if (result.error) {
        addNotification(`"${result.post?.title ?? 'A post'}" could not be written: ${result.error}`, 'error');
      }
    }

    setRunning(false);
    if (current.status === 'done') {
      const p = jobProgress(current);
      addNotification(
        p.failed
          ? `${p.written} written, ${p.failed} failed. The failures are listed below and can be retried on their own.`
          : `${p.written} article${p.written === 1 ? '' : 's'} written for ${monthLabel(month)}`,
        p.failed ? 'info' : 'success',
      );
    }
  }

  function writeAll() {
    if (!plan) return;
    if (plan.status !== 'approved') {
      addNotification('Approve the plan first — writing a month nobody read is the expensive mistake.', 'error');
      return;
    }
    const next = startJob(plan);
    if (!next.queue.length) {
      addNotification('Every post in this plan is already written. Rewrite one from its own card.', 'info');
      return;
    }
    void drive(next);
  }

  function retryFailures() {
    if (!plan || !job?.failed.length) return;
    void drive(startJob(plan, job.failed.map(f => f.postId)));
  }

  function stop() {
    setRunning(false);
    if (job) persistJob(cancelJob(job));
    addNotification('Stopped. Everything written so far is saved.', 'info');
  }

  /* ── One post ── */

  async function writeOne(post: PlannedPost) {
    if (post.article?.edited && !window.confirm(
      `"${post.title}" has been edited by hand. Rewriting replaces those edits. Continue?`,
    )) return;

    setBusyPost(post.id);
    try {
      const article = await writeWithAI(post, project);
      if (!plan) return;
      persistPlan({
        ...plan,
        posts: plan.posts.map(p => (p.id === post.id ? { ...p, article, status: 'written' as const } : p)),
      });
      if (article.note) addNotification(article.note, 'info');
    } catch (err) {
      addNotification(`That post could not be written: ${err instanceof Error ? err.message : 'unknown error'}`, 'error');
    } finally {
      setBusyPost('');
    }
  }

  /**
   * Save a hand edit.
   *
   * The edited HTML goes through the same sanitiser as model output — a person
   * pasting from a page they were reading can bring a script tag with them
   * without meaning to — and then the checks are re-run so they describe the
   * article as it now stands.
   */
  function saveEdit(post: PlannedPost) {
    if (!plan || !post.article) return;
    const clean = sanitizeHtml(draft);
    const next = remeasure({ ...post.article, html: clean }, post, project);
    if (persistPlan(
      { ...plan, posts: plan.posts.map(p => (p.id === post.id ? { ...p, article: next } : p)) },
      'Saved — the checks have been re-run on what is now there',
    )) {
      setMode('read');
    }
  }

  /** Persist one post's article — used by the image panel for every change. */
  function saveArticle(postId: string, article: Parameters<typeof remeasure>[0], message?: string) {
    if (!plan) return;
    persistPlan(
      { ...plan, posts: plan.posts.map(p => (p.id === postId ? { ...p, article } : p)) },
      message,
    );
  }

  /**
   * A cover for every written post that has none.
   *
   * Covers are cheap to draw and the alternative is doing it twenty times by
   * hand, but posts that already have one — including uploaded photographs —
   * are left completely alone.
   */
  function coverTheMonth() {
    if (!plan) return;
    const targets = plan.posts.filter(p => p.article && !coverOf(p.article));
    if (!targets.length) {
      addNotification('Every written post already has a cover.', 'info');
      return;
    }
    try {
      const made = new Map(targets.map(p => [p.id, makeCover(p, project, 'editorial')]));
      persistPlan(
        {
          ...plan,
          posts: plan.posts.map(p => {
            const img = made.get(p.id);
            return img && p.article
              ? { ...p, article: { ...p.article, images: [img, ...(p.article.images ?? [])] } }
              : p;
          }),
        },
        `${targets.length} cover${targets.length === 1 ? '' : 's'} drawn`,
      );
    } catch (err) {
      addNotification(err instanceof Error ? err.message : 'The covers could not be drawn.', 'error');
    }
  }

  function openPost(post: PlannedPost, next: Mode) {
    setOpenId(post.id);
    setMode(next);
    if (next !== 'read') setDraft(post.article?.html ?? '');
  }

  /* ── Render ── */

  const isRunning = !!planId && runningPlanId === planId;
  const imageStats = plan ? planImageStats(plan) : null;
  const progress = job ? jobProgress(job) : null;
  /* A job still marked running that this session is not driving was interrupted
     — a closed tab, a refresh — and can be picked up where it stopped. */
  const interrupted = !!job && job.status === 'running' && !isRunning && job.queue.length > 0;

  return (
    <div style={{ display: 'grid', gap: 14 }}>

      {/* The bar: what month, how much of it exists, and the one big action. */}
      <section style={{ backgroundColor: PLANE, borderRadius: 24, border: `1px solid ${LINE}`, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <FileText size={16} color={INK} />
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>
            Write the month
          </h3>
          <input
            type="month"
            value={month}
            onChange={e => { setMonth(e.target.value || monthKey(new Date())); setOpenId(''); }}
            aria-label="Month to write"
            style={{
              padding: '8px 12px', borderRadius: 999, border: `1px solid ${LINE}`,
              backgroundColor: '#fff', fontSize: 12, color: INK, fontFamily: 'inherit', outline: 'none',
            }}
          />
          <span style={{ flex: 1 }} />
          {!isRunning && written > 0 && (
            <button onClick={coverTheMonth} className="press" style={ghost()}>
              <ImageIcon size={12} /> Cover every post
            </button>
          )}
          {isRunning ? (
            <button onClick={stop} className="press" style={{ ...ghost(), color: BAD }}>
              <Square size={12} /> Stop
            </button>
          ) : (
            <button onClick={writeAll} disabled={!plan} className="press" style={{ ...primary(), opacity: plan ? 1 : 0.5 }}>
              <Sparkles size={13} /> {written ? 'Write what is left' : 'Write every post'}
            </button>
          )}
        </div>

        {!plan ? (
          <p style={{ margin: '12px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
            There is no plan for {monthLabel(month)} yet. Build one in the Month plan tab first — the
            writer works from the plan's keywords, outlines and internal links, so there is nothing to
            write from until it exists.
          </p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: MUTED, flexWrap: 'wrap' }}>
              <span><strong style={{ color: INK }}>{posts.length}</strong> posts planned</span>
              <span><strong style={{ color: INK }}>{written}</strong> written</span>
              <span><strong style={{ color: INK }}>{posts.length - written}</strong> still to write</span>
              <span><strong style={{ color: INK }}>{imageStats?.withCover ?? 0}</strong> with a cover</span>
              {!!imageStats?.totalBytes && (
                <span><strong style={{ color: INK }}>{readableBytes(imageStats.totalBytes)}</strong> of pictures</span>
              )}
              {!!imageStats?.missingAlt && (
                <span style={{ color: BAD, fontWeight: 700 }}>{imageStats.missingAlt} image without alt text</span>
              )}
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                color: plan.status === 'approved' ? GOOD : WARN, fontWeight: 700,
              }}>
                {plan.status === 'approved' ? <Check size={12} /> : <AlertTriangle size={12} />}
                {plan.status === 'approved' ? 'Plan approved' : 'Plan not approved yet'}
              </span>
            </div>

            {progress && progress.total > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: MUTED, marginBottom: 5 }}>
                  <span>
                    {isRunning
                      ? `Writing ${progress.written + progress.failed + 1} of ${progress.total}…`
                      : `${progress.written} written${progress.failed ? `, ${progress.failed} failed` : ''}`}
                  </span>
                  <span style={{ fontWeight: 800, color: INK }}>{progress.percent}%</span>
                </div>
                <div style={{ height: 7, borderRadius: 999, backgroundColor: '#e6e9ee', overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.max(progress.percent, 2)}%`, height: '100%',
                    borderRadius: 999, backgroundColor: '#65a30d', transition: 'width 240ms ease',
                  }} />
                </div>
                {interrupted && job && (
                  <p style={{ margin: '8px 0 0', fontSize: 11.5, color: MUTED, lineHeight: 1.55 }}>
                    A run was interrupted with {job.queue.length} post{job.queue.length === 1 ? '' : 's'} left.
                    Nothing was lost —{' '}
                    <button onClick={() => job && void drive(job)} style={linkButton()}>carry on from where it stopped</button>.
                  </p>
                )}
              </div>
            )}

            {job && job.failed.length > 0 && (
              <div style={{
                marginTop: 12, padding: '11px 14px', borderRadius: 16,
                backgroundColor: '#fff', border: `1px solid ${BAD}33`,
              }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: BAD, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={12} /> {job.failed.length} could not be written
                </p>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 11.5, color: MUTED, lineHeight: 1.6 }}>
                  {job.failed.map(f => <li key={f.postId}><strong style={{ color: INK }}>{f.title}</strong> — {f.error}</li>)}
                </ul>
                <button onClick={retryFailures} className="press" style={{ ...ghost(), marginTop: 9 }}>
                  <RefreshCw size={12} /> Retry these
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* The posts. */}
      {plan && posts.length > 0 && (
        <div style={{ display: 'grid', gap: 10 }}>
          {posts.map(post => {
            const a = post.article;
            const failing = a ? a.seo.checks.filter(c => !c.ok) : [];
            const isOpen = openId === post.id;
            return (
              <article key={post.id} style={{
                backgroundColor: '#fff', borderRadius: 20, border: `1px solid ${LINE}`, overflow: 'hidden',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase',
                        color: post.role === 'pillar' ? ON_LIME : MUTED,
                        backgroundColor: post.role === 'pillar' ? LIME : '#f1f3f6',
                        padding: '3px 8px', borderRadius: 999,
                      }}>{post.role}</span>
                      <span style={{ fontSize: 11, color: MUTED }}>{post.date} · {post.time}</span>
                      {a && (
                        <span style={{
                          fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 999,
                          color: a.source === 'ai' ? '#1d4ed8' : MUTED,
                          backgroundColor: a.source === 'ai' ? '#dbeafe' : '#f1f3f6',
                        }}>
                          {a.source === 'ai' ? 'AI draft' : 'Written from your portfolio'}
                        </span>
                      )}
                      {a?.edited && (
                        <span style={{ fontSize: 10, fontWeight: 800, color: GOOD }}>Edited by you</span>
                      )}
                    </div>
                    <h4 style={{ margin: '7px 0 0', fontSize: 15, fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>
                      {post.title}
                    </h4>
                    <p style={{ margin: '3px 0 0', fontSize: 11.5, color: MUTED, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Search size={11} /> {post.primaryKeyword}
                    </p>
                    {a && (
                      <p style={{ margin: '7px 0 0', fontSize: 11.5, color: MUTED }}>
                        {a.seo.words} words · {a.seo.readingMinutes} min read · {a.seo.density}% density ·{' '}
                        {a.seo.headings} headings · {a.seo.internalLinks} internal link{a.seo.internalLinks === 1 ? '' : 's'}
                        {' · '}
                        <strong style={{ color: failing.length ? WARN : GOOD }}>
                          {failing.length ? `${failing.length} check${failing.length === 1 ? '' : 's'} failing` : 'all checks pass'}
                        </strong>
                      </p>
                    )}
                    {a?.note && (
                      <p style={{ margin: '6px 0 0', fontSize: 11, color: WARN, lineHeight: 1.5 }}>{a.note}</p>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    {a ? (
                      <>
                        <button onClick={() => (isOpen && mode === 'read' ? setOpenId('') : openPost(post, 'read'))} className="press" style={ghost()}>
                          <Eye size={12} /> {isOpen && mode === 'read' ? 'Close' : 'Read'}
                        </button>
                        <button onClick={() => openPost(post, 'edit')} className="press" style={ghost()}>
                          <Pencil size={12} /> Edit
                        </button>
                      </>
                    ) : (
                      <span style={{ fontSize: 11.5, color: MUTED, alignSelf: 'center' }}>Not written yet</span>
                    )}
                    <button
                      onClick={() => void writeOne(post)}
                      disabled={busyPost === post.id || isRunning}
                      className="press"
                      style={{ ...(a ? ghost() : primary()), opacity: busyPost === post.id || isRunning ? 0.55 : 1 }}
                    >
                      {busyPost === post.id
                        ? <><Loader2 size={12} className="spin" /> Writing…</>
                        : <>{a ? <><RefreshCw size={12} /> Rewrite</> : <><Sparkles size={12} /> Write</>}</>}
                    </button>
                  </div>
                </div>

                {isOpen && a && (
                  <div style={{ borderTop: `1px solid ${LINE}`, backgroundColor: '#fbfcfd', padding: 16 }}>

                    <ImagePanel
                      post={post}
                      project={project}
                      onSave={next => saveArticle(post.id, next)}
                    />

                    {/* The checks, always visible with the article rather than behind a tab. */}
                    <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
                      {a.seo.checks.map(c => (
                        <div key={c.id} style={{
                          display: 'flex', gap: 9, alignItems: 'flex-start',
                          padding: '8px 11px', borderRadius: 12, backgroundColor: '#fff',
                          border: `1px solid ${c.ok ? LINE : `${WARN}55`}`,
                        }}>
                          <span style={{
                            width: 17, height: 17, borderRadius: 999, flexShrink: 0, marginTop: 1,
                            backgroundColor: c.ok ? GOOD : WARN, color: '#fff',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {c.ok ? <Check size={11} /> : <X size={11} />}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: INK }}>
                              {c.label} <span style={{ fontWeight: 500, color: MUTED }}>— {c.detail}</span>
                            </p>
                            {!c.ok && (
                              <p style={{ margin: '3px 0 0', fontSize: 11, color: MUTED, lineHeight: 1.55 }}>{c.why}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* How it will look in a search result. */}
                    <div style={{
                      padding: '11px 14px', borderRadius: 14, backgroundColor: '#fff',
                      border: `1px solid ${LINE}`, marginBottom: 14,
                    }}>
                      <p style={{ margin: '0 0 5px', fontSize: 10.5, fontWeight: 800, color: MUTED, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        In a search result
                      </p>
                      <p style={{ margin: 0, fontSize: 12, color: '#0b7a34' }}>
                        {project.domain || 'yourdomain.com'}/blog/{a.seo.slug}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 15, color: '#1a0dab', lineHeight: 1.3 }}>{a.seo.metaTitle}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: '#4d5156', lineHeight: 1.5 }}>{a.seo.metaDescription}</p>
                    </div>

                    <div style={{ display: 'flex', gap: 7, marginBottom: 11, flexWrap: 'wrap' }}>
                      {([['read', 'Read', Eye], ['edit', 'Edit text', Pencil], ['html', 'Edit HTML', Code2]] as const).map(([m, label, Icon]) => (
                        <button
                          key={m}
                          onClick={() => { setMode(m); if (m !== 'read') setDraft(a.html); }}
                          aria-pressed={mode === m}
                          className="press"
                          style={mode === m ? primary() : ghost()}
                        >
                          <Icon size={12} /> {label}
                        </button>
                      ))}
                    </div>

                    {mode === 'read' ? (
                      <div
                        className="blog-article"
                        style={{ fontSize: 14, color: INK, lineHeight: 1.75 }}
                        // The HTML was run through the allowlist sanitiser on the way
                        // in, on every hand edit, and again on load below — nothing
                        // reaches here that was not stripped of scripts and handlers.
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(a.html) }}
                      />
                    ) : (
                      <>
                        <textarea
                          value={draft}
                          onChange={e => setDraft(e.target.value)}
                          spellCheck
                          aria-label={`Edit ${post.title}`}
                          style={{
                            width: '100%', minHeight: 320, padding: 14, borderRadius: 14,
                            border: `1px solid ${LINE}`, backgroundColor: '#fff', color: INK,
                            fontSize: mode === 'html' ? 12 : 13.5,
                            fontFamily: mode === 'html' ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit',
                            lineHeight: 1.7, resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                          }}
                        />
                        <p style={{ margin: '7px 0 0', fontSize: 11, color: MUTED, lineHeight: 1.55 }}>
                          Saved through the same sanitiser as generated content — scripts, event handlers and
                          unsafe links are stripped whoever wrote them. The checks re-run on what you save.
                        </p>
                        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                          <button onClick={() => saveEdit(post)} className="press" style={primary()}>
                            <Check size={13} /> Save and re-check
                          </button>
                          <button onClick={() => { setMode('read'); setDraft(a.html); }} className="press" style={ghost()}>
                            Discard changes
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {plan && posts.length === 0 && (
        <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
          The plan for {monthLabel(month)} has no posts in it.
        </p>
      )}
    </div>
  );
}

/* ── Buttons ── */

function primary(): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 15px',
    borderRadius: 999, border: `1px solid ${LIME_EDGE}`, backgroundColor: LIME,
    color: ON_LIME, fontSize: 12, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
  };
}

function ghost(): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px',
    borderRadius: 999, border: `1px solid ${LINE}`, backgroundColor: '#fff',
    color: INK, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  };
}

function linkButton(): React.CSSProperties {
  return {
    background: 'none', border: 'none', padding: 0, font: 'inherit',
    color: '#1d4ed8', textDecoration: 'underline', cursor: 'pointer',
  };
}
