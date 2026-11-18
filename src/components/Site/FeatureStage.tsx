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
 *
 * ── Clips instead of stills (2026-11-18) ──
 *
 * The home page's sections now show each module being used — a short looping
 * recording per module (`clips`, ClipPlayer) — in place of the slideshow of
 * its screens; the microsites still pass `shots`. With clips, a module's
 * block is a button that plays its clip.
 */
import { useCallback, useState, type ReactNode } from 'react';
import ShotReel from './ShotReel';
import ClipPlayer from './ClipPlayer';
import type { ReelShot } from './reels';
import type { ModuleClip } from './clips';
import { useReveal, useRevealGroup } from './useReveal';
import { motionReduced } from '../../services/motion';

type Icon = (p: { size?: number }) => ReactNode;
/**
 * `module`: the module this block is about, as the reel's shots name it. A
 * chapter's reel runs through several modules; the block whose screen is
 * showing is lit, so a visitor reading "Contacts" under a picture of the
 * pipeline can see at once which block the picture belongs to.
 */
export interface StageFeature { icon: Icon; title: string; body: string; module?: string }
export interface StageChip { icon: Icon; title: string; sub: string }

export default function FeatureStage({
  id, className = '', eyebrow, title, body, label, shots = [], clips, features, chips, children, after,
}: {
  id?: string;
  className?: string;
  eyebrow: ReactNode;
  title: ReactNode;
  body: ReactNode;
  /** What the slideshow is of, for a screen reader. */
  label: string;
  shots?: ReelShot[];
  /** The modules being used, one recording each; shown instead of `shots`. */
  clips?: ModuleClip[];
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
  const [showing, setShowing] = useState<string | undefined>(clips?.[0]?.module ?? shots[0]?.module);
  const [pick, setPick] = useState<{ module: string; n: number } | undefined>();
  const onClip = useCallback((c: ModuleClip) => setShowing(c.module), []);
  const hasClip = (m?: string) => !!m && !!clips?.some(c => c.module === m);
  return (
    <section className={`dc-stage ${className}`} id={id} aria-label={label}>
      <div className="dc-stage-head reveal" ref={head}>
        <span className="dc-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{body}</p>
        {children}
      </div>

      <div className={`dc-stage-show reveal${chips?.length ? ' has-chips' : ''}`} ref={show}>
        {clips?.length
          ? <ClipPlayer clips={clips} label={label} pick={pick} onShow={onClip} />
          : <ShotReel shots={shots} label={label} onShow={s => setShowing(s.module)} />}
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
        {features.map(f => {
          const cls = `dc-stage-feat${f.module && f.module === showing ? ' on' : ''}`;
          const inner = <>
            <span className="dc-stage-ic"><span className="dc-stage-ic-in"><f.icon size={17} /></span></span>
            <div><b>{f.title}</b><span>{f.body}</span></div>
          </>;
          /* A block with a clip plays it — and brings the player into view on a
             phone, where the blocks sit under it. */
          return hasClip(f.module) && clips!.length > 1
            ? <button key={f.title} type="button" className={`${cls} is-btn`} aria-pressed={f.module === showing}
                onClick={e => { setPick(p => ({ module: f.module!, n: (p?.n ?? 0) + 1 })); (e.currentTarget.closest('.dc-stage')?.querySelector('.dc-mclip') as HTMLElement | null)?.scrollIntoView({ block: 'nearest', behavior: motionReduced() ? 'auto' : 'smooth' }); }}>{inner}</button>
            : <div key={f.title} className={cls}>{inner}</div>;
        })}
      </div>
      {after}
    </section>
  );
}
