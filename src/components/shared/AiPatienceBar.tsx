import { useEffect, useState, useSyncExternalStore } from 'react';
import { patienceSnapshot, stopAllWaiting, subscribePatience } from '../../services/aiPatience';

/**
 * What the page says while it waits out a busy AI (services/aiPatience.ts):
 * the work is kept, and when the next try is. Never an error — the screen's
 * own spinner is still turning underneath.
 *
 * Dark glass in the logo's lime and mint (public/favicon.svg), and
 * `data-noinvert`, so it reads the same in day and night mode.
 */
const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export default function AiPatienceBar() {
  const list = useSyncExternalStore(subscribePatience, patienceSnapshot, patienceSnapshot);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!list.length) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [list.length]);
  if (!list.length) return null;

  /* The soonest try speaks for all of them; a pause outranks a short rest. */
  const paused = list.some(w => w.paused);
  const next = list.reduce((a, b) => (b.nextAt < a.nextAt ? b : a));
  const left = next.nextAt - now;
  const trying = left <= 0;
  const span = Math.max(1, next.nextAt - next.waitFrom);
  const done = Math.min(1, Math.max(0, (now - next.waitFrom) / span));
  const more = list.length > 1 ? ` · ${list.length} requests held` : '';

  return (
    <div className="ai-patience" role="status" aria-live="polite" data-noinvert data-paused={paused ? '1' : '0'}>
      <span className="ai-patience-dot" aria-hidden />
      <div className="ai-patience-text">
        <strong>{paused ? 'AI paused — your work is safe.' : 'Switching AI capacity — your work is safe.'}</strong>
        <span>
          {trying
            ? 'Trying again now…'
            : paused
              ? `We'll pick this up automatically · next check in ${mmss(left)}. Keep this page open.`
              : `Continuing in ${mmss(left)}`}
          {more}
        </span>
        <span className="ai-patience-track" aria-hidden><span style={{ transform: `scaleX(${trying ? 1 : done})` }} /></span>
      </div>
      <button type="button" onClick={stopAllWaiting} title="Show the error now instead of waiting">Stop waiting</button>
    </div>
  );
}
