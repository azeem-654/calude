/**
 * AI Autopilot, drawn as it works — for the sign-in panel and the site's hero.
 *
 * A sentence is typed, the orb takes it, four stages light in turn, and the
 * things Autopilot actually does surface as they would in the app: a post
 * scheduled, a lead's reply stopping a sequence, a meeting booked. Every chip
 * names something the product does today; none is a figure about anybody's
 * business, because this is an illustration and must not read as a result.
 *
 * All of it is CSS keyframes except the typing, which is a timer. Both stop
 * for reduced motion — the CSS by its media query (so services/motion.ts can
 * overrule the system either way), the typing by motionReduced(), which reads
 * the same choice — and what is left is a still picture that says the same.
 */
import { useEffect, useState } from 'react';
import { Sparkles, Mail, CalendarCheck, Image as ImageIcon, Users, Check, MessageSquare, Workflow } from 'lucide-react';
import { motionReduced } from '../../services/motion';
import { LogoMark } from './Logo';
import './autopilotScene.css';

export const PROMPTS = [
  'Get us more five-star reviews from happy customers',
  'Post on Instagram and LinkedIn every weekday morning',
  'Follow up every quote that has gone quiet for a week',
  'Book discovery calls with the leads from our website',
];

/** A sentence typed, held, cleared, and the next one — like somebody asking. */
export function TypedPrompt({ prompts = PROMPTS, className = '' }: { prompts?: string[]; className?: string }) {
  const [text, setText] = useState(() => (motionReduced() ? prompts[0] : ''));
  useEffect(() => {
    if (motionReduced()) return;
    let i = 0; let n = 0; let deleting = false;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      const full = prompts[i];
      if (!deleting) {
        n += 1;
        setText(full.slice(0, n));
        if (n >= full.length) { deleting = true; t = setTimeout(tick, 2400); return; }
        t = setTimeout(tick, 34 + Math.random() * 40);
      } else {
        n -= 3;
        if (n <= 0) { n = 0; deleting = false; i = (i + 1) % prompts.length; setText(''); t = setTimeout(tick, 420); return; }
        setText(full.slice(0, n));
        t = setTimeout(tick, 14);
      }
    };
    t = setTimeout(tick, 700);
    return () => clearTimeout(t);
  }, [prompts]);
  return (
    <div className={`aps-prompt ${className}`}>
      <span className="aps-prompt-icon"><Sparkles size={15} /></span>
      <span className="aps-prompt-text">{text}<i className="aps-caret" aria-hidden="true" /></span>
      <span className="aps-prompt-go" aria-hidden="true">↵</span>
    </div>
  );
}

const CHIPS = [
  { icon: ImageIcon, title: '3 posts scheduled', sub: 'In your colours, for tomorrow 9:00' },
  { icon: MessageSquare, title: 'Lead replied', sub: 'Sequence stopped — the reply is yours' },
  { icon: CalendarCheck, title: 'Call booked', sub: 'Tuesday 10:30 · Google Meet' },
  { icon: Mail, title: 'Review request sent', sub: 'From your own mailbox' },
];

/** Events surfacing one after another, as they would on the project board. */
export function EventChips({ className = '' }: { className?: string }) {
  return (
    <div className={`aps-chips ${className}`} aria-hidden="true">
      {CHIPS.map((c, i) => (
        <div key={c.title} className={`aps-chip aps-chip-${i}`}>
          <span className="aps-chip-icon"><c.icon size={14} /></span>
          <span><b>{c.title}</b><small>{c.sub}</small></span>
          <Check size={13} className="aps-chip-tick" />
        </div>
      ))}
    </div>
  );
}

const STAGES = [
  { icon: Sparkles, label: 'Understand' },
  { icon: Workflow, label: 'Build' },
  { icon: Users, label: 'Run' },
  { icon: Check, label: 'Report' },
];

/** The four stages every project goes through, lit in turn. */
export function StageFlow({ className = '' }: { className?: string }) {
  return (
    <div className={`aps-flow ${className}`} aria-hidden="true">
      <span className="aps-flow-line"><i /></span>
      {STAGES.map((s, i) => (
        <span key={s.label} className={`aps-stage aps-stage-${i}`}>
          <span className="aps-stage-dot"><s.icon size={14} /></span>
          <small>{s.label}</small>
        </span>
      ))}
    </div>
  );
}

/** The orb: the mark at the centre, rings turning, work orbiting it. */
export function AiOrb({ size = 168 }: { size?: number }) {
  return (
    <div className="aps-orb" style={{ width: size, height: size }} aria-hidden="true">
      <span className="aps-ring aps-ring-1" />
      <span className="aps-ring aps-ring-2" />
      <span className="aps-ring aps-ring-3" />
      <span className="aps-orbit">
        <i><Mail size={12} /></i>
        <i><CalendarCheck size={12} /></i>
        <i><ImageIcon size={12} /></i>
        <i><Users size={12} /></i>
      </span>
      <span className="aps-core"><LogoMark size={Math.round(size * 0.3)} tile={false} /></span>
    </div>
  );
}

/** The whole scene, as the sign-in panel shows it. */
export default function AutopilotScene() {
  return (
    <div className="aps">
      <div className="aps-glow aps-glow-a" />
      <div className="aps-glow aps-glow-b" />
      <div className="aps-grid" />
      <div className="aps-stack">
        <AiOrb />
        <TypedPrompt />
        <StageFlow />
      </div>
      <EventChips />
    </div>
  );
}
