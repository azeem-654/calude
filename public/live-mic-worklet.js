/*
 * The microphone for Protron's live voice (src/services/protron/live.ts).
 *
 * A static file, not a Blob URL: the app's Content-Security-Policy allows
 * scripts from 'self' only. Runs on the audio thread at the device's rate,
 * averages down to 16 kHz mono, and posts 100 ms of 16-bit PCM at a time
 * with its loudness (0–1) for the listening bars.
 */
class LiveMic extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.out = new Int16Array(1600);
    this.n = 0;
    this.acc = 0;
    this.count = 0;
    this.pos = 0;
    this.peak = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.acc += ch[i];
      this.count++;
      this.pos += 1;
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio;
        const v = Math.max(-1, Math.min(1, this.acc / this.count));
        this.acc = 0;
        this.count = 0;
        const a = Math.abs(v);
        if (a > this.peak) this.peak = a;
        this.out[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        if (this.n === this.out.length) {
          this.port.postMessage({ pcm: this.out.buffer, level: Math.min(1, this.peak * 2.2) }, [this.out.buffer]);
          this.out = new Int16Array(1600);
          this.n = 0;
          this.peak = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('live-mic', LiveMic);
