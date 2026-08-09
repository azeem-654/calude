import { useMemo, useState } from 'react';
import {
  ArrowLeft, CalendarClock, CalendarX, Check, Film, Play, Send,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  STATUS_META, assetsFor, describeTargets, goalLabel, placementRules,
} from '../../services/socialAutomation';
import { campaignReport, clearSchedule, formatSlot, scheduleCampaign } from '../../services/campaignSchedule';
import ReviewEdit from './ReviewEdit';
import type { Campaign } from '../../types/socialAutomation';

const INK = '#17191c';
const MUTED = '#8a8f98';
const FAINT = '#b0b4ba';

const CARD: React.CSSProperties = {
  backgroundColor: '#fff', borderRadius: 18, padding: 20,
  boxShadow: '0 1px 2px rgba(23,25,28,0.05)',
};

interface Props {
  campaign: Campaign;
  onBack: () => void;
  onChange: () => void;
}

/**
 * One campaign, end to end: what was made, where it is going, and when.
 *
 * The status table is grouped by destination rather than listing every asset,
 * because the decision a user makes here is per-destination — publish all the
 * Reels, hold the LinkedIn posts — not per-caption. Individual pieces live one
 * click away under Review.
 */
export default function CampaignDashboard({ campaign, onBack, onChange }: Props) {
  const { addNotification } = useApp();
  const [tab, setTab] = useState<'overview' | 'review'>('overview');
  const [version, setVersion] = useState(0);
  const [startDate, setStartDate] = useState('');

  const assets = useMemo(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    () => assetsFor(campaign.id), [campaign.id, version],
  );
  const report = useMemo(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    () => campaignReport(campaign), [campaign.id, version],
  );

  const bump = () => { setVersion(v => v + 1); onChange(); };

  /** Rows grouped by destination — the level decisions are actually made at. */
  const rows = useMemo(() => {
    const groups = new Map<string, {
      label: string; surface: string; count: number; scheduled: number; published: number; nextAt?: string;
    }>();
    for (const a of assets) {
      // A clip is raw material for the video placements, not a destination.
      if (!a.placement && !a.channel) continue;
      const rules = a.placement ? placementRules(a.placement) : undefined;
      const key = a.placement ?? a.channel ?? 'other';
      const CHANNEL_LABEL: Record<string, string> = {
        email: 'Email campaign', sms: 'SMS campaign', blog: 'Blog post', landing: 'Landing page',
      };
      const label = rules?.label ?? CHANNEL_LABEL[a.channel ?? ''] ?? key;
      const g = groups.get(key) ?? { label, surface: rules?.surface ?? 'Send', count: 0, scheduled: 0, published: 0 };
      g.count += 1;
      if (a.status === 'scheduled') g.scheduled += 1;
      if (a.status === 'published') g.published += 1;
      if (a.scheduledFor && (!g.nextAt || a.scheduledFor < g.nextAt)) g.nextAt = a.scheduledFor;
      groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => b.count - a.count);
  }, [assets]);

  const clips = assets.filter(a => a.kind === 'clip' && !a.placement);
  const meta = STATUS_META[campaign.status];

  function schedule() {
    const start = startDate ? new Date(`${startDate}T00:00:00`) : new Date();
    if (Number.isNaN(start.getTime())) { addNotification('That start date is not valid.', 'error'); return; }
    const jobs = scheduleCampaign(campaign, start);
    bump();
    addNotification(`${jobs.length} posts scheduled, starting ${formatSlot(jobs[0]?.scheduledFor)}`, 'success');
  }

  function unschedule() {
    clearSchedule(campaign.id);
    bump();
    addNotification('Schedule cleared — nothing is queued.', 'info');
  }

  const cell: React.CSSProperties = {
    padding: '10px 8px', fontSize: 12.5, color: INK, borderBottom: '1px solid #f2f3f5',
  };

  return (
    <div style={{ padding: '4px 28px 40px' }}>
      <button onClick={onBack} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', margin: '8px 0 16px',
        borderRadius: 999, border: '1px solid #e4e7ec', backgroundColor: '#fff',
        color: MUTED, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
      }}>
        <ArrowLeft size={13} /> All campaigns
      </button>

      {/* Summary */}
      <div style={{ ...CARD, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
              <h2 style={{ fontSize: 19, fontWeight: 800, color: INK, margin: 0, letterSpacing: '-0.02em' }}>
                {campaign.name}
              </h2>
              <span style={{
                padding: '4px 10px', borderRadius: 999, fontSize: 10.5, fontWeight: 800,
                backgroundColor: meta.bg, color: meta.color,
              }}>{meta.label}</span>
            </div>
            <p style={{ fontSize: 12.5, color: MUTED, margin: 0, lineHeight: 1.6 }}>
              {goalLabel(campaign.goal)} · {describeTargets(campaign)}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {([
              ['Pieces', report.total],
              ['Scheduled', report.scheduled],
              ['Published', report.published],
              ['Clips cut', clips.length],
            ] as const).map(([k, v]) => (
              <div key={k}>
                <p style={{ fontSize: 20, fontWeight: 800, color: INK, margin: 0, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{v}</p>
                <p style={{ fontSize: 11, color: MUTED, margin: 0, fontWeight: 600 }}>{k}</p>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 14,
          borderTop: '1px solid #f2f3f5', flexWrap: 'wrap',
        }}>
          {campaign.sources.map(s => (
            <span key={s.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px',
              borderRadius: 999, backgroundColor: '#f7f8fa', fontSize: 11.5, color: '#5c6066', fontWeight: 600,
            }}>
              {s.kind === 'youtube' ? <Play size={11} color="#e5484d" /> : <Film size={11} color="#3e63dd" />}
              {s.name}
            </span>
          ))}
          {report.firstAt && (
            <span style={{ fontSize: 11.5, color: MUTED, marginLeft: 'auto' }}>
              Runs {formatSlot(report.firstAt)} → {formatSlot(report.lastAt)}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {([['overview', 'Publishing plan'], ['review', `Review & edit ${report.total}`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k} style={{
            padding: '8px 15px', borderRadius: 999, cursor: 'pointer',
            border: `1px solid ${tab === k ? INK : '#e4e7ec'}`,
            backgroundColor: tab === k ? INK : '#fff',
            color: tab === k ? '#fff' : INK, fontSize: 12.5, fontWeight: 700,
          }}>{label}</button>
        ))}
      </div>

      {tab === 'review' ? (
        <ReviewEdit campaign={campaign} onChange={bump} />
      ) : (
        <>
          <div style={{ ...CARD, padding: 0, overflow: 'hidden', marginBottom: 14 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#fafbfc' }}>
                  {['Destination', 'Pieces', 'Status', 'First slot'].map((h, i) => (
                    <th key={h} style={{
                      ...cell, textAlign: i === 0 ? 'left' : i === 1 ? 'right' : 'left',
                      fontSize: 10.5, fontWeight: 800, color: MUTED,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={4} style={{ ...cell, textAlign: 'center', color: MUTED, padding: '24px 8px' }}>
                    Nothing has been generated yet.
                  </td></tr>
                )}
                {rows.map(r => (
                  <tr key={r.label}>
                    <td style={{ ...cell, paddingLeft: 16, fontWeight: 700 }}>{r.label}</td>
                    <td style={{ ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.count}</td>
                    <td style={cell}>
                      {r.published === r.count ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#3f9142', fontWeight: 700, fontSize: 11.5 }}>
                          <Check size={12} /> Published
                        </span>
                      ) : r.scheduled > 0 ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#3e63dd', fontWeight: 700, fontSize: 11.5 }}>
                          <CalendarClock size={12} /> {r.scheduled} scheduled
                        </span>
                      ) : (
                        <span style={{ fontSize: 11.5, color: '#c77414', fontWeight: 700 }}>Ready</span>
                      )}
                    </td>
                    <td style={{ ...cell, color: MUTED, fontSize: 11.5 }}>{formatSlot(r.nextAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Scheduling */}
          <div style={CARD}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: INK, margin: '0 0 4px', letterSpacing: '-0.01em' }}>
              When should this go out?
            </h3>
            <p style={{ fontSize: 12.5, color: MUTED, margin: '0 0 14px', lineHeight: 1.6 }}>
              Each destination is spread across its own best hours in your local time, so five Instagram posts
              do not land in the same minute. Leave the date blank to start from now.
            </p>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label htmlFor="sa-start" style={{ fontSize: 12, fontWeight: 700, color: INK }}>Start from</label>
              <input
                id="sa-start"
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                style={{
                  padding: '9px 12px', border: '1px solid #e4e7ec', borderRadius: 10,
                  fontSize: 12.5, outline: 'none', fontFamily: 'inherit',
                }}
              />
              <button onClick={schedule} disabled={report.total === 0} style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px',
                borderRadius: 999, border: 'none', cursor: report.total === 0 ? 'not-allowed' : 'pointer',
                backgroundColor: report.total === 0 ? '#d5d8dd' : INK, color: '#fff',
                fontSize: 12.5, fontWeight: 700,
              }}>
                <CalendarClock size={13} /> {report.scheduled > 0 ? 'Reschedule everything' : 'Schedule everything'}
              </button>
              {report.scheduled > 0 && (
                <button onClick={unschedule} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px',
                  borderRadius: 999, border: '1px solid #e4e7ec', backgroundColor: '#fff',
                  color: MUTED, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                }}>
                  <CalendarX size={13} /> Clear schedule
                </button>
              )}
            </div>

            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 16, padding: '11px 13px',
              backgroundColor: '#fdf5e7', borderRadius: 11,
            }}>
              <Send size={13} color="#c77414" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 11.5, color: '#8a6516', margin: 0, lineHeight: 1.6 }}>
                <strong style={{ color: '#c77414' }}>Publishing arrives next.</strong> Scheduling records when each
                piece should go out; the handoff that opens each platform's composer with your caption already
                filled in is the last part of this module.
              </p>
            </div>
          </div>

          {clips.length > 0 && (
            <div style={{ ...CARD, marginTop: 14 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: INK, margin: '0 0 4px', letterSpacing: '-0.01em' }}>
                Clips cut from the video
              </h3>
              <p style={{ fontSize: 12.5, color: MUTED, margin: '0 0 12px', lineHeight: 1.6 }}>
                Ranked by how likely they are to travel. The strongest become the first Reel, Short and TikTok.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {clips.slice(0, 8).map(c => (
                  <div key={c.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px',
                    backgroundColor: '#f7f8fa', borderRadius: 10,
                  }}>
                    <span style={{
                      fontSize: 11, fontWeight: 800, color: '#fff', backgroundColor: INK,
                      borderRadius: 999, padding: '3px 9px', fontVariantNumeric: 'tabular-nums',
                    }}>{c.viralityScore ?? '—'}</span>
                    <span style={{
                      flex: 1, fontSize: 12.5, color: INK, fontWeight: 600, minWidth: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{c.title}</span>
                    <span style={{ fontSize: 11, color: FAINT, whiteSpace: 'nowrap' }}>
                      {Math.round(c.startSec ?? 0)}s – {Math.round(c.endSec ?? 0)}s
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
