/**
 * The test kit for test/videoStudio.e2e.mjs.
 *
 *   makeRecording(file, minutes) — a real video of a scripted talk: a test
 *     picture, and sound that is a tone while "words" are spoken and silent
 *     in the pauses, so the engine's measured silences agree with the script.
 *   startWhisperMock(port, script) — Workers AI's Whisper as the Worker calls
 *     it (POST /run/@cf/openai/whisper-large-v3-turbo, base64 audio). It
 *     cannot hear the tone, so it works out *which* piece it was sent: it
 *     decodes the MP3 with ffprobe for its length, and pieces arrive in order
 *     (a repeat of the same bytes is the same piece), so each one's start is
 *     the sum of the lengths before it. It answers the script's words in that
 *     window, on the piece's own clock — exactly what Whisper does.
 *   startGeminiMock(port) — topics and Shorts by keyword from the numbered
 *     transcript in the prompt, and per-video metadata from each <video>'s own
 *     words. It can be told to fail, to prove the rule-based fallback.
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

/* ── The talk ─────────────────────────────────────────────────────────────── */

const TOPICS = [
  { key: 'intro', lines: ['Hello and welcome to the weekly growth show.', 'Today we cover four things that bring in new customers.'] },
  { key: 'prospecting', lines: [
    'Let us start with AI Prospecting.', 'AI Prospecting finds thirty new businesses every day in the town you choose.',
    'It reads each website and checks every email address before anything is sent.', 'So you never write to an address that bounces.',
    'A roofer in Dallas used AI Prospecting to fill a week of calls.'] },
  { key: 'crm', lines: [
    'Next, the CRM and your pipeline.', 'Every lead lands in the pipeline with its stage and its value.',
    'You can see at a glance which deals are close to closing.', 'The pipeline tells you who to call this morning.'] },
  { key: 'followup', lines: [
    'Now the email follow-up.', 'Most deals are lost because nobody follows up.',
    'The follow-up email goes out two days later if they do not reply.', 'For example, a dental clinic booked twelve more patients from follow-up alone.'] },
  { key: 'pricing', lines: [
    'What does it cost?', 'The plan is $49 a month and there is no setup fee.',
    'You do not need the agency plan unless you resell it.', 'Every plan starts with a seven day trial.'] },
  { key: 'booking', lines: [
    'Then appointments and the booking page.', 'People pick a time that suits them and it lands in your calendar.',
    'A reminder goes out the day before so fewer people forget.'] },
  { key: 'closing', lines: ['That is everything for this week.', 'Thanks for watching and see you next week.'] },
];
const FILLER = ['um', 'uh', 'erm'];
const ELABORATE = [
  'Here is another way to think about it.', 'This matters more than most people expect.', 'Let me show you how that looks on the screen.',
  'It takes about five minutes to set up.', 'Nothing is sent until you approve it.', 'You can change it at any time.',
];

/**
 * Sentences laid out on a clock: words of 0.32 s with 0.12 s between, 0.45 s
 * between sentences, a long pause every so often, fillers and one repeat in
 * places, four seconds of silence before the first word.
 */
export function makeScript(minutes) {
  const total = minutes * 60;
  const words = [];
  const sentences = [];
  let t = 4.0, k = 0;
  const say = (text, topic) => {
    const ws = text.split(' ');
    const first = words.length;
    for (let i = 0; i < ws.length; i++) {
      if (k % 23 === 5 && i === 1) { words.push({ w: FILLER[k % 3] + ',', s: t, e: t + 0.4 }); t += 0.55; }
      if (k % 31 === 7 && i === 0) { words.push({ w: ws[0], s: t, e: t + 0.3 }); t += 0.42; }
      words.push({ w: ws[i], s: t, e: t + 0.32 }); t += 0.44;
    }
    sentences.push({ text, topic, s: words[first].s, e: words[words.length - 1].e });
    t += k % 17 === 9 ? 2.6 : 0.45;
    k++;
  };
  const per = Math.max(1, Math.floor((total - 30) / 4.2 / TOPICS.reduce((n, x) => n + x.lines.length + 4, 0)));
  outer:
  for (let round = 0; round < per; round++) {
    for (const topic of TOPICS) {
      if (round > 0 && (topic.key === 'intro' || topic.key === 'closing')) continue;
      for (const line of topic.lines) { if (t > total - 12) break outer; say(round ? line.replace(/\.$/, ` again, part ${round + 1}.`) : line, topic.key); }
      for (let j = 0; j < 3; j++) { if (t > total - 12) break outer; say(ELABORATE[(round * 3 + j) % ELABORATE.length], topic.key); }
    }
  }
  return { words, sentences, duration: total };
}

export function makeRecording(file, minutes, { width = 640, height = 360 } = {}) {
  const script = makeScript(minutes);
  const rate = 16000, n = Math.ceil(script.duration * rate);
  const pcm = Buffer.alloc(n * 2);
  for (const w of script.words) {
    const a = Math.floor(w.s * rate), b = Math.min(n, Math.floor(w.e * rate));
    for (let i = a; i < b; i++) pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 9000), i * 2);
  }
  const raw = path.join(os.tmpdir(), `talk-${process.pid}.pcm`);
  fs.writeFileSync(raw, pcm);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', `testsrc2=size=${width}x${height}:rate=30`,
    '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', raw,
    '-t', String(script.duration), '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-g', '60', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', file]);
  fs.rmSync(raw, { force: true });
  return script;
}

/* ── Whisper ──────────────────────────────────────────────────────────────── */

const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const readBody = req => new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });

export function startWhisperMock(port, script) {
  const seen = new Map();
  let clock = 0;
  const state = { calls: 0, failNext: 0 };
  const server = http.createServer(async (req, res) => {
    const body = await readBody(req);
    if (req.method !== 'POST' || !/\/run\/@cf\/openai\/whisper/.test(req.url)) return send(res, 404, { error: 'no route' });
    state.calls++;
    if (state.failNext > 0) { state.failNext--; return send(res, 500, { error: 'transcriber busy (test)' }); }
    const { audio } = JSON.parse(body.toString('utf8'));
    const bytes = Buffer.from(audio, 'base64');
    const hash = crypto.createHash('sha1').update(bytes).digest('hex');
    let piece = seen.get(hash);
    if (!piece) {
      const tmp = path.join(os.tmpdir(), `piece-${hash}.mp3`);
      fs.writeFileSync(tmp, bytes);
      const d = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', tmp]).toString().trim());
      fs.rmSync(tmp, { force: true });
      piece = { start: clock, end: clock + d };
      clock += d;
      seen.set(hash, piece);
    }
    const ws = script.words.filter(w => (w.s + w.e) / 2 >= piece.start && (w.s + w.e) / 2 < piece.end);
    const segs = [];
    for (let i = 0; i < ws.length; i += 12) {
      const g = ws.slice(i, i + 12);
      segs.push({
        start: g[0].s - piece.start, end: g[g.length - 1].e - piece.start, text: g.map(w => w.w).join(' '), avg_logprob: -0.12,
        words: g.map(w => ({ word: w.w, start: Math.round((w.s - piece.start) * 1000) / 1000, end: Math.round((w.e - piece.start) * 1000) / 1000 })),
      });
    }
    send(res, 200, { result: { text: ws.map(w => w.w).join(' '), transcription_info: { language: 'en', language_probability: 0.99, duration: piece.end - piece.start }, segments: segs }, success: true });
  });
  return new Promise(r => server.listen(port, '127.0.0.1', () => r({ server, state })));
}

/* ── Gemini ───────────────────────────────────────────────────────────────── */

const KEYWORDS = [
  { re: /AI Prospecting finds/i, topic: 'AI Prospecting', title: 'How AI Prospecting finds 30 businesses a day' },
  { re: /lands in the pipeline/i, topic: 'CRM pipeline', title: 'Your pipeline tells you who to call' },
  { re: /Most deals are lost/i, topic: 'Email follow-up', title: 'Why follow-up wins the deal' },
  { re: /\$49 a month/i, topic: 'Pricing', title: 'What it costs: $49 a month, no setup fee' },
  { re: /pick a time that suits/i, topic: 'Booking page', title: 'Let people book themselves' },
];

export function startGeminiMock(port) {
  const state = { calls: [], fail: false };
  const server = http.createServer(async (req, res) => {
    const raw = (await readBody(req)).toString('utf8');
    const u = new URL(req.url, `http://127.0.0.1:${port}`);
    if (req.method === 'GET' && u.pathname === '/v1beta/models') {
      return send(res, 200, { models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] });
    }
    if (req.method !== 'POST' || !/:generateContent$/.test(u.pathname)) return send(res, 404, { error: { code: 404, message: 'no route' } });
    const prompt = JSON.parse(raw).contents?.[0]?.parts?.map(p => p.text ?? '').join('\n') ?? '';
    state.calls.push(prompt.slice(0, 120));
    if (state.fail) return send(res, 500, { error: { code: 500, message: 'model unavailable (test)' } });
    let answer;
    if (/<transcript>/.test(prompt)) {
      const lines = [...prompt.matchAll(/^\[(\d+)\] \((\d+):(\d+)\) (.*)$/gm)].map(m => ({ i: Number(m[1]), t: Number(m[2]) * 60 + Number(m[3]), text: m[4] }));
      const shorts = [];
      for (const k of KEYWORDS) {
        const at = lines.find(l => k.re.test(l.text));
        if (!at) continue;
        /* Through the sentences that follow until about 45 seconds. */
        let end = at.i;
        while (lines[end + 1] && lines[end + 1].t - at.t < 42) end++;
        shorts.push({ start_sentence: at.i, end_sentence: end, title: k.title, topic: k.topic, reason: `A complete explanation of ${k.topic.toLowerCase()} that needs no context.`, hook: 4, clarity: 5, relevance: 4, completeness: 4 });
      }
      /* A duplicate topic, which the server must refuse. */
      if (shorts[0]) shorts.push({ ...shorts[0], title: 'AI Prospecting again', start_sentence: shorts[0].start_sentence + 1 });
      const ch = KEYWORDS.map(k => lines.find(l => k.re.test(l.text))).filter(Boolean).map((l, j) => ({ start_sentence: j ? l.i - 1 : 0, title: j ? KEYWORDS.find(k => k.re.test(l.text)).topic : 'Welcome' }));
      answer = { shorts, chapters: ch, summary: 'A weekly show about winning customers.' };
    } else if (/<video id=/.test(prompt)) {
      const vids = [...prompt.matchAll(/<video id="([^"]+)" kind="(\w+)">\n([\s\S]*?)\n<\/video>/g)];
      answer = { videos: vids.map(([, id, kind, text]) => {
        const k = KEYWORDS.find(x => x.re.test(text));
        const subject = kind === 'long' ? 'The weekly growth show' : k ? k.topic : 'A quick tip';
        return {
          id,
          titles: [k && kind === 'short' ? k.title : `${subject}: four ways to win customers`, `${subject} explained`, `${subject} in a minute`],
          description: `${subject}. ${text.split('. ').slice(0, 2).join('. ')}.`,
          keywords: [subject.toLowerCase(), 'customers', 'growth'], tags: [subject, 'small business'], hashtags: [`#${subject.replace(/\W+/g, '')}`, '#growth'],
          pinned_comment: `What would you like to know about ${subject.toLowerCase()}?`, cta: 'Start free at protectedcentral.com',
        };
      }) };
    } else answer = {};
    send(res, 200, { candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] });
  });
  return new Promise(r => server.listen(port, '127.0.0.1', () => r({ server, state })));
}
