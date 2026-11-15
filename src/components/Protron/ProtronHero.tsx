/**
 * Protron, large and alive: the portrait (ProtronAvatar) inside a ring of
 * light that turns, a second ring carrying two orbiting sparks, a halo that
 * breathes, a scan line passing over the faceplate and sparks rising — the
 * owner's brief, 2026-11-15: "the true bot, with more animation, lighting,
 * tech-savvy moves, AI vibes". Used where Protron has the stage: the AI
 * Autopilot wizard's side pane and the "Building your AI Autopilot" screen,
 * which until now showed the older two-eyed AI Autopilot bot.
 *
 * Every effect is CSS (protron.css `.pth-*`), in the state's colour; under
 * reduced motion nothing moves and only the colours say the state.
 *
 * `ThoughtBubbles` is what it is thinking about, one line at a time, slowly
 * (every `every` ms, 4.5 s by default — "don't shuffle them very fast"), each
 * line fading up into a thought bubble. The lines are the caller's: on the
 * build screen they are the real step running plus what that step decides.
 */
import { useEffect, useState } from 'react';
import ProtronAvatar, { type AvatarState } from './ProtronAvatar';
import './protron.css';

export default function ProtronHero({ size = 112, state = 'idle' }: { size?: number; state?: AvatarState }) {
  const inner = Math.round(size * 0.78);
  return (
    <span className="pth" data-state={state} style={{ width: size, height: size }} aria-hidden="true">
      <i className="pth-halo" />
      <i className="pth-ring" />
      <i className="pth-orbit"><b /><b /></i>
      <i className="pth-sparks"><b /><b /><b /><b /><b /></i>
      <span className="pth-face" style={{ width: inner, height: inner }}>
        <ProtronAvatar size={inner} state={state} />
        <i className="pth-scan" />
      </span>
    </span>
  );
}

export function ThoughtBubbles({ lines, every = 4500, className = '' }: { lines: string[]; every?: number; className?: string }) {
  const [i, setI] = useState(0);
  const key = lines.join('|');
  useEffect(() => { setI(0); }, [key]);
  useEffect(() => {
    if (lines.length < 2) return;
    const t = window.setInterval(() => setI(n => (n + 1) % lines.length), every);
    return () => window.clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, every]);
  const line = lines[Math.min(i, Math.max(0, lines.length - 1))] ?? '';
  if (!line) return null;
  return (
    <span className={`pth-thought ${className}`} role="status" aria-live="polite">
      <i className="pth-thought-dot pth-thought-dot-1" aria-hidden="true" />
      <i className="pth-thought-dot pth-thought-dot-2" aria-hidden="true" />
      <span className="pth-thought-cloud">
        <span className="pth-thought-dots" aria-hidden="true"><b /><b /><b /></span>
        <span key={i} className="pth-thought-line">{line}</span>
      </span>
    </span>
  );
}

/**
 * What Protron is turning over while the business workspace is built. The
 * first line is the step really running (`now`); the rest are what that kind
 * of build weighs — worded as thinking, never as a search it is not doing
 * (ThinkingLines.tsx has the same rule).
 */
export function buildThoughts(business: string, now = ''): string[] {
  const them = business.trim() ? business.trim().slice(0, 40) : 'your business';
  return [
    ...(now ? [`${now}…`] : []),
    `Understanding the targets and goals for ${them}…`,
    'Thinking through how competitors in your market win customers…',
    'Working out which workflows should run first…',
    'Calculating a sending pace that keeps your reputation safe…',
    'Lining up the follow-ups so nobody is left waiting…',
    'Checking every step against the plan you approved…',
  ];
}
