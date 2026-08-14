import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Check, Download, ExternalLink, Globe, Link2, Loader2, Plug,
  RefreshCw, Send, Square, Trash2, Undo2, X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { monthKey, monthLabel, planFor, takePlanSaveError, upsertPlan } from '../../services/blogPlanner';
import {
  blockers, cancelPublishJob, connectWordPress, connectionStatus, deleteTarget,
  disconnect, emptyTarget, publishJobFor, publishNext, publishProgress,
  startPublishJob, takePublishSaveError, targetsFor, upsertPublishJob, upsertTarget, withdraw,
} from '../../services/blogPublish';
import { postUrl, sitemapUrl } from '../../services/blogExport';
import { buildBundle, downloadBundle } from '../../services/blogBundle';
import { readableBytes } from '../../services/blogImages';
import type {
  BlogProject, MonthPlan, PlannedPost, PublishJob, PublishTarget,
} from '../../types/blogAutomation';

/**
 * Putting the month on the customer's site.
 *
 * This is the only screen in the module that changes something outside the app,
 * so it is built to be slow and explicit rather than smooth: what is about to
 * happen, to which site, and what is wrong with it, all before the button. The
 * publish itself is one post per pass against a stored job, and every result —
 * the live URL, or the error verbatim — is on the post's own row.
 *
 * Nothing here deletes. Withdrawing a post sets it back to a draft on the site,
 * so a mistake costs a click to undo rather than a restore from backup.
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

interface Props { project: BlogProject }

export default function PublishDesk({ project }: Props) {
  const { addNotification } = useApp();
  const [version, setVersion] = useState(0);
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [openId, setOpenId] = useState('');
  const [busy, setBusy] = useState('');
  const [runningTarget, setRunningTarget] = useState('');
  const [status, setStatus] = useState<Record<string, string>>({});
  const running = useRef(false);

  const bump = () => setVersion(v => v + 1);

  /* `version` is not an unused dependency: these read from localStorage, which
     React cannot observe, so bumping it is what makes them re-read after a
     write. The rule has no way to know that. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => planFor(project.id, month), [project.id, month, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const targets = useMemo(() => targetsFor(project.id), [project.id, version]);
  const target = targets.find(t => t.id === openId) ?? targets[0];
  const planId = plan?.id;
  const targetId = target?.id;
  const job = useMemo(
    () => (planId && targetId ? publishJobFor(planId, targetId) ?? null : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [planId, targetId, version],
  );

  /**
   * The connection form, seeded from whichever target is selected.
   *
   * Two cases, and both were wrong before. On mount, switching tabs unmounts
   * this screen, so the fields came back blank on a site that was in fact
   * connected — which reads as "my settings were lost". And on switching
   * targets, the form has to follow. The initialiser covers the first, and
   * comparing against the previous id during render covers the second; that
   * is React's own sanctioned pattern here, where an effect would render the
   * wrong values once and then correct them.
   */
  const formFromTarget = (t?: PublishTarget) => ({
    siteUrl: t?.siteUrl ?? '',
    basePath: t?.basePath ?? '',
    username: t?.username ?? '',
    password: '',
  });
  const [form, setForm] = useState(() => formFromTarget(target));
  const [formFor, setFormFor] = useState(targetId);
  if (targetId !== formFor) {
    setFormFor(targetId);
    setForm(formFromTarget(target));
  }

  const issues = plan ? blockers(plan, project) : [];
  const fatal = issues.filter(i => i.fatal);
  const warnings = issues.filter(i => !i.fatal);
  const progress = plan && target ? publishProgress(plan, target.id) : null;
  const isRunning = !!target && runningTarget === target.id;

  function persistPlan(next: MonthPlan, message?: string) {
    if (!upsertPlan(next)) {
      addNotification(takePlanSaveError() || 'The plan could not be saved.', 'error');
      return false;
    }
    bump();
    if (message) addNotification(message, 'success');
    return true;
  }

  function addTarget(kind: PublishTarget['kind']) {
    const t = emptyTarget(project.id, kind, project.domain ? `https://${project.domain}` : '');
    if (!upsertTarget(t)) {
      addNotification(takePublishSaveError() || 'That could not be saved.', 'error');
      return;
    }
    setOpenId(t.id);
    bump();
  }

  async function saveAndConnect() {
    if (!target) return;
    const next: PublishTarget = {
      ...target,
      siteUrl: form.siteUrl.trim().replace(/\/+$/, ''),
      basePath: form.basePath.trim().replace(/^\/+|\/+$/g, ''),
      username: form.username.trim(),
    };
    if (!upsertTarget(next)) { addNotification(takePublishSaveError() || 'Could not save.', 'error'); return; }
    bump();

    if (next.kind !== 'wordpress') { addNotification('Saved.', 'success'); return; }

    setBusy('connect');
    try {
      const r = await connectWordPress(next, next.username ?? '', form.password);
      if (!r.connected) {
        addNotification(r.error || 'That connection could not be verified.', 'error');
        upsertTarget({ ...next, hasCredential: false, verifyNote: r.error });
        bump();
        return;
      }
      upsertTarget({ ...next, hasCredential: true, verifiedAt: r.verifiedAt, verifyNote: undefined });
      setForm(f => ({ ...f, password: '' }));
      setStatus(s => ({ ...s, [next.id]: `Connected as ${r.connectedAs}` }));
      bump();
      addNotification(`Connected to ${next.siteUrl} as ${r.connectedAs}`, 'success');
    } finally {
      setBusy('');
    }
  }

  async function check(t: PublishTarget) {
    setBusy(`check-${t.id}`);
    try {
      const r = await connectionStatus(t);
      setStatus(s => ({
        ...s,
        [t.id]: r.connected ? `Connected as ${r.connectedAs || r.username}` : (r.error || 'Not connected'),
      }));
      upsertTarget({ ...t, hasCredential: r.connected });
      bump();
    } finally { setBusy(''); }
  }

  async function unlink(t: PublishTarget) {
    if (!window.confirm(`Disconnect ${t.siteUrl}? Posts already published stay on the site.`)) return;
    await disconnect(t);
    upsertTarget({ ...t, hasCredential: false, verifiedAt: undefined });
    setStatus(s => ({ ...s, [t.id]: 'Not connected' }));
    bump();
    addNotification('Disconnected. The stored password has been deleted from the server.');
  }

  function removeTarget(t: PublishTarget) {
    if (!window.confirm(`Remove "${t.name}"? Published posts stay where they are; only this connection goes.`)) return;
    void disconnect(t);
    deleteTarget(t.id);
    if (openId === t.id) setOpenId('');
    bump();
  }

  /* ── The run ── */

  async function drive(initial: PublishJob) {
    if (!target) return;
    running.current = true;
    setRunningTarget(target.id);
    let current = initial;
    upsertPublishJob(current);

    while (running.current && current.status === 'running' && current.queue.length) {
      const r = await publishNext(current, project, target);
      current = r.job;
      upsertPublishJob(current);
      bump();
      if (r.error) addNotification(`"${r.post?.title ?? 'A post'}" was not published: ${r.error}`, 'error');
    }

    running.current = false;
    setRunningTarget('');
    if (current.status === 'done') {
      // Re-read the plan: every pass wrote a record to it, so the copy captured
      // when this run started is already out of date.
      const fresh = planFor(project.id, month);
      const p = fresh ? publishProgress(fresh, target.id) : null;
      addNotification(
        current.failed.length
          ? `${p?.live ?? 0} live, ${p?.scheduled ?? 0} scheduled, ${current.failed.length} failed.`
          : `${p?.live ?? 0} live, ${p?.scheduled ?? 0} scheduled on ${target.siteUrl}`,
        current.failed.length ? 'info' : 'success',
      );
    }
  }

  function publish(mode: PublishJob['mode']) {
    if (!plan || !target) return;
    if (fatal.length) {
      addNotification(`Cannot publish: ${fatal[0].reason}`, 'error');
      return;
    }
    if (target.kind !== 'wordpress') {
      addNotification('This target produces a download. Use "Build the bundle" below.', 'info');
      return;
    }
    if (!target.hasCredential) {
      addNotification('Connect the site first.', 'error');
      return;
    }
    const next = startPublishJob(plan, target, mode);
    if (!next.queue.length) {
      addNotification('Everything on this plan is already up to date on that site.', 'info');
      return;
    }
    if (!window.confirm(
      `${mode === 'now' ? 'Publish' : 'Schedule'} ${next.queue.length} post${next.queue.length === 1 ? '' : 's'} to ${target.siteUrl}?`,
    )) return;
    void drive(next);
  }

  function stop() {
    running.current = false;
    setRunningTarget('');
    if (job) upsertPublishJob(cancelPublishJob(job));
    addNotification('Stopped. Everything already published stays published.', 'info');
    bump();
  }

  async function takeDown(post: PlannedPost) {
    if (!plan || !target) return;
    if (!window.confirm(`Take "${post.title}" off ${target.siteUrl}? It becomes a draft there — nothing is deleted.`)) return;
    setBusy(`withdraw-${post.id}`);
    try {
      const r = await withdraw(plan, post, target);
      if (!r.ok) { addNotification(r.error || 'That could not be withdrawn.', 'error'); return; }
      bump();
      addNotification('Taken down. It is a draft on the site now.');
    } finally { setBusy(''); }
  }

  function exportBundle() {
    if (!plan || !target) return;
    const result = buildBundle(project, plan, target);
    if (!result.posts) {
      addNotification('Nothing is marked live on this target yet, so the bundle would be empty.', 'error');
      return;
    }
    downloadBundle(result, `${project.name.replace(/[^\w-]/g, '') || 'blog'}-${month}.zip`);
    addNotification(
      `${result.posts} post${result.posts === 1 ? '' : 's'}, ${result.files.length} files, ${readableBytes(result.bytes)}`
      + (result.skipped.length ? ` — ${result.skipped.length} not live and left out.` : ''),
      'success',
    );
  }

  /** Mark posts live locally, which is what an export target means by published. */
  function markLive() {
    if (!plan || !target) return;
    const ready = plan.posts.filter(p => p.article);
    if (!ready.length) { addNotification('Nothing is written yet.', 'error'); return; }
    let next = plan;
    for (const p of ready) {
      next = {
        ...next,
        posts: next.posts.map(x => (x.id === p.id ? {
          ...x,
          published: {
            ...(x.published ?? {}),
            [target.id]: {
              postId: p.id, targetId: target.id, state: 'live' as const,
              url: postUrl(target, p.article!.seo.slug),
              at: new Date().toISOString(), updatedAt: new Date().toISOString(),
            },
          },
        } : x)),
      };
    }
    persistPlan(next, `${ready.length} post${ready.length === 1 ? '' : 's'} marked ready to export`);
  }

  /* ── Render ── */

  return (
    <div style={{ display: 'grid', gap: 14 }}>

      <section style={{ backgroundColor: PLANE, borderRadius: 24, border: `1px solid ${LINE}`, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Globe size={16} color={INK} />
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>Publish</h3>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value || monthKey(new Date()))}
            aria-label="Month to publish"
            style={{
              padding: '8px 12px', borderRadius: 999, border: `1px solid ${LINE}`,
              backgroundColor: '#fff', fontSize: 12, color: INK, fontFamily: 'inherit', outline: 'none',
            }}
          />
          <span style={{ flex: 1 }} />
          <button onClick={() => addTarget('wordpress')} className="press" style={ghost()}>
            <Plug size={12} /> Connect WordPress
          </button>
          <button onClick={() => addTarget('export')} className="press" style={ghost()}>
            <Download size={12} /> Add a download target
          </button>
        </div>

        {!plan && (
          <p style={{ margin: '12px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
            There is no plan for {monthLabel(month)}. Build and write one first — there is nothing to publish yet.
          </p>
        )}

        {plan && (
          <>
            <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: MUTED, flexWrap: 'wrap' }}>
              <span><strong style={{ color: INK }}>{progress?.total ?? 0}</strong> written</span>
              <span><strong style={{ color: GOOD }}>{progress?.live ?? 0}</strong> live</span>
              <span><strong style={{ color: INK }}>{progress?.scheduled ?? 0}</strong> scheduled</span>
              {!!progress?.failed && <span style={{ color: BAD, fontWeight: 700 }}>{progress.failed} failed</span>}
            </div>

            {fatal.length > 0 && (
              <div style={{ marginTop: 12, padding: '11px 14px', borderRadius: 16, backgroundColor: '#fff', border: `1px solid ${BAD}33` }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: BAD, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <X size={12} /> Not ready to publish
                </p>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 11.5, color: MUTED, lineHeight: 1.6 }}>
                  {fatal.slice(0, 6).map((b, i) => (
                    <li key={i}><strong style={{ color: INK }}>{b.title}</strong> — {b.reason}</li>
                  ))}
                </ul>
              </div>
            )}

            {warnings.length > 0 && (
              <div style={{ marginTop: 10, padding: '11px 14px', borderRadius: 16, backgroundColor: '#fff', border: `1px solid ${WARN}55` }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: '#8a6300', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={12} /> {warnings.length} thing{warnings.length === 1 ? '' : 's'} worth fixing first
                </p>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 11.5, color: MUTED, lineHeight: 1.6 }}>
                  {warnings.slice(0, 6).map((b, i) => (
                    <li key={i}><strong style={{ color: INK }}>{b.title}</strong> — {b.reason}</li>
                  ))}
                </ul>
                <p style={{ margin: '7px 0 0', fontSize: 11, color: MUTED }}>
                  These do not stop a publish. It is your site, and a thin post is still a post.
                </p>
              </div>
            )}
          </>
        )}
      </section>

      {targets.length === 0 ? (
        <div style={{ backgroundColor: '#fff', borderRadius: 22, border: `1px dashed ${LINE}`, padding: '34px 26px', textAlign: 'center' }}>
          <h4 style={{ margin: '0 0 7px', fontSize: 15, fontWeight: 800, color: INK }}>Nowhere to publish yet</h4>
          <p style={{ margin: '0 auto', maxWidth: 520, fontSize: 12.5, color: MUTED, lineHeight: 1.65 }}>
            Connect a WordPress site and posts go up on their planned dates by themselves. If the site is
            not WordPress, add a download target instead and you get a folder of pages, images, a sitemap
            and a feed to upload anywhere.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {targets.map(t => (
            <button
              key={t.id}
              onClick={() => setOpenId(t.id)}
              aria-pressed={target?.id === t.id}
              className="press"
              style={target?.id === t.id ? primary() : ghost()}
            >
              {t.kind === 'wordpress' ? <Globe size={12} /> : <Download size={12} />} {t.siteUrl || t.name}
            </button>
          ))}
        </div>
      )}

      {target && (
        <section style={{ backgroundColor: '#fff', borderRadius: 22, border: `1px solid ${LINE}`, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12, flexWrap: 'wrap' }}>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: INK }}>
              {target.kind === 'wordpress' ? 'WordPress' : 'Download a bundle'}
            </h4>
            {target.kind === 'wordpress' && (
              <span style={{
                fontSize: 11, fontWeight: 700,
                color: target.hasCredential ? GOOD : MUTED,
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                {target.hasCredential ? <><Check size={11} /> connected</> : <><Link2 size={11} /> not connected</>}
              </span>
            )}
            <span style={{ flex: 1 }} />
            <button onClick={() => removeTarget(target)} className="press" style={{ ...ghost(), color: BAD }}>
              <Trash2 size={12} /> Remove
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            <Field label="Site address" hint="Where the site lives, e.g. https://example.com">
              <input value={form.siteUrl} onChange={e => setForm(f => ({ ...f, siteUrl: e.target.value }))}
                placeholder="https://example.com" style={input()} />
            </Field>
            <Field label="Posts live under" hint={`e.g. blog → ${postUrl({ ...target, basePath: form.basePath }, 'a-post')}`}>
              <input value={form.basePath} onChange={e => setForm(f => ({ ...f, basePath: e.target.value }))}
                placeholder="blog" style={input()} />
            </Field>
            {target.kind === 'wordpress' && (
              <>
                <Field label="WordPress username" hint="The account the posts are published as">
                  <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                    autoComplete="off" style={input()} />
                </Field>
                <Field
                  label="Application password"
                  hint="WordPress → Users → Profile → Application Passwords. Not the login password; it can be revoked on its own."
                >
                  <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder={target.hasCredential ? '•••••••• stored on the server' : 'xxxx xxxx xxxx xxxx xxxx xxxx'}
                    autoComplete="new-password" style={input()} />
                </Field>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button onClick={() => void saveAndConnect()} disabled={busy === 'connect'} className="press" style={primary()}>
              {busy === 'connect' ? <><Loader2 size={12} className="spin" /> Checking…</> : <><Plug size={12} /> {target.kind === 'wordpress' ? 'Save and connect' : 'Save'}</>}
            </button>
            {target.kind === 'wordpress' && (
              <>
                <button onClick={() => void check(target)} disabled={busy.startsWith('check')} className="press" style={ghost()}>
                  <RefreshCw size={12} /> Check connection
                </button>
                {target.hasCredential && (
                  <button onClick={() => void unlink(target)} className="press" style={ghost()}>Disconnect</button>
                )}
              </>
            )}
          </div>

          {(status[target.id] || target.verifyNote) && (
            <p style={{ margin: '9px 0 0', fontSize: 11.5, color: status[target.id]?.startsWith('Connected') ? GOOD : BAD, lineHeight: 1.55 }}>
              {status[target.id] || target.verifyNote}
            </p>
          )}
          <p style={{ margin: '9px 0 0', fontSize: 11, color: MUTED, lineHeight: 1.6 }}>
            The application password is sent once and kept on the server, never in this browser. Publishing
            goes through the server because WordPress does not allow a browser to call its API directly.
          </p>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', borderTop: `1px solid ${LINE}`, paddingTop: 14 }}>
            {target.kind === 'wordpress' ? (
              isRunning ? (
                <button onClick={stop} className="press" style={{ ...ghost(), color: BAD }}><Square size={12} /> Stop</button>
              ) : (
                <>
                  <button onClick={() => publish('schedule')} disabled={!plan || !!fatal.length} className="press"
                    style={{ ...primary(), opacity: !plan || fatal.length ? 0.5 : 1 }}>
                    <Send size={12} /> Schedule the month
                  </button>
                  <button onClick={() => publish('now')} disabled={!plan || !!fatal.length} className="press"
                    style={{ ...ghost(), opacity: !plan || fatal.length ? 0.5 : 1 }}>
                    Publish everything now
                  </button>
                </>
              )
            ) : (
              <>
                <button onClick={markLive} disabled={!plan} className="press" style={ghost()}>
                  <Check size={12} /> Mark written posts ready
                </button>
                <button onClick={exportBundle} disabled={!plan} className="press" style={primary()}>
                  <Download size={12} /> Build the bundle
                </button>
              </>
            )}
          </div>

          {target.kind === 'wordpress' && (
            <p style={{ margin: '9px 0 0', fontSize: 11, color: MUTED, lineHeight: 1.6 }}>
              Scheduling hands each post to WordPress with its planned date, so the site publishes it on
              time whether or not this app is open. WordPress maintains its own sitemap and feed, so this
              does not add a second one.
            </p>
          )}
          {target.kind === 'export' && (
            <p style={{ margin: '9px 0 0', fontSize: 11, color: MUTED, lineHeight: 1.6 }}>
              The bundle contains one folder per post, the images as files, {sitemapUrl(target).split('/').pop()},
              a feed and a README. Only posts marked ready go in — a bundle of drafts uploaded by mistake
              would put unfinished writing on a public server.
            </p>
          )}

          {job && job.queue.length > 0 && !isRunning && (
            <p style={{ margin: '10px 0 0', fontSize: 11.5, color: MUTED }}>
              A run stopped with {job.queue.length} left.{' '}
              <button onClick={() => void drive(job)} style={linkBtn()}>Carry on</button>.
            </p>
          )}
        </section>
      )}

      {/* Per-post state */}
      {plan && target && plan.posts.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          {plan.posts.map(post => {
            const rec = post.published?.[target.id];
            const state = rec?.state ?? (post.article ? 'draft' : undefined);
            const tone = state === 'live' ? GOOD : state === 'scheduled' ? '#1d4ed8' : state === 'failed' ? BAD : MUTED;
            return (
              <article key={post.id} style={{
                display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
                backgroundColor: '#fff', borderRadius: 16, border: `1px solid ${LINE}`, padding: '12px 15px',
              }}>
                <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: INK }}>{post.title}</p>
                  <p style={{ margin: '3px 0 0', fontSize: 11.5, color: MUTED }}>
                    {post.date} · {post.time} ·{' '}
                    <strong style={{ color: tone }}>
                      {state === 'live' ? 'live' : state === 'scheduled' ? 'scheduled' : state === 'failed' ? 'failed'
                        : state === 'withdrawn' ? 'withdrawn' : post.article ? 'not published' : 'not written'}
                    </strong>
                  </p>
                  {rec?.error && <p style={{ margin: '4px 0 0', fontSize: 11, color: BAD, lineHeight: 1.5 }}>{rec.error}</p>}
                </div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {rec?.url && (
                    <a href={rec.url} target="_blank" rel="noopener noreferrer" className="press" style={{ ...ghost(), textDecoration: 'none' }}>
                      <ExternalLink size={12} /> View
                    </a>
                  )}
                  {rec?.remoteId && rec.state !== 'withdrawn' && (
                    <button onClick={() => void takeDown(post)} disabled={busy === `withdraw-${post.id}`} className="press" style={{ ...ghost(), color: BAD }}>
                      {busy === `withdraw-${post.id}` ? <Loader2 size={12} className="spin" /> : <Undo2 size={12} />} Take down
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', minWidth: 0 }}>
      <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: INK, marginBottom: 4 }}>{label}</span>
      {children}
      {hint && <span style={{ display: 'block', fontSize: 10.5, color: MUTED, marginTop: 4, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{hint}</span>}
    </label>
  );
}

function input(): React.CSSProperties {
  return {
    width: '100%', padding: '9px 12px', borderRadius: 10, border: `1px solid ${LINE}`,
    backgroundColor: '#fff', fontSize: 12.5, color: INK, fontFamily: 'inherit',
    outline: 'none', boxSizing: 'border-box',
  };
}

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

function linkBtn(): React.CSSProperties {
  return { background: 'none', border: 'none', padding: 0, font: 'inherit', color: '#1d4ed8', textDecoration: 'underline', cursor: 'pointer' };
}
