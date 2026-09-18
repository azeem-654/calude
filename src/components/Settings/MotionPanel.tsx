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
import { Check, Sparkles, Stethoscope } from 'lucide-react';
import {
  motionChoice, motionDiagnostics, setMotionChoice, systemPrefersReduced,
  type MotionChoice, type MotionDiagnostics,
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

/*
 * ── The two squares ──
 *
 * The whole point of the self-test. One square is animated by a rule nothing
 * gates; the other by a rule wrapped in `prefers-reduced-motion: reduce`,
 * exactly like every moving part in the app. Which of them moves says where
 * the motion is being stopped, and no amount of describing settings can
 * substitute for seeing it:
 *
 *  - both move → the app is animating; whatever looked still is a different
 *    problem, and worth reporting as one.
 *  - only the ungated one moves → the reduce gate is winning. The choice above
 *    is what changes that.
 *  - neither moves → motion is blocked below the app entirely: an extension, a
 *    browser flag, a device policy, or a machine with animations disabled at a
 *    level CSS never reaches. Nothing in this product can fix that, and knowing
 *    so is worth more than another setting to try.
 */
const TEST_CSS = `
@keyframes crm-motion-test {
  from { transform: translateX(0); }
  to   { transform: translateX(34px); }
}
.crm-motion-test-dot {
  animation: crm-motion-test 1.1s ease-in-out infinite alternate;
}
.crm-motion-test-gated {
  animation: crm-motion-test 1.1s ease-in-out infinite alternate;
}
@media (prefers-reduced-motion: reduce) {
  .crm-motion-test-gated { animation: none; }
}
`;

export default function MotionPanel() {
  const [choice, setChoice] = useState<MotionChoice>(motionChoice());
  const [systemReduced, setSystemReduced] = useState(systemPrefersReduced());
  const [diag, setDiag] = useState<MotionDiagnostics | null>(null);
  const [showDiag, setShowDiag] = useState(false);

  /* The system value can change while this screen is open — plugging a laptop
     in turns battery saver off — and a panel describing a stale one is worse
     than a panel describing none. */
  useEffect(() => {
    const on = () => setSystemReduced(systemPrefersReduced());
    window.addEventListener('crm-motion-change', on);
    return () => window.removeEventListener('crm-motion-change', on);
  }, []);

  /* Read after `applyMotion` has run, and again whenever the choice changes,
     so the numbers describe the page as it is rather than as it was. */
  useEffect(() => {
    const read = () => setDiag(motionDiagnostics());
    const id = window.setTimeout(read, 80);
    window.addEventListener('crm-motion-change', read);
    return () => { window.clearTimeout(id); window.removeEventListener('crm-motion-change', read); };
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

      {/* ── The self-test ──
          For the case the setting above does not fix, which is the case that
          otherwise turns into a week of guessing. */}
      <style>{TEST_CSS}</style>
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${LINE}` }}>
        <button onClick={() => { setShowDiag(v => !v); setDiag(motionDiagnostics()); }} style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, padding: 0,
          background: 'none', border: 0, cursor: 'pointer', fontFamily: 'inherit',
          fontSize: 12.5, fontWeight: 700, color: ACCENT,
        }}>
          <Stethoscope size={13} />
          {showDiag ? 'Hide the test' : 'Still nothing moving? Run the test'}
        </button>

        {showDiag && (
          <div style={{ marginTop: 13, display: 'grid', gap: 13 }}>
            <div style={{ display: 'grid', gap: 9 }}>
              {([
                ['crm-motion-test-dot', 'Always animated', 'Nothing in the app stops this one.'],
                ['crm-motion-test-gated', 'Animated unless reduced', 'Gated exactly like the rest of the app.'],
              ] as const).map(([cls, label, hint]) => (
                <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{
                    width: 58, height: 20, borderRadius: 6, background: '#f1f3f7',
                    display: 'flex', alignItems: 'center', padding: '0 3px', flexShrink: 0,
                  }}>
                    <span className={cls} style={{
                      width: 14, height: 14, borderRadius: 4, background: ACCENT, display: 'block',
                    }} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: INK }}>{label}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: MUTED }}>{hint}</span>
                  </span>
                </div>
              ))}
            </div>

            <div style={{ background: '#f8fafc', border: `1px solid ${LINE}`, borderRadius: 12, padding: '12px 13px' }}>
              <p style={{ margin: '0 0 9px', fontSize: 12.5, color: INK, fontWeight: 700 }}>What the squares mean</p>
              <ul style={{ margin: 0, paddingLeft: 17, fontSize: 12, color: MUTED, lineHeight: 1.7 }}>
                <li><strong style={{ color: INK }}>Both moving</strong> — the app is animating normally. Whatever looked
                  still is a different problem, and worth telling us about.</li>
                <li><strong style={{ color: INK }}>Only the top one moving</strong> — reduced motion is winning.
                  Choose <strong style={{ color: INK }}>Always animate</strong> above.</li>
                <li><strong style={{ color: INK }}>Neither moving</strong> — something outside this app is stopping
                  animation on this browser: an extension, a browser flag, or a device policy. No setting here can
                  reach that. Try the same page in a different browser on the same machine to confirm it.</li>
              </ul>
            </div>

            {diag && (
              <div style={{ background: '#f8fafc', border: `1px solid ${LINE}`, borderRadius: 12, padding: '12px 13px' }}>
                <p style={{ margin: '0 0 8px', fontSize: 12.5, color: INK, fontWeight: 700 }}>What this browser reports</p>
                <div style={{ display: 'grid', gap: 4, fontSize: 12, color: MUTED }}>
                  {([
                    ['System asking for', diag.systemReduced ? 'reduced motion' : 'full motion'],
                    ['This browser set to', diag.choice],
                    ['Page is running as', diag.attribute],
                    ['Animation rules found', String(diag.rulesFound)],
                    ['…of those, overridden', String(diag.rulesForced)],
                    ['Stylesheets it cannot read', String(diag.sheetsUnreadable)],
                  ] as const).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span>{k}</span><span style={{ color: INK, fontWeight: 600 }}>{v}</span>
                    </div>
                  ))}
                </div>
                {diag.rulesFound === 0 && (
                  /* The one number that means the setting itself cannot work,
                     however it is set — worth calling out rather than leaving
                     in a row of figures. */
                  <p style={{ margin: '10px 0 0', fontSize: 12, color: '#78350f', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 9, padding: '9px 10px', lineHeight: 1.6 }}>
                    No animation rules were found, which means this browser is not letting the page read its own
                    stylesheets. The choice above cannot take effect here whatever it is set to. A hard reload
                    (Ctrl+Shift+R) is worth trying first; after that, a different browser on the same machine.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
