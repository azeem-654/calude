/**
 * Protron's real-time voice — speech in, speech out, over one live session.
 *
 * The wizard's first screens use it (ProtronIntake.tsx → LiveTalk). The
 * session runs through /api/live.php (worker/src/routes/live.ts), which holds
 * the key, the model and the instructions; this file only moves audio and
 * reports what happened:
 *
 *   mic → AudioWorklet (public/live-mic-worklet.js, 16 kHz PCM) → socket
 *   socket → 24 kHz PCM chunks scheduled back to back → speakers
 *
 * Barge-in is the model's own: when the customer starts talking Gemini sends
 * `interrupted`, and every chunk still queued is stopped at once. The mouth
 * follows the measured loudness of what is playing (level.ts), never a timer.
 * Captions come from the session's own transcriptions.
 *
 * Tool calls (`set_business_details`, `finish_interview`)
 * are handed to the page, which answers them — the website reading goes back
 * in the answer, so Protron can suggest where the customers are.
 */
import { API_BASE } from '../apiBase';
import { getActiveAccountId } from '../tenancy';
import { emitVoiceLevel } from './level';

export type LiveState = 'idle' | 'connecting' | 'live' | 'ended' | 'error';

export interface LiveHandlers {
  onState: (s: LiveState, message?: string, code?: string) => void;
  /** A caption: `final` once the turn is over. */
  onCaption: (role: 'you' | 'protron', text: string, final: boolean) => void;
  /** Answer a tool call; the object goes back to the model. */
  onTool: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  /** Who is making sound now, for the face and the bars. */
  onActivity?: (who: 'you' | 'protron' | 'none', level: number) => void;
}

/** Can this browser hold a live session at all? */
export function liveSupported(): boolean {
  return typeof window !== 'undefined' && typeof WebSocket !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
    && typeof AudioWorkletNode !== 'undefined';
}

const b64 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

const unb64 = (s: string): Int16Array => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return new Int16Array(out.buffer, 0, out.length >> 1);
};

/** The parts of the session's messages this file reads. */
interface LiveMessage {
  pc?: { ready?: boolean; error?: string; code?: string };
  serverContent?: {
    interrupted?: boolean;
    turnComplete?: boolean;
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    modelTurn?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] };
  };
  toolCall?: { functionCalls?: { id: string; name: string; args?: Record<string, unknown> }[] };
  goAway?: unknown;
}

export class LiveVoice {
  private ws: WebSocket | null = null;
  private mic: MediaStream | null = null;
  private micCtx: AudioContext | null = null;
  private outCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private playing = new Set<AudioBufferSourceNode>();
  private nextAt = 0;
  private raf = 0;
  private youText = '';
  private botText = '';
  private stopped = false;
  private h: LiveHandlers;

  constructor(h: LiveHandlers) { this.h = h; }

  /** Opens the mic and the session. `context` is the first user turn: what is already known, as data. */
  async start(context: string): Promise<void> {
    this.stopped = false;
    this.h.onState('connecting');
    const accountId = getActiveAccountId();
    if (!accountId) { this.h.onState('error', 'No workspace is active yet.'); return; }
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    } catch {
      this.h.onState('error', 'The microphone is blocked. Allow it in the browser’s address bar, then press Talk live again.', 'mic');
      return;
    }
    if (this.stopped) { this.release(); return; }

    /* Playback first, inside the press, so the browser lets it make sound. */
    this.outCtx = new AudioContext({ sampleRate: 24000 });
    this.analyser = this.outCtx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.connect(this.outCtx.destination);

    this.micCtx = new AudioContext();
    try {
      await this.micCtx.audioWorklet.addModule(`${import.meta.env.BASE_URL}live-mic-worklet.js`);
    } catch {
      this.h.onState('error', 'This browser could not start the live microphone.', 'mic');
      this.release();
      return;
    }
    const src = this.micCtx.createMediaStreamSource(this.mic);
    const node = new AudioWorkletNode(this.micCtx, 'live-mic');
    src.connect(node);
    /* Not to the speakers: a silent sink keeps the graph pulling. */
    const sink = this.micCtx.createGain();
    sink.gain.value = 0;
    node.connect(sink).connect(this.micCtx.destination);

    const host = API_BASE ? new URL(API_BASE).host : location.host;
    const secure = API_BASE ? API_BASE.startsWith('https') : location.protocol === 'https:';
    const ws = new WebSocket(`${secure ? 'wss' : 'ws'}://${host}/api/live.php?accountId=${encodeURIComponent(accountId)}`);
    this.ws = ws;
    let ready = false;

    node.port.onmessage = (ev: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
      if (!ready || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ realtimeInput: { audio: { data: b64(ev.data.pcm), mimeType: 'audio/pcm;rate=16000' } } }));
      if (!this.playing.size && ev.data.level > 0.06) this.h.onActivity?.('you', ev.data.level);
    };

    ws.onopen = () => {
      ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: context }] }], turnComplete: true } }));
    };
    ws.onmessage = async ev => {
      const raw = typeof ev.data === 'string' ? ev.data : await (ev.data as Blob).text();
      let m: LiveMessage;
      try { m = JSON.parse(raw) as LiveMessage; } catch { return; }
      if (m.pc) {
        if (m.pc.ready) { ready = true; this.h.onState('live'); }
        if (m.pc.error) { this.h.onState(m.pc.code === 'time' || m.pc.code === 'upstream_closed' ? 'ended' : 'error', String(m.pc.error), String(m.pc.code ?? '')); this.stop(true); }
        return;
      }
      const sc = m.serverContent;
      if (sc) {
        if (sc.interrupted) this.hush();
        if (sc.inputTranscription?.text) {
          this.youText += sc.inputTranscription.text;
          this.h.onCaption('you', this.youText.trim(), false);
        }
        for (const p of sc.modelTurn?.parts ?? []) {
          if (p.inlineData?.data && String(p.inlineData.mimeType ?? '').startsWith('audio/')) {
            if (this.youText) { this.h.onCaption('you', this.youText.trim(), true); this.youText = ''; }
            this.play(unb64(p.inlineData.data));
          }
        }
        if (sc.outputTranscription?.text) {
          this.botText += sc.outputTranscription.text;
          this.h.onCaption('protron', this.botText.trim(), false);
        }
        if (sc.turnComplete || sc.interrupted) {
          if (this.youText) { this.h.onCaption('you', this.youText.trim(), true); this.youText = ''; }
          if (this.botText) { this.h.onCaption('protron', this.botText.trim(), true); this.botText = ''; }
        }
      }
      if (m.toolCall?.functionCalls?.length) {
        const responses = await Promise.all(m.toolCall.functionCalls.map(async c => {
          let response: Record<string, unknown>;
          try { response = await this.h.onTool(c.name, c.args ?? {}); } catch (e) { response = { ok: false, error: String(e) }; }
          return { id: c.id, name: c.name, response };
        }));
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));
      }
      if (m.goAway) this.h.onState('ended', 'The live conversation is ending — press Talk live to carry on.');
    };
    ws.onerror = () => { if (!ready) this.h.onState('error', 'The live voice could not connect. Type your answers instead, or try again.', 'connect'); };
    ws.onclose = () => { if (!this.stopped) { this.h.onState(ready ? 'ended' : 'error', ready ? 'The live conversation ended.' : 'The live voice could not connect.'); this.stop(true); } };
    this.meter();
  }

  /** A typed line while the session is open — sent as the customer's turn. */
  sendText(text: string): boolean {
    const t = text.trim();
    if (!t || !this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.hush();
    this.ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: t.slice(0, 2000) }] }], turnComplete: true } }));
    return true;
  }

  /** Queue one chunk right after the last, so speech is seamless. */
  private play(pcm: Int16Array) {
    const ctx = this.outCtx;
    if (!ctx || !this.analyser || !pcm.length) return;
    const buf = ctx.createBuffer(1, pcm.length, 24000);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.analyser);
    this.nextAt = Math.max(this.nextAt, ctx.currentTime + 0.04);
    src.start(this.nextAt);
    this.nextAt += buf.duration;
    this.playing.add(src);
    src.onended = () => { this.playing.delete(src); };
  }

  /** Barge-in: everything queued stops now. */
  private hush() {
    for (const s of this.playing) { try { s.stop(); } catch { /* done */ } }
    this.playing.clear();
    this.nextAt = 0;
  }

  private meter() {
    const data = new Uint8Array(256);
    const tick = () => {
      if (this.stopped || !this.analyser) return;
      this.analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) { const x = (v - 128) / 128; sum += x * x; }
      const lvl = this.playing.size ? Math.min(1, Math.sqrt(sum / data.length) * 4) : 0;
      emitVoiceLevel(lvl);
      if (this.playing.size) this.h.onActivity?.('protron', lvl);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private release() {
    this.mic?.getTracks().forEach(t => t.stop());
    this.mic = null;
    void this.micCtx?.close().catch(() => undefined);
    void this.outCtx?.close().catch(() => undefined);
    this.micCtx = null;
    this.outCtx = null;
    this.analyser = null;
  }

  /** Ends the session and frees the mic. `quiet` keeps the last state message. */
  stop(quiet = false) {
    if (this.stopped) return;
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    this.hush();
    emitVoiceLevel(0);
    this.h.onActivity?.('none', 0);
    try { this.ws?.close(1000, 'done'); } catch { /* closed */ }
    this.ws = null;
    this.release();
    if (!quiet) this.h.onState('idle');
  }
}
