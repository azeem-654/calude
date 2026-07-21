/**
 * ContentPipelineCard — dashboard widget for the 12-month content pipeline.
 *
 * Before onboarding: a setup CTA that launches the AI wizard.
 * After onboarding: month-by-month status strip (Planned / Generating /
 * Review / Published), quick stats, and an expandable detail panel per month
 * with the theme, focus, holidays, ideas and audit trail.
 */
import { useMemo, useState } from 'react';
import { Sparkles, CalendarRange, ChevronDown, ChevronUp, ArrowRight, History } from 'lucide-react';
import { loadOnboarding, statusMeta } from '../../services/onboarding';

const INK = '#17191c';
const MUTED = '#8a8f98';
const FROST: React.CSSProperties = { backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 24, padding: 20 };
const CARD: React.CSSProperties = { backgroundColor: '#fff', borderRadius: 18, boxShadow: '0 1px 2px rgba(23,25,28,0.05)' };

export default function ContentPipelineCard({ onSetup, refreshKey }: { onSetup: () => void; refreshKey: number }) {
  // refreshKey busts the memo whenever the wizard closes (it writes to localStorage).
  const ob = useMemo(() => loadOnboarding(), [refreshKey]);
  const [openMonth, setOpenMonth] = useState<number | null>(null);
  const [showAudit, setShowAudit] = useState(false);

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
                <p style={{ fontSize: 11, color: MUTED, margin: '10px 0 0', lineHeight: 1.5 }}>
                  Full content for this month (emails, posts, tasks) is generated with your approval when the month approaches — nothing goes live without review.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
