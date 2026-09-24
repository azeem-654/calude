/**
 * Microphone samples → a 16 kHz mono WAV, for the transcriber.
 *
 * ── Why WAV, and not what MediaRecorder makes ──
 *
 * Chrome's recorder makes WebM/Opus, Safari's makes MP4/AAC, and the
 * transcriber's list of formats it promises to read includes neither WebM nor
 * every MP4 variant. WAV is on every list. At 16 kHz mono it is 32 KB a second
 * — a minute of somebody describing their business is under 2 MB — and 16 kHz
 * is what speech models are trained on, so nothing is lost by going down to it.
 */
export function downsample(chunks: Float32Array[], fromRate: number, toRate = 16_000): Int16Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const input = new Float32Array(total);
  let at = 0;
  for (const c of chunks) { input.set(c, at); at += c.length; }
  const ratio = fromRate / toRate;
  const length = Math.floor(total / ratio);
  const out = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    /* The average of the samples this one stands for, rather than every Nth —
       picking every Nth folds high frequencies back down as hiss. */
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), total);
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    const v = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out;
}

export function wavBytes(pcm: Int16Array, rate = 16_000): Uint8Array {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return new Uint8Array(buf);
}

export function base64(bytes: Uint8Array): string {
  let s = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) s += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(s);
}
