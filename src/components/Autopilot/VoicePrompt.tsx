/**
 * Speaking a prompt into one of the project's side boxes.
 *
 * A thin wrapper now: the listening, the live preview, the locale and the
 * transcription all live in `voice/` and are shared with the New Project
 * wizard, so the microphone behaves the same everywhere it appears. See
 * `voice/useVoiceInput.ts` for why the old browser-only version misheard.
 *
 * Here the words are appended to the box — somebody who typed two sentences
 * and reached for the microphone meant to add a third — and a line under it
 * asks them to read it before pressing the button. Nothing is sent from here.
 */
import { useState } from 'react';
import VoiceControl from './voice/VoiceControl';

export default function VoicePrompt({ onText, disabled }: {
  /** Called with what was heard, to append. */
  onText: (text: string) => void;
  disabled?: boolean;
}) {
  const [note, setNote] = useState('');
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <VoiceControl compact disabled={disabled} onListening={on => { if (on) setNote(''); }}
        onResult={r => { onText(r.text); setNote(r.doubtful ? `${r.note}` : 'Added to the box above. Check the words before pressing the button.'); }} />
      {note && <span style={{ fontSize: 11, color: '#92400e', lineHeight: 1.5 }} role="status">{note}</span>}
    </div>
  );
}
