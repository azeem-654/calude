import { useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowDown, ArrowUp, Calendar, Check, Link2, Loader2,
  Plus, RefreshCw, Sparkles, Trash2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  auditPlan, buildPlan, enrichPlanWithAI, monthKey, monthLabel, planFor,
  reflow, slotsWanted, takePlanSaveError, upsertPlan, ymd,
} from '../../services/blogPlanner';
import { newId } from '../../services/blogAutomation';
import type { BlogProject, MonthPlan, PlannedPost } from '../../types/blogAutomation';

/**
 * A month of posts, laid out and argued with.
 *
 * The plan is generated but never final. Everything is editable — retitle,
 * retarget, reorder, reschedule, drop, add your own — and because an edit can
 * break the very rules that make the plan worth having, the checks re-run
 * against the plan as it stands and say so on screen rather than trusting how
 * it was built.
 *
 * Nothing is written until the plan is approved. That gate exists because Part 3
 * spends real API calls and real time, and a month of articles generated from a
 * plan nobody read is a month of articles nobody wanted.
 */

const INK = '#17191c';
const MUTED = '#6b7480';
const LINE = '#e3e6eb';
const LIME = '#c7f441';
const ON_LIME = '#0e1117';
const LIME_EDGE = '#a8d327';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  project: BlogProject;
}

export default function MonthPlanner({ project }: Props) {
  const { addNotification } = useApp();
  const [version, setVersion] = useState(0);
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [cadence, setCadence] = useState(2);
  const [weekdays, setWeekdays] = useState<number[]>([2, 4]);
  const [time, setTime] = useState('09:00');
  const [busy, setBusy] = useState(false);
  const [openPost, setOpenPost] = useState('');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => planFor(project.id, month), [project.id, month, version]);
  const audit = useMemo(() => (plan ? auditPlan(plan, project) : null), [plan, project]);

  const wanted = slotsWanted(month, cadence, weekdays);
  const keywordsAvailable = project.clusters.reduce((n, c) => n + c.keywords.length, 0);

  const bump = () => setVersion(v => v + 1);

  function persist(next: MonthPlan, message?: string) {
    if (!upsertPlan(next)) {
      addNotification(takePlanSaveError() || 'The plan could not be saved.', 'error');
      return false;
    }
    bump();
    if (message) addNotification(message, 'success');
    return true;
  }

  async function generate() {
    if (!project.clusters.length) {
      addNotification('Build the ranking strategy first — there is nothing to plan around.', 'error');
      return;
    }
    setBusy(true);
    try {
      const { plan: draft, shortfall } = buildPlan(project, { month, cadence, weekdays, time });
      const enriched = await enrichPlanWithAI(draft, project);
      // Keep the id of any plan already sitting on this month, so regenerating
      // replaces it rather than leaving two plans for the same weeks.
      const finalPlan = plan ? { ...enriched, id: plan.id, createdAt: plan.createdAt } : enriched;
      if (persist(finalPlan, `${finalPlan.posts.length} posts planned for ${monthLabel(month)}`)) {
        if (shortfall > 0) {
          addNotification(
            `${shortfall} slot${shortfall > 1 ? 's' : ''} left empty — the strategy has run out of keywords. Add more in the strategy tab.`,
            'info',
          );
        }
        if (enriched.note) addNotification(enriched.note, 'info');
      }
    } catch {
      addNotification('The plan could not be built.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function setPost(id: string, patch: Partial<PlannedPost>) {
    if (!plan) return;
    persist({
      ...plan,
      posts: plan.posts.map(p => (p.id === id ? { ...p, ...patch, edited: true } : p)),
    });
  }

  function move(id: string, dir: -1 | 1) {
    if (!plan) return;
    const i = plan.posts.findIndex(p => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= plan.posts.length) return;
    const posts = [...plan.posts];
    [posts[i], posts[j]] = [posts[j], posts[i]];
    // Order is the strategy, so moving a post reflows the dates to match rather
    // than leaving the list and the calendar disagreeing.
    persist(reflow({ ...plan, posts }));
  }

  function addPost() {
    if (!plan) return;
    const post: PlannedPost = {
      id: newId('post'),
      clusterId: project.clusters[0]?.id ?? '',
      primaryKeyword: '',
      secondaryKeywords: [],
      title: '',
      angle: '',
      outline: [],
      role: 'supporting',
      targetWords: 900,
      moneyPageId: project.moneyPages[0]?.id,
      date: plan.posts[plan.posts.length - 1]?.date ?? ymd(new Date()),
      time: plan.options.time,
      status: 'planned',
      edited: true,
    };
    persist(reflow({ ...plan, posts: [...plan.posts, post] }));
    setOpenPost(post.id);
  }

  function approve() {
    if (!plan || !audit) return;
    if (audit.cannibalised.length) {
      addNotification(`Two posts are chasing "${audit.cannibalised[0]}". Fix that before approving — they will compete with each other.`, 'error');
      return;
    }
    if (plan.posts.some(p => !p.primaryKeyword.trim() || !p.title.trim())) {
      addNotification('Every post needs a keyword and a title before the plan can be approved.', 'error');
      return;
    }
    persist(
      { ...plan, status: 'approved', approvedAt: new Date().toISOString() },
      `${monthLabel(month)} approved — ready to write in Part 3`,
    );
  }

  const card: React.CSSProperties = { backgroundColor: '#fff', borderRadius: 20, border: `1px solid ${LINE}`, padding: 18 };
  const input: React.CSSProperties = {
    padding: '9px 12px', borderRadius: 11, border: `1px solid ${LINE}`,
    fontSize: 12.5, color: INK, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  };
  const label: React.CSSProperties = {
    display: 'block', fontSize: 10.5, fontWeight: 800, color: MUTED, marginBottom: 5,
    textTransform: 'uppercase', letterSpacing: '0.05em',
  };

  if (!project.clusters.length) {
    return (
      <div style={{ ...card, textAlign: 'center', padding: '40px 22px' }}>
        <h3 style={{ margin: '0 0 7px', fontSize: 16, fontWeight: 800, color: INK }}>Nothing to plan around yet</h3>
        <p style={{ margin: 0, fontSize: 12.5, color: MUTED }}>
          Build the ranking strategy first — the plan schedules one post per keyword, so it needs the clusters.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Settings ── */}
      <section style={card}>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: INK }}>Plan a month</h3>
        <p style={{ margin: '0 0 14px', fontSize: 11.5, color: MUTED, lineHeight: 1.6 }}>
          One post per keyword, cheapest to rank first, each cluster's pillar before the posts that
          link up to it.
        </p>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={label} htmlFor="bp-month">Month</label>
            <input id="bp-month" type="month" value={month} onChange={e => setMonth(e.target.value)} style={input} />
          </div>
          <div>
            <label style={label} htmlFor="bp-cadence">Posts a week</label>
            <select id="bp-cadence" value={cadence} onChange={e => setCadence(Number(e.target.value))} style={{ ...input, cursor: 'pointer' }}>
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="bp-time">Publish at</label>
            <input id="bp-time" type="time" value={time} onChange={e => setTime(e.target.value)} style={input} />
          </div>
          <div>
            <span style={label}>Days</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {DAYS.map((d, i) => {
                const on = weekdays.includes(i);
                return (
                  <button
                    key={d}
                    onClick={() => setWeekdays(on ? weekdays.filter(x => x !== i) : [...weekdays, i].sort())}
                    aria-pressed={on}
                    className="press"
                    style={{
                      padding: '8px 9px', borderRadius: 10, cursor: 'pointer',
                      border: `1px solid ${on ? LIME_EDGE : LINE}`,
                      backgroundColor: on ? LIME : '#fff',
                      color: on ? ON_LIME : MUTED, fontSize: 10.5, fontWeight: 800,
                    }}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
          <button onClick={generate} disabled={busy || !weekdays.length} className="press" style={{
            ...primary(), opacity: busy || !weekdays.length ? 0.5 : 1,
            cursor: busy || !weekdays.length ? 'not-allowed' : 'pointer',
          }}>
            {busy
              ? <><Loader2 size={13} /> Planning…</>
              : <><Sparkles size={13} /> {plan ? 'Rebuild the month' : 'Plan the month'}</>}
          </button>
        </div>

        <p style={{ margin: '12px 0 0', fontSize: 11, color: MUTED, lineHeight: 1.6 }}>
          {weekdays.length === 0
            ? 'Pick at least one day to publish on.'
            : <>
              {monthLabel(month)} has room for <strong style={{ color: INK }}>{wanted}</strong> post
              {wanted === 1 ? '' : 's'} at this cadence, and the strategy has{' '}
              <strong style={{ color: INK }}>{keywordsAvailable}</strong> keywords to draw on.
              {wanted > keywordsAvailable && ' Some slots will stay empty until you add more keywords.'}
            </>}
        </p>
      </section>

      {!plan ? (
        <div style={{ ...card, textAlign: 'center', padding: '38px 22px' }}>
          <Calendar size={22} color={MUTED} />
          <h3 style={{ margin: '10px 0 6px', fontSize: 16, fontWeight: 800, color: INK }}>
            No plan for {monthLabel(month)} yet
          </h3>
          <p style={{ margin: 0, fontSize: 12.5, color: MUTED }}>
            Set the cadence above and plan the month. Nothing is written until you approve it.
          </p>
        </div>
      ) : (
        <>
          {/* ── The three rules, checked against the plan as it stands ── */}
          {audit && (
            <section style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: INK }}>Will this plan rank?</h3>
                <span style={{ fontSize: 11, color: MUTED }}>
                  {audit.posts} posts · {audit.clustersCovered} clusters · avg difficulty {audit.averageDifficulty} (estimate)
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 12 }}>
                <Rule
                  ok={audit.cannibalised.length === 0}
                  good="One keyword per post"
                  bad={`${audit.cannibalised.length} keyword${audit.cannibalised.length > 1 ? 's' : ''} chased twice`}
                  why="Two posts on the same phrase compete with each other — Google picks one and the other's work is wasted."
                  detail={audit.cannibalised.join(', ')}
                />
                <Rule
                  ok={audit.pillarsOutOfOrder.length === 0}
                  good="Pillars publish first"
                  bad={`${audit.pillarsOutOfOrder.length} pillar${audit.pillarsOutOfOrder.length > 1 ? 's' : ''} scheduled too late`}
                  why="Supporting posts link up to their pillar. If the pillar is not out yet, those links point at nothing."
                  detail={audit.pillarsOutOfOrder.join(', ')}
                />
                <Rule
                  ok={audit.withoutMoneyPage === 0}
                  good="Every post links to a page that earns"
                  bad={`${audit.withoutMoneyPage} post${audit.withoutMoneyPage > 1 ? 's' : ''} link nowhere`}
                  why="A post with no internal link ranks for itself and moves no revenue."
                />
              </div>
            </section>
          )}

          {/* ── The posts ── */}
          <section style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: INK }}>{monthLabel(month)}</h3>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: MUTED }}>
                  {plan.status === 'approved'
                    ? 'Approved — Part 3 will write these.'
                    : 'Draft. Nothing is written until you approve it.'}
                  {plan.planSource === 'ai' ? ' Titles written by the AI.' : ' Titles written from the keywords.'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={addPost} className="press" style={ghost()}><Plus size={12} /> Add a post</button>
                <button onClick={() => persist(reflow(plan), 'Dates reflowed')} className="press" style={ghost()}>
                  <RefreshCw size={12} /> Reflow dates
                </button>
                {plan.status !== 'approved' && (
                  <button onClick={approve} className="press" style={primary()}><Check size={13} /> Approve the month</button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {plan.posts.map((post, i) => {
                const cluster = project.clusters.find(c => c.id === post.clusterId);
                const page = project.moneyPages.find(m => m.id === post.moneyPageId);
                const open = openPost === post.id;
                const clash = audit?.cannibalised.includes(post.primaryKeyword.trim().toLowerCase());
                return (
                  <div key={post.id} style={{
                    borderRadius: 15, border: `1px solid ${clash ? '#d03b3b' : LINE}`,
                    backgroundColor: open ? '#f7f8fa' : '#fff', overflow: 'hidden',
                  }}>
                    <div style={{
                      display: 'grid', gridTemplateColumns: '70px 1fr auto', gap: 12,
                      alignItems: 'center', padding: '11px 13px',
                    }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: INK, fontVariantNumeric: 'tabular-nums' }}>
                          {new Date(post.date + 'T12:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                        </p>
                        <p style={{ margin: 0, fontSize: 10, color: MUTED }}>{post.time}</p>
                      </div>

                      <button
                        onClick={() => setOpenPost(open ? '' : post.id)}
                        aria-expanded={open}
                        style={{ border: 'none', background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', minWidth: 0 }}
                      >
                        <p style={{
                          margin: 0, fontSize: 13, fontWeight: 700, color: INK,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{post.title || <em style={{ color: MUTED }}>Untitled — needs a title</em>}</p>
                        <span style={{ display: 'inline-flex', gap: 7, alignItems: 'center', marginTop: 3, flexWrap: 'wrap' }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 999, fontSize: 9.5, fontWeight: 800,
                            backgroundColor: post.role === 'pillar' ? '#e6f0fb' : '#f0f2f5',
                            color: post.role === 'pillar' ? '#1c5cab' : MUTED,
                          }}>{post.role === 'pillar' ? 'Pillar' : 'Supporting'}</span>
                          <span style={{ fontSize: 10.5, color: clash ? '#b3302f' : MUTED, fontWeight: clash ? 800 : 600 }}>
                            {post.primaryKeyword || 'no keyword'}
                          </span>
                          {cluster && <span style={{ fontSize: 10.5, color: MUTED }}>· {cluster.pillar}</span>}
                          {page && (
                            <span style={{ fontSize: 10.5, color: MUTED, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <Link2 size={9} /> {page.title || page.url}
                            </span>
                          )}
                        </span>
                      </button>

                      <span style={{ display: 'inline-flex', gap: 4 }}>
                        <IconBtn label="Move earlier" onClick={() => move(post.id, -1)} disabled={i === 0}><ArrowUp size={12} /></IconBtn>
                        <IconBtn label="Move later" onClick={() => move(post.id, 1)} disabled={i === plan.posts.length - 1}><ArrowDown size={12} /></IconBtn>
                        <IconBtn
                          label="Remove this post"
                          danger
                          onClick={() => persist({ ...plan, posts: plan.posts.filter(p => p.id !== post.id) })}
                        ><Trash2 size={12} /></IconBtn>
                      </span>
                    </div>

                    {open && (
                      <div style={{ padding: '0 13px 13px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 11 }}>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label style={label}>Title</label>
                          <input value={post.title} onChange={e => setPost(post.id, { title: e.target.value })} style={{ ...input, width: '100%' }} />
                        </div>
                        <div>
                          <label style={label}>Keyword it must own</label>
                          <input value={post.primaryKeyword} onChange={e => setPost(post.id, { primaryKeyword: e.target.value })} style={{ ...input, width: '100%' }} />
                        </div>
                        <div>
                          <label style={label}>Links to</label>
                          <select value={post.moneyPageId ?? ''} onChange={e => setPost(post.id, { moneyPageId: e.target.value || undefined })} style={{ ...input, width: '100%', cursor: 'pointer' }}>
                            <option value="">Nothing — this post moves no revenue</option>
                            {project.moneyPages.map(m => <option key={m.id} value={m.id}>{m.title || m.url}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={label}>Date</label>
                          <input type="date" value={post.date} onChange={e => setPost(post.id, { date: e.target.value })} style={{ ...input, width: '100%' }} />
                        </div>
                        <div>
                          <label style={label}>Role</label>
                          <select value={post.role} onChange={e => setPost(post.id, { role: e.target.value as PlannedPost['role'] })} style={{ ...input, width: '100%', cursor: 'pointer' }}>
                            <option value="pillar">Pillar</option>
                            <option value="supporting">Supporting</option>
                          </select>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label style={label}>Angle</label>
                          <textarea rows={2} value={post.angle} onChange={e => setPost(post.id, { angle: e.target.value })} style={{ ...input, width: '100%', resize: 'vertical' }} />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label style={label}>Outline — one heading a line</label>
                          <textarea
                            rows={Math.max(3, post.outline.length)}
                            value={post.outline.join('\n')}
                            onChange={e => setPost(post.id, { outline: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })}
                            style={{ ...input, width: '100%', resize: 'vertical', lineHeight: 1.6 }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {plan.posts.length === 0 && (
              <p style={{ margin: 0, fontSize: 12.5, color: MUTED }}>
                No posts in this plan. Add one, or rebuild the month.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/* ── Pieces ── */

function Rule({ ok, good, bad, why, detail }: {
  ok: boolean; good: string; bad: string; why: string; detail?: string;
}) {
  return (
    <div style={{
      padding: '11px 13px', borderRadius: 13,
      backgroundColor: ok ? '#f2f8f2' : '#fdf2f2',
      border: `1px solid ${ok ? '#cfe6cf' : '#f0c9c9'}`,
    }}>
      <p style={{
        margin: 0, fontSize: 11.5, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6,
        color: ok ? '#0a7a0a' : '#b3302f',
      }}>
        {ok ? <Check size={12} strokeWidth={3} /> : <AlertTriangle size={12} strokeWidth={2.6} />}
        {ok ? good : bad}
      </p>
      <p style={{ margin: '5px 0 0', fontSize: 10.5, color: MUTED, lineHeight: 1.55 }}>{why}</p>
      {!ok && detail && (
        <p style={{ margin: '4px 0 0', fontSize: 10.5, color: '#b3302f', fontWeight: 700 }}>{detail}</p>
      )}
    </div>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: {
  label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="press"
      style={{
        width: 26, height: 26, borderRadius: 999, border: `1px solid ${LINE}`,
        backgroundColor: '#fff', color: danger ? '#c2410c' : MUTED,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.35 : 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

function primary(): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 17px',
    borderRadius: 999, border: `1px solid ${LIME_EDGE}`, backgroundColor: LIME,
    color: ON_LIME, fontSize: 12, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
  };
}
function ghost(): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '9px 14px',
    borderRadius: 999, border: `1px solid ${LINE}`, backgroundColor: '#fff',
    color: INK, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  };
}
