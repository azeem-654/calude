/**
 * What to do next, with the numbers underneath it.
 *
 * The evidence line is not decoration — it is what separates this from a
 * horoscope. A reader who can see "8 of 100 opened (8%)" can decide the advice
 * is wrong; a reader shown only "rewrite your subject lines" has to take it on
 * faith, and software has not earned that.
 */
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Check, Lightbulb } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { leadStats, leadsFor } from '../../services/aiDiscovery';
import { rollup } from '../../services/aiRollup';
import { nothingToAdvise, recommend, type Urgency } from '../../services/aiRecommend';
import type { AICampaign } from '../../types/aiSalesAgent';
import { card } from './ui';

const TONE: Record<Urgency, { fg: string; bg: string; border: string; icon: typeof Check; label: string }> = {
  blocking: { fg: '#92400e', bg: '#fffbeb', border: '#fde68a', icon: AlertTriangle, label: 'Stops it working' },
  'worth-doing': { fg: '#1e293b', bg: '#f8fafc', border: '#e2e8f0', icon: Lightbulb, label: 'Worth doing' },
  observation: { fg: '#475569', bg: '#f8fafc', border: '#eef1f5', icon: Check, label: 'Worth knowing' },
};

export default function RecommendPanel({ campaign }: { campaign: AICampaign }) {
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  const { contacts, sequences, appointments, bookings } = useApp();

  const { items, empty } = useMemo(() => {
    const r = rollup(campaign, { contacts, sequences, appointments, bookings });
    const leads = leadStats(leadsFor(campaign.id));
    return { items: recommend({ campaign, rollup: r, leads }), empty: nothingToAdvise(r) };
  }, [campaign, contacts, sequences, appointments, bookings]);

  return (
    <section style={{ ...card, padding: 'clamp(16px, 3vw, 22px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>What to do next</h2>
        <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94a3b8' }}>
          Drawn only from what has actually happened, with the figures each one rests on.
        </p>
      </div>

      {items.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13.5, color: '#64748b', lineHeight: 1.6 }}>{empty}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {items.map(r => {
            const tone = TONE[r.urgency];
            const Icon = tone.icon;
            return (
              <div key={r.id} style={{
                display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 10,
                backgroundColor: tone.bg, border: `1px solid ${tone.border}`,
              }}>
                <Icon size={15} color={tone.fg} style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: tone.fg }}>{r.title}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#94a3b8' }}>
                      {tone.label}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12.5, color: '#475569', lineHeight: 1.6 }}>{r.detail}</p>
                  {/* The half that makes it arguable. */}
                  <p style={{ margin: 0, fontSize: 12, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                    <strong style={{ color: '#0f172a' }}>Because:</strong> {r.evidence}
                  </p>
                  {r.action && (
                    <div>
                      <button className="press"
                        onClick={() => {
                          if (r.action?.route) navigate(r.action.route);
                          else if (r.action?.tab) setParams(r.action.tab === 'overview' ? {} : { tab: r.action.tab }, { replace: true });
                        }}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 3,
                          padding: '5px 11px', borderRadius: 8, cursor: 'pointer',
                          border: '1px solid #e2e8f0', backgroundColor: 'white',
                          fontSize: 12, fontWeight: 600, color: '#334155',
                        }}>
                        {r.action.label} <ArrowRight size={12} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
