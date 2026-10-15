/**
 * The microphone on the results bar — one round button.
 *
 * The same engine as Autopilot's voice prompts (`useVoiceInput`: the browser's
 * recogniser for a live preview, the server's transcriber for the text), in
 * the customer's remembered language. Autopilot's `VoiceControl` draws a
 * language menu and a sentence of help beside itself, which is right in a
 * wizard and wrong in a search bar; this draws only the state. The words it
 * hears go into the boxes for checking, never straight into a search.
 *
 * While listening the button holds a few bars that move with the microphone's
 * real level (VoiceBars) — the browser's live words trailed the speaker and
 * are not shown anywhere any more; the bars are what says it is hearing.
 */
import { Loader, Mic } from 'lucide-react';
import { defaultLocale, useVoiceInput, type VoiceResult } from '../Autopilot/voice/useVoiceInput';
import VoiceBars from '../Autopilot/voice/VoiceBars';

export default function MicButton({ onResult }: { onResult: (r: VoiceResult) => void }) {
  const v = useVoiceInput(defaultLocale());
  if (!v.supported) return null;
  const listening = v.phase === 'listening' || v.phase === 'starting';
  const busy = v.phase === 'transcribing';
  return (
    <button type="button" className="aip-micbtn" data-state={listening ? 'listening' : busy ? 'busy' : undefined}
      aria-label={listening ? 'Stop listening' : 'Speak your search'} title={v.problem || (listening ? `Listening ${Math.floor(v.seconds / 60)}:${String(v.seconds % 60).padStart(2, '0')} — press to stop` : 'Say it instead of typing')}
      disabled={busy}
      onClick={async () => {
        if (listening) { void v.stop(); return; }
        const r = await v.start();
        if (r) onResult(r);
      }}>
      {busy ? <Loader size={16} className="spin" />
        : v.phase === 'listening' ? <span style={{ width: 24, display: 'block' }}><VoiceBars meter={v.meter} count={5} height={20} /></span>
          : listening ? <Loader size={16} className="spin" /> : <Mic size={17} />}
    </button>
  );
}
