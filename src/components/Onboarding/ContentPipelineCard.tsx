/**
 * ContentPipelineCard — dashboard widget for the 12-month content pipeline.
 *
 * Before onboarding: a setup CTA that launches the AI wizard.
 * After onboarding: month-by-month status strip (Planned / Generating /
 * Review / Published), quick stats, and an expandable detail panel per month
 * with the theme, focus, holidays, ideas and audit trail.
 */
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, CalendarRange, ChevronDown, ChevronUp, ArrowRight, History, Loader, Mail, MessageSquare, Wand2, CheckCheck, X, Share2, Clapperboard, Copy } from 'lucide-react';
import { loadOnboarding, saveOnboarding, statusMeta, auditEntry, sanitizeText } from '../../services/onboarding';
import { startMonthGeneration, publishMonth } from '../../services/contentGen';
import { applyLaunchAssets } from '../../services/launchAssets';
import { useApp } from '../../context/AppContext';
import { getSession } from '../../services/auth';
import type { ContentMonth } from '../../types/onboarding';

const INK = '#17191c';
const MUTED = '#8a8f98';
const FROST: React.CSSProperties = { backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 24, padding: 20 };
const CARD: React.CSSProperties = { backgroundColor: '#fff', borderRadius: 18, boxShadow: '0 1px 2px rgba(23,25,28,0.05)' };
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid #e4e6ea',
  fontSize: 12.5, color: INK, outline: 'none', backgroundColor: '#fff', boxSizing: 'border-box', fontFamily: 'inherit',
};

/* ── Review & approve modal for a month awaiting approval ── */
const PLATFORM_META: Record<string, { label: string; color: string }> = {
  instagram: { label: 'Instagram', color: '#d946ef' },
  facebook: { label: 'Facebook', color: '#3e63dd' },
  linkedin: { label: 'LinkedIn', color: '#0ea5e9' },
};

function MonthReviewModal({ month, onClose, onPublished }: { month: ContentMonth; onClose: () => void; onPublished: () => void }) {
  const { addSequence, addCampaign, addSocialPost, addNotification } = useApp();
  const [content, setContent] = useState(() => month.generated!);
  const [copiedVideo, setCopiedVideo] = useState<number | null>(null);
  const actor = getSession()?.user.email || 'owner';
  const social = content.social ?? [];
  const videos = content.videos ?? [];

  const persistEdits = (next: typeof content) => {
    setContent(next);
    const ob = loadOnboarding();
    saveOnboarding({
      ...ob,
      plan: ob.plan.map(m => m.index === month.index
        ? { ...m, generated: next, audit: [...m.audit.filter(a => a.action !== 'Content edited during review'), auditEntry('Content edited during review', actor)] }
        : m),
    });
  };

  const approve = () => {
    const published = publishMonth(month.index, { addSequence, addCampaign, addSocialPost }, actor);
    if (published) {
      const bits = ['email sequence', content.sms.length ? 'SMS flow' : '', social.length ? `${social.length} social designs` : ''].filter(Boolean).join(' + ');
      addNotification(`${month.label} approved — ${bits} published across your modules`, 'success');
      onPublished();
      onClose();
    } else {
      addNotification('Could not publish this month — refresh and try again', 'error');
    }
  };

  // Portal to <body>: the widget sits inside an animated container whose
  // stacking context would otherwise trap this fixed overlay below siblings.
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 4200, backgroundColor: 'rgba(23,25,28,0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: 'min(760px, 100%)', maxHeight: '90vh', backgroundColor: '#f7f8fa', borderRadius: 22, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 32px 80px -16px rgba(23,25,28,0.5)' }}>
        <div style={{ padding: '18px 24px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #eceef1', backgroundColor: '#fff' }}>
          <div>
            <h3 style={{ fontSize: 16.5, fontWeight: 800, color: INK, margin: 0, letterSpacing: '-0.02em' }}>Review {month.label}</h3>
            <p style={{ fontSize: 12, color: MUTED, margin: '3px 0 0' }}>
              "{month.theme}" — edit anything below, then approve to push it live into Marketing.
            </p>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 999, border: 'none', backgroundColor: '#f0f1f3', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.07em', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Mail size={12} /> Email sequence — {content.emails.length} emails
          </span>
          {content.emails.map((e, i) => (
            <div key={i} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', backgroundColor: INK, padding: '3px 10px', borderRadius: 999, flexShrink: 0 }}>DAY {e.day}</span>
                <input style={{ ...inputStyle, fontWeight: 700 }} value={e.subject} maxLength={80}
                  onChange={ev => persistEdits({ ...content, emails: content.emails.map((x, xi) => xi === i ? { ...x, subject: sanitizeText(ev.target.value, 80) || x.subject } : x) })} />
              </div>
              <textarea style={{ ...inputStyle, minHeight: 92, resize: 'vertical', lineHeight: 1.55 }} value={e.body} maxLength={1600}
                onChange={ev => persistEdits({ ...content, emails: content.emails.map((x, xi) => xi === i ? { ...x, body: ev.target.value.slice(0, 1600) } : x) })} />
            </div>
          ))}

          {content.sms.length > 0 && (
            <>
              <span style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.07em', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <MessageSquare size={12} /> SMS flow — {content.sms.length} messages
              </span>
              {content.sms.map((s, i) => (
                <div key={i} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', backgroundColor: '#8b5cf6', padding: '3px 10px', borderRadius: 999, flexShrink: 0, marginTop: 8 }}>DAY {s.day}</span>
                  <div style={{ flex: 1 }}>
                    <textarea style={{ ...inputStyle, minHeight: 52, resize: 'vertical' }} value={s.message} maxLength={160}
                      onChange={ev => persistEdits({ ...content, sms: content.sms.map((x, xi) => xi === i ? { ...x, message: ev.target.value.slice(0, 160) } : x) })} />
                    <span style={{ fontSize: 10.5, color: s.message.length > 150 ? '#c77414' : MUTED, fontWeight: 600 }}>{s.message.length}/160</span>
                  </div>
                </div>
              ))}
            </>
          )}

          {social.length > 0 && (
            <>
              <span style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.07em', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <Share2 size={12} /> 30-day social calendar — {social.length} posts (approving creates editable designs in Social Creator)
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {social.map((p, i) => {
                  const meta = PLATFORM_META[p.platform] ?? PLATFORM_META.instagram;
                  return (
                    <div key={i} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', backgroundColor: INK, padding: '3px 9px', borderRadius: 999 }}>DAY {p.day}</span>
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', backgroundColor: meta.color, padding: '3px 9px', borderRadius: 999 }}>{meta.label}</span>
                      </div>
                      <input style={{ ...inputStyle, fontWeight: 700 }} value={p.headline} maxLength={60}
                        onChange={ev => persistEdits({ ...content, social: social.map((x, xi) => xi === i ? { ...x, headline: sanitizeText(ev.target.value, 60) || x.headline } : x) })} />
                      <textarea style={{ ...inputStyle, minHeight: 62, resize: 'vertical' }} value={p.caption} maxLength={400}
                        onChange={ev => persistEdits({ ...content, social: social.map((x, xi) => xi === i ? { ...x, caption: ev.target.value.slice(0, 400) } : x) })} />
                      <span style={{ fontSize: 10.5, color: MUTED, fontWeight: 600 }}>{p.hashtags.map(h => `#${h}`).join(' ')}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {videos.length > 0 && (
            <>
              <span style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.07em', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <Clapperboard size={12} /> Short-video scripts — {videos.length} (copy into AI Shorts → Script to Video)
              </span>
              {videos.map((v, i) => (
                <div key={i} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', backgroundColor: '#c77414', padding: '3px 9px', borderRadius: 999 }}>DAY {v.day}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: INK }}>{v.title}</span>
                    </div>
                    <button
                      onClick={() => {
                        const text = `${v.title}\n\n${v.script.join('\n')}`;
                        void navigator.clipboard?.writeText(text).then(() => { setCopiedVideo(i); setTimeout(() => setCopiedVideo(null), 1600); });
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 999, border: '1px solid #e4e6ea', backgroundColor: copiedVideo === i ? '#e2f5dc' : '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: copiedVideo === i ? '#3f9142' : INK }}>
                      <Copy size={11} /> {copiedVideo === i ? 'Copied!' : 'Copy script'}
                    </button>
                  </div>
                  <p style={{ fontSize: 11.5, color: '#8b5cf6', fontWeight: 700, margin: '8px 0 6px' }}>Hook: {v.hook}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {v.script.map((line, li) => (
                      <span key={li} style={{ fontSize: 12, color: '#5c6066', display: 'flex', gap: 8 }}>
                        <span style={{ fontWeight: 800, color: MUTED, flexShrink: 0 }}>{li + 1}.</span> {line}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <div style={{ padding: '14px 24px', display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid #eceef1', backgroundColor: '#fff' }}>
          <button onClick={onClose} style={{ padding: '10px 18px', borderRadius: 999, border: '1.5px solid #e4e6ea', backgroundColor: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: INK }}>
            Keep in review
          </button>
          <button onClick={approve} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 20px', borderRadius: 999, border: 'none', backgroundColor: INK, color: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 800 }}>
            <CheckCheck size={14} color="#c7f441" /> Approve & publish
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function ContentPipelineCard({ onSetup, refreshKey }: { onSetup: () => void; refreshKey: number }) {
  const { addNotification, addFunnel, addWebsite, updateSchedule, createPipeline, updatePipeline } = useApp();
  const [bump, setBump] = useState(0);
  // refreshKey/bump bust the memo whenever the wizard closes or a job/publish updates storage.
  const ob = useMemo(() => loadOnboarding(), [refreshKey, bump]);
  const [openMonth, setOpenMonth] = useState<number | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [reviewMonth, setReviewMonth] = useState<number | null>(null);
  const actor = getSession()?.user.email || 'owner';

  if (!ob.completed || !ob.plan.length) {
    return (
      <div style={{
        backgroundColor: INK, borderRadius: 24, padding: '22px 26px', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap',
        boxShadow: '0 16px 40px -12px rgba(23,25,28,0.45)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 260 }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Sparkles size={20} color="#c7f441" />
          </div>
          <div>
            <h3 style={{ fontSize: 16.5, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>Let AI set up your entire workspace</h3>
            <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.6)', margin: '4px 0 0', lineHeight: 1.5 }}>
              A 5-minute wizard configures your brand, pipeline, business hours — and plans 12 months of marketing content.
            </p>
          </div>
        </div>
        <button onClick={onSetup} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '12px 22px', borderRadius: 999, border: 'none',
          backgroundColor: '#c7f441', color: INK, fontSize: 13, fontWeight: 800, cursor: 'pointer', flexShrink: 0,
        }}>
          Start AI setup <ArrowRight size={14} strokeWidth={2.5} />
        </button>
      </div>
    );
  }

  const stats = {
    planned: ob.plan.filter(m => m.status === 'PLAN_GENERATED').length,
    generating: ob.plan.filter(m => m.status === 'GENERATING').length,
    review: ob.plan.filter(m => m.status === 'AWAITING_APPROVAL').length,
    published: ob.plan.filter(m => m.status === 'PUBLISHED').length,
  };
  const now = new Date();
  const currentIdx = ob.plan.findIndex(m => m.year === now.getFullYear() && m.month === now.getMonth());
  const current = ob.plan[Math.max(currentIdx, 0)];
  const open = openMonth != null ? ob.plan.find(m => m.index === openMonth) : null;

  return (
    <div style={FROST}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, margin: '2px 4px 14px', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: 0, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 8 }}>
            <CalendarRange size={16} /> Content Pipeline
            <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 999, backgroundColor: INK, color: '#c7f441', letterSpacing: '0.05em' }}>12-MONTH PLAN</span>
          </h3>
          <p style={{ fontSize: 12, color: MUTED, margin: '4px 0 0' }}>
            This month: <span style={{ fontWeight: 700, color: INK }}>{current.theme}</span> — {current.label}
          </p>
          {!ob.createdTaskPipelineId && (
            <button
              onClick={() => {
                const state = loadOnboarding();
                const assets = applyLaunchAssets(state, { addFunnel, addWebsite, updateSchedule, createPipeline, updatePipeline }, actor);
                saveOnboarding({
                  ...state,
                  createdFunnelId: assets.funnelId ?? state.createdFunnelId,
                  createdWebsiteId: assets.websiteId ?? state.createdWebsiteId,
                  createdTaskPipelineId: assets.taskPipelineId,
                  audit: [...state.audit, ...assets.audit],
                });
                addNotification(`Launch assets ready — ${assets.taskCount} tasks in your 90-Day Launch Plan${assets.blogCount ? `, website + ${assets.blogCount} blog posts` : ''}${assets.funnelId ? ', lead funnel' : ''}${assets.eventTypeCount ? `, ${assets.eventTypeCount} booking pages` : ''}`, 'success');
                setBump(b => b + 1);
              }}
              style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 999, border: 'none', backgroundColor: INK, color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
              <Sparkles size={12} color="#c7f441" /> Generate launch assets (90-day plan, site, funnel)
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {([['Published', stats.published, '#3f9142', '#e2f5dc'], ['In review', stats.review, '#8b5cf6', '#f1edfb'], ['Generating', stats.generating, '#c77414', '#fdeeda'], ['Planned', stats.planned, '#3e63dd', '#eceff9']] as const)
            .map(([label, n, color, bg]) => (
              <div key={label} style={{ ...CARD, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: color }} />
                <span style={{ fontSize: 15, fontWeight: 800, color: INK }}>{n}</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', backgroundColor: bg, padding: '2px 8px', borderRadius: 999 }}>{label}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Month strip */}
      <div style={{ ...CARD, padding: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 6 }}>
          {ob.plan.map(m => {
            const meta = statusMeta(m.status);
            const isCurrent = m.index === currentIdx;
            const isOpen = openMonth === m.index;
            return (
              <button key={m.index} onClick={() => setOpenMonth(isOpen ? null : m.index)} title={`${m.label} — ${m.theme}`}
                style={{
                  padding: '9px 4px 8px', borderRadius: 12, cursor: 'pointer', textAlign: 'center',
                  border: isOpen ? `1.5px solid ${INK}` : isCurrent ? `1.5px dashed ${INK}` : '1.5px solid #eef0f3',
                  backgroundColor: isOpen ? '#f7f8fa' : '#fff', transition: 'all 0.15s ease', minWidth: 0,
                }}>
                <span style={{ display: 'block', fontSize: 10, fontWeight: 800, color: INK }}>
                  {m.label.slice(0, 3)}
                </span>
                <span style={{ display: 'block', margin: '6px auto 0', width: 8, height: 8, borderRadius: 999, backgroundColor: meta.color }} />
                <span style={{ display: 'block', fontSize: 8.5, fontWeight: 700, color: meta.color, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {meta.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Expanded month detail */}
        {open && (
          <div style={{ marginTop: 14, borderTop: '1px solid #f2f3f5', paddingTop: 14, display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h4 style={{ fontSize: 15, fontWeight: 800, color: INK, margin: 0, letterSpacing: '-0.01em' }}>{open.label}: {open.theme}</h4>
                {(() => { const meta = statusMeta(open.status); return (
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 999, backgroundColor: meta.bg, color: meta.color }}>{meta.label.toUpperCase()}</span>
                ); })()}
              </div>
              <p style={{ fontSize: 12.5, color: '#5c6066', margin: '7px 0 0', lineHeight: 1.55 }}>{open.focus}</p>
              {open.holidays.length > 0 && (
                <p style={{ fontSize: 11.5, color: MUTED, margin: '8px 0 0' }}>
                  <span style={{ fontWeight: 700, color: INK }}>Key dates:</span> {open.holidays.join(' · ')}
                </p>
              )}
              <button onClick={() => setShowAudit(a => !a)} style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 999, border: '1px solid #eef0f3', backgroundColor: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: MUTED }}>
                <History size={11} /> Audit trail {showAudit ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
              {showAudit && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {open.audit.slice(-6).reverse().map((a, i) => (
                    <p key={i} style={{ fontSize: 11, color: MUTED, margin: 0 }}>
                      <span style={{ fontWeight: 700, color: INK }}>{new Date(a.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      {' — '}{a.action} <span style={{ opacity: 0.7 }}>({a.actor})</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px' }}>Planned content</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {open.ideas.map((idea, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', borderRadius: 11, backgroundColor: '#f7f8fa' }}>
                    <span style={{ width: 20, height: 20, borderRadius: 999, backgroundColor: INK, color: '#c7f441', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: INK, lineHeight: 1.4 }}>{idea}</span>
                  </div>
                ))}
              </div>
              {open.status === 'PLAN_GENERATED' && (
                <div style={{ marginTop: 12 }}>
                  <p style={{ fontSize: 11, color: MUTED, margin: '0 0 8px', lineHeight: 1.5 }}>
                    Full content for this month is generated on demand and never goes live without your review.
                  </p>
                  <button onClick={() => { startMonthGeneration(open.index, addNotification, actor); setBump(b => b + 1); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 999, border: 'none', backgroundColor: INK, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    <Wand2 size={13} color="#c7f441" /> Generate content for {open.label.split(' ')[0]}
                  </button>
                </div>
              )}
              {open.status === 'GENERATING' && (
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderRadius: 12, backgroundColor: '#fdeeda' }}>
                  <Loader size={14} color="#c77414" style={{ animation: 'spin 0.9s linear infinite' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#c77414' }}>Generating emails & SMS in the background — you'll get a notification.</span>
                </div>
              )}
              {open.status === 'AWAITING_APPROVAL' && open.generated && (
                <div style={{ marginTop: 12 }}>
                  <p style={{ fontSize: 11.5, color: MUTED, margin: '0 0 8px' }}>
                    Ready for review: <span style={{ fontWeight: 700, color: INK }}>{[`${open.counts.emails} emails`, open.counts.sms ? `${open.counts.sms} SMS` : '', open.counts.social ? `${open.counts.social} social posts` : '', open.counts.videos ? `${open.counts.videos} video scripts` : ''].filter(Boolean).join(' · ')}</span>. Nothing goes live until you approve.
                  </p>
                  <button onClick={() => setReviewMonth(open.index)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 999, border: 'none', backgroundColor: '#8b5cf6', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    <CheckCheck size={13} /> Review & approve
                  </button>
                </div>
              )}
              {open.status === 'PUBLISHED' && (
                <p style={{ fontSize: 11.5, color: '#3f9142', fontWeight: 700, margin: '12px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCheck size={13} /> Live: {[`${open.counts.emails}-email sequence`, open.counts.sms ? `${open.counts.sms}-message SMS flow` : '', open.counts.social ? `${open.counts.social} social designs` : '', open.counts.videos ? `${open.counts.videos} video scripts` : ''].filter(Boolean).join(' + ')}.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {reviewMonth != null && (() => {
        const m = ob.plan.find(x => x.index === reviewMonth);
        return m?.generated ? (
          <MonthReviewModal month={m} onClose={() => setReviewMonth(null)} onPublished={() => setBump(b => b + 1)} />
        ) : null;
      })()}
    </div>
  );
}
