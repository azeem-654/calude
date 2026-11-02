/*
 * The editor's live preview of "Quieting the room between sentences": the
 * same soft gate the engine runs (FFmpeg agate — threshold, ratio, range,
 * attack, release), as an AudioWorklet. Below the threshold the sound is
 * expanded downward by the ratio, never below `range` (it never closes on a
 * word). A plain file under public/ because the page's CSP allows scripts
 * from 'self' only (no blob: worklets).
 */
class SoftGate extends AudioWorkletProcessor {
  constructor(opts) {
    super();
    const o = (opts && opts.processorOptions) || {};
    this.thr = o.threshold || 0.012;
    this.ratio = o.ratio || 2.5;
    this.range = o.range || 0.25;
    this.att = Math.exp(-1 / (sampleRate * (o.attack || 8) / 1000));
    this.rel = Math.exp(-1 / (sampleRate * (o.release || 250) / 1000));
    this.env = 0;
    this.gain = 1;
  }
  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    if (!inp || !inp.length) return true;
    const n = inp[0].length, ch = inp.length;
    for (let i = 0; i < n; i++) {
      let peak = 0;
      for (let c = 0; c < ch; c++) { const v = Math.abs(inp[c][i]); if (v > peak) peak = v; }
      this.env = peak > this.env ? peak : this.env * this.rel + peak * (1 - this.rel);
      const want = this.env >= this.thr ? 1 : Math.max(this.range, Math.pow(Math.max(this.env, 1e-6) / this.thr, this.ratio - 1));
      this.gain = want > this.gain ? want + (this.gain - want) * this.att : want + (this.gain - want) * this.rel;
      for (let c = 0; c < out.length; c++) out[c][i] = (inp[c] || inp[0])[i] * this.gain;
    }
    return true;
  }
}
registerProcessor('soft-gate', SoftGate);
