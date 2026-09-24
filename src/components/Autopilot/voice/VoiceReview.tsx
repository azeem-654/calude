/**
 * "I heard this — please check it before continuing."
 *
 * Shown by whoever owns the box once a transcript has been put in it, and it
 * holds that owner's submit until it is dismissed — by "Looks right", or by
 * the customer editing the words themselves, which is the same statement.
 * Nothing heard through a microphone runs without a person having read it.
 */
import { Check, RotateCcw, Plus, X, AlertTriangle, Ear } from 'lucide-react';
import './voice.css';

const ACCENT = '#5b46e5';

export default function VoiceReview({ note, doubtful, onLooksRight, onRetry, onAppend, onClear }: {
  note: string;
  doubtful: boolean;
  onLooksRight: () => void;
  onRetry: () => void;
  onAppend: () => void;
  onClear: () => void;
}) {
  const btn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 11px', borderRadius: 9,
    border: '1px solid #dfe3ec', background: '#fff', color: '#17191c', fontSize: 12.5, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
  };
  return (
    <div className="vc-review" role="status" style={{
      display: 'grid', gap: 9, padding: '11px 13px', borderRadius: 13,
      border: `1px solid ${doubtful ? '#f5d68a' : '#c9c2fa'}`,
      background: doubtful ? '#fffbeb' : '#f6f4ff',
    }}>
      <span style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: doubtful ? '#92400e' : '#3b2fb0', lineHeight: 1.5, fontWeight: 600 }}>
        {doubtful ? <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} /> : <Ear size={15} style={{ flexShrink: 0, marginTop: 2 }} />}
        {note}
      </span>
      <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" onClick={onLooksRight} style={{ ...btn, background: ACCENT, borderColor: ACCENT, color: '#fff' }}>
          <Check size={13} /> Looks right
        </button>
        <button type="button" onClick={onRetry} style={btn}><RotateCcw size={12} /> Say it again</button>
        <button type="button" onClick={onAppend} style={btn}><Plus size={12} /> Add more</button>
        <button type="button" onClick={onClear} style={btn}><X size={12} /> Clear it</button>
      </span>
    </div>
  );
}
