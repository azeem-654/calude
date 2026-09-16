/**
 * Whether this browser shows the moving parts.
 *
 * ── Why a product has this at all ──
 *
 * `prefers-reduced-motion` is treated as a deliberate accessibility choice, and
 * often it is. On Windows it is also flipped by battery saver, by "Adjust for
 * best performance" set once on an old machine, and by a Performance Options
 * tick box that silently overrules the Accessibility one. People end up with it
 * on without knowing, see a page where nothing moves, and reasonably conclude
 * the site is broken.
 *
 * So the system still decides by default — an accessibility preference a
 * website quietly ignores is worse than one it never offered — and anybody who
 * wants to can say otherwise for this browser.
 *
 * ── Why it says what the system is currently asking for ──
 *
 * Because "Match my system" is useless on its own: it tells somebody the rule
 * without telling them the answer. Naming the current value turns the panel
 * into the diagnosis they came here for.
 */
import { useEffect, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import {
  motionChoice, setMotionChoice, systemPrefersReduced, type MotionChoice,
} from '../../services/motion';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

const OPTIONS: { id: MotionChoice; label: string; hint: string }[] = [
  { id: 'system', label: 'Match my system', hint: 'Follow the accessibility setting on this device' },
  { id: 'full', label: 'Always animate', hint: 'Show the moving parts whatever the system says' },
  { id: 'reduced', label: 'Never animate', hint: 'Keep everything still, even if the system allows motion' },
];

export default function MotionPanel() {
  const [choice, setChoice] = useState<MotionChoice>(motionChoice());
  const [systemReduced, setSystemReduced] = useState(systemPrefersReduced());

  /* The system value can change while this screen is open — plugging a laptop
     in turns battery saver off — and a panel describing a stale one is worse
     than a panel describing none. */
  useEffect(() => {
    const on = () => setSystemReduced(systemPrefersReduced());
    window.addEventListener('crm-motion-change', on);
    return () => window.removeEventListener('crm-motion-change', on);
  }, []);

  const pick = (id: MotionChoice) => {
    setMotionChoice(id);
    setChoice(id);
  };

  return (
    <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${LINE}`, padding: 24, marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
        <Sparkles size={15} color={ACCENT} />
        <h3 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0 }}>Animation</h3>
      </div>
      <p style={{ fontSize: 13, color: MUTED, margin: '0 0 6px', lineHeight: 1.6 }}>
        The dashboard, the AI Autopilot badge and the marketing page all have moving parts. This decides
        whether they run in this browser.
      </p>
      <p style={{ fontSize: 12, color: MUTED, margin: '0 0 16px', lineHeight: 1.6 }}>
        Your system is currently asking for{' '}
        <strong style={{ color: INK }}>{systemReduced ? 'reduced motion' : 'full motion'}</strong>.
        {systemReduced && (
          <> That is why things look still — battery saver and Windows&apos; “Adjust for best performance”
            both turn it on. Pick <strong style={{ color: INK }}>Always animate</strong> to overrule it here.</>
        )}
      </p>

      <div style={{ display: 'grid', gap: 8 }}>
        {OPTIONS.map(o => {
          const on = choice === o.id;
          return (
            <button key={o.id} onClick={() => pick(o.id)} aria-pressed={on} style={{
              display: 'flex', alignItems: 'center', gap: 11, padding: '12px 13px',
              border: `1.5px solid ${on ? ACCENT : LINE}`, borderRadius: 12,
              background: on ? 'rgba(91,70,229,0.05)' : '#fff',
              textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <span style={{
                width: 17, height: 17, borderRadius: 999, flexShrink: 0, display: 'grid', placeItems: 'center',
                border: `1.5px solid ${on ? ACCENT : '#cbd2df'}`, background: on ? ACCENT : '#fff',
              }}>
                {on && <Check size={10} color="#fff" />}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: INK }}>{o.label}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 1 }}>{o.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      <p style={{ fontSize: 11.5, color: MUTED, margin: '14px 0 0', lineHeight: 1.6 }}>
        This is per browser, like light and dark mode — it is not saved to your workspace and your clients
        are not affected by it.
      </p>
    </div>
  );
}
