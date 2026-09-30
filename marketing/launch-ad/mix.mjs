/* Music bed, sound design and voiceover, synthesised and mixed to a 48 kHz
   stereo WAV. Usage: node mix.mjs config.json out.wav
   config: { dur, sections: [{a,b,kind}], sfx: [{t,type,gain}], vo: [{t,file}] }
   kind: intro | build | full | lift | break | rebuild | outro */
import fs from 'node:fs';
const [, , cfgPath, outPath] = process.argv;
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const SR = 48000;
const N = Math.ceil(cfg.dur * SR);
const TAU = Math.PI * 2;
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const noise = () => rnd() * 2 - 1;

const musL = new Float32Array(N), musR = new Float32Array(N);
const drumL = new Float32Array(N), drumR = new Float32Array(N);
const fxL = new Float32Array(N), fxR = new Float32Array(N);
const vo = new Float32Array(N);
const send = new Float32Array(N); // reverb send (mono)

const kindAt = t => (cfg.sections.find(s => t >= s.a && t < s.b) || { kind: 'none' }).kind;
const has = (t, ...k) => k.includes(kindAt(t));

/* Biquad */
function biquad(type, f, q) {
  const w = TAU * f / SR, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
  else { b0 = a; b1 = 0; b2 = -a; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
}
function bq(f, x) { const y = f.b0 * x + f.b1 * f.x1 + f.b2 * f.x2 - f.a1 * f.y1 - f.a2 * f.y2; f.x2 = f.x1; f.x1 = x; f.y2 = f.y1; f.y1 = y; return y; }
function retune(f, type, fr, q) { const n = biquad(type, fr, q); f.b0 = n.b0; f.b1 = n.b1; f.b2 = n.b2; f.a1 = n.a1; f.a2 = n.a2; }

/* ── Music ── */
const BEAT = 0.5, BAR = 2, CH = 4;
const CHORDS = [ // Am F C G
  { root: 55, pad: [220, 261.63, 329.63, 440] },
  { root: 43.65, pad: [174.61, 220, 261.63, 349.23] },
  { root: 65.41, pad: [196, 261.63, 329.63, 392] },
  { root: 49, pad: [196, 246.94, 293.66, 392] },
];
const chordAt = t => CHORDS[Math.floor(t / CH) % 4];
const level = {
  intro: { pad: 0.55, bass: 0, kick: 0, hat: 0, clap: 0, arp: 0, cut: 900 },
  build: { pad: 0.7, bass: 0.7, kick: 0.6, hat: 0.4, clap: 0, arp: 0.35, cut: 1800 },
  full: { pad: 0.75, bass: 1, kick: 1, hat: 0.7, clap: 0.7, arp: 0.6, cut: 2600 },
  lift: { pad: 0.85, bass: 1, kick: 1, hat: 0.9, clap: 0.8, arp: 0.8, cut: 3400 },
  break: { pad: 0.8, bass: 0.25, kick: 0, hat: 0, clap: 0, arp: 0.45, cut: 1400 },
  rebuild: { pad: 0.75, bass: 0.8, kick: 0.8, hat: 0.6, clap: 0.4, arp: 0.7, cut: 2400 },
  outro: { pad: 0.9, bass: 0.8, kick: 0.7, hat: 0.4, clap: 0.3, arp: 0.6, cut: 3000 },
  none: { pad: 0, bass: 0, kick: 0, hat: 0, clap: 0, arp: 0, cut: 800 },
};
/* Smooth the section levels so changes are never a click. */
const LV = {};
for (const k of Object.keys(level.full)) LV[k] = new Float32Array(Math.ceil(cfg.dur * 100) + 2);
{
  const cur = { ...level.none };
  for (let i = 0; i < LV.pad.length; i++) {
    const tgt = level[kindAt(i / 100)] || level.none;
    for (const k of Object.keys(cur)) { cur[k] += (tgt[k] - cur[k]) * 0.04; LV[k][i] = cur[k]; }
  }
}
const lv = (k, t) => LV[k][Math.min(LV[k].length - 1, Math.floor(t * 100))];

/* Pad: detuned additive voices with a moving low-pass tilt. */
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const ci = Math.floor(t / CH);
  const within = t - ci * CH;
  let sL = 0, sR = 0;
  for (const [idx, w] of [[ci, 1], [ci - 1, 0]]) {
    if (idx < 0) continue;
    const ch = CHORDS[idx % 4];
    const lt = t - idx * CH;
    let env = Math.min(1, lt / 0.9);
    if (idx !== ci) env *= Math.max(0, 1 - within / 0.9); else if (w === 0) continue;
    if (env <= 0) continue;
    const cut = lv('cut', t) * (1 + 0.25 * Math.sin(t * 0.7));
    ch.pad.forEach((f, n) => {
      for (const [det, pan] of [[-0.004, 0.2], [0.004, 0.8]]) {
        const ff = f * (1 + det);
        let v = 0;
        for (let h = 1; h <= 9; h++) { const fh = ff * h; v += Math.sin(TAU * fh * t + n + h) / Math.pow(h, 1.1) / (1 + Math.pow(fh / cut, 2)); }
        v *= env * 0.02;
        sL += v * (1 - pan); sR += v * pan;
      }
    });
  }
  const g = lv('pad', t);
  musL[i] += sL * g; musR[i] += sR * g;
}

/* Kicks, and the sidechain they drive. */
const kicks = [];
for (let b = 0; b * BEAT < cfg.dur; b++) {
  const t = b * BEAT; const g = lv('kick', t);
  if (g > 0.05) kicks.push([t, g]);
}
function addKick(t0, g, L, R) {
  const s0 = Math.floor(t0 * SR);
  let ph = 0;
  for (let j = 0; j < SR * 0.5 && s0 + j < N; j++) {
    const tt = j / SR;
    const f = 46 + 110 * Math.exp(-tt / 0.035);
    ph += TAU * f / SR;
    const v = (Math.sin(ph) * Math.exp(-tt / 0.22) + (j < 90 ? noise() * 0.25 * (1 - j / 90) : 0)) * g * 0.55;
    L[s0 + j] += v; R[s0 + j] += v;
  }
}
kicks.forEach(([t, g]) => addKick(t, g, drumL, drumR));
const duck = new Float32Array(N).fill(1);
kicks.forEach(([t, g]) => { const s0 = Math.floor(t * SR); for (let j = 0; j < SR * 0.4 && s0 + j < N; j++) duck[s0 + j] = Math.min(duck[s0 + j], 1 - 0.45 * g * Math.exp(-(j / SR) / 0.11)); });

/* Hats (offbeats; sixteenths when it lifts) and claps on 2 and 4. */
{
  const hp = biquad('hp', 7000, 0.7);
  for (let s = 0; s * BEAT / 4 < cfg.dur; s++) {
    const t = s * BEAT / 4; const g = lv('hat', t);
    if (g < 0.05) continue;
    const off = s % 4 === 2; const six = lv('arp', t) > 0.55;
    if (!off && !(six && s % 2 === 1)) continue;
    const amp = (off ? 0.16 : 0.06) * g; const dec = off && kindAt(t) === 'lift' ? 0.12 : 0.035;
    const s0 = Math.floor(t * SR); const pan = off ? 0.6 : 0.35;
    for (let j = 0; j < SR * 0.25 && s0 + j < N; j++) { const v = bq(hp, noise()) * amp * Math.exp(-(j / SR) / dec); drumL[s0 + j] += v * (1 - pan) * 1.4; drumR[s0 + j] += v * pan * 1.4; }
  }
  const bp = biquad('bp', 1500, 1.2);
  for (let b = 1; b * BEAT < cfg.dur; b += 2) {
    const t = b * BEAT; const g = lv('clap', t); if (g < 0.05) continue;
    const s0 = Math.floor(t * SR);
    for (let j = 0; j < SR * 0.3 && s0 + j < N; j++) {
      const tt = j / SR; const burst = tt < 0.03 ? (Math.floor(tt / 0.01) % 1 === 0 ? Math.exp(-((tt % 0.01) / 0.003)) : 0) : Math.exp(-(tt - 0.03) / 0.09);
      const v = bq(bp, noise()) * burst * 0.35 * g; drumL[s0 + j] += v; drumR[s0 + j] += v; send[s0 + j] += v * 0.5;
    }
  }
}

/* Bass: eighth-note plucks on the root, saturated a touch. */
for (let e = 0; e * BEAT / 2 < cfg.dur; e++) {
  const t = e * BEAT / 2; const g = lv('bass', t); if (g < 0.05) continue;
  const ch = chordAt(t); const f = ch.root * (e % 8 === 7 ? 2 : 1);
  const s0 = Math.floor(t * SR); const len = BEAT / 2;
  for (let j = 0; j < SR * len && s0 + j < N; j++) {
    const tt = j / SR; const env = Math.min(1, tt / 0.004) * Math.exp(-tt / 0.16);
    const x = Math.sin(TAU * f * tt) + 0.35 * Math.sin(TAU * 2 * f * tt) + 0.12 * Math.sin(TAU * 3 * f * tt);
    const v = Math.tanh(x * 1.4) * env * 0.22 * g; musL[s0 + j] += v; musR[s0 + j] += v;
  }
}

/* Arp: chord tones up an octave, eighths, bell-ish. */
{
  const pat = [0, 1, 2, 3, 2, 1, 3, 1];
  for (let e = 0; e * BEAT / 2 < cfg.dur; e++) {
    const t = e * BEAT / 2; const g = lv('arp', t); if (g < 0.05) continue;
    const ch = chordAt(t); const f = ch.pad[pat[e % 8]] * 2;
    const s0 = Math.floor(t * SR); const pan = e % 2 ? 0.7 : 0.3;
    for (let j = 0; j < SR * 0.45 && s0 + j < N; j++) {
      const tt = j / SR; const env = Math.min(1, tt / 0.003) * Math.exp(-tt / 0.13);
      const v = (Math.sin(TAU * f * tt) + 0.3 * Math.sin(TAU * 2.01 * f * tt) * Math.exp(-tt / 0.04)) * env * 0.06 * g;
      musL[s0 + j] += v * (1 - pan) * 1.4; musR[s0 + j] += v * pan * 1.4; send[s0 + j] += v * 0.6;
    }
  }
}

/* ── Sound design ── */
function put(t0, len, fn, pan = 0.5, rev = 0.3) {
  const s0 = Math.floor(t0 * SR);
  for (let j = 0; j < SR * len; j++) {
    const k = s0 + j; if (k < 0 || k >= N) continue;
    const v = fn(j / SR); fxL[k] += v * (1 - pan) * 1.4; fxR[k] += v * pan * 1.4; send[k] += v * rev;
  }
}
const sweepNoise = (len, f0, f1, q, amp, shape) => { const f = biquad('bp', f0, q); let c = 0; return tt => { if ((c++ & 31) === 0) retune(f, 'bp', f0 * Math.pow(f1 / f0, Math.min(1, tt / len)), q); return bq(f, noise()) * amp * shape(tt / len); }; };
const bell = x => Math.sin(Math.PI * Math.min(1, Math.max(0, x)));
const SFX = {
  pop: (g, P) => P(0, 0.12, tt => Math.sin(TAU * (700 + 2500 * tt) * tt) * Math.exp(-tt / 0.03) * 0.25 * g, 0.5, 0.2),
  click: (g, P) => P(0, 0.06, tt => (Math.sin(TAU * 3200 * tt) * Math.exp(-tt / 0.006) * 0.35 + noise() * Math.exp(-tt / 0.002) * 0.3) * g, 0.5, 0.1),
  key: (g, P) => { const a = 0.6 + rnd() * 0.4; P(0, 0.03, tt => noise() * Math.exp(-tt / 0.004) * 0.22 * g * a, 0.45 + rnd() * 0.1, 0.02); },
  tick: (g, P) => P(0, 0.15, tt => (Math.sin(TAU * 1480 * tt) + 0.4 * Math.sin(TAU * 2960 * tt)) * Math.exp(-tt / 0.035) * 0.14 * g, 0.55, 0.25),
  pulse: (g, P) => P(0, 0.25, tt => (Math.sin(TAU * 523 * tt) + 0.3 * Math.sin(TAU * 1046 * tt)) * Math.min(1, tt / 0.008) * Math.exp(-tt / 0.08) * 0.16 * g, 0.5, 0.35),
  success: (g, P) => P(0, 0.7, tt => { const a = Math.sin(TAU * 1318.5 * tt) * Math.exp(-tt / 0.18); const b = tt > 0.08 ? Math.sin(TAU * 1760 * (tt - 0.08)) * Math.exp(-(tt - 0.08) / 0.25) : 0; return (a + b) * 0.1 * g; }, 0.55, 0.5),
  notify: (g, P) => P(0, 0.7, tt => { const a = Math.sin(TAU * 1046.5 * tt) * Math.exp(-tt / 0.15); const b = tt > 0.07 ? Math.sin(TAU * 1568 * (tt - 0.07)) * Math.exp(-(tt - 0.07) / 0.22) : 0; return (a + b) * 0.09 * g; }, 0.65, 0.5),
  shimmer: (g, P) => P(0, 1.2, tt => [1318.5, 1975.5, 2637].reduce((s, f, i) => s + Math.sin(TAU * f * tt + i) * (0.6 + 0.4 * Math.sin(tt * 30 + i)), 0) * Math.min(1, tt / 0.05) * Math.exp(-tt / 0.35) * 0.05 * g, 0.5, 0.7),
  ai_on: (g, P) => { let ph = 0; P(0, 0.9, tt => { ph += TAU * (300 + 1100 * Math.pow(Math.min(1, tt / 0.45), 2)) / SR; return (Math.sin(ph) * Math.exp(-Math.max(0, tt - 0.4) / 0.12) * Math.min(1, tt / 0.05) * 0.1 + Math.sin(TAU * 2637 * tt) * Math.max(0, tt - 0.35) * Math.exp(-tt / 0.3) * 0.08) * g; }, 0.5, 0.6); },
  whoosh_soft: (g, P) => P(-0.15, 0.5, sweepNoise(0.5, 700, 3200, 1.4, 0.5 * g, bell), 0.5, 0.3),
  whoosh_in: (g, P) => P(-0.05, 0.5, sweepNoise(0.5, 300, 5000, 1.2, 0.9 * g, x => Math.pow(Math.min(1, x), 2)), 0.5, 0.3),
  bass_hit: (g, P) => { let ph = 0; const lp = biquad('lp', 900, 0.7); P(0, 2.4, tt => { ph += TAU * (34 + 40 * Math.exp(-tt / 0.12)) / SR; return (Math.tanh(Math.sin(ph) * 1.6) * Math.exp(-tt / 0.7) * 0.6 + bq(lp, noise()) * Math.exp(-tt / 0.05) * 0.5) * g; }, 0.5, 0.35); },
  impact: (g, P) => { let ph = 0; const lp = biquad('lp', 5000, 0.6); P(0, 2.5, tt => { ph += TAU * (40 + 60 * Math.exp(-tt / 0.08)) / SR; return (Math.sin(ph) * Math.exp(-tt / 0.45) * 0.5 + bq(lp, noise()) * Math.exp(-tt / 0.5) * 0.12) * g; }, 0.5, 0.5); },
  sting: (g, P) => P(0, 2.8, tt => { const fs_ = [523.25, 659.25, 783.99, 1174.66, 1567.98]; let v = 0; fs_.forEach((f, i) => { const d = i * 0.035; if (tt > d) v += Math.sin(TAU * f * (tt - d)) * Math.exp(-(tt - d) / (1.1 - i * 0.12)) * (1 + 0.5 * Math.sin(TAU * 2 * f * (tt - d)) * Math.exp(-(tt - d) / 0.05)); }); return (v * 0.055 + Math.sin(TAU * 55 * tt) * Math.exp(-tt / 0.6) * 0.3) * g; }, 0.5, 0.8),
  riser: () => {},
};
for (const s of cfg.sfx) {
  const fn = SFX[s.type]; if (!fn) continue;
  fn(s.gain ?? 1, (t0, len, f, pan, rev) => put(s.t + t0, len, f, pan, rev));
}
/* Risers into the big moments. */
for (const r of cfg.risers || []) put(r.a, r.b - r.a, sweepNoise(r.b - r.a, 250, 6000, 1.0, r.gain ?? 0.35, x => Math.pow(x, 2.5)), 0.5, 0.4);

/* ── Voiceover ── */
function readWav(p) {
  const b = fs.readFileSync(p);
  let off = 12, sr = 22050, data = null, ch = 1;
  while (off < b.length) { const id = b.toString('ascii', off, off + 4); const sz = b.readUInt32LE(off + 4); if (id === 'fmt ') { ch = b.readUInt16LE(off + 10); sr = b.readUInt32LE(off + 12); } if (id === 'data') data = b.subarray(off + 8, off + 8 + sz); off += 8 + sz + (sz & 1); }
  const n = data.length / 2 / ch; const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = data.readInt16LE(i * 2 * ch) / 32768;
  return { sr, x: out };
}
for (const v of cfg.vo) {
  const { sr, x } = readWav(v.file);
  const hp = biquad('hp', 90, 0.7);
  const ratio = sr / SR; const s0 = Math.floor(v.t * SR); const n = Math.floor(x.length / ratio);
  let env = 0;
  for (let j = 0; j < n; j++) {
    const p = j * ratio; const i0 = Math.floor(p); const fr = p - i0;
    const xm1 = x[i0 - 1] ?? 0, x0 = x[i0] ?? 0, x1 = x[i0 + 1] ?? 0, x2 = x[i0 + 2] ?? 0;
    let s = x0 + 0.5 * fr * (x1 - xm1 + fr * (2 * xm1 - 5 * x0 + 4 * x1 - x2 + fr * (3 * (x0 - x1) + x2 - xm1)));
    s = bq(hp, s);
    const a = Math.abs(s); env = a > env ? env + (a - env) * 0.01 : env + (a - env) * 0.0004;
    const gr = env > 0.25 ? Math.pow(0.25 / env, 0.6) : 1; // ~2.5:1 above threshold
    if (s0 + j < N) vo[s0 + j] += s * gr * 1.3;
  }
}

/* ── Reverb (Schroeder) on the send ── */
function reverb(inp, delays) {
  const out = new Float32Array(N);
  const combs = delays.map(d => ({ buf: new Float32Array(d), i: 0, lp: 0 }));
  const aps = [[556, 0.5], [441, 0.5]].map(([d, g]) => ({ buf: new Float32Array(d), i: 0, g }));
  for (let k = 0; k < N; k++) {
    let s = 0;
    for (const c of combs) { const y = c.buf[c.i]; c.lp = y * 0.7 + c.lp * 0.3; c.buf[c.i] = inp[k] + c.lp * 0.82; c.i = (c.i + 1) % c.buf.length; s += y; }
    s *= 0.25;
    for (const a of aps) { const b = a.buf[a.i]; const y = -s + b; a.buf[a.i] = s + b * a.g; a.i = (a.i + 1) % a.buf.length; s = y; }
    out[k] = s;
  }
  return out;
}
const revL = reverb(send, [1557, 1617, 1491, 1422]);
const revR = reverb(send, [1580, 1640, 1514, 1445]);

/* ── Master ── */
// Duck the music under the voice.
const vEnv = new Float32Array(N);
{ let e = 0; for (let k = 0; k < N; k++) { const a = Math.abs(vo[k]); e = a > e ? e + (a - e) * 0.002 : e + (a - e) * 0.00006; vEnv[k] = e; } }
const L = new Float32Array(N), R = new Float32Array(N);
const fadeOut = cfg.fadeOut ?? 0.6;
for (let k = 0; k < N; k++) {
  const t = k / SR;
  const vd = 1 - Math.min(0.55, vEnv[k] * 5);
  const m = duck[k] * vd;
  const fo = Math.min(1, (cfg.dur - t) / fadeOut);
  const fi = Math.min(1, t / 0.02);
  L[k] = ((musL[k] * m + drumL[k] * 0.42 * (0.55 + 0.45 * vd)) * 0.9 + fxL[k] * 0.9 + revL[k] * 0.55 + vo[k]) * fo * fi;
  R[k] = ((musR[k] * m + drumR[k] * 0.42 * (0.55 + 0.45 * vd)) * 0.9 + fxR[k] * 0.9 + revR[k] * 0.55 + vo[k]) * fo * fi;
}
{
  const rms = (a, from = 0, to = N, mask) => { let s = 0, n = 0; for (let k = from; k < to; k++) { if (mask && !mask(k)) continue; s += a[k] * a[k]; n++; } return (10 * Math.log10(s / Math.max(1, n) + 1e-12)).toFixed(1); };
  const pk = a => { let p = 0, at = 0; for (let k = 0; k < N; k++) if (Math.abs(a[k]) > p) { p = Math.abs(a[k]); at = k; } return p.toFixed(2) + '@' + (at / SR).toFixed(2); };
  const mus = new Float32Array(N); for (let k = 0; k < N; k++) mus[k] = musL[k] * duck[k];
  const voOn = k => vEnv[k] > 0.02;
  console.log('dB  mus(all)', rms(mus), 'mus(full 11-38)', rms(mus, 11 * SR, 38 * SR), 'drums', rms(drumL, 11 * SR, 38 * SR), 'fx', rms(fxL), 'vo(active)', rms(vo, 0, N, voOn), 'rev', rms(revL));
  console.log('peaks mus', pk(musL), 'drum', pk(drumL), 'fx', pk(fxL), 'vo', pk(vo), 'rev', pk(revL), 'L', pk(L));
}
let peak = 0; for (let k = 0; k < N; k++) peak = Math.max(peak, Math.abs(L[k]), Math.abs(R[k]));
const norm = 0.6 / peak;
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let k = 0; k < N; k++) {
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, Math.tanh(L[k] * norm * 1.05) )) * 32767), 44 + k * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, Math.tanh(R[k] * norm * 1.05) )) * 32767), 46 + k * 4);
}
fs.writeFileSync(outPath, buf);
console.log('wrote', outPath, cfg.dur + 's', 'peak', peak.toFixed(3));
