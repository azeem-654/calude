import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { GrowthAction } from '../../services/marketFeed';
import { ModuleMark } from './moduleIcons';
import type { Palette } from './marketTheme';

interface Props {
  actions: GrowthAction[];
  p: Palette;
  /** Charting the department a suggestion belongs to. */
  onFocus: (symbol: string) => void;
}

/**
 * What to do next, ranked by how much it would actually move the index.
 *
 * The lift on each card is computed, not guessed: the engine re-scores the
 * department with the suggestion applied and keeps the difference. That is what
 * makes the ordering meaningful — the top card is genuinely the highest-leverage
 * thing available, not the first item in a hard-coded list.
 */
export default function GrowthActions({ actions, p, onFocus }: Props) {
  const navigate = useNavigate();

  if (actions.length === 0) {
    return (
      <p style={{ padding: 16, fontSize: 11.5, color: p.textDim, margin: 0, lineHeight: 1.6 }}>
        Every department is above 85. Nothing here is worth nagging you about — keep the pace.
      </p>
    );
  }

  const best = Math.max(...actions.map(a => a.lift), 0.01);

  return (
    <div style={{ maxHeight: 420, overflowY: 'auto' }}>
      {actions.map(a => (
        <div key={a.id} style={{ padding: '10px 12px', borderBottom: `1px solid ${p.border}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
            <button
              onClick={() => onFocus(a.symbol)}
              title={`Chart ${a.module}`}
              aria-label={`Chart ${a.module}`}
              style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', lineHeight: 0, marginTop: 1 }}
            >
              <ModuleMark symbol={a.symbol} size={24} />
            </button>

            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                margin: 0, fontSize: 12, fontWeight: 700, color: p.textStrong, lineHeight: 1.35,
              }}>{a.title}</p>
              <p style={{ margin: '2px 0 0', fontSize: 10.5, color: p.textDim, lineHeight: 1.45 }}>
                {a.detail}
              </p>

              {/* Lift, as a bar relative to the best available move. Capped:
                  a 3px bar run across a wide panel reads as a rule, not a
                  quantity, and the comparison between cards is what matters. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 7, maxWidth: 260 }}>
                <div style={{ flex: 1, height: 3, borderRadius: 999, backgroundColor: p.panelHi, overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.max((a.lift / best) * 100, 3)}%`, height: '100%',
                    borderRadius: 999, backgroundColor: p.up,
                  }} />
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 800, color: p.up, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                }}>
                  +{a.lift.toFixed(2)} index
                </span>
              </div>

              <button
                onClick={() => navigate(a.route)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8,
                  padding: '4px 10px', borderRadius: 999, border: `1px solid ${p.border}`,
                  backgroundColor: p.panelHi, color: p.textStrong,
                  fontSize: 10.5, fontWeight: 800, cursor: 'pointer',
                }}
              >
                {a.cta} <ArrowRight size={10} />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
