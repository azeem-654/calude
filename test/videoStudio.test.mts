/**
 * AI Video Studio's pure rules (worker/src/lib/video/*): what a request
 * asks for, what the edit keeps, how captions follow cuts, what cleanup
 * proposes and never touches, how Shorts are chosen and kept distinct, what
 * a sentence said to the editor does, and whether a PNG is really a PNG.
 *
 *   npm run test:video
 */
import zlib from 'node:zlib';
import {
  applyOps, keepRanges, keptLength, newDoc, parseRequest, retimeWords, sentencesOf, toOutput, toSource, dimsFor, hashOf,
  type Word, type VideoDoc,
} from '../worker/src/lib/video/edit';
import { cuesOf, toAss, toSrt, toVtt, thumbAss, isRtl } from '../worker/src/lib/video/captions';
import { proposeCleanup, isFiller, meaningful } from '../worker/src/lib/video/cleanup';
import { validatePicks, fallbackPicks, findSection, cleanMeta, fallbackMeta, distinctMeta, transcriptForAi, withMusicCredit, cleanQuiz } from '../worker/src/lib/video/shorts';
import { looksLikeAudio, licenseLabel, musicQuery } from '../worker/src/lib/video/music';
import { parseVideoCommand } from '../worker/src/lib/video/commands';
import { checkPng } from '../worker/src/lib/video/png';

let pass = 0, failN = 0;
const ok = (name: string, cond: unknown, detail: unknown = '') => {
  if (cond) { pass++; console.log(`PASS  ${name}`); } else { failN++; console.log(`FAIL  ${name} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`.slice(0, 600)); }
};

/* ── A little talk, as Whisper would give it ── */
function talk(text: string, start = 1, gap = 0.12, perWord = 0.3): Word[] {
  const out: Word[] = [];
  let t = start;
  for (const raw of text.split(' ')) {
    if (raw === '|') { t += 2.4; continue; }
    if (raw === '/') { t += 0.6; continue; }
    out.push({ i: out.length, w: raw, s: t, e: t + perWord, c: 0.9 });
    t += perWord + gap;
  }
  return out;
}

console.log('\nThe request');
{
  const r = parseRequest('Clean this recording, remove filler words and long gaps, create one polished main video and four Shorts, add captions and create PNG thumbnails.');
  ok('the brief\'s example: long video, 4 Shorts, captions, thumbnails, balanced', r.long && r.shorts === 4 && r.captions && r.thumbnails && r.cleanup === 'balanced', r);
  const p = parseRequest('Every time I upload a podcast, create 5 Shorts.');
  ok('"create 5 Shorts" → 5 Shorts and no long video', p.shorts === 5 && !p.long, p);
  const w = parseRequest('Turn every webinar into one cleaned long video and 4 Shorts');
  ok('"one cleaned long video and 4 Shorts"', w.long && w.shorts === 4, w);
  const t = parseRequest('Create three reels from every training recording');
  ok('"three reels" → 3, reels only', t.shorts === 3 && !t.long, t);
  const len = parseRequest('four 30–60 second Shorts, no captions');
  ok('"30–60 second" sets the length; "no captions" turns them off', len.min === 30 && len.max === 60 && !len.captions && len.shorts === 4, len);
  const many = parseRequest('make 40 shorts');
  ok('at most 15 Shorts', many.shorts === 15, many);
  ok('"aggressive" / "gentle" set the cleanup level', parseRequest('aggressive cleanup, 3 shorts').cleanup === 'aggressive' && parseRequest('gentle clean, 2 clips').cleanup === 'conservative');
}

console.log('\nWhat the edit keeps');
{
  const doc = newDoc(parseRequest('clean it and make 2 shorts'));
  doc.cuts = [
    { id: 'a', s: 10, e: 12, kind: 'manual', state: 'approved', reason: '', conf: 1, by: 'you' },
    { id: 'b', s: 20, e: 21, kind: 'filler', state: 'proposed', reason: '', conf: 0.9, by: 'rule' },
    { id: 'c', s: 30, e: 35, kind: 'gap', state: 'approved', reason: '', conf: 0.9, by: 'rule' },
  ];
  doc.protects = [{ id: 'p', s: 31, e: 32, note: '' }];
  const k = keepRanges(60, doc);
  ok('approved cuts go, proposed ones stay, a protected part survives inside a cut', JSON.stringify(k) === JSON.stringify([[0, 10], [12, 30], [31, 32], [35, 60]]), k);
  ok('kept length is the sum', Math.abs(keptLength(k) - 54) < 1e-9, keptLength(k));
  ok('source → output time across a cut', toOutput(15, k) === 13 && toOutput(11, k) === null, [toOutput(15, k), toOutput(11, k)]);
  ok('output → source time', Math.abs(toSource(13, k) - 15) < 1e-9, toSource(13, k));
  const clip = keepRanges(60, doc, [8, 25]);
  ok('a clip keeps only its own range, minus its cuts', JSON.stringify(clip) === JSON.stringify([[8, 10], [12, 25]]), clip);
  const odd = keepRanges(10, { cuts: [{ id: 'x', s: 2.013, e: 3.987, kind: 'manual', state: 'approved', reason: '', conf: 1, by: 'you' }], protects: [] });
  ok('boundaries sit on the 1/30 s frame grid', odd.every(([a, b]) => Math.abs(a * 30 - Math.round(a * 30)) < 1e-6 && Math.abs(b * 30 - Math.round(b * 30)) < 1e-6), odd);
  const sliver = keepRanges(10, { cuts: [{ id: 'x', s: 2, e: 5, kind: 'manual', state: 'approved', reason: '', conf: 1, by: 'you' }, { id: 'y', s: 5.04, e: 8, kind: 'manual', state: 'approved', reason: '', conf: 1, by: 'you' }], protects: [] });
  ok('a sliver under two frames between cuts is not flashed', JSON.stringify(sliver) === JSON.stringify([[0, 2], [8, 10]]), sliver);
}

console.log('\nCaptions follow the cuts');
{
  const words = talk('We help roofers find customers. | They pay $49 a month.');
  const doc = newDoc(parseRequest('clean'));
  const keeps0 = keepRanges(20, doc);
  const all = retimeWords(words, keeps0);
  const cut = { id: 'g', s: words[4].e + 0.2, e: words[5].s - 0.2, kind: 'gap' as const, state: 'approved' as const, reason: '', conf: 0.9, by: 'rule' as const };
  doc.cuts = [cut];
  const keeps1 = keepRanges(20, doc);
  const after = retimeWords(words, keeps1);
  const shift = (cut.e - cut.s);
  const w5 = after.find(w => w.i === 5)!, w5b = all.find(w => w.i === 5)!;
  ok('a word after a cut moves earlier by exactly the cut', Math.abs((w5b.s - w5.s) - (Math.round(cut.e * 30) / 30 - Math.round(cut.s * 30) / 30)) < 0.02, { before: w5b.s, after: w5.s, shift });
  ok('every word is still captioned (nothing spoken was cut)', after.length === words.length);
  doc.cuts.push({ id: 'm', s: words[1].s - 0.02, e: words[1].e + 0.02, kind: 'manual', state: 'approved', reason: '', conf: 1, by: 'you' });
  const gone = retimeWords(words, keepRanges(20, doc));
  ok('a removed spoken word is gone from the captions too', !gone.some(w => w.i === 1) && gone.length === words.length - 1);
  const edited = retimeWords(words, keepRanges(20, doc), { 2: 'ROOFERS', 3: '' });
  ok('a caption correction changes the text only — times stay', edited.find(w => w.i === 2)?.w === 'ROOFERS' && edited.find(w => w.i === 2)?.s === gone.find(w => w.i === 2)?.s && !edited.some(w => w.i === 3));
  const cues = cuesOf(all, 'short');
  ok('Shorts captions are a few words at a time', cues.every(c => c.words.length <= 4 && c.text.length <= 22), cues.map(c => c.text));
  ok('cues never overlap', cues.every((c, i) => !cues[i + 1] || c.e <= cues[i + 1].s + 1e-9));
  const srt = toSrt(cuesOf(all, 'long'));
  ok('SRT: numbered, comma milliseconds', /^1\n00:00:01,000 --> 00:00:0\d,\d{3}\nWe help/.test(srt), srt.slice(0, 80));
  const vtt = toVtt(cuesOf(all, 'long'));
  ok('VTT: header, dot milliseconds', vtt.startsWith('WEBVTT\n\n00:00:01.000 --> '), vtt.slice(0, 60));
  const tr = talk('Müşteri İstanbul’da ğüşıöç ŞİMDİ geliyor.');
  const ass = toAss(cuesOf(retimeWords(tr, [[0, 20]]), 'short'), newDoc(parseRequest('x')).captions.short, 1080, 1920, 'short');
  ok('Turkish is kept exactly, in Noto Sans', ass.includes('Noto Sans') && /MÜŞTERI|Müşteri|MÜŞTERİ/.test(ass) && /ĞÜŞIÖÇ|ğüşıöç/i.test(ass), ass.split('\n').filter(l => l.startsWith('Dialogue')).join(' | '));
  ok('Turkish upper case keeps the dotted İ', /İSTANBUL/.test(ass), ass.split('\n').filter(l => l.startsWith('Dialogue'))[0]);
  const ur = talk('یہ ایک آزمائشی جملہ ہے');
  const uass = toAss(cuesOf(retimeWords(ur, [[0, 20]]), 'short'), newDoc(parseRequest('x')).captions.short, 1080, 1920, 'short');
  ok('Urdu is set right to left in Noto Naskh Arabic, never upper-cased', isRtl('یہ') && /Dialogue: [^\n]*,Rtl,/.test(uass) && uass.includes('Noto Naskh Arabic') && uass.includes('آزمائشی'), uass.split('\n').filter(l => l.startsWith('Dialogue')).join(' | '));
  ok('caption text cannot open an ASS override', !toAss(cuesOf(retimeWords(talk('a {\\pos(0,0)} b'), [[0, 9]]), 'long'), newDoc(parseRequest('x')).captions.long, 1920, 1080, 'long').includes('{\\pos'));
  ok('numbers and prices are emphasised in the bold style', /\{\\c&H[0-9A-F]{8}\}\$49/.test(toAss(cuesOf(retimeWords(talk('only $49 a month'), [[0, 9]]), 'short'), newDoc(parseRequest('x')).captions.short, 1080, 1920, 'short')));
  const th = thumbAss('How AI Prospecting finds 30 leads', 'left', 1280, 720);
  ok('thumbnail words are exactly what was typed', th.includes('How AI Prospecting finds 30') && th.includes('leads'));
}

console.log('\nCleanup');
{
  const words = talk('So um we built the tool. | It costs $49 not $99. We we can help. / I uh think that is right.');
  const silences: [number, number][] = [];
  for (let j = 0; j + 1 < words.length; j++) if (words[j + 1].s - words[j].e > 0.5) silences.push([words[j].e + 0.02, words[j + 1].s - 0.02]);
  silences.unshift([0, words[0].s - 0.02]);
  const bal = proposeCleanup(words, silences, 'balanced', 20);
  const fillers = bal.filter(c => c.kind === 'filler');
  ok('fillers "um" and "uh" are found', fillers.length === 2 && fillers.every(c => /um|uh/.test(c.reason)), fillers.map(c => c.reason));
  ok('…and start approved at Balanced (high confidence)', fillers.every(c => c.state === 'approved'));
  const gaps = bal.filter(c => c.kind === 'gap');
  ok('the long pause is shortened, not removed', gaps.some(c => c.e - c.s > 1.5 && c.e - c.s < 2.4), gaps);
  ok('a 0.6 s pause is left alone at Balanced', !gaps.some(c => c.s > words[17].e - 0.1 && c.e < words[18].s + 0.1), gaps);
  const rep = bal.find(c => c.kind === 'repeat');
  ok('"We we" is proposed — not applied', rep?.state === 'proposed' && /we/.test(rep.reason), bal);
  const touched = (w: Word) => bal.some(c => c.state === 'approved' && c.s < w.e - 0.05 && c.e > w.s + 0.05);
  ok('numbers, prices and negation are never cut', !words.filter(w => meaningful(w.w)).some(touched), words.filter(w => meaningful(w.w)).map(w => w.w));
  ok('"umbrella" is not a filler; "um," is', !isFiller('umbrella') && isFiller('um,') && isFiller('Uhh') && !isFiller('ee-commerce'));
  const noisy = proposeCleanup(words, [], 'balanced', 20);
  ok('a gap in the words that is not silent is not cut at Balanced', !noisy.some(c => c.kind === 'gap' && c.state === 'approved' && c.e - c.s > 1), noisy.filter(c => c.kind === 'gap'));
  const agg = proposeCleanup(words, [], 'aggressive', 20);
  ok('…and only offered, unapproved, at Aggressive', agg.some(c => c.kind === 'gap' && c.state === 'proposed' && c.conf < 0.5));
  const con = proposeCleanup(words, silences, 'conservative', 20);
  ok('Conservative proposes fillers but applies nothing that changes words', con.filter(c => c.kind === 'filler').every(c => c.state === 'proposed') && !con.some(c => c.kind === 'repeat'));
  ok('ids are stable across levels (decisions survive a re-run)', bal.filter(c => c.kind === 'filler').every(c => agg.some(a => a.id === c.id)));
  const doc = newDoc(parseRequest('x'));
  const d1 = applyOps(doc, [{ op: 'cleanup.preset', preset: 'balanced', cuts: bal }], 20).doc;
  const rejected = applyOps(d1, [{ op: 'cut.set', id: fillers[0].id, state: 'rejected' }], 20).doc;
  const again = applyOps(rejected, [{ op: 'cleanup.preset', preset: 'aggressive', cuts: agg }], 20).doc;
  ok('a rejected suggestion stays rejected when cleanup runs again', again.cuts.find(c => c.id === fillers[0].id)?.state === 'rejected');
  const opening = proposeCleanup(talk('Hello there.', 6), [[0, 5.9]], 'balanced', 10);
  ok('a 6 s silence before the first word is cut to a moment', opening.some(c => c.id === 'gap--1' && c.state === 'approved' && c.e > 5), opening);
}

console.log('\nShorts');
{
  const topics = ['AI Prospecting finds thirty businesses a day in your town.', 'It reads every website and checks each address.',
    'The pipeline shows every deal and its value.', 'You see which deals are close.', 'Follow up two days later if they do not reply.', 'Most deals are lost without it.',
    'The plan is $49 a month.', 'There is no setup fee.'];
  let text = '';
  for (let r = 0; r < 4; r++) for (const t of topics) text += `${t} `;
  const words = talk(text.trim().replace(/\. /g, '. / '), 1, 0.12, 0.35);
  const sentences = sentencesOf(words);
  ok('sentences split on full stops', sentences.length === 32 && /^AI Prospecting/.test(sentences[0].text), sentences.length);
  const opts = { count: 4, min: 15, max: 45, aspect: '9:16' as const };
  const picks = validatePicks([
    { start_sentence: 0, end_sentence: 3, title: 'AI Prospecting', topic: 'prospecting', hook: 9, clarity: 4, relevance: 4, completeness: 4 },
    { start_sentence: 2, end_sentence: 5, title: 'Pipeline', topic: 'pipeline' },
    { start_sentence: 8, end_sentence: 9, title: 'AI Prospecting again', topic: 'prospecting' },
    { start_sentence: 4, end_sentence: 7, title: 'Follow-up', topic: 'follow up' },
    { start_sentence: 99, end_sentence: 120, title: 'Nowhere', topic: 'x' },
    { start_sentence: 14, end_sentence: 15, title: '', topic: 'no title' },
    { start_sentence: 22, end_sentence: 23, title: 'Pricing', topic: 'pricing' },
  ], sentences, opts);
  ok('invented sentence numbers and untitled picks are dropped', !picks.some(p => p.title === 'Nowhere' || !p.title), picks.map(p => p.title));
  ok('a second pick on the same topic is refused', picks.filter(p => /prospecting/i.test(p.topic)).length === 1, picks.map(p => p.topic));
  ok('no two Shorts share footage', picks.every((a, i) => picks.every((b, j) => i === j || Math.min(a.e, b.e) - Math.max(a.s, b.s) <= 1)), picks.map(p => [p.s, p.e]));
  ok('every Short is whole sentences within the length asked', picks.every(p => p.e - p.s >= 8 && p.e - p.s <= opts.max + 5 && sentences.some(s => Math.abs(s.s - p.s) < 1e-9) && sentences.some(s => Math.abs(s.e - p.e) < 1e-9)), picks.map(p => p.e - p.s));
  ok('scores are editorial 1–5, clamped', picks[0].scores?.hook === 5 && picks.every(p => !p.scores || Object.values(p.scores).every(v => v >= 1 && v <= 5)));
  const fb = fallbackPicks(sentences, opts);
  ok('without AI: Shorts chosen by rule, labelled, unscored, spread out', fb.length === 4 && fb.every(p => p.by === 'rules' && p.scores === null && /without AI/.test(p.reason)) && fb[3].s > fb[0].e, fb.map(p => [p.s, p.e, p.title]));
  const found = findSection('Find the section about the pipeline', sentences, opts);
  ok('"find the section about the pipeline" lands on the pipeline', !!found && /pipeline/i.test(sentences[found.a].text), found);
  ok('a subject never mentioned finds nothing (no clip about something else)', findSection('the part about blockchain', sentences, opts) === null);
  ok('the AI sees numbered sentences with times', /^\[0\] \(0:01\) AI Prospecting/.test(transcriptForAi(sentences)));
}

console.log('\nMetadata');
{
  const m = cleanMeta({ titles: ['A', 'A', 'B'], description: 'Short but real description here.', hashtags: ['growth', '#Sales Tips', '##x'], tags: ['a'], chapters: [{ s: 0, title: 'x' }] }, 'short', 40);
  ok('titles de-duplicated, hashtags made valid', !!m && m.titles.length === 2 && m.hashtags.includes('#growth') && m.hashtags.includes('#SalesTips'), m);
  ok('a description that says nothing is refused', cleanMeta({ titles: ['x'], description: 'hi' }, 'short', 10) === null);
  const ch = cleanMeta({ titles: ['x'], description: 'A long enough description.', chapters: [{ s: 3, title: 'Intro' }, { s: 5, title: 'Too soon' }, { s: 60, title: 'Two' }, { s: 120, title: 'Three' }] }, 'long', 600);
  ok('chapters follow YouTube\'s rule: first at 0:00, ten seconds apart, at least three', JSON.stringify(ch?.chapters.map(c => c.s)) === '[0,60,120]', ch?.chapters);
  const a = fallbackMeta('AI Prospecting finds thirty businesses a day. It reads every website.', 'short', { company: 'Acme', website: 'acme.example' });
  ok('without AI: the passage\'s own words, labelled', a.by === 'rules' && /^AI Prospecting finds/.test(a.titles[0]) && /acme\.example/.test(a.description));
  const same = { titles: ['Same'], description: 'The same description for both.', keywords: [], tags: [], hashtags: [], chapters: [], pinnedComment: '', cta: '', by: 'ai' as const };
  const d = distinctMeta([{ id: '1', meta: same, text: 'First video about prospecting.', kind: 'short' }, { id: '2', meta: same, text: 'Second video about pricing.', kind: 'short' }], {});
  ok('two videos never carry the same title', d.get('1')!.titles[0] !== d.get('2')!.titles[0], [...d.values()].map(x => x.titles[0]));
}

console.log('\nWhat a sentence does to the edit');
{
  const words = talk('Hello there. This is an example of pricing. Another example is booking. Thanks.', 5);
  const sentences = sentencesOf(words);
  const doc: VideoDoc = newDoc(parseRequest('clean, 2 shorts'));
  doc.clips = [{ id: 'c1', title: 'One', topic: '', reason: '', s: 5, e: 12, scores: null, by: 'ai', aspect: '9:16', reframe: { mode: 'crop', x: 0.5, y: 0.5 } }];
  doc.cuts = [
    { id: 'gx', s: 9, e: 9.6, kind: 'gap', state: 'proposed', reason: '', conf: 0.9, by: 'rule' },
    { id: 'ex2', s: sentences[2].s, e: sentences[2].e, kind: 'manual', state: 'approved', reason: '', conf: 1, by: 'you' },
  ];
  const ctx = { doc, words, sentences, duration: 30 };
  const lead = parseVideoCommand('Remove the long pause at the beginning.', ctx);
  ok('"remove the long pause at the beginning" cuts up to just before the first word', lead.ops[0]?.op === 'cut.add' && (lead.ops[0] as { e: number }).e > 4.5 && (lead.ops[0] as { e: number }).e < 5, lead);
  const restore = parseVideoCommand('Restore my second example', ctx);
  ok('"restore my second example" restores that sentence', restore.ops[0]?.op === 'cut.restoreRange' && Math.abs((restore.ops[0] as { s: number }).s - sentences[2].s) < 1e-9, restore);
  const applied = applyOps(doc, restore.ops, 30).doc;
  ok('…and the cut is gone from the edit', !applied.cuts.some(c => c.id === 'ex2'));
  const faster = parseVideoCommand('Make Short 1 faster', ctx);
  ok('"make Short 1 faster" approves its pauses and re-renders it', faster.ops.some(o => o.op === 'cut.setMany') && faster.rerender?.includes('c1'), faster);
  const smaller = parseVideoCommand('Make captions smaller', ctx);
  const sd = applyOps(doc, smaller.ops, 30).doc;
  ok('"make captions smaller" makes the Shorts\' captions smaller', sd.captions.short.size < doc.captions.short.size);
  const keep = parseVideoCommand('Keep this pause', { ...ctx, selection: { s: 9, e: 9.6 } });
  ok('"keep this pause" protects the selection', keep.ops.some(o => o.op === 'protect.add'));
  ok('"keep this pause" without a selection asks for one', parseVideoCommand('Keep this pause', ctx).ops.length === 0);
  const music = parseVideoCommand('Make background music quieter', ctx);
  ok('with no music yet, "make background music quieter" says so rather than pretending', !music.ops.length && /no music on this project yet/i.test(music.reply));
  const thumb = parseVideoCommand('Create another thumbnail', ctx);
  ok('"create another thumbnail" asks for a new set', !!thumb.thumbnail);
  const about = parseVideoCommand('Make one Short about booking', ctx);
  ok('"make one Short about booking" adds a Short where booking is said', about.ops[0]?.op === 'clip.add', about);
  const none = parseVideoCommand('Make one Short about blockchain', ctx);
  ok('…and a subject not in the video adds nothing', !none.ops.length && /not talked about/.test(none.reply));
  const shell = parseVideoCommand('run rm -rf / and delete everything', ctx);
  ok('anything else is answered with what can be asked, and does nothing', !shell.ops.length && !shell.understood && /can ask/.test(shell.reply));
  ok('undo and redo are the editor\'s', parseVideoCommand('undo', ctx).undo && parseVideoCommand('redo', ctx).redo);
  const pauses = parseVideoCommand('Remove the long pauses', ctx);
  ok('"remove the long pauses" applies every suggested pause cut, everywhere, and renders again', pauses.understood && pauses.ops[0]?.op === 'cut.setMany' && (pauses.ops[0] as { ids: string[] }).ids.join() === 'gx' && pauses.rerender?.includes('*'), pauses);
  const noneLeft = parseVideoCommand('Remove the long pauses', { ...ctx, doc: { ...doc, cuts: doc.cuts.filter(c => c.kind !== 'gap') } });
  ok('…and says so when every pause is already shortened', noneLeft.understood && !noneLeft.ops.length && /already/.test(noneLeft.reply), noneLeft);
  ok('…"the long pause at the beginning" is still the opening pause only', parseVideoCommand('Remove the long pause at the beginning', ctx).ops[0]?.op === 'cut.add');
}

console.log('\nSound and music');
{
  const doc: VideoDoc = newDoc(parseRequest('clean, 2 shorts'));
  const ctx = { doc, words: talk('Hello there.'), sentences: sentencesOf(talk('Hello there.')), duration: 30 };
  const both = parseVideoCommand('remove the background noise and also add background music to all the videos', ctx);
  ok('"remove the background noise and also add background music to all the videos" does both', both.ops.some(o => o.op === 'audio.set' && (o as { patch: { denoise?: string } }).patch.denoise === 'medium') && !!both.music && both.rerender?.includes('*'), both);
  const noise = parseVideoCommand('remove the background noise in all of the videos', ctx);
  ok('"remove the background noise in all of the videos" turns noise reduction on and re-renders every video', noise.ops[0]?.op === 'audio.set' && noise.rerender?.[0] === '*' && /cannot rebuild/.test(noise.reply));
  ok('"completely" asks for the strong level', (parseVideoCommand('remove all of the noise completely', ctx).ops[0] as { patch: { denoise: string } }).patch.denoise === 'strong');
  ok('"turn off noise reduction"', (parseVideoCommand('turn off noise reduction', ctx).ops[0] as { patch: { denoise: string } })?.patch.denoise === 'off');
  ok('"make my voice clearer"', (parseVideoCommand('make my voice clearer', ctx).ops[0] as { patch: { voice: boolean } })?.patch.voice === true);
  ok('"add upbeat corporate music" asks the library for that mood', parseVideoCommand('add upbeat corporate music', ctx).music?.query === 'upbeat corporate' && musicQuery('upbeat corporate') === 'upbeat corporate instrumental');
  ok('"make the music quieter" with none says there is none', /no music on this project yet/.test(parseVideoCommand('make the music quieter', ctx).reply));
  const withMusic = applyOps(doc, [{ op: 'music.set', track: { id: 't', key: 'v/a/music/t.mp3', title: 'Calm', artist: 'A', license: 'CC BY 4.0', licenseUrl: '', attribution: 'Music: “Calm” by A — CC BY 4.0', source: 'openverse', sourceUrl: '', duration: 90, volume: 0.18, fadeIn: 1.5, fadeOut: 2.5, loop: true, duck: true, applyTo: 'all' } }], 30).doc;
  const q = parseVideoCommand('make the music quieter', { ...ctx, doc: withMusic });
  const quieter = applyOps(withMusic, q.ops, 30).doc;
  ok('…and with music, turns it down', quieter.music!.volume < 0.18 && quieter.music!.volume >= 0.03);
  ok('"remove the music" removes it', applyOps(withMusic, parseVideoCommand('remove the music', { ...ctx, doc: withMusic }).ops, 30).doc.music === null);
  const bad = applyOps(withMusic, [{ op: 'music.patch', patch: { volume: 9, fadeIn: -3, applyTo: 'everything' as 'all' } }], 30).doc.music!;
  ok('music settings are clamped', bad.volume === 1 && bad.fadeIn === 0 && bad.applyTo === 'all');
  const credited = withMusicCredit('A good video.\n\nMusic: “Old” by B — CC BY 4.0', 'Music: “Calm” by A — CC BY 4.0');
  ok('a CC BY credit replaces the old one, never stacks', credited === 'A good video.\n\nMusic: “Calm” by A — CC BY 4.0', credited);
  ok('…and goes when the music does', withMusicCredit(credited, '') === 'A good video.');
  ok('licence labels say what they are', licenseLabel('cc0') === 'CC0 (public domain)' && licenseLabel('by', '4.0') === 'CC BY 4.0');
  ok('audio is recognised from its bytes; a PNG is not audio', looksLikeAudio(new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0, 0, 0])) === 'mp3' && looksLikeAudio(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])) === null);
}

console.log('\nA quiz');
{
  const sentences = sentencesOf(talk('The plan costs $49 a month. There is no setup fee. You can cancel any time.'));
  const quiz = cleanQuiz({ questions: [
    { question: 'What does the plan cost?', options: ['$29', '$49', '$99', 'Free'], answer: 1, explanation: 'Said at the start.', sentence: 0 },
    { question: 'Is there a setup fee?', options: ['Yes', 'No', 'Yes'], answer: 1, sentence: 1 },
    { question: 'Something never said?', options: ['a', 'b', 'c'], answer: 0, sentence: 99 },
    { question: 'Bad answer index', options: ['a', 'b', 'c'], answer: 5, sentence: 2 },
  ] }, sentences);
  ok('a quiz keeps only well-formed questions about things actually said', quiz.length === 1 && quiz[0].answer === 1 && quiz[0].t === sentences[0].s, quiz);
}

console.log('\nThe edit refuses what is malformed');
{
  const doc = newDoc(parseRequest('x'));
  const r = applyOps(doc, [
    { op: 'cut.add', s: 5, e: 4 }, { op: 'clip.add', s: 1, e: 2 }, { op: 'clip.add', s: 0, e: 500 },
    { op: 'caption.style', target: 'short', patch: { size: 9, color: 'red', position: 'top' } }, { op: 'nonsense' } as never,
  ], 1000);
  ok('backwards cuts, too-short and too-long Shorts, unknown ops are refused', r.refused.length === 4 && r.doc.cuts.length === 0 && r.doc.clips.length === 0, r.refused);
  ok('styles are clamped and colours must be hex', r.doc.captions.short.size === 1.6 && r.doc.captions.short.color === '#ffffff' && r.doc.captions.short.position === 'top');
  ok('dimensions: 9:16 is 1080×1920; source keeps its shape, ≤ 1920', JSON.stringify(dimsFor('9:16', 1, 1)) === '{"width":1080,"height":1920}' && JSON.stringify(dimsFor('source', 3840, 2160)) === '{"width":1920,"height":1080}');
  ok('a hash changes when the edit does', hashOf({ a: 1 }) !== hashOf({ a: 2 }) && hashOf({ a: 1 }) === hashOf({ a: 1 }));
}

console.log('\nA PNG is a PNG');
{
  /* A real PNG made here, byte by byte (no image tools needed in CI): the
     signature, IHDR, one IDAT of zlib-compressed rows, IEND, each with its CRC. */
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const W = 320, H = 180;
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows = Buffer.alloc((W * 3 + 1) * H, 90);
  for (let y = 0; y < H; y++) rows[y * (W * 3 + 1)] = 0;
  const pngBuf = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
  const png = new Uint8Array(pngBuf);
  ok('a real PNG passes, with its size', checkPng(png, { width: 320, height: 180 }).ok, checkPng(png));
  ok('the wrong size is caught', !checkPng(png, { width: 1280, height: 720 }).ok);
  const webp = new Uint8Array(Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(80, 1)]));
  ok('a WebP called .png is refused', !checkPng(webp).ok);
  const jpeg = new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(80, 2)]));
  ok('a JPEG called .png is refused', !checkPng(jpeg).ok);
  ok('a cut-short PNG is refused', !checkPng(png.subarray(0, png.length - 20)).ok);
  const bad = png.slice(); bad[20] ^= 0xff;
  ok('a corrupt header is refused', !checkPng(bad).ok);
}

console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
