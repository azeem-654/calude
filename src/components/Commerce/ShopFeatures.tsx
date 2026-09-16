/**
 * What the shop can do, said plainly — including what it cannot.
 *
 * ── Why the "no" rows are on the same list ──
 *
 * Because a feature list that only says yes is a list nobody believes. Live
 * carrier rates, tax calculation, customer accounts and subscriptions are all
 * absent, and somebody deciding whether to run their shop here needs to find
 * that out now rather than three weeks in. Saying so is also the only way the
 * "yes" rows mean anything.
 *
 * ── Why it is collapsed by default ──
 *
 * It is a reference, not a daily screen. Somebody who opens Sell wants to add
 * a product; somebody weighing the product up wants all of this at once. One
 * row that opens is both.
 */
import { useState } from 'react';
import { Check, ChevronDown, ExternalLink, Minus, Sparkles, X } from 'lucide-react';
import { SHOP_FEATURES, featureCount, type FeatureState } from '../../services/shopFeatures';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

const MARK: Record<FeatureState, { icon: typeof Check; bg: string; fg: string; label: string }> = {
  yes: { icon: Check, bg: '#e8f6ee', fg: '#0f7b3d', label: 'Included' },
  /* Its own mark rather than a green tick with an asterisk. A limit somebody
     discovers later is worse than one stated on the row. */
  partly: { icon: Minus, bg: '#fff4ed', fg: '#9a3412', label: 'With a limit' },
  no: { icon: X, bg: '#f1f5f9', fg: '#64748b', label: 'Not here' },
};

export default function ShopFeatures() {
  const [open, setOpen] = useState(false);
  const { works, total } = featureCount();

  return (
    <section style={{ background: '#fff', borderRadius: 18, border: `1px solid ${LINE}`, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={{
        display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
        padding: '16px 20px', border: 'none', background: '#fff', cursor: 'pointer', fontFamily: 'inherit',
      }}>
        <Sparkles size={16} color={ACCENT} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 16, fontWeight: 700, color: INK }}>
            What this shop can do
          </span>
          <span style={{ display: 'block', fontSize: 12.5, color: MUTED, marginTop: 2 }}>
            {works} of {total} things, and the {total - works} it cannot — said here rather than found out later
          </span>
        </span>
        <ChevronDown size={17} color={MUTED} style={{
          flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease',
        }} />
      </button>

      {open && (
        <div style={{ padding: '0 20px 20px', display: 'grid', gap: 20 }}>
          {SHOP_FEATURES.map(group => (
            <div key={group.title}>
              <h4 style={{ fontSize: 13.5, fontWeight: 800, color: INK, margin: '0 0 2px' }}>{group.title}</h4>
              <p style={{ fontSize: 12.5, color: MUTED, margin: '0 0 10px', lineHeight: 1.55 }}>{group.blurb}</p>

              <div style={{ display: 'grid', gap: 7 }}>
                {group.features.map(f => {
                  const m = MARK[f.state];
                  const Icon = m.icon;
                  return (
                    <div key={f.label} style={{
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                      padding: '10px 12px', borderRadius: 11,
                      background: f.state === 'no' ? '#fafbfc' : '#fff',
                      border: `1px solid ${LINE}`,
                    }}>
                      <span style={{
                        flexShrink: 0, width: 18, height: 18, borderRadius: 999, marginTop: 1,
                        display: 'grid', placeItems: 'center', background: m.bg, color: m.fg,
                      }} title={m.label}>
                        <Icon size={11} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                          display: 'block', fontSize: 13.5, fontWeight: 700,
                          color: f.state === 'no' ? MUTED : INK,
                        }}>
                          {f.label}
                        </span>
                        <span style={{ display: 'block', fontSize: 12.5, color: MUTED, marginTop: 2, lineHeight: 1.55 }}>
                          {f.detail}
                        </span>
                      </span>
                      {/* Only where there is somewhere to go. A link to nothing
                          is worse than no link. */}
                      {f.route && f.state !== 'no' && (
                        <a href={f.route} style={{
                          flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 1,
                          fontSize: 11.5, fontWeight: 700, color: ACCENT, textDecoration: 'none',
                        }}>
                          Open <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <p style={{ margin: 0, fontSize: 12, color: MUTED, lineHeight: 1.65 }}>
            Everything marked <strong style={{ color: '#0f7b3d' }}>Included</strong> works today — this list
            is added to when something ships, not when it is planned. If a row here turns out not to do what
            it says, that is a bug and worth reporting as one.
          </p>
        </div>
      )}
    </section>
  );
}
