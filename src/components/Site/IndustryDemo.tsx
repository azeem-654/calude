/**
 * "See it working" on /hvac, /roofing and /medical-billing: the industry's
 * problems one at a time, each followed by the real screen that handles it,
 * and the site's narrated film of the same steps above them.
 *
 * Problem first, then the screen: a visitor recognises their own trouble
 * before being shown software, and every picture under a problem is of the
 * module that answers it (industryDemos.ts, photographed by
 * scripts/industry-demos.mts). The film (marketing/industry-films) is made
 * from the same steps and pictures, so the page and the film cannot disagree.
 */
import { ArrowDown, Check, Play } from 'lucide-react';
import { useState } from 'react';
import ShotReel from './ShotReel';
import { INDUSTRY_DEMOS, type DemoSlug } from './industryDemos';
import { useReveal } from './useReveal';

const base = () => (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

/** The narrated film: nothing is fetched until it is asked for, then it plays with sound. */
function DemoFilm({ slug, title }: { slug: DemoSlug; title: string }) {
  const dir = `${base()}/site/industry/${slug}`;
  const [on, setOn] = useState(false);
  return (
    <figure className="idm-film" data-testid="demo-film">
      {on ? (
        <video controls autoPlay playsInline preload="auto" poster={`${dir}/poster.jpg`} aria-label={title}>
          <source src={`${dir}/demo.mp4`} type="video/mp4" />
          <track kind="captions" src={`${dir}/captions.vtt`} srcLang="en" label="English" default />
        </video>
      ) : (
        <button type="button" className="idm-film-start" onClick={() => setOn(true)} aria-label={`Play: ${title}`}>
          <img src={`${dir}/poster.jpg`} alt="" loading="lazy" />
          <span className="idm-film-play"><Play size={26} /></span>
        </button>
      )}
      <figcaption>{title} — the problems below, in the running software, with narration and captions.</figcaption>
    </figure>
  );
}

export default function IndustryDemo({ slug }: { slug: DemoSlug }) {
  const d = INDUSTRY_DEMOS[slug];
  const head = useReveal<HTMLDivElement>();
  return (
    <section className="idm" id="see-it-work" aria-label="See it working">
      <div className="ind-sec idm-intro">
        <div className="dc-chapter-head reveal" ref={head}>
          <span className="dc-eyebrow">{d.eyebrow}</span>
          <h2>{d.lead} <em>{d.emph}</em></h2>
          <p>{d.body}</p>
        </div>
        {/* Only a demo that has a film made: a poster and a Play button over a
            demo.mp4 that does not exist would be a player that plays nothing. */}
        {d.film && <DemoFilm slug={slug} title={d.film.title} />}
        <ol className="idm-index" aria-label="The problems shown below">
          {d.steps.map((s, i) => <li key={s.pain}><a href={`#see-${i + 1}`}><b>{i + 1}</b> {s.pain}</a></li>)}
        </ol>
        <p className="dc-sample-note idm-sample">{d.sample}</p>
      </div>
      {d.steps.map((s, i) => (
        <article key={s.pain} className="dc-stage idm-step" id={`see-${i + 1}`} data-step={i + 1}>
          <div className="idm-step-head">
            <div className="idm-pain">
              <span className="idm-tag idm-tag-pain"><b>{i + 1}</b> The problem</span>
              <h3>{s.pain}</h3>
              <p>{s.problem}</p>
            </div>
            <ArrowDown className="idm-arrow" size={22} aria-hidden="true" />
            <div className="idm-fix">
              <span className="idm-tag idm-tag-fix"><Check size={13} /> In Protected Central · {s.module}</span>
              <p>{s.solved}</p>
            </div>
          </div>
          <div className="dc-stage-show">
            <ShotReel shots={s.shots.map(x => ({ ...x, module: s.module }))} label={`${s.pain}: ${s.module}`} />
          </div>
        </article>
      ))}
    </section>
  );
}
