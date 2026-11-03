/**
 * The voice's sound fixes as a list of named steps — one plan read by three
 * places, so they cannot drift apart:
 *
 *   - the engine (server.mjs) runs each step as its own FFmpeg pass on the
 *     edited sound, in this order, and reports `sound:<key>` while it runs —
 *     so Progress names exactly what is being done ("Removing background
 *     noise on a strong level") with that pass's own percentage. One pass for
 *     everything finished all of them at the same instant, and showing them
 *     ticking off one by one would have been a lie;
 *   - Progress (ActivityPanel.tsx) lists the steps before they start;
 *   - the editor's player (liveSound.ts) builds the same steps out of Web
 *     Audio nodes, so the preview is heard with the fixes while editing —
 *     RNNoise in the browser too (a WebAssembly build of the same network).
 *     The browser's filters are close, not identical: what each step does in
 *     the browser is `web`; a step the browser cannot do says so in `webNote`.
 *
 * Plain JavaScript (the engine image runs it unbuilt); types in soundPlan.d.mts.
 * Numbers only: nothing from a request is ever copied into a filter as text.
 */

const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const pct = k => `${Math.round(k * 100)}%`;

/** Room noise between sentences pulled down a little — a soft gate that never closes on a word. */
export const GATE = { threshold: 0.012, ratio: 2.5, range: 0.25, attack: 8, release: 250, knee: 3 };
const gateFf = g => `agate=threshold=${g.threshold}:ratio=${g.ratio}:range=${g.range}:attack=${g.attack}:release=${g.release}:knee=${g.knee}`;

export const NOISE_WORDS = { light: 'light', medium: 'medium', strong: 'strong', max: 'maximum (AI voice isolation)' };

/**
 * Whether this sound asks for AI voice isolation: the "Maximum" level, or
 * Studio Sound at 90 % and over. RNNoise alone left 35–40 % of a loud room
 * audible on the owner's recordings (2026-11); isolation is DeepFilterNet 3
 * in the engine, which separates the voice from everything that is not a
 * voice (music, traffic, keyboards, a second room), not only steady noise.
 */
export function wantsIsolation(audio) {
  const a = audio && typeof audio === 'object' ? audio : {};
  return a.studio ? num(a.strength, 60, 0, 100) >= 90 : a.denoise === 'max';
}

/** Whether the room is turned right down wherever the transcript has nobody talking. */
export function wantsSpeechOnly(audio) {
  const a = audio && typeof audio === 'object' ? audio : {};
  return !!a.speechOnly || wantsIsolation(a);
}

/** How far the room goes down between words when only the talking is kept (−26 dB). */
export const SPEECH_FLOOR = 0.05;

/**
 * Spoken stretches (output seconds) → numbers-only `volume` expression: full
 * level while somebody talks, SPEECH_FLOOR otherwise. Padded so a breath in
 * and a word's tail are kept; stretches closer than 0.6 s are one. Capped at
 * 1500 stretches (the expression stays far under FFmpeg's argument limit).
 */
export function speechVolume(spans) {
  const list = (Array.isArray(spans) ? spans : [])
    .map(x => (Array.isArray(x) ? [Number(x[0]), Number(x[1])] : [NaN, NaN]))
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a && a >= 0)
    .map(([a, b]) => [Math.max(0, a - 0.15), b + 0.3])
    .sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const [a, b] of list) {
    const last = merged[merged.length - 1];
    if (last && a - last[1] < 0.6) last[1] = Math.max(last[1], b); else merged.push([a, b]);
  }
  if (!merged.length) return '';
  const terms = merged.slice(0, 1500).map(([a, b]) => `between(t,${a.toFixed(2)},${b.toFixed(2)})`).join('+');
  return `asetnsamples=n=480:p=0,volume=volume='if(${terms},1,${SPEECH_FLOOR})':eval=frame`;
}

/**
 * The steps for a document's `audio`, in the order they run.
 * `rnnModel` is the engine's RNNoise model path, or '' when the image has
 * none (then the FFT denoiser stands in, as before). The browser passes ''
 * and reads `web`, never `ff`.
 */
export function soundSteps(audio, rnnModel = '', opts = {}) {
  const a = audio && typeof audio === 'object' ? audio : {};
  const o = opts && typeof opts === 'object' ? opts : {};
  const rnn = (mix, fallback) => rnnModel ? ['aresample=48000', `arnndn=m=${rnnModel}:mix=${mix.toFixed(2)}`] : [fallback];
  /*
   * AI voice isolation. `tool: 'dfn'` tells the engine to run DeepFilterNet
   * on this step (its own process, not FFmpeg); `ff` is what runs when the
   * image has no DeepFilterNet or it fails: RNNoise twice — the general-noise
   * model (`cbModel`, trained on more than speech-in-fan-noise) then the
   * standard one — and a light spectral clean of what is left. That costs a
   * little of the voice's air, which is the trade the customer chose.
   */
  const isolate = () => ({
    key: 'isolate', tool: 'dfn', label: 'AI voice isolation — keeping your voice, removing everything else',
    ff: rnnModel
      ? ['aresample=48000', ...(o.cbModel ? [`arnndn=m=${o.cbModel}:mix=1.00`] : []), `arnndn=m=${rnnModel}:mix=1.00`, 'afftdn=nr=14:nf=-48:tn=1', 'lowpass=f=12000']
      : ['afftdn=nr=30:nf=-34:tn=1', 'afftdn=nr=12:nf=-46', 'lowpass=f=11000'],
    web: [{ t: 'rnn', mix: 1 }, { t: 'rnn', mix: 1 }],
    webNote: 'AI voice isolation is heard in the made video; the player uses RNNoise twice, which is close.',
  });
  /* Uses the transcript: the room turned right down wherever nobody is talking. */
  const speech = () => {
    const ff = speechVolume(o.speech);
    if (ff) steps.push({ key: 'speech', label: 'Keeping only the talking — the room turned down wherever the transcript has no words', ff: [ff], web: [], webNote: 'Turning the room down between words uses the transcript and is heard in the made video only.' });
    else if (wantsIsolation(a)) steps.push({ key: 'gate', label: 'Quieting the room between sentences', ff: [gateFf(GATE)], web: [{ t: 'gate', ...GATE }] });
  };
  const steps = [];
  const hz = a.hum === '50' ? 50 : a.hum === '60' ? 60 : 0;
  const repair = () => {
    if (hz) steps.push({
      key: 'hum', label: `Removing ${hz} Hz electrical hum and its overtones`,
      ff: [1, 2, 3, 4].map(k => `bandreject=f=${hz * k}:width_type=q:w=${k === 1 ? 6 : 10}`),
      web: [1, 2, 3, 4].map(k => ({ t: 'notch', f: hz * k, q: k === 1 ? 6 : 10 })),
    });
    if (a.declick) steps.push({
      key: 'declick', label: 'Repairing clicks and pops',
      ff: ['adeclick=w=55:o=75:t=2'], web: [],
      webNote: 'Click repair is heard in the made video only.',
    });
  };
  if (a.studio) {
    const k = num(a.strength, 60, 0, 100) / 100;
    const mix = Math.min(1, 0.7 + 0.6 * k);
    steps.push({ key: 'rumble', label: 'Lining the sound up with your cuts and cutting low rumble', ff: ['highpass=f=80:poles=2'], web: [{ t: 'hp', f: 80 }] });
    repair();
    if (wantsIsolation(a)) steps.push(isolate());
    else steps.push({
      key: 'noise', label: `Converting to Studio Sound — removing background noise (strength ${pct(k)})`,
      ff: rnn(mix, `afftdn=nr=${(10 + 16 * k).toFixed(1)}:nf=-40:tn=1`), web: [{ t: 'rnn', mix }],
    });
    if (wantsSpeechOnly(a)) speech();
    const di = 0.25 + 0.3 * k;
    steps.push({ key: 'deess', label: 'Studio Sound — softening harsh “s” sounds', ff: [`deesser=i=${di.toFixed(2)}`], web: [{ t: 'peak', f: 6500, q: 2, g: -(di * 10) }] });
    const lo = -1 - 2 * k, hi = 1 + 2.5 * k;
    steps.push({
      key: 'tone', label: 'Studio Sound — less boom, more presence in the voice',
      ff: [`equalizer=f=250:t=q:w=1.1:g=${lo.toFixed(1)}`, `equalizer=f=3500:t=q:w=1.4:g=${hi.toFixed(1)}`],
      web: [{ t: 'peak', f: 250, q: 1.1, g: lo }, { t: 'peak', f: 3500, q: 1.4, g: hi }],
    });
    if (a.gate && !steps.some(st => st.key === 'gate')) steps.push({ key: 'gate', label: 'Quieting the room between sentences', ff: [gateFf(GATE)], web: [{ t: 'gate', ...GATE }] });
    const thr = 0.14 - 0.06 * k, ratio = 2 + 2 * k, makeup = 1.2 + 0.6 * k;
    steps.push({
      key: 'even', label: 'Studio Sound — evening out quiet and loud words',
      ff: [`acompressor=threshold=${thr.toFixed(3)}:ratio=${ratio.toFixed(1)}:attack=6:release=120:knee=3:makeup=${makeup.toFixed(2)}`],
      web: [{ t: 'comp', threshold: thr, ratio, attack: 6, release: 120, knee: 3, makeup }],
    });
    return steps;
  }
  /* The plain levels are RNNoise too, wherever its model is in the image (see server.mjs). */
  steps.push({ key: 'rumble', label: 'Lining the sound up with your cuts and cutting low rumble', ff: ['highpass=f=70'], web: [{ t: 'hp', f: 70 }] });
  repair();
  const level = NOISE_WORDS[a.denoise];
  if (a.denoise === 'max') steps.push(isolate());
  else if (level) {
    const mix = a.denoise === 'light' ? 0.75 : 1;
    const fallback = a.denoise === 'light' ? 'afftdn=nr=10:nf=-42' : a.denoise === 'medium' ? 'afftdn=nr=18:nf=-38:tn=1' : 'afftdn=nr=26:nf=-34:tn=1,lowpass=f=11000';
    steps.push({ key: 'noise', label: `Removing background noise on a ${level} level`, ff: rnn(mix, fallback), web: [{ t: 'rnn', mix }] });
  }
  /* Strong always lowers the room between sentences (it did inside the one chain). */
  if (wantsSpeechOnly(a)) speech();
  if ((a.gate || a.denoise === 'strong') && !steps.some(st => st.key === 'gate')) steps.push({ key: 'gate', label: 'Quieting the room between sentences', ff: [gateFf(GATE)], web: [{ t: 'gate', ...GATE }] });
  if (a.voice) steps.push({
    key: 'voice', label: 'Voice clarity — more presence, softer “s”, evened levels',
    ff: ['equalizer=f=3200:t=q:w=1.2:g=2.5', 'deesser=i=0.35', 'acompressor=threshold=0.08:ratio=3:attack=8:release=120:makeup=1.5'],
    web: [{ t: 'peak', f: 3200, q: 1.2, g: 2.5 }, { t: 'peak', f: 6500, q: 2, g: -3.5 }, { t: 'comp', threshold: 0.08, ratio: 3, attack: 8, release: 120, knee: 3, makeup: 1.5 }],
  });
  return steps;
}

/** The whole chain as FFmpeg filters, in order — what one pass used to run. */
export function voiceFilters(audio, rnnModel = '', opts = {}) {
  return soundSteps(audio, rnnModel, opts).flatMap(s => s.ff);
}

/**
 * Whether the sound needs passes of its own: anything beyond the plain
 * high-pass every video gets. Without fixes the render keeps its single pass.
 */
export function needsSoundPasses(audio) {
  return soundSteps(audio).length > 1;
}
