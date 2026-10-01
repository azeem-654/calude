/**
 * The launch film, full length, as the second thing on the page.
 *
 * About five minutes, rendered from marketing/launch-film and re-encoded for
 * the web (public/site/launch/, as WebM and MP4). It is drawn for 16:9 — the
 * product window on the right, the words on the left. There used to be a
 * square cut for portrait screens, cropped from a taller ad with blurred
 * sides; the owner asked for the full frame instead, so a phone gets the same
 * film, whole, as wide as the screen.
 *
 * On a wide, short window — a laptop — the film is fitted to the height under
 * the nav and may lose up to 11% of itself top and bottom to fill more of the
 * width; the film is laid out to keep everything that matters out of that
 * margin (site.css, "The launch film"). One scroll from the top lands on it,
 * centred (useFilmStep).
 *
 * ── How it plays ──
 *
 * Nothing downloads until the section is nearly on screen (`preload="none"`
 * and the source set only then): a film most visitors scroll past should not
 * be the slowest thing on the page. On arrival it plays muted, because a
 * browser refuses sound nobody asked for, with the voiceover as captions so
 * the muted version still says everything. "Watch with sound" starts it again
 * from the beginning with sound and the player's own controls — somebody who
 * asked to listen wants the whole thing, not the second half. It pauses when
 * scrolled away.
 *
 * Somebody whose system asks for less motion gets the poster and the button,
 * and nothing moves until they press it.
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Volume2 } from 'lucide-react';
import { appHref, isCrossOrigin } from '../../services/hosts';
import { motionReduced } from '../../services/motion';

const base = `${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}/site/launch`;

export default function LaunchFilm() {
  const wrap = useRef<HTMLElement | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const [armed, setArmed] = useState(false);
  const [sound, setSound] = useState(false);

  const file = 'launch-16x9';
  const poster = `${base}/poster-16x9.jpg`;

  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        setInView(e.isIntersecting);
        if (e.isIntersecting) setArmed(true);
      }
    }, { rootMargin: '200px 0px', threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* After the render that put the <source> in, not in the observer: before it
     the element has nothing to play. */
  useEffect(() => {
    const v = video.current;
    if (!v || !armed) return;
    if (!inView) { if (!v.paused) v.pause(); return; }
    if (!sound && motionReduced()) return;
    if (v.paused && !v.ended) v.play().catch(() => { /* refused: the poster and button remain */ });
  }, [armed, inView, sound]);

  const withSound = () => {
    const v = video.current;
    setArmed(true);
    setSound(true);
    if (!v) return;
    v.muted = false;
    v.currentTime = 0;
    /* All of it on screen before it speaks: the frame is sized to fit under
       the nav, and the section's scroll margin (site.css) centres it there. */
    wrap.current?.scrollIntoView({ behavior: motionReduced() ? 'auto' : 'smooth', block: 'start' });
    /* The captions stay available from the controls, but with the voice
       audible they would say everything twice. */
    for (const t of Array.from(v.textTracks)) t.mode = 'hidden';
    v.play().catch(() => { /* the controls are showing now; the play button is there */ });
  };

  const signup = appHref('/signup');

  return (
    <section className="dc-film" id="film" aria-label="Protected Central in five minutes" ref={wrap}>
      {/* The band is the full width; the frame inside it is as wide as the
          crop allows, and the band's own ground carries on from the film's. */}
      <div className="dc-film-band">
        <div className="dc-film-frame">
          <video
            ref={video}
            className="dc-film-video"
            poster={poster}
            muted={!sound}
            playsInline
            preload="none"
            controls={sound}
            aria-label="Protected Central — a five-minute tour of the product, AI Autopilot first"
          >
            {/* WebM first: two thirds the size, and what Chrome, Firefox and
                Edge pick. MP4 for Safari, and for anything without VP9. */}
            {armed && <source src={`${base}/${file}.webm`} type="video/webm" />}
            {armed && <source src={`${base}/${file}.mp4`} type="video/mp4" />}
            {armed && <track kind="captions" src={`${base}/captions.vtt`} srcLang="en" label="English" default />}
          </video>
          {!sound && (
            <button type="button" className="dc-film-sound" onClick={withSound}>
              <Volume2 size={16} /> Watch with sound
            </button>
          )}
        </div>
      </div>
      <div className="dc-film-foot">
        <p>Protected Central in five minutes. Screens show a demo workspace with example data and example figures.</p>
        {!sound && (
          <button type="button" className="dc-film-sound" onClick={withSound}>
            <Volume2 size={16} /> Watch with sound
          </button>
        )}
        <a className="dc-btn dc-btn-primary" href={signup} {...(isCrossOrigin(signup) ? { rel: 'noopener' } : {})}>
          Start your 7-day free trial <ArrowRight size={15} />
        </a>
      </div>
    </section>
  );
}
