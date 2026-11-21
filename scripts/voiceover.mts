/**
 * Voices a demonstration film: Protron reads a narration script over the
 * recorded chapters (scripts/site-clips.mts masters), and the voice sets the
 * clock.
 *
 *   npx tsx scripts/voiceover.mts marketing/voice/scripts/autopilot-deep-dive.json
 *
 * The script is `{ film, voice, style, chapters: [{ id, lines: [[at, text]] }] }`
 * — `at` is the second in that chapter's master where the line starts (where
 * its caption appears). Each line is spoken by Google's text-to-speech
 * (gemini-3.8-flash-tts, the owner's chosen voice — Umbriel on 2026-11-20)
 * with every Google AI key on hand, one after another as each runs out
 * (keys() below), and
 * cached by its words in /tmp/vo-cache, so changing one line re-buys one line.
 *
 * Why the voice sets the clock: a line read against a caption that is on
 * screen for four seconds either gets cut off or is written so short it says
 * nothing. So where a line is longer than the stretch before the next one,
 * the picture holds its last frame (still under the same caption) until the
 * voice is done — the same rule as the launch film (marketing/launch-film).
 * The words never run over the next caption.
 *
 * Writes marketing/demos/<film>.mp4 with sound (git-ignored, like the silent
 * films) and prints how much each chapter was held.
 *
 *   npx tsx scripts/voiceover.mts --lines marketing/launch-film/lines.json /tmp/lf/vo
 *
 * The drawn launch film instead: each `[id, scene, text]` line spoken in the
 * same voice and written as <dir>/<id>.wav, which its timing.mjs measures
 * (marketing/launch-film/README.md). Style from marketing/voice/scripts/style.txt.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';

const MASTER = '/tmp/site-clips-master';
const CACHE = '/tmp/vo-cache';
const WORK = '/tmp/vo-work';
const FF = process.env.FFMPEG || '/usr/bin/ffmpeg';
const MODEL = process.env.TTS_MODEL || 'gemini-3.8-flash-tts';
const GAP = 0.35;      // breath between one line and the next
const TAIL = 0.6;      // room left after the last line before the chapter's fade

type Script = { film: string; out?: string; voice: string; style: string; chapters: { id: string; lines: [number, string][] }[] };

/**
 * Every Google AI key on hand, in order. The owner added a second and third
 * key on 2026-11-21 because the first ran out mid-film; the free tier's daily
 * speech allowance is per Google project, so keys from separate projects each
 * bring their own. Names accepted: AI_API_KEY, AI_API_KEY_2…, API_KEY_2…, and
 * the cloud environment's `aistudio_Google_api_key[_NN]_…` variables, plus
 * AI_API_KEY in the git-ignored .dev.vars. Duplicates are dropped.
 */
function keys(): string[] {
  const env = process.env;
  const named = Object.keys(env)
    .filter(n => /^(AI_)?API_KEY(_\d+)?$/.test(n) || /^aistudio_google_api_key/i.test(n))
    .sort((a, b) => (Number(/\d+/.exec(a)?.[0] ?? 1) - Number(/\d+/.exec(b)?.[0] ?? 1)) || a.localeCompare(b))
    .map(n => env[n]!.trim());
  const m = fs.existsSync('.dev.vars') ? /^AI_API_KEY=(.*)$/m.exec(fs.readFileSync('.dev.vars', 'utf8')) : null;
  if (m) named.push(m[1].trim().replace(/^"|"$/g, ''));
  const all = [...new Set(named.filter(Boolean))];
  if (!all.length) throw new Error('No Google AI key: set AI_API_KEY (or API_KEY_2, API_KEY_3…) or put AI_API_KEY in .dev.vars');
  return all;
}
/* The key in use. Moves on when Google says that key's quota is spent, and
   stays there for the rest of the run, so later batches do not re-ask a key
   that has already said no. */
let keyAt = 0;

const dur = (f: string) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());

const cacheFile = (voice: string, style: string, text: string) =>
  `${CACHE}/${crypto.createHash('sha1').update([MODEL, voice, style, text].join('\n')).digest('hex').slice(0, 16)}.wav`;

/**
 * Speaks several lines in ONE request and cuts the audio back into lines.
 * Why batched: the free Google AI tier allows ten speech requests a day per
 * model (found 2026-11-20), and a film has fifty lines. The speech model
 * does not pause much longer between paragraphs than inside them, so each
 * line is found by a local recogniser (scripts/vo-align.py); a piece whose
 * length does not fit its word count stops the run instead of shifting every
 * line. Returns how many lines (from the first) were spoken in full.
 */
async function speakBatch(voice: string, style: string, texts: string[]): Promise<number> {
  const prompt = `${style}\n\n${texts.join('\n\n')}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
  };
  let part: any;
  const raw = `${WORK}/batch.raw`;
  // VO_REUSE=1 re-cuts the last batch already bought instead of asking again.
  if (process.env.VO_REUSE && fs.existsSync(raw)) part = { mimeType: fs.readFileSync(`${raw}.type`, 'utf8') };
  else for (let attempt = 1; ; attempt++) {
    const all = keys();
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': all[keyAt] }, body: JSON.stringify(body),
    });
    const j: any = await r.json().catch(() => ({}));
    part = j?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData;
    if (part) break;
    const msg = JSON.stringify(j).slice(0, 400);
    // A spent or refused key: the next key, at once, without spending a retry.
    if ((r.status === 429 && /per day|quota|exhaust/i.test(msg)) || r.status === 401 || r.status === 403 || /API key not valid|billing/i.test(msg)) {
      if (keyAt + 1 < all.length) { console.log(`  key ${keyAt + 1} of ${all.length} refused (${r.status}) — trying key ${keyAt + 2}`); keyAt++; attempt--; continue; }
      throw new Error(`TTS refused on all ${all.length} keys (${MODEL}): ${r.status} ${msg}`);
    }
    if (attempt >= 4) throw new Error(`TTS refused (${MODEL}): ${r.status} ${msg}`);
    await new Promise(res => setTimeout(res, 20000 * attempt));
  }
  if (part.data) { fs.writeFileSync(raw, Buffer.from(part.data, 'base64')); fs.writeFileSync(`${raw}.type`, part.mimeType); }
  const whole = `${WORK}/batch.wav`;
  // The models answer either a WAV file or bare 16-bit PCM at 24 kHz.
  const input = /wav/i.test(part.mimeType) ? ['-i', raw] : ['-f', 's16le', '-ar', '24000', '-ac', '1', '-i', raw];
  execFileSync(FF, ['-y', '-v', 'error', ...input, '-ar', '48000', '-ac', '1', whole]);
  const total = dur(whole);
  const det = execFileSync('bash', ['-c', `${FF} -hide_banner -i ${whole} -af silencedetect=noise=-42dB:d=0.22 -f null - 2>&1 | grep silence_`]).toString();
  const sil: { a: number; b: number }[] = [];
  let a = -1;
  for (const m of det.matchAll(/silence_(start|end): ([\d.]+)/g)) {
    if (m[1] === 'start') a = Number(m[2]); else if (a >= 0) { sil.push({ a, b: Number(m[2]) }); a = -1; }
  }
  // Each line's first and last word, timed by a local recogniser
  // (vo-align.py). Words before the first line (the model sometimes reads its
  // directions aloud) fall outside every piece; a line it stopped before
  // finishing is left for the next batch.
  fs.writeFileSync(`${WORK}/lines.json`, JSON.stringify(texts));
  const found: ({ start: number; end: number } | null)[] = JSON.parse(execFileSync(process.env.VO_PYTHON || '/tmp/vo-venv/bin/python',
    ['-I', 'scripts/vo-align.py', whole, `${WORK}/lines.json`], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split('\n').pop()!);
  let done = found.findIndex(x => x == null);
  if (done < 0) done = texts.length;
  if (found.slice(done).some(x => x)) throw new Error(`line ${done + 1} of a batch was not heard, but later ones were: "${texts[done].slice(0, 50)}"`);
  if (!done) throw new Error(`nothing in the batch was heard as the script — first line "${texts[0].slice(0, 50)}"`);
  const pauseBefore = (t: number) => {
    // The longest pause just before the first word: a later, shorter one
    // inside the line would cut off its first word ("And share…" lost "And").
    const p = sil.filter(x => x.a < t + 0.15 && x.b > t - 0.9).sort((x, y) => (y.b - y.a) - (x.b - x.a))[0];
    return p ? Math.min(p.b - 0.06, t) : Math.max(0, t - 0.08);
  };
  for (let i = 0; i < done; i++) {
    const f = found[i]!;
    const from = pauseBefore(f.start);
    const to = i + 1 < done ? pauseBefore(found[i + 1]!.start) : Math.min(total, f.end + 0.35);
    const len = to - from, words = texts[i].split(/\s+/).length;
    if (len < words * 0.18 || len > words * 0.75 + 1.5) throw new Error(`line "${texts[i].slice(0, 50)}" came out ${len.toFixed(1)} s for ${words} words — a cut is misplaced`);
    execFileSync(FF, ['-y', '-v', 'error', '-i', whole, '-ss', from.toFixed(3), '-to', to.toFixed(3),
      '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse',
      cacheFile(voice, style, texts[i])]);
  }
  return done;
}

async function linesMode(file: string, dir: string) {
  const style = fs.readFileSync('marketing/voice/scripts/style.txt', 'utf8').trim();
  const voice = process.env.VO_VOICE || 'Umbriel';
  const lines: [string, string, string][] = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.mkdirSync(CACHE, { recursive: true });
  fs.mkdirSync(WORK, { recursive: true });
  fs.mkdirSync(dir, { recursive: true });
  const todo = [...new Set(lines.map(l => l[2]))].filter(t => !fs.existsSync(cacheFile(voice, style, t)));
  const BATCH = Number(process.env.VO_BATCH || 10);
  for (let i = 0; i < todo.length;) {
    i += await speakBatch(voice, style, todo.slice(i, i + BATCH));
    console.log(`voice ${i}/${todo.length} new lines`);
  }
  for (const [id, , text] of lines) fs.copyFileSync(cacheFile(voice, style, text), `${dir}/${id}.wav`);
  console.log(`${lines.length} lines in ${dir}`);
}

async function main() {
  if (process.argv[2] === '--lines') return linesMode(process.argv[3], process.argv[4]);
  const file = process.argv[2];
  if (!file) { console.log('usage: voiceover.mts <script.json>'); process.exit(2); }
  const s: Script = JSON.parse(fs.readFileSync(file, 'utf8'));
  const missing = s.chapters.map(c => c.id).filter(id => !fs.existsSync(`${MASTER}/${id}.mp4`));
  if (missing.length) { console.log(`not recorded yet: ${missing.join(', ')}`); process.exit(1); }
  fs.mkdirSync(CACHE, { recursive: true });
  fs.mkdirSync(WORK, { recursive: true });

  // Speak every new line first, in batches, so a failure stops before any encoding.
  const all = [...new Set(s.chapters.flatMap(c => c.lines.map(l => l[1])))];
  const todo = all.filter(t => !fs.existsSync(cacheFile(s.voice, s.style, t)));
  const BATCH = Number(process.env.VO_BATCH || 10);
  for (let i = 0; i < todo.length;) {
    i += await speakBatch(s.voice, s.style, todo.slice(i, i + BATCH));
    console.log(`voice ${i}/${todo.length} new lines (${all.length - todo.length} cached)`);
  }
  const wavs = new Map(all.map(t => [t, cacheFile(s.voice, s.style, t)] as const));

  const parts: string[] = [];
  let total = 0;
  for (const ch of s.chapters) {
    const src = `${MASTER}/${ch.id}.mp4`;
    const len = dur(src);
    const lines = [...ch.lines].sort((a, b) => a[0] - b[0]);
    // Walk the lines in source time; `hold` is how long the picture freezes
    // just before the next line's start so this line finishes first.
    const holds: { at: number; sec: number }[] = [];
    const placed: { wav: string; out: number }[] = [];
    let shift = 0;                       // output time minus source time so far
    let busyUntil = 0;                   // output time the voice is busy until
    lines.forEach(([at, text], i) => {
      const wav = wavs.get(text)!;
      const out = Math.max(at + shift, busyUntil + (i ? GAP : 0));
      if (out > at + shift) { // previous line overran: hold before this caption
        const need = out - (at + shift);
        holds.push({ at: Math.max(0, at - 0.25), sec: need });
        shift += need;
      }
      placed.push({ wav, out: at + shift });
      busyUntil = at + shift + dur(wav);
    });
    const end = len + shift;
    if (busyUntil + TAIL > end - 0.5) { // last line runs into the fade: hold before the fade
      const need = busyUntil + TAIL - (end - 0.5);
      holds.push({ at: Math.max(0, len - 0.8), sec: need });
      shift += need;
    }

    // Picture: cut at each hold point, clone the last frame for the hold.
    const cuts = [0, ...holds.map(h => h.at), len];
    const vf: string[] = [];
    const segs: string[] = [];
    for (let i = 0; i < cuts.length - 1; i++) {
      const pad = holds[i] ? `,tpad=stop_mode=clone:stop_duration=${holds[i].sec.toFixed(3)}` : '';
      vf.push(`[0:v]trim=${cuts[i].toFixed(3)}:${cuts[i + 1].toFixed(3)},setpts=PTS-STARTPTS${pad}[v${i}]`);
      segs.push(`[v${i}]`);
    }
    vf.push(`${segs.join('')}concat=n=${segs.length}:v=1:a=0[v]`);
    // Sound: every line delayed to its place, mixed without level changes.
    const inputs = ['-i', src, ...placed.flatMap(p => ['-i', p.wav])];
    const af = placed.map((p, i) => `[${i + 1}:a]adelay=${Math.round(p.out * 1000)}:all=1[a${i}]`);
    const outLen = len + shift;
    af.push(`${placed.map((_, i) => `[a${i}]`).join('')}${placed.length ? `amix=inputs=${placed.length}:normalize=0:dropout_transition=0,` : `anullsrc=r=48000:cl=mono,`}apad,atrim=0:${outLen.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]`);
    const out = `${WORK}/${s.film}-${ch.id}.mp4`;
    execFileSync(FF, ['-y', '-v', 'error', ...inputs, '-filter_complex', [...vf, ...af].join(';'),
      '-map', '[v]', '-map', '[a]', '-r', '25', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', out]);
    parts.push(out);
    total += outLen;
    console.log(`${ch.id.padEnd(22)} ${len.toFixed(1)}s → ${outLen.toFixed(1)}s (held ${shift.toFixed(1)}s, ${lines.length} lines)`);
  }

  fs.mkdirSync('marketing/demos', { recursive: true });
  const list = `${WORK}/${s.film}.txt`;
  fs.writeFileSync(list, parts.map(p => `file '${p}'`).join('\n'));
  const dest = s.out || `marketing/demos/${s.film}.mp4`;
  execFileSync(FF, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', dest]);
  const mb = (fs.statSync(dest).size / 1e6).toFixed(1);
  console.log(`${dest} — ${Math.floor(total / 60)} min ${Math.round(total % 60)} s, ${mb} MB`);
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
