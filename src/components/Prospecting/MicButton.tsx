/**
 * The microphone on the results bar — one round button.
 *
 * The same engine as Autopilot's voice prompts (`useVoiceInput`: the browser's
 * recogniser for a live preview, the server's transcriber for the text), in
 * the customer's remembered language. Autopilot's `VoiceControl` draws a
 * language menu and a sentence of help beside itself, which is right in a
 * wizard and wrong in a search bar; this draws only the state. The words it
 * hears go into the boxes for checking, never straight into a search.
 */
import { Loader, Mic, Square } from 'lucide-react';
import { defaultLocale, useVoiceInput, type VoiceResult } from '../Autopilot/voice/useVoiceInput';

export default function MicButton({ onResult }: { onResult: (r: VoiceResult) => void }) {
  const v = useVoiceInput(defaultLocale());
  if (!v.supported) return null;
  const listening = v.phase === 'listening' || v.phase === 'starting';
  const busy = v.phase === 'transcribing';
  return (
    <button type="button" className="aip-micbtn" data-state={listening ? 'listening' : busy ? 'busy' : undefined}
      aria-label={listening ? 'Stop listening' : 'Speak your search'} title={v.problem || (listening ? 'Listening — press to stop' : 'Say it instead of typing')}
      disabled={busy}
      onClick={async () => {
        if (listening) { void v.stop(); return; }
        const r = await v.start();
        if (r) onResult(r);
      }}>
      {busy ? <Loader size={16} className="spin" /> : listening ? <Square size={14} /> : <Mic size={17} />}
    </button>
  );
}
