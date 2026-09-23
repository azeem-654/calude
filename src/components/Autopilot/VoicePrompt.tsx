/**
 * Speaking a prompt instead of typing it.
 *
 * ── What this actually is ──
 *
 * The browser's own speech recognition (`SpeechRecognition` /
 * `webkitSpeechRecognition`). Nothing is sent to this app's servers and no
 * audio is stored anywhere: the browser does the listening and hands back text,
 * which is then sitting in the same box as if it had been typed.
 *
 * ── Why it is honest about not existing ──
 *
 * The API is Chrome, Edge and Safari; Firefox does not have it, and a Chrome
 * tab without a microphone permission will refuse it. So this renders *nothing
 * at all* where it cannot work, rather than a button that does nothing when
 * pressed — an offered feature that silently fails is worse than one that was
 * never offered. Where it does work and permission is refused, it says so in
 * the words the customer needs ("allow the microphone"), because the browser's
 * own prompt has by then disappeared.
 *
 * ── Why the text is appended, never replaced ──
 *
 * Somebody who typed two sentences and then reached for the microphone meant to
 * add a third. Replacing the box would throw away work they cannot get back.
 */
import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { T } from './theme';

/* The two names the same API ships under, and the handful of fields used. The
   DOM lib does not type it, and typing the whole interface to use four
   properties would be more surface to keep in step than it is worth. */
interface Recogniser {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type RecogniserCtor = new () => Recogniser;

function ctor(): RecogniserCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecogniserCtor; webkitSpeechRecognition?: RecogniserCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export default function VoicePrompt({ onText, disabled }: {
  /** Called with everything heard so far, to append. */
  onText: (text: string) => void;
  disabled?: boolean;
}) {
  const [supported] = useState(() => !!ctor());
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState('');
  const rec = useRef<Recogniser | null>(null);

  /* Stopped when this unmounts. A recogniser left running holds the microphone
     open with its indicator lit and no screen to stop it from. */
  useEffect(() => () => { try { rec.current?.stop(); } catch { /* already gone */ } }, []);

  if (!supported) return null;

  const start = () => {
    const C = ctor();
    if (!C) return;
    setProblem('');
    const r = new C();
    rec.current = r;
    /* The page's language rather than a hard-coded one: this product is sold
       in more than one country and "en-US" would mishear every other. */
    r.lang = document.documentElement.lang || navigator.language || 'en-GB';
    r.continuous = true;
    /* Interim results off: a box that rewrites itself while somebody is still
       speaking is unreadable, and every correction lands as a visible stutter. */
    r.interimResults = false;

    r.onresult = e => {
      let heard = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) heard += e.results[i][0].transcript;
      }
      if (heard.trim()) onText(heard.trim());
    };
    r.onerror = e => {
      setProblem(e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'The microphone is blocked for this site. Allow it in the address bar and try again.'
        : e.error === 'no-speech'
          ? 'Nothing was heard. Try again, a little closer to the microphone.'
          : `The microphone stopped: ${e.error}.`);
      setListening(false);
    };
    r.onend = () => setListening(false);

    try { r.start(); setListening(true); } catch { setProblem('The microphone could not be started.'); }
  };

  const stop = () => { try { rec.current?.stop(); } catch { /* already stopped */ } setListening(false); };

  return (
    <div style={{ display: 'grid', gap: 5 }}>
      <button
        type="button"
        onClick={() => (listening ? stop() : start())}
        disabled={disabled}
        aria-pressed={listening}
        className={listening ? 'press ap-working' : 'press'}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '8px 13px', borderRadius: 10, fontFamily: 'inherit',
          fontSize: 11.5, fontWeight: 700, cursor: disabled ? 'default' : 'pointer',
          border: `1px solid ${listening ? T.bad : T.line}`,
          background: listening ? T.badSoft : '#fff',
          color: listening ? T.bad : T.ink,
        }}
      >
        {listening ? <><Square size={11} /> Stop listening</> : <><Mic size={12} /> Speak it instead</>}
      </button>

      <span style={{ fontSize: 10, color: problem ? T.bad : T.muted, lineHeight: 1.5 }}>
        {problem || (listening
          ? 'Listening. What you say is added to the box — it is not sent anywhere until you press the button below.'
          : 'Your browser does the listening. No audio reaches this app.')}
      </span>
    </div>
  );
}
