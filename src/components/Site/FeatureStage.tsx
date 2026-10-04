/**
 * A product section on the public site: the title on top, the module's real
 * screens as a wide slideshow, and what it does in blocks underneath.
 *
 * ── Why this shape ──
 *
 * The sections used to put the words in one column and the screenshot in the
 * other, which gave the picture half the width of the page — a whole app
 * window at 600px, unreadable. The owner asked for the screens to have the
 * width: title first, then the slideshow edge to edge (ShotReel, which shows
 * each screen whole and zooms into the part worth reading), then the feature
 * blocks. On a wide window a few short "what just happened" chips float
 * beside the screens, over the dimmed neighbours rather than the screen being
 * read; narrower windows drop them.
 *
 * Every icon breathes in a small loop of its own, staggered so they never move
 * together. Nothing moves with reduced motion asked for (site.css).
 */
import type { ReactNode } from 'react';
import ShotReel from './ShotReel';
import type { ReelShot } from './reels';
import { useReveal, useRevealGroup } from './useReveal';

type Icon = (p: { size?: number }) => ReactNode;
export interface StageFeature { icon: Icon; title: string; body: string }
export interface StageChip { icon: Icon; title: string; sub: string }

export default function FeatureStage({
  id, className = '', eyebrow, title, body, label, shots, features, chips, children, after,
}: {
  id?: string;
  className?: string;
  eyebrow: ReactNode;
  title: ReactNode;
  body: ReactNode;
  /** What the slideshow is of, for a screen reader. */
  label: string;
  shots: ReelShot[];
  features: StageFeature[];
  chips?: StageChip[];
  /** Under the intro: a button, pills. */
  children?: ReactNode;
  /** After the feature blocks: anything the section adds of its own. */
  after?: ReactNode;
}) {
  const head = useReveal<HTMLDivElement>();
  const show = useReveal<HTMLDivElement>();
  const feats = useRevealGroup<HTMLDivElement>('.dc-stage-feat');
  return (
    <section className={`dc-stage ${className}`} id={id} aria-label={label}>
      <div className="dc-stage-head reveal" ref={head}>
        <span className="dc-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{body}</p>
        {children}
      </div>

      <div className={`dc-stage-show reveal${chips?.length ? ' has-chips' : ''}`} ref={show}>
        <ShotReel shots={shots} label={label} />
        {!!chips?.length && (
          <div className="dc-stage-chips" aria-hidden="true">
            {chips.slice(0, 4).map((c, i) => (
              <div key={c.title} className={`dc-stage-chip dc-stage-chip-${i}`}>
                <span className="dc-stage-chip-ic"><c.icon size={14} /></span>
                <span><b>{c.title}</b><small>{c.sub}</small></span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`dc-stage-feats stagger${features.length % 3 === 0 ? ' three' : features.length === 4 ? ' four' : ''}`} ref={feats}>
        {features.map(f => (
          <div key={f.title} className="dc-stage-feat">
            <span className="dc-stage-ic"><span className="dc-stage-ic-in"><f.icon size={17} /></span></span>
            <div><b>{f.title}</b><span>{f.body}</span></div>
          </div>
        ))}
      </div>
      {after}
    </section>
  );
}
