/**
 * The microphone, as the customer sees it.
 *
 * Idle is a microphone. Listening says "Listening…" with a recording light
 * and a running clock, draws a ring that follows their voice, and a row of
 * bars that move with the microphone's real level (VoiceBars). The words are
 * not shown as they are spoken: the browser's live guess trailed the speaker
 * by a second or more and read as a recording that was not working (see
 * useVoiceInput.ts). Stop, and it says it is transcribing; then it hands the
 * text up to whoever owns the box, which puts it there and asks them to
 * check it.
 *
 * The ring and the pulse are CSS, inside `prefers-reduced-motion:
 * no-preference` (see voice.css), so somebody who asked their machine to stop
 * moving things gets the same states in words and colour, without the motion.
 */
import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Loader, AlertCircle, RotateCcw, Globe2 } from 'lucide-react';
import { useVoiceInput, LOCALES, defaultLocale, rememberLocale, type VoiceResult } from './useVoiceInput';
import VoiceBars from './VoiceBars';
import './voice.css';

const INK = '#17191c';
const MUTED = '#6b7280';
const ACCENT = '#5b46e5';
const BAD = '#b42318';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function VoiceControl({ onResult, onListening, disabled, compact, listenSignal }: {
  onResult: (r: VoiceResult) => void;
  /** Bumped by the owner to start listening from its own button — "Say it
   *  again" and "Add more" on the review banner. */
  listenSignal?: number;
  /** Told when listening starts and stops, so the owner can lock its box. */
  onListening?: (on: boolean) => void;
  disabled?: boolean;
  /** A smaller button for a side panel. */
  compact?: boolean;
}) {
  const [locale, setLocale] = useState(defaultLocale);
  const v = useVoiceInput(locale);
  const busy = v.phase === 'starting' || v.phase === 'listening' || v.phase === 'transcribing';

  const go = async () => {
    if (v.phase === 'listening') { void v.stop(); return; }
    if (busy) return;
    onListening?.(true);
    const r = await v.start();
    onListening?.(false);
    if (r) onResult(r);
  };

  /* Started from outside. A ref to `go` rather than `go` itself in the effect,
     so the effect runs when the signal changes and at no other time. */
  const goRef = useRef(go);
  useEffect(() => { goRef.current = go; });
  const seen = useRef(listenSignal ?? 0);
  useEffect(() => {
    if (listenSignal === undefined || listenSignal === seen.current) return;
    seen.current = listenSignal;
    void goRef.current();
  }, [listenSignal]);

  const size = compact ? 38 : 46;
  if (!v.supported) return null;

  return (
    <div className="vc" style={{ display: 'grid', gap: 8, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => void go()}
          disabled={disabled || v.phase === 'transcribing' || v.phase === 'starting'}
          aria-pressed={v.phase === 'listening'}
          aria-label={v.phase === 'listening' ? 'Stop listening' : 'Speak instead of typing'}
          title={v.phase === 'listening' ? 'Stop listening' : 'Speak instead of typing'}
          className={`vc-mic${v.phase === 'listening' ? ' vc-on' : ''}`}
          style={{
            ['--lvl' as string]: v.level.toFixed(3),
            width: size, height: size, borderRadius: 999, flexShrink: 0,
            border: v.phase === 'listening' ? `2px solid ${BAD}` : '1px solid #dfe3ec',
            background: v.phase === 'listening' ? '#fff1f0' : '#fff',
            color: v.phase === 'listening' ? BAD : INK,
            display: 'grid', placeItems: 'center', cursor: disabled ? 'default' : 'pointer',
            position: 'relative',
          } as React.CSSProperties}
        >
          {v.phase === 'transcribing' || v.phase === 'starting'
            ? <Loader size={compact ? 15 : 18} className="spin" />
            : v.phase === 'listening' ? <Square size={compact ? 13 : 15} fill="currentColor" /> : <Mic size={compact ? 16 : 19} />}
        </button>

        <span style={{ minWidth: 0, flex: '1 1 140px' }}>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: v.phase === 'listening' ? BAD : v.phase === 'error' ? BAD : INK }}>
            {v.phase === 'listening' && <span className="vc-rec" aria-hidden />}
            {/* The words are announced; the clock beside them is not, or a
                screen reader would read out every second. */}
            <span aria-live="polite">
              {v.phase === 'listening' ? 'Listening…'
                : v.phase === 'starting' ? 'Starting the microphone…'
                  : v.phase === 'transcribing' ? 'Transcribing what you said…'
                    : v.phase === 'error' ? 'Voice input stopped'
                      : 'Speak instead'}
            </span>
            {v.phase === 'listening' && (
              <span aria-hidden style={{ marginLeft: 6, fontVariantNumeric: 'tabular-nums' }}>{mmss(v.seconds)}</span>
            )}
          </span>
          <span style={{ display: 'block', fontSize: 11.5, color: MUTED, lineHeight: 1.45 }}>
            {v.phase === 'listening' ? 'Speak naturally — pauses are fine. Press stop when you have finished.'
              : v.phase === 'transcribing' ? 'Reading the whole recording, so the words are right.'
                : 'Nothing is sent or run until you have checked the words.'}
          </span>
        </span>

        {/* The language it listens for. Small, because most people never touch
            it; there, because the wrong one is the commonest reason for words
            being misheard. */}
        {!busy && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: MUTED }}>
            <Globe2 size={12} aria-hidden />
            <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Language you speak</span>
            <select
              value={locale}
              onChange={e => { setLocale(e.target.value); rememberLocale(e.target.value); }}
              aria-label="Language you speak"
              style={{ border: 'none', background: 'transparent', color: MUTED, fontSize: 11.5, fontFamily: 'inherit', cursor: 'pointer', maxWidth: 150 }}
            >
              {LOCALES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </label>
        )}
      </div>

      {v.phase === 'listening' && (
        <div className="vc-live" style={{
          border: '1px solid #f3d3d0', background: '#fffafa', borderRadius: 12, padding: '10px 12px',
          display: 'grid', gap: 6, minWidth: 0,
        }}>
          <span style={{ color: BAD, display: 'block', minWidth: 0 }}>
            <VoiceBars meter={v.meter} count={compact ? 28 : 40} height={compact ? 28 : 36} />
          </span>
          <span style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.45 }}>
            Recording — the bars move with your voice. Your words appear for you to check when you press stop.
          </span>
        </div>
      )}

      {v.phase === 'error' && (
        <div role="alert" style={{
          display: 'flex', gap: 8, alignItems: 'flex-start', padding: '9px 11px', borderRadius: 11,
          background: '#fef3f2', color: BAD, fontSize: 12.5, lineHeight: 1.5,
        }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span style={{ flex: 1 }}>{v.problem}</span>
          <button type="button" onClick={() => { v.reset(); void go(); }} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none',
            color: ACCENT, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
          }}><RotateCcw size={12} /> Try again</button>
        </div>
      )}
    </div>
  );
}
