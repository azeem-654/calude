/**
 * Reviews — what people say about the business on Google, and answering it.
 *
 * Everything on this screen comes from /api/reputation.php, which reads Google
 * from the Worker. It used to invent reviews on a timer, compare the business
 * with made-up competitors and "post" replies by flipping a flag in this
 * browser; a customer could have answered a review that never existed and
 * believed a reply was public that nobody would ever see. Now:
 *
 *  - "Live monitoring" is the server's automatic check (every six hours), and
 *    it says when it last ran. "Refresh" checks now.
 *  - "Post to Google" appears only where Google will take the reply (Business
 *    Profile, connected). Elsewhere the screen says so and offers "Copy reply &
 *    open on Google" plus "Mark as replied", which records that a person did it.
 *  - Competitors are real places, with Google's own rating and count.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Star, Send, Sparkles, Settings2, RefreshCw, Reply, Zap, AlertTriangle, MessageSquarePlus,
  ThumbsUp, ThumbsDown, Trophy, X, Mail, Radio, ExternalLink, Copy, Check, Search, Trash2, Info,
} from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import ReputationSetup from './ReputationSetup';
import { flushNow } from '../../services/serverData';
import {
  repStatus, listReviews, checkNow, saveSource, draftReply, postReply, markReplied, dismissAttention,
  listCompetitors, addCompetitor, removeCompetitor, findPlace, listRequests, sendRequests,
  loadProfile, saveProfile, loadRules, saveRules, migrateLegacy, trendingThemes, sentimentOf,
} from '../../services/reputationService';
import type {
  RepReview, RepStatus, BusinessProfile, AutoResponseRule, Platform, ReviewRequest, Competitor, PlaceHit,
} from '../../services/reputationService';

const INK = '#17191c';
const MUTED = '#8a8f98';
const FAINT = '#b0b4ba';
const AMBER = '#f59e0b';
const FROST: React.CSSProperties = { background: 'rgba(255,255,255,0.6)', borderRadius: 20, padding: 20, minWidth: 0 };
const CARD: React.CSSProperties = { background: '#fff', borderRadius: 18, boxShadow: '0 1px 2px rgba(23,25,28,0.05)', minWidth: 0 };

function Stars({ n, size = 14 }: { n: number; size?: number }) {
  return <div style={{ display: 'flex', gap: 2 }} aria-label={`${n} stars`}>{[1, 2, 3, 4, 5].map(s => <Star key={s} size={size} fill={s <= n ? AMBER : 'none'} color={s <= n ? AMBER : '#e2e8f0'} />)}</div>;
}
function relTime(iso: string | null) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: s > 300 * 86400 ? 'numeric' : undefined });
}

export default function Reputation() {
  const { contacts, addNotification } = useApp();
  const [status, setStatus] = useState<RepStatus | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reviews, setReviews] = useState<RepReview[]>([]);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [requests, setRequests] = useState<ReviewRequest[]>([]);
  const [profile, setProfile] = useState<BusinessProfile>(loadProfile);
  const [rules, setRules] = useState<AutoResponseRule[]>(() => loadRules().rules);
  const [migrated, setMigrated] = useState('');

  const [filter, setFilter] = useState<'all' | 'unreplied' | 'attention' | 'negative'>('all');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string>('');
  const [problem, setProblem] = useState<Record<string, string>>({});
  const [setupOpen, setSetupOpen] = useState<false | 'business' | 'sources' | 'rules'>(false);
  const [reqOpen, setReqOpen] = useState(false);
  const [checking, setChecking] = useState(false);

  const refresh = useCallback(async () => {
    const [s, r, c, q] = await Promise.all([repStatus(), listReviews(), listCompetitors(), listRequests()]);
    if (s.success) { setStatus(s); setLoadError(''); } else setLoadError(s.error ?? 'The review source could not be read.');
    if (r.success) {
      setReviews(r.reviews);
      /* A server draft (a rule's, or one written before) fills the box, but never over what is being typed. */
      setDraft(prev => { const n = { ...prev }; for (const x of r.reviews) if (x.draft && n[x.id] === undefined) n[x.id] = x.draft; return n; });
    }
    if (c.success) setCompetitors(c.competitors);
    if (q.success) setRequests(q.requests);
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const note = await migrateLegacy();
      if (alive && note) setMigrated(note);
      if (alive) await refresh();
    })();
    return () => { alive = false; };
  }, [refresh]);

  /*
   * What the cron reads arrives on the server with nobody watching. Re-reading
   * the stored list once a minute while the tab is visible (and on coming
   * back to it) puts it on screen without a reload. It asks this app's
   * database only — never Google, so it costs nobody's quota.
   */
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') void refresh(); };
    const id = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [refresh]);

  const src = status?.source ?? null;
  const gbp = status?.gbp;
  const gbpLive = gbp?.status === 'connected' && !!gbp.location;
  const hasSource = !!src?.placeId || gbpLive;

  /* ── Derived ── */
  const total = reviews.length;
  const answered = reviews.filter(r => r.replyState === 'posted' || r.replyState === 'posted_elsewhere').length;
  const responseRate = total ? Math.round((answered / total) * 100) : 0;
  const attention = reviews.filter(r => r.attention).length;
  const posThemes = trendingThemes(reviews, 'positive');
  const negThemes = trendingThemes(reviews, 'negative');
  const filtered = reviews.filter(r =>
    filter === 'all' ? true
      : filter === 'unreplied' ? (r.replyState === 'none' || r.replyState === 'draft')
      : filter === 'attention' ? r.attention
      : sentimentOf(r.rating, r.content) === 'negative');
  const youName = src?.placeName || profile.name || 'Your business';
  const comp = [
    ...(src?.rating != null ? [{ placeId: '__you', name: youName, rating: src.rating, reviewCount: src.reviewCount, mapsUrl: src.mapsUrl, lastError: '' } as Competitor] : []),
    ...competitors,
  ].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));

  /* ── Actions ── */
  const doCheck = async () => {
    setChecking(true);
    const r = await checkNow();
    setChecking(false);
    if (!r.success) { addNotification(r.error ?? 'Google could not be read.', 'error'); await refresh(); return; }
    addNotification(r.added ? `${r.added} new review${r.added === 1 ? '' : 's'} from Google.` : 'Checked Google — nothing new.', 'success');
    /* What the check could not do is said, not dropped: Business Profile
       refusing and Places standing in, or new reviews Places will not show. */
    for (const n of (r.notes ?? []).slice(0, 2)) addNotification(n, 'info');
    await refresh();
  };
  const toggleAuto = async () => {
    if (!src) { setSetupOpen('sources'); return; }
    const r = await saveSource({ autoCheck: !src.autoCheck });
    if (r.success) setStatus(r); else addNotification(r.error ?? 'Could not change it.', 'error');
  };
  const aiDraft = async (r: RepReview) => {
    setBusy(`ai:${r.id}`); setProblem(p => ({ ...p, [r.id]: '' }));
    const res = await draftReply(r.id);
    setBusy('');
    if (res.success) setDraft(prev => ({ ...prev, [r.id]: res.draft }));
    else setProblem(p => ({ ...p, [r.id]: res.error ?? 'The reply could not be drafted.' }));
  };
  const post = async (r: RepReview) => {
    const text = draft[r.id]?.trim();
    if (!text) return;
    setBusy(`post:${r.id}`); setProblem(p => ({ ...p, [r.id]: '' }));
    const res = await postReply(r.id, text);
    setBusy('');
    if (!res.success) { setProblem(p => ({ ...p, [r.id]: res.error ?? 'Google did not take the reply.' })); return; }
    addNotification(`Reply posted on Google to ${r.author}'s review.`, 'success');
    setDraft(prev => { const n = { ...prev }; delete n[r.id]; return n; });
    await refresh();
  };
  const copyAndOpen = async (r: RepReview) => {
    const text = draft[r.id]?.trim() ?? '';
    try { await navigator.clipboard?.writeText(text); } catch { /* the box still holds it */ }
    if (r.link) window.open(r.link, '_blank', 'noopener');
    addNotification(text ? 'Reply copied — paste it on Google, then press "Mark as replied".' : 'Opened on Google.', 'info');
  };
  const markDone = async (r: RepReview) => {
    setBusy(`mark:${r.id}`);
    const res = await markReplied(r.id, draft[r.id] ?? '');
    setBusy('');
    if (!res.success) { setProblem(p => ({ ...p, [r.id]: res.error ?? 'Could not mark it.' })); return; }
    setDraft(prev => { const n = { ...prev }; delete n[r.id]; return n; });
    await refresh();
  };
  const dismiss = async (r: RepReview) => { await dismissAttention(r.id); await refresh(); };

  const saveSettings = (p: BusinessProfile, r: AutoResponseRule[]) => {
    setProfile(p); saveProfile(p); setRules(r); saveRules(r);
    addNotification('Reputation settings saved', 'success');
  };

  const setup = setupOpen && (
    <ReputationSetup
      initialTab={setupOpen}
      profile={profile} rules={rules} status={status}
      onStatus={s => { setStatus(s); void refresh(); }}
      onSave={(p, r) => { saveSettings(p, r); setSetupOpen(false); }}
      onClose={() => { setSetupOpen(false); void refresh(); }}
    />
  );

  /* ── Not set up ── */
  if (status && !hasSource && !reviews.length) {
    return (
      <div style={{ minHeight: '100vh' }}>
        <Header title="Reviews" subtitle="Watch what people say and answer it" />
        <div style={{ padding: '60px 16px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ maxWidth: 480, textAlign: 'center', ...FROST, borderRadius: 24, padding: '36px 24px' }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}><Star size={28} color="#fff" fill="#fff" /></div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: INK, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Your Google reviews, in one place</h2>
            <p style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.6, margin: '0 0 22px' }}>
              Find your business on Google and this screen reads its rating and reviews, checks for new ones on its own,
              drafts replies in your voice, asks happy customers for a review, and compares you with competitors you pick.
            </p>
            {migrated && <p style={{ fontSize: 12.5, color: '#3f9142', margin: '0 0 14px' }}>{migrated}</p>}
            {gbp?.status === 'connected' && !gbp.location && <p style={{ fontSize: 12.5, color: INK, margin: '0 0 14px' }}>Business Profile is connected — choose which of your locations this workspace is under Review sources.</p>}
            <button onClick={() => setSetupOpen('sources')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', background: INK, color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              <Search size={16} /> Find your business on Google
            </button>
          </div>
        </div>
        {setup}
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Header title="Reputation" subtitle={`${youName} · ${src?.reviewCount ?? total} reviews on Google · ${responseRate}% of those here answered`} />

      <div style={{ padding: '10px 16px 0', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', maxWidth: 1320, margin: '0 auto', boxSizing: 'border-box' }}>
        <button onClick={toggleAuto} aria-pressed={!!src?.autoCheck} title="Checks Google for new reviews every six hours, with nobody signed in" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, padding: '6px 13px', borderRadius: 999, border: 'none', cursor: 'pointer', background: src?.autoCheck ? '#e9f4e6' : '#f0f1f3', color: src?.autoCheck ? '#3f9142' : '#7c828c' }}>
          {src?.autoCheck ? <span className="live-dot" style={{ width: 7, height: 7, borderRadius: 999, background: '#4ade80' }} /> : <Radio size={12} />}
          {src?.autoCheck ? 'Live monitoring' : 'Monitoring off'}
        </button>
        <span style={{ fontSize: 11.5, color: MUTED }}>{src?.lastCheckedAt ? `Last checked ${relTime(src.lastCheckedAt)}` : 'Not checked yet'}</span>
        <button onClick={doCheck} disabled={checking} style={btn(false)}><RefreshCw size={13} /> {checking ? 'Checking…' : 'Refresh'}</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setReqOpen(true)} style={btn(false)}><MessageSquarePlus size={14} /> Request Reviews</button>
          <button onClick={() => setSetupOpen('business')} aria-label="Reputation settings" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: INK, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}><Settings2 size={14} /> Settings</button>
        </div>
      </div>

      <div style={{ padding: '14px 16px 28px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1320, margin: '0 auto', boxSizing: 'border-box' }}>
        {/* ── What is true about the source right now ── */}
        {loadError && <Banner tone="error">{loadError}</Banner>}
        {migrated && <Banner tone="ok">{migrated}</Banner>}
        {src?.lastError && <Banner tone="error">{src.lastError}</Banner>}
        {gbp?.status === 'connected' && !gbp.location && (
          <Banner tone="info">Business Profile is connected. <button onClick={() => setSetupOpen('sources')} style={linkBtn}>Choose which location this workspace is</button> to read every review and reply from here.</Banner>
        )}
        {gbp?.status === 'error' && <Banner tone="error">{gbp.lastError || 'The Business Profile connection stopped working.'} <button onClick={() => setSetupOpen('sources')} style={linkBtn}>Connect again</button></Banner>}
        {!gbpLive && src?.placeId && (
          <Banner tone="info">
            Reading through Google Places, which shows at most {status?.placesReviewLimit ?? 5} reviews, chosen by Google, and cannot post replies.{' '}
            <button onClick={() => setSetupOpen('sources')} style={linkBtn}>Connect Google Business Profile</button> to read all of them and reply from here.
          </Banner>
        )}

        {/* ── KPI row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 16 }}>
          <div style={{ ...CARD, padding: '20px 22px' }}>
            <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 600, marginBottom: 6 }}>Google rating</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: INK, letterSpacing: '-0.03em' }}>{src?.rating != null ? src.rating.toFixed(1) : '—'}</div>
            <div style={{ marginTop: 6 }}><Stars n={Math.round(src?.rating ?? 0)} size={15} /></div>
          </div>
          {[
            { label: 'Reviews on Google', value: src?.reviewCount ?? '—', sub: `${total} read here` },
            { label: 'Response rate', value: `${responseRate}%`, sub: `${answered} of ${total} read here answered` },
            { label: 'Needs attention', value: attention, sub: 'flagged by your rules or a failed auto-reply' },
          ].map(k => (
            <div key={k.label} style={{ ...CARD, padding: '20px 22px' }}>
              <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 600, marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: INK, letterSpacing: '-0.03em' }}>{k.value}</div>
              <div style={{ fontSize: 11.5, color: FAINT, marginTop: 6, fontWeight: 500 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Insight row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 16 }}>
          <div style={FROST}>
            <div style={{ fontSize: 14, fontWeight: 800, color: INK, marginBottom: 4 }}>Rating breakdown</div>
            <div style={{ fontSize: 11.5, color: FAINT, marginBottom: 12 }}>Of the {total} review{total === 1 ? '' : 's'} read here</div>
            {[5, 4, 3, 2, 1].map(star => {
              const c = reviews.filter(r => r.rating === star).length;
              const pct = total ? Math.round((c / total) * 100) : 0;
              return (
                <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 34, fontSize: 12, color: '#475569', fontWeight: 600 }}>{star}<Star size={11} fill={AMBER} color={AMBER} /></span>
                  <div style={{ flex: 1, height: 8, background: '#eceef1', borderRadius: 999 }}><div style={{ height: '100%', width: `${pct}%`, background: star >= 4 ? '#3f9142' : star === 3 ? AMBER : '#e5484d', borderRadius: 999 }} /></div>
                  <span style={{ minWidth: 30, textAlign: 'right', fontSize: 11.5, color: FAINT, fontWeight: 600 }}>{pct}%</span>
                </div>
              );
            })}
          </div>

          <div style={FROST}>
            <div style={{ fontSize: 14, fontWeight: 800, color: INK, marginBottom: 14 }}>What customers mention</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}><ThumbsUp size={13} color="#3f9142" /><span style={{ fontSize: 11.5, fontWeight: 700, color: '#3f9142' }}>Loved</span></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {posThemes.length ? posThemes.map(t => <span key={t.word} style={theme('#e9f4e6', '#3f9142', t.count)}>{t.word} · {t.count}</span>) : <span style={{ fontSize: 12, color: FAINT }}>Nothing yet</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}><ThumbsDown size={13} color="#e5484d" /><span style={{ fontSize: 11.5, fontWeight: 700, color: '#e5484d' }}>Concerns</span></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {negThemes.length ? negThemes.map(t => <span key={t.word} style={theme('#fceaea', '#e5484d', t.count)}>{t.word} · {t.count}</span>) : <span style={{ fontSize: 12, color: FAINT }}>None in the reviews read here</span>}
            </div>
          </div>

          <CompetitorPanel comp={comp} onChange={setCompetitors} notify={addNotification} />
        </div>

        {/* ── Review requests: what really happened to each ── */}
        {requests.length > 0 && <RequestList requests={requests} />}

        {/* ── Filter bar ── */}
        <div style={{ display: 'flex', gap: 4, padding: 4, background: '#fff', borderRadius: 12, boxShadow: '0 1px 2px rgba(23,25,28,0.05)', alignSelf: 'flex-start', flexWrap: 'wrap', maxWidth: '100%' }}>
          {([['all', 'All'], ['unreplied', 'Needs reply'], ['attention', 'Attention'], ['negative', 'Negative']] as const).map(([f, label]) => (
            <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} style={{ padding: '6px 13px', borderRadius: 8, border: 'none', background: filter === f ? INK : 'transparent', color: filter === f ? '#fff' : '#5c6066', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{label}</button>
          ))}
        </div>

        {/* ── Reviews ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.length === 0 && (
            <div style={{ ...CARD, padding: 24, textAlign: 'center', fontSize: 13, color: MUTED }}>
              {total === 0 ? (src?.lastCheckedAt ? 'Google returned no reviews for this business yet.' : 'Not read from Google yet — press Refresh.') : 'No reviews match this filter.'}
            </div>
          )}
          {filtered.map(r => {
            const d = draft[r.id] ?? '';
            const done = r.replyState === 'posted' || r.replyState === 'posted_elsewhere';
            const sent = sentimentOf(r.rating, r.content);
            return (
              <div key={r.id} data-review={r.id} style={{ ...CARD, padding: '18px 18px', border: r.attention ? '1px solid #f3c2c2' : undefined }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    {r.authorPhoto
                      ? <img src={r.authorPhoto} alt="" referrerPolicy="no-referrer" style={{ width: 40, height: 40, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
                      : <div style={{ width: 40, height: 40, borderRadius: 12, background: '#eceef1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: INK, fontSize: 15, fontWeight: 800, flexShrink: 0 }}>{(r.author || '?')[0]}</div>}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.author}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}><Stars n={r.rating} /><span style={{ fontSize: 12, color: FAINT }}>{relTime(r.time)}</span></div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span title={r.source === 'google_business' ? 'Read through Business Profile' : 'Read through Google Places'} style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#fef2f2', color: '#ea4335' }}>Google</span>
                    {r.attention && <span style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#fceaea', color: '#e5484d' }}><AlertTriangle size={10} />Attention</span>}
                    {!done && !r.attention && <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: sent === 'negative' ? '#fceaea' : '#fdf5e7', color: sent === 'negative' ? '#e5484d' : '#c77414' }}>Needs reply</span>}
                  </div>
                </div>
                <p style={{ fontSize: 14, color: r.content ? '#374151' : FAINT, lineHeight: 1.65, margin: '0 0 12px', overflowWrap: 'anywhere' }}>{r.content || 'A star rating with no words.'}</p>
                {r.note && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: '#7c5a10', background: '#fdf5e7', borderRadius: 10, padding: '8px 10px', marginBottom: 10 }}>
                    <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} /><span style={{ flex: 1 }}>{r.note}</span>
                    {r.attention && <button onClick={() => dismiss(r)} style={{ ...linkBtn, fontSize: 11.5 }}>Dismiss</button>}
                  </div>
                )}

                {done ? (
                  <div style={{ padding: '12px 16px', background: '#f7f8f9', borderRadius: 12, borderLeft: `3px solid ${INK}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                      <Reply size={12} color={INK} />
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: INK }}>{r.replyState === 'posted' ? 'Your reply on Google' : 'Marked as replied — posted on Google by hand'}</span>
                      {r.auto && <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: '#e9f4e6', color: '#3f9142' }}><Zap size={9} />Auto</span>}
                    </div>
                    {r.reply && <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, margin: 0, overflowWrap: 'anywhere' }}>{r.reply}</p>}
                  </div>
                ) : (
                  <div>
                    <textarea data-field="rep.reply" aria-label={`Reply to ${r.author}`} value={d} onChange={e => setDraft(prev => ({ ...prev, [r.id]: e.target.value }))} placeholder="Write a public reply…" rows={d ? 3 : 2}
                      style={{ width: '100%', padding: '10px 14px', border: '1px solid #e6e9f0', borderRadius: 10, fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box', marginBottom: 8 }} />
                    {problem[r.id] && <div role="alert" style={{ fontSize: 12, color: '#b42318', marginBottom: 8, lineHeight: 1.5 }}>{problem[r.id]}</div>}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button onClick={() => aiDraft(r)} disabled={busy === `ai:${r.id}`} style={pill(INK, '#fff')}><Sparkles size={12} /> {busy === `ai:${r.id}` ? 'Drafting…' : 'AI reply'}</button>
                      {r.canPost ? (
                        <button onClick={() => post(r)} disabled={!d.trim() || busy === `post:${r.id}`} style={pill(d.trim() ? INK : '#c7cbd1', '#fff')}><Send size={12} /> {busy === `post:${r.id}` ? 'Posting…' : 'Post to Google'}</button>
                      ) : (
                        <button onClick={() => copyAndOpen(r)} disabled={!r.link} title={r.link ? '' : 'Google gave no link for this review'} style={pill('#fff', INK, true)}><Copy size={12} /> Copy reply & open on Google <ExternalLink size={11} /></button>
                      )}
                      <button onClick={() => markDone(r)} disabled={busy === `mark:${r.id}`} style={pill('#fff', INK, true)}><Check size={12} /> Mark as replied</button>
                    </div>
                    {!r.canPost && <div style={{ fontSize: 11.5, color: FAINT, marginTop: 6 }}>Google only takes replies through Business Profile. Post it there, then mark it here.</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {setup}
      {reqOpen && <RequestModal contacts={contacts} profile={profile} onClose={() => setReqOpen(false)} onSent={refresh} addNotification={addNotification} />}
    </div>
  );
}

function Banner({ tone, children }: { tone: 'error' | 'info' | 'ok'; children: React.ReactNode }) {
  const c = tone === 'error' ? { bg: '#fdecec', fg: '#b42318', bd: '#f5c2c0' } : tone === 'ok' ? { bg: '#e9f4e6', fg: '#2f6b31', bd: '#cfe6c8' } : { bg: '#f3f5f8', fg: '#475569', bd: '#e6e9f0' };
  return <div role={tone === 'error' ? 'alert' : undefined} style={{ background: c.bg, color: c.fg, border: `1px solid ${c.bd}`, borderRadius: 12, padding: '10px 14px', fontSize: 12.5, lineHeight: 1.55, overflowWrap: 'anywhere' }}>{children}</div>;
}

/* ── Competitors: real places, Google's own numbers ── */
function CompetitorPanel({ comp, onChange, notify }: { comp: Competitor[]; onChange: (c: Competitor[]) => void; notify: (m: string, t?: 'success' | 'error' | 'info') => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const search = async () => {
    setBusy(true); setErr('');
    const r = await findPlace(q, 'rep.competitorSearch');
    setBusy(false);
    if (!r.success) { setErr(r.error ?? 'Search failed.'); setHits([]); return; }
    setHits(r.places);
    if (!r.places.length) setErr('Google found nothing for that.');
  };
  const add = async (p: PlaceHit) => {
    const r = await addCompetitor(p.placeId);
    if (!r.success) { setErr(r.error ?? 'Could not add it.'); return; }
    onChange(r.competitors); setHits([]); setQ('');
    notify(`Comparing with ${p.name}.`, 'success');
  };
  const remove = async (placeId: string) => { const r = await removeCompetitor(placeId); if (r.success) onChange(r.competitors); };
  return (
    <div style={FROST}>
      <div style={{ fontSize: 14, fontWeight: 800, color: INK, marginBottom: 12 }}>vs. competitors</div>
      {comp.length === 0 && <div style={{ fontSize: 12, color: FAINT, marginBottom: 10 }}>Add businesses to compare with — their rating and count come from Google.</div>}
      {comp.map(c => {
        const you = c.placeId === '__you';
        return (
          <div key={c.placeId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, marginBottom: 6, background: you ? INK : '#fff' }}>
            {you && <Trophy size={13} color="#c7f441" style={{ flexShrink: 0 }} />}
            <span title={c.lastError || c.name} style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: you ? 700 : 600, color: you ? '#fff' : INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: you ? '#fff' : INK }}>{c.rating != null ? c.rating.toFixed(1) : '—'}</span>
            <Star size={12} fill={AMBER} color={AMBER} />
            <span style={{ fontSize: 10.5, color: you ? 'rgba(255,255,255,0.6)' : FAINT, minWidth: 30, textAlign: 'right' }}>{c.reviewCount ?? ''}</span>
            {!you && <button onClick={() => remove(c.placeId)} aria-label={`Remove ${c.name}`} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}><Trash2 size={12} color={FAINT} /></button>}
          </div>
        );
      })}
      {comp.filter(c => c.placeId !== '__you').length < 5 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input data-field="rep.competitorSearch" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void search(); }} placeholder="Add a competitor — name and town, or Maps link" aria-label="Search for a competitor"
            style={{ flex: 1, minWidth: 0, padding: '8px 10px', border: '1px solid #e6e9f0', borderRadius: 9, fontSize: 12.5, outline: 'none', fontFamily: 'inherit' }} />
          <button onClick={search} disabled={busy || q.trim().length < 3} style={btn(false)}><Search size={12} /> {busy ? '…' : 'Find'}</button>
        </div>
      )}
      {err && <div style={{ fontSize: 11.5, color: '#b42318', marginTop: 6, lineHeight: 1.5 }}>{err}</div>}
      {hits.map(h => (
        <button key={h.placeId} onClick={() => add(h)} style={{ display: 'block', width: '100%', textAlign: 'left', marginTop: 6, padding: '8px 10px', border: '1px solid #e6e9f0', borderRadius: 9, background: '#fff', cursor: 'pointer' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>{h.name} {h.rating != null && <span style={{ color: MUTED, fontWeight: 600 }}>· {h.rating.toFixed(1)}★ ({h.count ?? 0})</span>}</div>
          <div style={{ fontSize: 11, color: FAINT }}>{h.address}</div>
        </button>
      ))}
    </div>
  );
}

function RequestList({ requests }: { requests: ReviewRequest[] }) {
  const counts = { queued: 0, sent: 0, failed: 0 } as Record<string, number>;
  for (const r of requests) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return (
    <div style={{ ...CARD, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: INK }}>Review requests</span>
        <span style={{ fontSize: 12, color: MUTED }}>{counts.sent ?? 0} sent · {counts.queued ?? 0} queued · {counts.failed ?? 0} failed</span>
      </div>
      <div style={{ display: 'grid', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
        {requests.slice(0, 30).map(r => (
          <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 12.5, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: INK, minWidth: 0, overflowWrap: 'anywhere' }}>{r.contactName || r.email || r.contactId || 'A contact'}</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 999, background: r.status === 'sent' ? '#e9f4e6' : r.status === 'failed' ? '#fceaea' : '#f0f1f3', color: r.status === 'sent' ? '#3f9142' : r.status === 'failed' ? '#e5484d' : '#5c6066' }}>{r.status}</span>
            <span style={{ color: FAINT, fontSize: 11.5 }}>{relTime(r.sentAt ?? r.createdAt ?? null)}</span>
            {r.error && <span style={{ color: '#b42318', fontSize: 11.5, flexBasis: '100%', overflowWrap: 'anywhere' }}>{r.error}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Review-request campaign: sent by the server, from the workspace's mailbox ── */
function RequestModal({ contacts, profile, onClose, onSent, addNotification }: {
  contacts: { name: string; email: string }[];
  profile: BusinessProfile;
  onClose: () => void;
  onSent: () => void;
  addNotification: (m: string, t?: 'success' | 'error' | 'info') => void;
}) {
  const [platform, setPlatform] = useState<Platform>('google');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const link = profile.reviewLinks[platform] || '';
  const withEmail = contacts.filter(c => c.email);

  const send = async () => {
    const picks = withEmail.filter(c => selected.has(c.email)).map(c => ({ name: c.name, email: c.email }));
    if (picks.length === 0) { setError('Select at least one contact.'); return; }
    setSending(true); setError('');
    /* The server reads the review link from the synced profile; a link saved
       a moment ago may still be waiting in the sync queue. */
    await flushNow().catch(() => undefined);
    const r = await sendRequests(picks, platform);
    setSending(false);
    if (!r.success) { setError(r.error ?? 'Nothing was sent.'); onSent(); return; }
    addNotification(`Sent ${r.sent} review request${r.sent === 1 ? '' : 's'}${r.failed ? ` — ${r.failed} failed` : ''}.`, r.failed ? 'info' : 'success');
    onSent();
    onClose();
  };

  return (
    <div role="dialog" aria-label="Request reviews" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 560, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 48px -12px rgba(16,24,40,0.28)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 20px', borderBottom: '1px solid #e9edf3', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><MessageSquarePlus size={17} color="#fff" /></div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: 0 }}>Request Reviews</h3>
              <p style={{ fontSize: 12, color: MUTED, margin: '1px 0 0' }}>Ask happy customers to leave a review by email.</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: '#f1f5f9', borderRadius: 9, padding: 7, cursor: 'pointer', display: 'flex' }}><X size={16} color="#64748b" /></button>
        </div>
        <div style={{ padding: '16px 20px', flex: 1, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, marginBottom: 14 }}>
            {(['google', 'facebook', 'yelp', 'trustpilot'] as Platform[]).map(p => (
              <button key={p} onClick={() => setPlatform(p)} aria-pressed={platform === p} style={{ padding: '8px 4px', borderRadius: 9, border: `1px solid ${platform === p ? INK : '#e6e9f0'}`, background: platform === p ? INK : '#fff', color: platform === p ? '#fff' : '#5c6066', fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p}</button>
            ))}
          </div>
          {!link && <div style={{ padding: '9px 12px', background: '#fdf5e7', border: '1px solid #f5d98e', borderRadius: 10, fontSize: 12, color: '#c77414', marginBottom: 12 }}>No {platform} link set — add one in Settings → Review sources.</div>}
          {error && <div role="alert" style={{ padding: '9px 12px', background: '#fdecec', borderRadius: 10, fontSize: 12, color: '#b42318', marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>Select contacts ({selected.size})</span>
            <button onClick={() => setSelected(selected.size === withEmail.length ? new Set() : new Set(withEmail.map(c => c.email)))} style={{ border: 'none', background: 'none', color: INK, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{selected.size === withEmail.length && withEmail.length ? 'Clear' : 'Select all'}</button>
          </div>
          {withEmail.length === 0 && <p style={{ fontSize: 13, color: FAINT, textAlign: 'center', padding: 20 }}>No contacts with email addresses yet.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {withEmail.slice(0, 50).map(c => {
              const on = selected.has(c.email);
              return (
                <button key={c.email} onClick={() => setSelected(s => { const n = new Set(s); if (on) n.delete(c.email); else n.add(c.email); return n; })}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, border: `1px solid ${on ? INK : '#e6e9f0'}`, background: on ? '#f7f8f9' : '#fff', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ width: 18, height: 18, borderRadius: 6, border: `2px solid ${on ? INK : '#cbd5e1'}`, background: on ? INK : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{on && <span style={{ color: '#fff', fontSize: 11, fontWeight: 800 }}>✓</span>}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: INK }}>{c.name}</div>
                    <div style={{ fontSize: 11.5, color: FAINT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid #e9edf3', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5, color: FAINT, display: 'flex', alignItems: 'center', gap: 5 }}><Mail size={12} /> Sends from this workspace's mailbox</span>
          <button onClick={send} disabled={sending || selected.size === 0 || !link} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 20px', background: selected.size && link ? INK : '#c7cbd1', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: selected.size && link ? 'pointer' : 'not-allowed' }}>
            <Send size={13} /> {sending ? 'Sending…' : `Send ${selected.size || ''} request${selected.size === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const linkBtn: React.CSSProperties = { border: 'none', background: 'none', padding: 0, color: 'inherit', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontSize: 'inherit', fontFamily: 'inherit' };
function btn(active: boolean): React.CSSProperties {
  return { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', border: '1px solid #e6e9f0', borderRadius: 10, background: active ? INK : '#fff', color: active ? '#fff' : '#374151', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0 };
}
function pill(bg: string, fg: string, outline = false): React.CSSProperties {
  return { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: bg, color: fg, border: outline ? '1px solid #e6e9f0' : 'none', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer' };
}
function theme(bg: string, color: string, count: number): React.CSSProperties {
  const scale = Math.min(1, 0.55 + count * 0.15);
  return { fontSize: 11.5 + Math.min(3, count), fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: bg, color, opacity: scale, textTransform: 'capitalize' };
}
