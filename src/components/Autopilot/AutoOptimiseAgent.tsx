/**
 * Protron's "AI auto-optimisation" agent: a small strip above each workflow
 * and above a business workspace's prospect sources, saying it is watching
 * and what it has seen (owner's brief, 2026-11-20: "an always-monitoring AI
 * auto-optimisation live agent above each workflow, and above the prospects
 * that are active in the daily search").
 *
 * ── Why every line on it is a number from the server ──
 *
 * A monitor is the easiest thing in this product to fake: a pulsing dot and
 * "Optimising…" cost nothing and mean nothing. So the strip only states what
 * is really watched and what was really seen — the caller passes facts read
 * from the server (sends and failures over the watch's window, people in a
 * workflow, a finder's searches, reads and additions today), the rules the
 * engine actually applies, and the last thing it flagged. Switched off, it
 * says it is not watching rather than looking busy. The chips light up in
 * turn as a sign of life, never as a claim that a check is running now.
 */
import type { ReactNode } from 'react';
import ProtronAvatar from '../Protron/ProtronAvatar';
import './autoOptimise.css';

export type AgentState = 'monitoring' | 'paused' | 'attention';

export default function AutoOptimiseAgent({
  title, state, status, facts, watches, note, flagged, testId,
}: {
  /** "AI auto-optimisation" or a variant naming the area ("… of prospecting"). */
  title: string;
  state: AgentState;
  /** The short word in the pill: "Monitoring", "Paused", "Needs you". */
  status: string;
  /** Real numbers, each a short phrase ("41 emails sent in 14 days"). */
  facts: string[];
  /** What it watches, as chips. */
  watches: string[];
  /** One sentence: how often it checks and what it does about what it finds. */
  note: string;
  /** The last thing it flagged, with its action. */
  flagged?: ReactNode;
  testId?: string;
}) {
  const live = state !== 'paused';
  return (
    <div className="aoa" data-state={state} data-testid={testId} role="status" aria-label={`${title}: ${status}`}>
      <span className="aoa-face">
        <ProtronAvatar size={38} alive={live} state={state === 'attention' ? 'error' : live ? 'working' : 'idle'} />
      </span>
      <div className="aoa-body">
        <div className="aoa-top">
          <b className="aoa-title">{title}</b>
          <span className="aoa-pill"><i className="aoa-dot" />{status}</span>
        </div>
        {facts.length > 0 && <div className="aoa-facts">{facts.map(f => <span key={f}>{f}</span>)}</div>}
        <div className="aoa-watch" style={{ ['--n' as string]: watches.length }}>
          <span className="aoa-watch-label">Watching</span>
          {watches.map((w, i) => <span key={w} className="aoa-chip" style={{ ['--i' as string]: i }}>{w}</span>)}
        </div>
        <p className="aoa-note">{note}</p>
        {flagged && <div className="aoa-flag">{flagged}</div>}
      </div>
      {live && <span className="aoa-scan" aria-hidden />}
    </div>
  );
}
