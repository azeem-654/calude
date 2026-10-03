/**
 * The sound side of Live help, for the person answering — the twin of the
 * controls in public/widget.js, so both ends of a call can do the same things.
 *
 * Mute (and the other side is told, so their screen says "muted" rather than
 * leaving them wondering whether the line has dropped), the speaker's volume,
 * which microphone, which speaker, and who is talking. The levels come from the
 * connection's own statistics — what this microphone is sending and what is
 * arriving — so there is no second audio pipeline to keep in step with it.
 *
 * Choosing a speaker needs `HTMLMediaElement.setSinkId`, which Chrome and Edge
 * have and Safari does not. Where it is missing the choice is not drawn: a
 * list that changes nothing would be a control pretending to work.
 *
 * The ring and the clock are in liveSound.ts, beside it: a file of
 * components only, so the dev server can hot-swap it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Volume2 } from 'lucide-react';
import { canPickSpeaker } from './liveSound';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';

export interface AudioCall {
  pc: RTCPeerConnection;
  mic: MediaStream | null;
  dc: RTCDataChannel | null;
}

type SinkAudio = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };

export function AudioControls({ call, audio, theirName, theyMuted, connected }: {
  call: AudioCall;
  audio: React.RefObject<HTMLAudioElement | null>;
  theirName: string;
  theyMuted: boolean;
  connected: boolean;
}) {
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState('');
  const [sinkId, setSinkId] = useState('');
  const [levels, setLevels] = useState({ me: 0, them: 0 });
  const [problem, setProblem] = useState('');
  const mutedRef = useRef(false);
  mutedRef.current = muted;

  /* Real devices only, named as the browser names them — the names are there
     because the microphone was already allowed. */
  useEffect(() => {
    let alive = true;
    void navigator.mediaDevices?.enumerateDevices?.().then(list => {
      if (!alive) return;
      setInputs(list.filter(d => d.kind === 'audioinput' && d.deviceId));
      setOutputs(list.filter(d => d.kind === 'audiooutput' && d.deviceId));
      const t = call.mic?.getAudioTracks()[0];
      setMicId(t?.getSettings().deviceId ?? '');
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [call]);

  useEffect(() => {
    if (!connected) return;
    let busy = false;
    const t = window.setInterval(() => {
      if (busy) return;
      busy = true;
      void call.pc.getStats().then(stats => {
        let me = 0;
        let them = 0;
        stats.forEach((s: { type?: string; kind?: string; audioLevel?: number }) => {
          if (s.kind !== 'audio' || typeof s.audioLevel !== 'number') return;
          if (s.type === 'media-source') me = Math.max(me, s.audioLevel);
          if (s.type === 'inbound-rtp') them = Math.max(them, s.audioLevel);
        });
        setLevels({ me: mutedRef.current ? 0 : me, them });
      }).catch(() => undefined).finally(() => { busy = false; });
    }, 400);
    return () => window.clearInterval(t);
  }, [call, connected]);

  const toggleMute = () => {
    if (!call.mic) return;
    const on = !muted;
    call.mic.getAudioTracks().forEach(t => { t.enabled = !on; });
    if (call.dc?.readyState === 'open') {
      try { call.dc.send(JSON.stringify({ t: 'mute', on })); } catch { /* closing */ }
    }
    setMuted(on);
  };

  /* A new track into the same sender: the other side hears the new
     microphone without the call being set up again. */
  const pickMic = useCallback(async (id: string) => {
    setProblem('');
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: id }, echoCancellation: true, noiseSuppression: true },
      });
      const t = s.getAudioTracks()[0];
      t.enabled = !mutedRef.current;
      const sender = call.pc.getSenders().find(x => x.track?.kind === 'audio');
      if (!sender) { s.getTracks().forEach(x => x.stop()); throw new Error('no sender'); }
      await sender.replaceTrack(t);
      call.mic?.getTracks().forEach(x => x.stop());
      call.mic = s;
      setMicId(id);
    } catch {
      setProblem('That microphone could not be used — the one before it is still on.');
    }
  }, [call]);

  const pickSpeaker = async (id: string) => {
    setProblem('');
    const el = audio.current as SinkAudio | null;
    if (!el?.setSinkId) return;
    try { await el.setSinkId(id); setSinkId(id); } catch { setProblem('That speaker could not be used.'); }
  };

  useEffect(() => { if (audio.current) audio.current.volume = volume; }, [audio, volume]);

  const talker = (label: string, isMuted: boolean, level: number, idle: string) => {
    const talking = connected && !isMuted && level > 0.02;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#334155', minWidth: 0 }}>
        <span aria-hidden style={{
          width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
          background: isMuted ? '#b42318' : talking ? '#22c55e' : '#cbd5e1',
        }} />
        {label} — {isMuted ? 'muted' : talking ? 'talking' : idle}
      </span>
    );
  };

  const sel: React.CSSProperties = {
    width: '100%', minWidth: 0, padding: '7px 9px', border: `1px solid ${LINE}`, borderRadius: 9,
    fontSize: 12.5, fontFamily: 'inherit', background: '#fff', color: INK,
  };
  const lbl: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 11.5, fontWeight: 700, color: '#475569', flex: '1 1 200px', minWidth: 0 };

  return (
    <div data-live-audio style={{ display: 'grid', gap: 10, padding: 12, border: `1px solid ${LINE}`, borderRadius: 12, background: '#f8fafc' }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }} aria-live="polite">
        {talker('You', muted || !call.mic, levels.me, connected ? 'quiet' : 'ready')}
        {talker(theirName, theyMuted, levels.them, connected ? 'quiet' : 'not connected yet')}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={toggleMute} disabled={!call.mic} aria-pressed={muted} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 9, cursor: 'pointer',
          fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
          border: `1px solid ${muted ? '#fecaca' : LINE}`, background: muted ? '#fef2f2' : '#fff', color: muted ? '#b42318' : INK,
        }}>
          {muted || !call.mic ? <MicOff size={13} /> : <Mic size={13} />} {!call.mic ? 'No microphone' : muted ? 'Unmute' : 'Mute'}
        </button>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flex: '1 1 180px', minWidth: 0, fontSize: 12, color: MUTED }}>
          <Volume2 size={15} style={{ flexShrink: 0 }} />
          <input type="range" min={0} max={1} step={0.05} value={volume} aria-label="Speaker volume"
            onChange={e => setVolume(Number(e.target.value))} style={{ flex: 1, minWidth: 0 }} />
        </label>
      </div>
      {(inputs.length > 1 && call.mic) || (canPickSpeaker() && outputs.length > 1) ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {inputs.length > 1 && call.mic && (
            <label style={lbl}>Microphone
              <select style={sel} value={micId} onChange={e => void pickMic(e.target.value)}>
                {inputs.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>)}
              </select>
            </label>
          )}
          {canPickSpeaker() && outputs.length > 1 && (
            <label style={lbl}>Speaker
              <select style={sel} value={sinkId || 'default'} onChange={e => void pickSpeaker(e.target.value)}>
                {outputs.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker ${i + 1}`}</option>)}
              </select>
            </label>
          )}
        </div>
      ) : null}
      {!call.mic && (
        <span style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
          No microphone on this side, so they cannot hear you — type to them instead.
        </span>
      )}
      {problem && <span style={{ fontSize: 12, color: '#b42318' }}>{problem}</span>}
    </div>
  );
}
