import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Star, Send, Sparkles, Settings2, RefreshCw, TrendingUp, TrendingDown,
  Reply, Zap, AlertTriangle, MessageSquarePlus, ThumbsUp, ThumbsDown,
  Trophy, X, Mail, Radio,
} from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import ReputationSetup from './ReputationSetup';
import { draftReviewReply, hasGeminiKey } from '../../lib/gemini';
import { sendEmail, loadEmailConfig } from '../../services/emailService';
import {
  loadReviews, saveReviews, loadProfile, saveProfile, loadRules, saveRules,
  loadRequests, saveRequests, loadCompetitors, makeIncomingReview, matchRule,
  loadGoogle, saveGoogle,
  trendingThemes, sentimentOf,
} from '../../services/reputationService';
import type { RepReview, BusinessProfile, AutoResponseRule, Platform, ReviewRequest } from '../../services/reputationService';

const INK = '#17191c';
const MUTED = '#8a8f98';
const FAINT = '#b0b4ba';
const AMBER = '#f59e0b';
const FROST: React.CSSProperties = { background: 'rgba(255,255,255,0.6)', borderRadius: 20, padding: 20 };
const CARD: React.CSSProperties = { background: '#fff', borderRadius: 18, boxShadow: '0 1px 2px rgba(23,25,28,0.05)' };

const PLATFORM = {
  google: { label: 'Google', color: '#ea4335', bg: '#fef2f2' },
  facebook: { label: 'Facebook', color: '#1877f2', bg: '#eff6ff' },
  yelp: { label: 'Yelp', color: '#d32323', bg: '#fef2f2' },
  trustpilot: { label: 'Trustpilot', color: '#00b67a', bg: '#e6f7f1' },
} as const;

function Stars({ n, size = 14 }: { n: number; size?: number }) {
  return <div style={{ display: 'flex', gap: 2 }}>{[1, 2, 3, 4, 5].map(s => <Star key={s} size={size} fill={s <= n ? AMBER : 'none'} color={s <= n ? AMBER : '#e2e8f0'} />)}</div>;
}
function relTime(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function useCountUp(target: number, dur = 900) {
  const [v, setV] = useState(0);
  useEffect(() => { let raf = 0; const t0 = performance.now(); const tick = (t: number) => { const p = Math.min(1, (t - t0) / dur); setV(target * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf); }, [target, dur]);
  return v;
}

export default function Reputation() {
  const { reviews: legacy, contacts, addNotification } = useApp();
  const [reviews, setReviews] = useState<RepReview[]>(loadReviews);
  const [profile, setProfile] = useState<BusinessProfile>(loadProfile);
  const [rules, setRules] = useState<AutoResponseRule[]>(loadRules);
  const [requests, setRequests] = useState<ReviewRequest[]>(loadRequests);
  const [google, setGoogle] = useState(loadGoogle);
  const competitors = loadCompetitors();

  const [filter, setFilter] = useState<'all' | 'unreplied' | 'negative' | Platform>('all');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [aiBusy, setAiBusy] = useState<string>('');
  const [setupOpen, setSetupOpen] = useState(false);
  const [reqOpen, setReqOpen] = useState(false);
  const [live, setLive] = useState(true);
  const autoRef = useRef<Set<string>>(new Set());

  const persist = (list: RepReview[]) => { setReviews(list); saveReviews(list); };

  /* one-time: merge any legacy reviews from AppContext into the store */
  useEffect(() => {
    if (legacy.length && reviews.every(r => !r.id.startsWith('legacy-'))) {
      /* Legacy records come from an older shape and from imports, so nothing
         about them is assumed: a missing author, a rating that arrived as a
         string, a date that will not parse. `new Date('nonsense').toISOString()`
         throws rather than returning undefined, which is why the optional call
         that used to be here never caught it. */
      const asDate = (v: unknown): string => {
        const d = new Date(typeof v === 'string' || typeof v === 'number' ? v : NaN);
        return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
      };
      const merged = [
        ...legacy.map((l, i) => {
          const content = typeof l?.content === 'string' ? l.content : '';
          const rating = Number(l?.rating);
          return {
            id: `legacy-${i}`,
            platform: (l?.platform || 'google') as Platform,
            rating: Number.isFinite(rating) ? rating : 0,
            author: typeof l?.author === 'string' && l.author.trim() ? l.author : 'Someone',
            content,
            date: asDate(l?.date),
            replied: l?.replied === true,
            sentiment: sentimentOf(rating, content),
          } as RepReview;
        }),
        ...reviews,
      ];
      // de-dupe by author+content
      const seen = new Set<string>();
      const unique = merged.filter(r => { const k = `${r.author}|${r.content}`; if (seen.has(k)) return false; seen.add(k); return true; });
      persist(unique);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Live stream: a new review arrives every ~20-40s ── */
  useEffect(() => {
    if (!live) return;
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(() => {
        const r = makeIncomingReview();
        setReviews(prev => { const next = [r, ...prev]; saveReviews(next); return next; });
        addNotification(`⭐ New ${r.rating}-star review on ${PLATFORM[r.platform].label} from ${r.author}`, r.rating <= 2 ? 'error' : 'success');
        setTimeout(() => setReviews(prev => prev.map(x => x.id === r.id ? { ...x, isNew: false } : x)), 5000);
        runAuto(r);
        schedule();
      }, 20000 + Math.random() * 20000);
    };
    schedule();
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, rules, profile]);

  /* ── Auto-response engine ── */
  const runAuto = useCallback(async (r: RepReview) => {
    if (autoRef.current.has(r.id) || r.replied) return;
    const rule = matchRule(rules, r.rating);
    if (!rule) return;
    autoRef.current.add(r.id);
    if (rule.mode === 'alert') {
      addNotification(`🚨 ${r.rating}★ review needs your attention — ${r.author}`, 'error');
      return;
    }
    if (!hasGeminiKey()) return;
    try {
      const text = await draftReviewReply(profile, r, rule.instruction);
      if (rule.mode === 'auto_send') {
        setReviews(prev => { const next = prev.map(x => x.id === r.id ? { ...x, replied: true, reply: text, autoReplied: true } : x); saveReviews(next); return next; });
        addNotification(`🤖 Auto-replied to ${r.author}'s ${r.rating}★ review`, 'success');
      } else {
        setDraft(prev => ({ ...prev, [r.id]: text }));
      }
      setRules(rs => { const next = rs.map(x => x.id === rule.id ? { ...x, runs: x.runs + 1 } : x); saveRules(next); return next; });
    } catch { /* ignore */ }
  }, [rules, profile, addNotification]);

  /* ── Derived stats ── */
  const total = reviews.length;
  const avg = total ? reviews.reduce((s, r) => s + r.rating, 0) / total : 0;
  const replied = reviews.filter(r => r.replied).length;
  const responseRate = total ? Math.round((replied / total) * 100) : 0;
  const weekAgo = Date.now() - 7 * 86400000;
  const newThisWeek = reviews.filter(r => new Date(r.date).getTime() > weekAgo).length;
  const prevAvg = (() => { const old = reviews.filter(r => new Date(r.date).getTime() <= weekAgo); return old.length ? old.reduce((s, r) => s + r.rating, 0) / old.length : avg; })();
  const trend = avg - prevAvg;
  const animAvg = useCountUp(avg, 900);
  const animRate = useCountUp(responseRate, 900);

  const posThemes = trendingThemes(reviews, 'positive');
  const negThemes = trendingThemes(reviews, 'negative');

  const comp = competitors.map(c => c.name === 'Your business' ? { ...c, rating: Number(avg.toFixed(1)), reviewCount: total } : c).sort((a, b) => b.rating - a.rating);

  const filtered = reviews.filter(r =>
    filter === 'all' ? true :
    filter === 'unreplied' ? !r.replied :
    filter === 'negative' ? r.sentiment === 'negative' :
    r.platform === filter,
  );

  /* ── Actions ── */
  const aiDraft = async (r: RepReview) => {
    if (!hasGeminiKey()) { addNotification('Add a Gemini API key to draft AI replies.', 'error'); return; }
    setAiBusy(r.id);
    try { const text = await draftReviewReply(profile, r, ''); setDraft(prev => ({ ...prev, [r.id]: text })); }
    catch (e) { addNotification(e instanceof Error ? e.message : 'AI draft failed', 'error'); }
    finally { setAiBusy(''); }
  };
  const publishReply = (r: RepReview) => {
    const text = draft[r.id]?.trim();
    if (!text) return;
    persist(reviews.map(x => x.id === r.id ? { ...x, replied: true, reply: text } : x));
    setDraft(prev => { const n = { ...prev }; delete n[r.id]; return n; });
    addNotification(`Reply posted to ${r.author}'s review`, 'success');
  };

  const saveSettings = (p: BusinessProfile, r: AutoResponseRule[], g: { apiKey: string; placeId: string }) => {
    setProfile(p); saveProfile(p); setRules(r); saveRules(r); setGoogle(g); saveGoogle(g);
    setSetupOpen(false);
    addNotification('Reputation settings saved', 'success');
  };

  /* ── Empty state ── */
  if (!profile.name) {
    return (
      <div style={{ minHeight: '100vh' }}>
        <Header title="Reviews" subtitle="Watch what people say and answer it" />
        <div style={{ padding: '60px 28px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ maxWidth: 470, textAlign: 'center', ...FROST, borderRadius: 24, padding: '40px 32px' }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}><Star size={28} color="#fff" fill="#fff" /></div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: INK, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Own your reputation</h2>
            <p style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.6, margin: '0 0 22px' }}>
              Aggregate reviews from Google, Facebook, Yelp & Trustpilot into one live feed. Auto-respond with on-brand AI replies, request new reviews from happy customers, and benchmark against competitors.
            </p>
            <button onClick={() => setSetupOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', background: INK, color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              <Settings2 size={16} /> Set up Reputation
            </button>
          </div>
        </div>
        {setupOpen && <ReputationSetup profile={profile} rules={rules} google={google} onSave={saveSettings} onClose={() => setSetupOpen(false)} />}
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Header title="Reputation" subtitle={`${profile.name} · ${total} reviews · ${responseRate}% responded`} />

      <div style={{ padding: '10px 28px 0', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={() => setLive(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, padding: '6px 13px', borderRadius: 999, border: 'none', cursor: 'pointer', background: live ? '#e9f4e6' : '#f0f1f3', color: live ? '#3f9142' : '#7c828c' }}>
          {live ? <span style={{ width: 7, height: 7, borderRadius: 999, background: '#4ade80', animation: 'pulse-dot 1.6s ease-in-out infinite' }} /> : <Radio size={12} />}
          {live ? 'Live monitoring' : 'Paused'}
        </button>
        <button onClick={() => addNotification('Refreshed — checking connected sources.', 'info')} style={btn(false)}><RefreshCw size={13} /> Refresh</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => setReqOpen(true)} style={btn(false)}><MessageSquarePlus size={14} /> Request Reviews</button>
          <button onClick={() => setSetupOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: INK, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}><Settings2 size={14} /> Settings</button>
        </div>
      </div>

      <div style={{ padding: '14px 28px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── KPI row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
          <div style={{ ...CARD, padding: '20px 22px' }}>
            <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 600, marginBottom: 6 }}>Overall rating</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 30, fontWeight: 800, color: INK, letterSpacing: '-0.03em' }}>{animAvg.toFixed(1)}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11.5, fontWeight: 700, color: trend >= 0 ? '#3f9142' : '#e5484d' }}>
                {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{Math.abs(trend).toFixed(1)}
              </span>
            </div>
            <div style={{ marginTop: 6 }}><Stars n={Math.round(avg)} size={15} /></div>
          </div>
          {[
            { label: 'Total reviews', value: total, sub: `${newThisWeek} new this week` },
            { label: 'Response rate', value: `${Math.round(animRate)}%`, sub: `${replied} of ${total} replied` },
            { label: 'Needs attention', value: reviews.filter(r => !r.replied && r.sentiment === 'negative').length, sub: 'negative & unanswered' },
          ].map(k => (
            <div key={k.label} style={{ ...CARD, padding: '20px 22px' }}>
              <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 600, marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: INK, letterSpacing: '-0.03em' }}>{k.value}</div>
              <div style={{ fontSize: 11.5, color: FAINT, marginTop: 6, fontWeight: 500 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Insight row: distribution · sentiment themes · competitors ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr 1fr', gap: 16 }}>
          {/* distribution */}
          <div style={FROST}>
            <div style={{ fontSize: 14, fontWeight: 800, color: INK, marginBottom: 14 }}>Rating breakdown</div>
            {[5, 4, 3, 2, 1].map(star => {
              const c = reviews.filter(r => r.rating === star).length;
              const pct = total ? Math.round((c / total) * 100) : 0;
              return (
                <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 34, fontSize: 12, color: '#475569', fontWeight: 600 }}>{star}<Star size={11} fill={AMBER} color={AMBER} /></span>
                  <div style={{ flex: 1, height: 8, background: '#eceef1', borderRadius: 999 }}><div style={{ height: '100%', width: `${pct}%`, background: star >= 4 ? '#3f9142' : star === 3 ? AMBER : '#e5484d', borderRadius: 999, transition: 'width 0.6s' }} /></div>
                  <span style={{ minWidth: 30, textAlign: 'right', fontSize: 11.5, color: FAINT, fontWeight: 600 }}>{pct}%</span>
                </div>
              );
            })}
          </div>

          {/* sentiment themes */}
          <div style={FROST}>
            <div style={{ fontSize: 14, fontWeight: 800, color: INK, marginBottom: 14 }}>What customers mention</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}><ThumbsUp size={13} color="#3f9142" /><span style={{ fontSize: 11.5, fontWeight: 700, color: '#3f9142' }}>Loved</span></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {posThemes.length ? posThemes.map(t => <span key={t.word} style={theme('#e9f4e6', '#3f9142', t.count)}>{t.word} · {t.count}</span>) : <span style={{ fontSize: 12, color: FAINT }}>No data yet</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}><ThumbsDown size={13} color="#e5484d" /><span style={{ fontSize: 11.5, fontWeight: 700, color: '#e5484d' }}>Concerns</span></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {negThemes.length ? negThemes.map(t => <span key={t.word} style={theme('#fceaea', '#e5484d', t.count)}>{t.word} · {t.count}</span>) : <span style={{ fontSize: 12, color: FAINT }}>None — nice!</span>}
            </div>
          </div>

          {/* competitor benchmark */}
          <div style={FROST}>
            <div style={{ fontSize: 14, fontWeight: 800, color: INK, marginBottom: 14 }}>vs. competitors</div>
            {comp.map(c => {
              const you = c.name === 'Your business';
              return (
                <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, marginBottom: 6, background: you ? INK : '#fff' }}>
                  {you && <Trophy size={13} color="#c7f441" style={{ flexShrink: 0 }} />}
                  <span style={{ flex: 1, fontSize: 12.5, fontWeight: you ? 700 : 600, color: you ? '#fff' : INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{you ? profile.name : c.name}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: you ? '#fff' : INK }}>{c.rating.toFixed(1)}</span>
                  <Star size={12} fill={AMBER} color={AMBER} />
                  <span style={{ fontSize: 10.5, color: you ? 'rgba(255,255,255,0.6)' : FAINT, minWidth: 34, textAlign: 'right' }}>{c.reviewCount}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Filter bar ── */}
        <div style={{ display: 'flex', gap: 4, padding: 4, background: '#fff', borderRadius: 12, boxShadow: '0 1px 2px rgba(23,25,28,0.05)', alignSelf: 'flex-start', flexWrap: 'wrap' }}>
          {(['all', 'unreplied', 'negative', 'google', 'facebook', 'yelp', 'trustpilot'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 13px', borderRadius: 8, border: 'none', background: filter === f ? INK : 'transparent', color: filter === f ? '#fff' : '#5c6066', fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize' }}>
              {f === 'unreplied' ? 'Needs reply' : f}
            </button>
          ))}
        </div>

        {/* ── Live review feed ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(r => {
            const P = PLATFORM[r.platform];
            const d = draft[r.id];
            return (
              <div key={r.id} style={{ ...CARD, padding: '18px 22px', animation: r.isNew ? 'feed-in 0.5s cubic-bezier(0.16,1,0.3,1)' : undefined, border: r.isNew ? '1px solid #c7f441' : undefined }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: '#eceef1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: INK, fontSize: 15, fontWeight: 800, flexShrink: 0 }}>{r.author[0]}</div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: INK }}>{r.author}</span>
                        {r.isNew && <span style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: '#17191c', color: '#c7f441' }}>NEW</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}><Stars n={r.rating} /><span style={{ fontSize: 12, color: FAINT }}>{relTime(r.date)}</span></div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: P.bg, color: P.color }}>{P.label}</span>
                    {!r.replied && <span style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: r.sentiment === 'negative' ? '#fceaea' : '#fdf5e7', color: r.sentiment === 'negative' ? '#e5484d' : '#c77414' }}>{r.sentiment === 'negative' && <AlertTriangle size={10} />}Needs reply</span>}
                  </div>
                </div>
                <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.65, margin: '0 0 14px' }}>{r.content}</p>

                {r.replied ? (
                  <div style={{ padding: '12px 16px', background: '#f7f8f9', borderRadius: 12, borderLeft: `3px solid ${INK}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Reply size={12} color={INK} /><span style={{ fontSize: 11.5, fontWeight: 700, color: INK }}>Your reply</span>
                      {r.autoReplied && <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: '#e9f4e6', color: '#3f9142' }}><Zap size={9} />Auto</span>}
                    </div>
                    <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, margin: 0 }}>{r.reply}</p>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <button onClick={() => aiDraft(r)} disabled={aiBusy === r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: INK, color: '#fff', border: 'none', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        <Sparkles size={12} /> {aiBusy === r.id ? 'Drafting…' : 'AI reply'}
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <textarea value={d ?? ''} onChange={e => setDraft(prev => ({ ...prev, [r.id]: e.target.value }))} placeholder="Write a public reply…" rows={d ? 3 : 1}
                        style={{ flex: 1, padding: '10px 14px', border: '1px solid #e6e9f0', borderRadius: 10, fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }} />
                      <button onClick={() => publishReply(r)} disabled={!d?.trim()} style={{ padding: '9px 16px', background: d?.trim() ? INK : '#c7cbd1', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: d?.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, alignSelf: 'flex-start' }}>
                        <Send size={13} /> Post
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {setupOpen && <ReputationSetup profile={profile} rules={rules} google={google} onSave={saveSettings} onClose={() => setSetupOpen(false)} />}
      {reqOpen && <RequestModal contacts={contacts} profile={profile} requests={requests} setRequests={r => { setRequests(r); saveRequests(r); }} onClose={() => setReqOpen(false)} addNotification={addNotification} />}
    </div>
  );
}

/* ── Review-request campaign modal ── */
function RequestModal({ contacts, profile, requests, setRequests, onClose, addNotification }: {
  contacts: { name: string; email: string }[];
  profile: BusinessProfile;
  requests: ReviewRequest[];
  setRequests: (r: ReviewRequest[]) => void;
  onClose: () => void;
  addNotification: (m: string, t?: 'success' | 'error' | 'info') => void;
}) {
  const [platform, setPlatform] = useState<Platform>('google');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const link = profile.reviewLinks[platform] || '';
  const withEmail = contacts.filter(c => c.email);

  const send = async () => {
    const picks = withEmail.filter(c => selected.has(c.email));
    if (picks.length === 0) { addNotification('Select at least one contact.', 'error'); return; }
    if (!link) { addNotification(`Add a ${platform} review link in Settings → Review Sources first.`, 'error'); return; }
    setSending(true);
    const cfg = loadEmailConfig();
    let ok = 0;
    const newReqs: ReviewRequest[] = [];
    for (const c of picks) {
      const html = `<p>Hi ${c.name.split(' ')[0]},</p><p>Thanks for choosing ${profile.name}! Would you take 30 seconds to share your experience? It really helps us.</p><p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#17191c;color:#fff;border-radius:8px;text-decoration:none;font-weight:700">Leave a review</a></p><p>${profile.signature || ''}</p>`;
      const res = await sendEmail({ ...cfg, provider: cfg.provider === 'none' ? 'smtp' : cfg.provider }, { to: c.email, toName: c.name, subject: `How was your experience with ${profile.name}?`, html });
      if (res.success) ok++;
      newReqs.push({ id: `req-${Date.now()}-${ok}`, contactName: c.name, email: c.email, sentAt: new Date().toISOString(), status: 'sent', platform });
    }
    setRequests([...newReqs, ...requests]);
    setSending(false);
    addNotification(ok > 0 ? `Sent ${ok} review request${ok > 1 ? 's' : ''}!` : 'Could not send — check email settings.', ok > 0 ? 'success' : 'error');
    if (ok > 0) onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 560, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 48px -12px rgba(16,24,40,0.28)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e9edf3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: INK, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MessageSquarePlus size={17} color="#fff" /></div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: 0 }}>Request Reviews</h3>
              <p style={{ fontSize: 12, color: MUTED, margin: '1px 0 0' }}>Ask happy customers to leave a review by email.</p>
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', borderRadius: 9, padding: 7, cursor: 'pointer', display: 'flex' }}><X size={16} color="#64748b" /></button>
        </div>
        <div style={{ padding: '16px 24px', flex: 1, overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {(['google', 'facebook', 'yelp', 'trustpilot'] as Platform[]).map(p => (
              <button key={p} onClick={() => setPlatform(p)} style={{ flex: 1, padding: '8px', borderRadius: 9, border: `1px solid ${platform === p ? INK : '#e6e9f0'}`, background: platform === p ? INK : '#fff', color: platform === p ? '#fff' : '#5c6066', fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize' }}>{p}</button>
            ))}
          </div>
          {!link && <div style={{ padding: '9px 12px', background: '#fdf5e7', border: '1px solid #f5d98e', borderRadius: 10, fontSize: 12, color: '#c77414', marginBottom: 12 }}>⚠ No {platform} link set — add one in Settings → Review Sources.</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>Select contacts ({selected.size})</span>
            <button onClick={() => setSelected(selected.size === withEmail.length ? new Set() : new Set(withEmail.map(c => c.email)))} style={{ border: 'none', background: 'none', color: INK, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{selected.size === withEmail.length ? 'Clear' : 'Select all'}</button>
          </div>
          {withEmail.length === 0 && <p style={{ fontSize: 13, color: FAINT, textAlign: 'center', padding: 20 }}>No contacts with email addresses yet.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {withEmail.slice(0, 50).map(c => {
              const on = selected.has(c.email);
              return (
                <button key={c.email} onClick={() => setSelected(s => { const n = new Set(s); on ? n.delete(c.email) : n.add(c.email); return n; })}
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
        <div style={{ padding: '14px 24px', borderTop: '1px solid #e9edf3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11.5, color: FAINT, display: 'flex', alignItems: 'center', gap: 5 }}><Mail size={12} /> Sends via your configured email</span>
          <button onClick={send} disabled={sending || selected.size === 0} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 20px', background: selected.size ? INK : '#c7cbd1', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: selected.size ? 'pointer' : 'not-allowed' }}>
            <Send size={13} /> {sending ? 'Sending…' : `Send ${selected.size || ''} request${selected.size === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function btn(active: boolean): React.CSSProperties {
  return { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', border: '1px solid #e6e9f0', borderRadius: 10, background: active ? INK : '#fff', color: active ? '#fff' : '#374151', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' };
}
function theme(bg: string, color: string, count: number): React.CSSProperties {
  const scale = Math.min(1, 0.55 + count * 0.15);
  return { fontSize: 11.5 + Math.min(3, count), fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: bg, color, opacity: scale, textTransform: 'capitalize' };
}
