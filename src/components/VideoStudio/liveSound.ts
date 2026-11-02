/**
 * The sound fixes, heard live in the editor's player.
 *
 * The owner pressed play after choosing "strong" noise removal and heard the
 * recording as it was — the fixes only existed in a made file. Now both of
 * the player's video elements (the deck) are routed through Web Audio, and
 * the chain is built from the same named steps the engine runs
 * (media/engine/soundPlan.mjs `web`): high-pass, hum notches, RNNoise (the
 * same network, compiled to WebAssembly — @sapphi-red/web-noise-suppressor,
 * MIT), the soft gate (public/worklets/soft-gate.js), EQ and compression.
 * It is close, not identical: click repair and the −16 LUFS loudness, which
 * is measured over the whole video, are heard in the made file only, and the
 * panel says so.
 *
 * Rules learned the hard way with media + Web Audio:
 *   - an element can be given to createMediaElementSource once, ever; after
 *     that its sound plays only through the graph, so if anything here fails
 *     the source is wired straight to the speakers rather than left silent;
 *   - a cross-origin element gives Web Audio silence: such a source is never
 *     routed (the sound stays native and the panel says the preview is off);
 *   - the context starts on a press (play), as browsers require;
 *   - RNNoise wants 48 kHz, so the context runs at 48 kHz.
 */
import { useSyncExternalStore } from 'react';
import { loadRnnoise, RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';
import rnnWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnSimdUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import { soundSteps, type WebStep, type VideoDoc } from '../../services/videoStudio';

type Audio = VideoDoc['audio'];
export interface LiveState { state: 'starting' | 'live' | 'off'; why: string }

let current: LiveState = { state: 'starting', why: '' };
const subs = new Set<() => void>();
function say(s: LiveState) { if (s.state !== current.state || s.why !== current.why) { current = s; subs.forEach(f => f()); } }
/** What the Audio panel shows: whether the player is playing the fixes live. */
export function useLiveSoundState(): LiveState {
  return useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f); }, () => current, () => current);
}

const sameOrigin = (src: string) => { try { return new URL(src, location.href).origin === location.origin; } catch { return false; } };

export class LiveSound {
  private ac: AudioContext | null = null;
  private input: GainNode | null = null;
  private out: GainNode | null = null;
  private nodes: AudioNode[] = [];
  private routed = new Set<HTMLMediaElement>();
  private rnnBin: ArrayBuffer | null = null;
  private rnnOk = false;
  private gateOk = false;
  private audio: Audio | null = null;
  private starting: Promise<void> | null = null;
  private dead = false;

  private els: HTMLMediaElement[];
  constructor(els: HTMLMediaElement[]) { this.els = els; }

  /** The settings to play (called on every change of the document's sound). */
  set(audio: Audio) {
    this.audio = audio;
    if (this.ac) this.rebuild();
  }

  /** On play (a press): start the context the first time, resume it after. */
  async start(): Promise<void> {
    if (this.dead) return;
    if (!this.starting) this.starting = this.boot().catch(e => { say({ state: 'off', why: `The live sound preview could not start (${(e as Error).message || 'unknown'}); the fixes are heard in the made video.` }); });
    await this.starting;
    if (this.ac && this.ac.state !== 'running') await this.ac.resume().catch(() => {});
  }

  private async boot() {
    if (typeof AudioContext === 'undefined' || typeof AudioWorkletNode === 'undefined') { say({ state: 'off', why: 'This browser has no Web Audio worklets, so the fixes are heard in the made video only.' }); return; }
    const src = this.els[0]?.currentSrc || this.els[0]?.src || '';
    if (src && !sameOrigin(src)) { say({ state: 'off', why: 'The preview is served from another address here, so the live sound preview is off; the fixes are heard in the made video.' }); return; }
    const ac = new AudioContext({ sampleRate: 48000, latencyHint: 'playback' });
    this.ac = ac;
    this.input = ac.createGain();
    this.out = ac.createGain();
    this.out.connect(ac.destination);
    for (const el of this.els) this.route(el);
    this.input.connect(this.out); // sound at once, the chain follows when the worklets are in
    const [rnn, gate] = await Promise.allSettled([
      (async () => { this.rnnBin = await loadRnnoise({ url: rnnWasmUrl, simdUrl: rnnSimdUrl }); await ac.audioWorklet.addModule(rnnWorkletUrl); })(),
      ac.audioWorklet.addModule('/worklets/soft-gate.js'),
    ]);
    this.rnnOk = rnn.status === 'fulfilled';
    this.gateOk = gate.status === 'fulfilled';
    this.rebuild();
  }

  private route(el: HTMLMediaElement) {
    if (!this.ac || !this.input || this.routed.has(el)) return;
    try { this.ac.createMediaElementSource(el).connect(this.input); this.routed.add(el); } catch { /* already routed by an earlier player on this element */ }
  }

  private make(s: WebStep, ac: AudioContext): { first: AudioNode; last: AudioNode; all: AudioNode[] } | null {
    const biquad = (type: BiquadFilterType, f: number, q: number, g = 0) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = g; return b; };
    switch (s.t) {
      case 'hp': { const b = biquad('highpass', s.f, 0.707); return { first: b, last: b, all: [b] }; }
      case 'notch': { const b = biquad('notch', s.f, s.q); return { first: b, last: b, all: [b] }; }
      case 'peak': { const b = biquad('peaking', s.f, s.q, s.g); return { first: b, last: b, all: [b] }; }
      case 'comp': {
        const c = ac.createDynamicsCompressor();
        c.threshold.value = 20 * Math.log10(Math.max(1e-4, s.threshold)); c.ratio.value = s.ratio; c.knee.value = s.knee;
        c.attack.value = s.attack / 1000; c.release.value = s.release / 1000;
        const g = ac.createGain(); g.gain.value = s.makeup; c.connect(g);
        return { first: c, last: g, all: [c, g] };
      }
      case 'gate': {
        if (!this.gateOk) return null;
        const n = new AudioWorkletNode(ac, 'soft-gate', { processorOptions: s, outputChannelCount: [2] });
        return { first: n, last: n, all: [n] };
      }
      case 'rnn': {
        if (!this.rnnOk || !this.rnnBin) return null;
        /* RNNoise at `mix`, as arnndn's mix: the denoised sound plus (1 − mix) of the original. */
        const split = ac.createGain(), sum = ac.createGain(), dry = ac.createGain();
        const n = new RnnoiseWorkletNode(ac, { wasmBinary: this.rnnBin, maxChannels: 2 });
        const wet = ac.createGain(); wet.gain.value = s.mix; dry.gain.value = 1 - s.mix;
        split.connect(n).connect(wet).connect(sum);
        split.connect(dry).connect(sum);
        return { first: split, last: sum, all: [split, n, wet, dry, sum] };
      }
    }
    return null;
  }

  private rebuild() {
    const ac = this.ac, input = this.input, out = this.out;
    if (!ac || !input || !out) return;
    input.disconnect();
    for (const n of this.nodes) { try { n.disconnect(); } catch { /* gone */ } if (n instanceof RnnoiseWorkletNode) n.destroy(); }
    this.nodes = [];
    const a = this.audio;
    let at: AudioNode = input;
    try {
      for (const st of a ? soundSteps(a) : []) for (const w of st.web) {
        const m = this.make(w, ac);
        if (!m) continue;
        at.connect(m.first); at = m.last; this.nodes.push(...m.all);
      }
      const vol = Math.min(2, Math.max(0.3, a?.volume ?? 1));
      if (vol !== 1) { const g = ac.createGain(); g.gain.value = vol; at.connect(g); at = g; this.nodes.push(g); }
      at.connect(out);
    } catch {
      input.disconnect(); input.connect(out);
    }
    const needsRnn = !!a && (a.studio || a.denoise !== 'off');
    say(needsRnn && !this.rnnOk
      ? { state: 'off', why: 'The noise remover could not load in this browser, so background noise is heard as recorded here (the other fixes are live); it is removed in the made video.' }
      : { state: 'live', why: '' });
  }

  destroy() {
    this.dead = true;
    for (const n of this.nodes) if (n instanceof RnnoiseWorkletNode) n.destroy();
    void this.ac?.close().catch(() => {});
    this.ac = null;
    say({ state: 'starting', why: '' });
  }
}
