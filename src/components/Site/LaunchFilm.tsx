/**
 * The launch film, full length, as the second thing on the page.
 *
 * About five and a half minutes, rendered from marketing/launch-film and re-encoded for
 * the web (public/site/launch/: an HLS ladder, and one MP4). It is drawn for 16:9 — the
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
 *
 * ── Quality follows the connection ──
 *
 * One 1080p file played beautifully on a good line and stopped every few
 * seconds on a slow one, and a visitor watching a spinner leaves. The film is
 * an HLS ladder — 1080p, 720p, 480p and 360p, cut into 4-second segments
 * with their keyframes in the same places (hls/, made by
 * marketing/launch-film/README.md) — so the player measures how fast each
 * segment arrives and steps down before the buffer runs dry, and back up
 * when the line recovers, without a restart. It opens at the rung the
 * browser's own estimate of the connection suggests (Network Information
 * API, where there is one) rather than at the top, and asks for no more
 * pixels than the frame shows. Save-Data starts at the bottom.
 *
 * Safari and iOS play HLS themselves, with their own switching. Elsewhere
 * hls.js does it over Media Source Extensions — the light build, loaded only
 * once the film is nearly on screen, so the page does not carry it. A
 * browser with neither, or a stream that fails beyond recovery, gets the MP4.
 */
import { useEffect, useRef, useState } from 'react';
import type HlsType from 'hls.js';
import { ArrowRight, Volume2 } from 'lucide-react';
import { appHref, isCrossOrigin } from '../../services/hosts';
import { motionReduced } from '../../services/motion';

const base = `${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}/site/launch`;

type Mode = 'hls' | 'native' | 'mp4';

/** The browser's guess at the line in bits a second, or undefined if it will not say. */
function lineEstimate(): { bps?: number; saveData: boolean } {
  const c = (navigator as Navigator & { connection?: { downlink?: number; saveData?: boolean } }).connection;
  /* downlink is in Mb/s, rounded and capped (Chrome caps it at 10); a guess
     at the start, which the measured segments then replace. */
  const bps = c?.downlink ? c.downlink * 1e6 * 0.8 : undefined;
  return { bps, saveData: !!c?.saveData };
}

export default function LaunchFilm() {
  const wrap = useRef<HTMLElement | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const [armed, setArmed] = useState(false);
  const [sound, setSound] = useState(false);

  const file = 'launch-16x9';
  const poster = `${base}/poster-16x9.jpg`;

  const [inView, setInView] = useState(false);
  /* How the film is fed, and whether it has something to play yet: play()
     before the stream is attached is refused, and nothing would ask again. */
  const [mode, setMode] = useState<Mode | null>(null);
  const [ready, setReady] = useState(false);

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

  /* Attach the stream once, when the section first comes near. */
  useEffect(() => {
    const v = video.current;
    if (!v || !armed) return;
    let hls: HlsType | null = null;
    let gone = false;
    const mp4 = () => { hls?.destroy(); hls = null; if (!gone) { setMode('mp4'); setReady(true); } };
    if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = `${base}/hls/master.m3u8`;
      setMode('native');
      setReady(true);
    } else if (typeof window.MediaSource === 'undefined' && typeof (window as Window & { ManagedMediaSource?: unknown }).ManagedMediaSource === 'undefined') {
      mp4();
    } else {
      import('hls.js/light').then(({ default: Hls }) => {
        if (gone) return;
        if (!Hls.isSupported()) { mp4(); return; }
        const line = lineEstimate();
        const h: HlsType = new Hls({
          capLevelToPlayerSize: true,
          /* Its worker is made from a blob: URL, which the site's
             script-src (public/_headers) refuses; a 700 kb/s stream is
             light work on the page's own thread. */
          enableWorker: false,
          startLevel: line.saveData ? 0 : -1,
          ...(line.bps ? { abrEwmaDefaultEstimate: line.bps } : {}),
          /* Enough ahead to ride out a dip, not so much that a visitor who
             scrolls on has downloaded the film. hls.js otherwise stretches
             its goal to what 60 MB holds at the current rung — the whole
             film on a fast line, and a whole film's worth fetched at the
             rung the line had at the start, before anything is measured
             again. */
          maxBufferLength: 20,
          maxMaxBufferLength: 30,
        });
        hls = h;
        let mediaRetried = false, netRetries = 0;
        h.on(Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal) return;
          /* A browser that cannot decode any rung says so as a media error,
             and "recovering" from that would sit on the poster for good. */
          if (data.details !== Hls.ErrorDetails.MANIFEST_INCOMPATIBLE_CODECS_ERROR) {
            /* hls.js has already retried each request by the time an error
               is fatal; two more rounds, then the file. */
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR && netRetries < 2) { netRetries++; h.startLoad(); return; }
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !mediaRetried) { mediaRetried = true; h.recoverMediaError(); return; }
          }
          /* Beyond recovery: the single file, from where it had got to. */
          const at = v.currentTime, playing = !v.paused;
          mp4();
          requestAnimationFrame(() => {
            v.load();
            v.addEventListener('loadedmetadata', () => { if (at) v.currentTime = at; if (playing) v.play().catch(() => {}); }, { once: true });
          });
        });
        h.loadSource(`${base}/hls/master.m3u8`);
        h.attachMedia(v);
        setMode('hls');
        setReady(true);
      }).catch(mp4);
    }
    return () => { gone = true; hls?.destroy(); };
  }, [armed]);

  /* After the render that attached the stream, not in the observer: before it
     the element has nothing to play. */
  useEffect(() => {
    const v = video.current;
    if (!v || !armed || !ready) return;
    if (!inView) { if (!v.paused) v.pause(); return; }
    if (!sound && motionReduced()) return;
    if (v.paused && !v.ended) v.play().catch(() => { /* refused: the poster and button remain */ });
  }, [armed, ready, inView, sound]);

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
    <section className="dc-film" id="film" aria-label="Protected Central in five and a half minutes" ref={wrap}>
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
            data-stream={mode ?? undefined}
            aria-label="Protected Central — a five-minute tour of the product, AI Autopilot first"
          >
            {/* Only when there is no stream: a <source> beside an attached
                stream would be what the element falls back to. */}
            {mode === 'mp4' && <source src={`${base}/${file}.mp4`} type="video/mp4" />}
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
        <p>Protected Central in five and a half minutes. Screens show a demo workspace with example data and example figures.</p>
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
