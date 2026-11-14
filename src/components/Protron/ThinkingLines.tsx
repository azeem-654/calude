/**
 * What Protron is working through while a reply is on its way — one line at a
 * time, changing every ~1.5 s (owner's brief, 2026-11-14: "keep on showing
 * the pop-ups … researching the competitors, best practices, how to get
 * sales" while it replies).
 *
 * ── Worded as thinking, not as browsing ──
 *
 * The reply is one model call: it reasons from what it knows about the trade,
 * its competitors and what sells, but it does not search the web while the
 * customer waits. So the lines say "Thinking through…", "Weighing…" — true of
 * the call in flight — and never "Searching Google" or "Scanning 2,000
 * competitors", which would be the plausible success CLAUDE.md forbids.
 * A step that really happens (reading their website) is passed in as `first`
 * and shown first, in its own words.
 */
import { useEffect, useState } from 'react';

export function thinkingLines(business = '', first: string[] = []): string[] {
  const trade = business.trim().slice(0, 40);
  const them = trade ? `businesses like ${trade}` : 'businesses like yours';
  return [
    ...first,
    'Reading what you said…',
    `Thinking through what wins customers for ${them}…`,
    'Weighing how competitors in your market get sales…',
    'Checking best practices for follow-ups and campaigns…',
    'Matching it to what Protected Central can set up…',
    'Choosing the question that matters most next…',
    'Putting the answer together…',
  ];
}

export default function ThinkingLines({ business = '', first = [], className }: { business?: string; first?: string[]; className?: string }) {
  const lines = thinkingLines(business, first);
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI(n => Math.min(n + 1, lines.length - 1)), 1500);
    return () => window.clearInterval(t);
  }, [lines.length]);
  return <span className={className} role="status" aria-live="polite" key={i} data-thinking-line="1">{lines[Math.min(i, lines.length - 1)]}</span>;
}
