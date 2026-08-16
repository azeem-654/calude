/**
 * How the campaign is doing, read from the modules that know.
 *
 * Every figure names its source, and a figure that cannot be measured yet shows
 * a dash rather than a nought. "0 replies" says the emails went out and nobody
 * answered; "—" says nothing has gone out. Those are very different mornings
 * for the person reading this screen, and a dashboard that renders them
 * identically is worse than one that shows nothing.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, Info } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { disagreements, rollup } from '../../services/aiRollup';
import type { AICampaign } from '../../types/aiSalesAgent';
import { card, ghostBtn } from './ui';

const SEQ_TONE: Record<string, { fg: string; bg: string; label: string }> = {
  active: { fg: '#15803d', bg: '#dcfce7', label: 'Active' },
  paused: { fg: '#a16207', bg: '#fef9c3', label: 'Paused' },
  draft: { fg: '#64748b', bg: '#f1f5f9', label: 'Draft' },
  missing: { fg: '#b91c1c', bg: '#fee2e2', label: 'Deleted in Marketing' },
};

export default function PerformancePanel({ campaign }: { campaign: AICampaign }) {
  const navigate = useNavigate();
  const { contacts, sequences, appointments, bookings } = useApp();

  const api = useMemo(
    () => ({ contacts, sequences, appointments, bookings }),
    [contacts, sequences, appointments, bookings],
  );
  const data = useMemo(() => rollup(campaign, api), [campaign, api]);
  const conflicts = useMemo(() => disagreements(campaign, api), [campaign, api]);

  if (!campaign.strategy) return null;

  return (
    <section style={{ ...card, padding: 'clamp(16px, 3vw, 22px)', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>How it is going</h2>
        <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94a3b8' }}>
          Read live from the modules that own each record — nothing here is a stored copy.
        </p>
      </div>

      {/* A campaign whose sequence someone paused in Marketing is not running,
          whatever this page's own status says. */}
      {conflicts.map((c, i) => (
        <div key={i} style={{ display: 'flex', gap: 9, padding: '11px 13px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 9 }}>
          <AlertTriangle size={14} color="#b45309" style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ margin: 0, fontSize: 12.5, color: '#92400e', lineHeight: 1.55 }}>{c}</p>
        </div>
      ))}

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 128px), 1fr))' }}>
        {data.figures.map(f => (
          <div key={f.label} style={{ padding: '9px 12px', borderRadius: 9, backgroundColor: '#f8fafc', border: '1px solid #eef1f5' }}>
            <p style={{
              margin: 0, fontSize: 19, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
              color: f.value === null ? '#cbd5e1' : '#0f172a',
            }}>
              {f.value === null ? '—' : f.value.toLocaleString()}
            </p>
            <p style={{ margin: 0, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#94a3b8' }}>
              {f.label}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 10.5, color: '#cbd5e1' }}>
              {f.note ?? f.from}
            </p>
          </div>
        ))}
      </div>

      {data.caveats.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '11px 13px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 9 }}>
          {data.caveats.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 7 }}>
              <Info size={12} color="#94a3b8" style={{ flexShrink: 0, marginTop: 3 }} />
              <p style={{ margin: 0, fontSize: 12.5, color: '#475569', lineHeight: 1.55 }}>{c}</p>
            </div>
          ))}
        </div>
      )}

      {data.sequences.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8' }}>
            Email sequences
          </p>
          {data.sequences.map(s => {
            const tone = SEQ_TONE[s.status] ?? SEQ_TONE.draft;
            return (
              <div key={s.id} style={{ border: '1px solid #eef1f5', borderRadius: 10, padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a', minWidth: 0 }}>{s.name}</span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, color: tone.fg, backgroundColor: tone.bg }}>
                      {tone.label}
                    </span>
                    {s.status !== 'missing' && (
                      <button onClick={() => navigate('/marketing')} className="press" style={{ ...ghostBtn, padding: '5px 11px', fontSize: 12 }}>
                        Open <ArrowUpRight size={12} />
                      </button>
                    )}
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12, color: '#64748b' }}>
                  <span><strong style={{ color: '#0f172a' }}>{s.enrolled}</strong> enrolled</span>
                  <span><strong style={{ color: '#0f172a' }}>{s.active}</strong> still going</span>
                  <span><strong style={{ color: '#0f172a' }}>{s.completed}</strong> finished</span>
                  <span><strong style={{ color: '#0f172a' }}>{s.sent}</strong> sent</span>
                  <span>
                    <strong style={{ color: '#0f172a' }}>{s.openRate === null ? '—' : `${s.openRate}%`}</strong> opened
                  </span>
                  <span>
                    <strong style={{ color: '#0f172a' }}>{s.replyRate === null ? '—' : `${s.replyRate}%`}</strong> replied
                  </span>
                  {s.bounced > 0 && <span style={{ color: '#b91c1c' }}><strong>{s.bounced}</strong> bounced</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
