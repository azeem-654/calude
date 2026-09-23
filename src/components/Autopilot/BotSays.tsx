/**
 * What the bot is saying, and why it is allowed to say it.
 *
 * ── The rule this component exists to enforce ──
 *
 * A face that talks is the most persuasive thing on a screen and therefore the
 * easiest place in this product to lie. "Analysing your audience…", "Optimising
 * your funnel…" — a line like that costs nothing to write, cannot be checked,
 * and is what a customer remembers when their mail bounces a fortnight later.
 *
 * So this component cannot invent a line. It takes them, already written, from
 * whoever knows: the project card, which has the workflows, the ledger and the
 * agent runs in front of it. Every line is a fact about a record that exists.
 * If there is nothing true to say, the caller passes the honest line saying so,
 * and that is what appears.
 *
 * ── Why the rotation is gated in JavaScript ──
 *
 * The movement here is a timer, not a CSS rule, and no media query can reach a
 * `setInterval`. Somebody who has asked for reduced motion gets the first line
 * and no rotation at all — which is the whole point of the setting, and would
 * be silently ignored if this only gated the fade.
 */
import { useEffect, useState } from 'react';
import { motionReduced } from '../../services/motion';

/** Long enough to read a sentence twice without feeling hurried. */
const EVERY_MS = 7000;

export default function BotSays({ lines }: { lines: string[] }) {
  const [i, setI] = useState(0);

  /* Read once per mount rather than watched: this is a preference somebody sets
     and leaves, and a listener on it would be four listeners on a board of four
     projects to catch something that happens perhaps once. */
  const still = motionReduced();

  useEffect(() => {
    if (still || lines.length < 2) return;
    const t = window.setInterval(() => setI(n => n + 1), EVERY_MS);
    return () => window.clearInterval(t);
  }, [still, lines.length]);

  if (!lines.length) return null;
  /* Modulo on read rather than on write, so the list changing under it — a run
     finishing, an approval clearing — can never leave the index out of range. */
  const line = lines[i % lines.length];

  return (
    <p
      /* Keyed on the text so React replaces the node and the fade runs again.
         Keyed on the index instead, an unchanged line would still flash. */
      key={line}
      className={still ? undefined : 'bot-says'}
      /* Announced politely: it changes on a timer, and a live region that
         interrupts would read the whole rotation to a screen reader for ever. */
      aria-live="polite"
      style={{
        margin: '0 0 9px', padding: '8px 10px', borderRadius: 10,
        background: 'rgba(91,124,250,0.10)', border: '1px solid rgba(91,124,250,0.22)',
        fontSize: 11, color: '#3b4a7a', lineHeight: 1.5,
      }}
    >
      {line}
    </p>
  );
}
