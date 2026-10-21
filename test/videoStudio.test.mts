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
  applyOps, keepRanges, keptLength, newDoc, parseRequest, retimeWords, sentencesOf, toOutput, toSource, dimsFor, hashOf, effectsOf,
  type Word, type VideoDoc,
} from '../worker/src/lib/video/edit';
import { cuesOf, toAss, toSrt, toVtt, thumbAss, isRtl } from '../worker/src/lib/video/captions';
import { proposeCleanup, isFiller, meaningful, findFillers, fillerCounts, cleanFillerKinds, scoreTakes, FILLER_KINDS } from '../worker/src/lib/video/cleanup';
import { validatePicks, fallbackPicks, findSection, cleanMeta, fallbackMeta, distinctMeta, transcriptForAi, withMusicCredit, cleanQuiz } from '../worker/src/lib/video/shorts';
import { looksLikeAudio, licenseLabel, musicQuery } from '../worker/src/lib/video/music';
import { parseVideoCommand } from '../worker/src/lib/video/commands';
import { checkPng } from '../worker/src/lib/video/png';
import { cameraPath, cutTimes, punchSpans, overlayAss, overlaySpan, trackAt, cssLook, cssEffects, skinBox, type TrackRow } from '../worker/src/lib/video/motion';
import { layoutOptions, layoutPlan } from '../worker/src/lib/video/layouts';
import { toXmeml, editorialScore } from '../worker/src/lib/video/xml';
import { pickHighlight, thumbWords, cleanThumbSpec, renderSpec } from '../worker/src/lib/video/pipeline';
import { thumbPlan, normaliseSpec, lineRect, TREND_LAYOUTS, STICKERS } from '../media/engine/thumbLayout.mjs';
import { parseYoutubeUrl, youtubeRefusal, cleanOembed, youtubeThumb, YOUTUBE_WAY_FORWARD } from '../worker/src/lib/video/youtube';

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

console.log('\nFiller words, by kind, in context');
{
  const quiet = (ws: Word[]): [number, number][] => [[0, ws[0].s - 0.02], ...ws.slice(1).map((w, j) => [ws[j].e + 0.02, w.s - 0.02] as [number, number]).filter(([a, b]) => b - a > 0.3)];
  const words = talk('I like this tool. It was, like, amazing. You know, it works. Do you know what it costs? I mean, it is cheap. What I mean is simple. It is kind of hard. What kind of car is it? Basically, we win. It works, right? So / we start. That\'s right? We would like more.');
  const hits = findFillers(words);
  const at = (kind: string) => hits.filter(h => h.kind === kind).map(h => h.text);
  ok('"like," as a filler is found; "I like", "would like" are not', JSON.stringify(at('like')) === '["like"]' && hits.find(h => h.kind === 'like')!.j0 === 6, hits);
  ok('"You know," is a filler; "Do you know what…" is a question', JSON.stringify(at('you_know')) === '["you know"]', at('you_know'));
  ok('"I mean," is a filler; "What I mean is" is not', JSON.stringify(at('i_mean')) === '["i mean"]', at('i_mean'));
  ok('"kind of hard" is a hedge; "what kind of car" is not', JSON.stringify(at('hedge')) === '["kind of"]', at('hedge'));
  ok('"Basically," set off by a comma is a filler', JSON.stringify(at('adverb')) === '["basically"]', at('adverb'));
  ok('"…, right?" ending a sentence is a tag; "That\'s right?" is not', JSON.stringify(at('tag')) === '["right"]', at('tag'));
  ok('"So" then a pause, starting a sentence, is a starter', JSON.stringify(at('starter')) === '["so"]', at('starter'));
  const counts = fillerCounts(words);
  ok('the options panel can count every kind, ticked or not', counts.like === 1 && counts.hedge === 1 && counts.adverb === 1 && counts.um === 0, counts);
  const def = proposeCleanup(words, quiet(words), 'balanced', 60);
  const wordFillers = def.filter(c => c.kind === 'filler');
  ok('by default the hedges and adverbs are not looked for', !wordFillers.some(c => c.sub === 'hedge' || c.sub === 'adverb') && wordFillers.some(c => c.sub === 'like'), wordFillers.map(c => c.sub));
  ok('…and a word filler is only ever proposed, never applied', wordFillers.length >= 5 && wordFillers.every(c => c.state === 'proposed'), wordFillers.map(c => [c.sub, c.state]));
  const only = proposeCleanup(words, quiet(words), 'balanced', 60, { fillers: ['hedge'] });
  ok('ticking only "sort of / kind of" proposes just that', only.filter(c => c.kind === 'filler').map(c => c.sub).join() === 'hedge', only.filter(c => c.kind === 'filler'));
  ok('a two-word filler is cut as one, with its own stable id', only.some(c => c.id === `fil-hedge-${words.findIndex(w => w.w === 'kind')}` && c.e - c.s > 0.6));
  const kinds = cleanFillerKinds(['like', 'nonsense', 'tag', 'like']);
  ok('only known kinds are kept from a request', JSON.stringify(kinds) === '["like","tag"]', kinds);
  const meaning = talk('Not like that. I would like 49 of them.');
  ok('numbers and negation stay: no filler is found in meaning words', !proposeCleanup(meaning, quiet(meaning), 'aggressive', 20, { fillers: [...FILLER_KINDS] }).some(c => c.kind === 'filler'));
}

console.log('\nRetakes: the best take kept, and why');
{
  const words = talk('We launched the new plan last week. | We launched the new plan last week. | Thanks for watching.');
  const dur = 30;
  const wave = new Uint8Array(dur * 20).fill(2);
  const sents = sentencesOf(words);
  for (let i = Math.floor(sents[0].s * 20); i < sents[0].e * 20; i++) wave[i] = 45;
  for (let i = Math.floor(sents[1].s * 20); i < sents[1].e * 20; i++) wave[i] = i % 2 ? 70 : 140;
  const cuts = proposeCleanup(words, null, 'balanced', dur, { wave });
  const ret = cuts.filter(c => c.kind === 'retake');
  ok('a sentence said twice is a retake: the first take proposed for cutting, never applied', ret.length === 1 && ret[0].state === 'proposed' && ret[0].s < sents[0].s && ret[0].e > sents[0].e && ret[0].e < sents[1].s, ret);
  ok('…and it says which take it kept and why: louder, livelier (from the waveform)', /kept take 2: .*louder.*livelier/.test(ret[0]?.reason ?? ''), ret[0]?.reason);
  const flip = new Uint8Array(wave);
  for (let i = Math.floor(sents[0].s * 20); i < sents[0].e * 20; i++) flip[i] = i % 2 ? 80 : 170;
  for (let i = Math.floor(sents[1].s * 20); i < sents[1].e * 20; i++) flip[i] = 40;
  const r2 = proposeCleanup(words, null, 'balanced', dur, { wave: flip }).filter(c => c.kind === 'retake');
  ok('…when the first take is the livelier one, the second is the one proposed', r2.length === 1 && r2[0].s > sents[1].s - 0.1 && /kept take 1/.test(r2[0].reason), r2);
  const fs = talk('So the first thing | So the first thing we do is plan the week.');
  const f = proposeCleanup(fs, null, 'balanced', 20).filter(c => c.kind === 'retake');
  ok('a sentence broken off and started again: the complete take is kept, saying so', f.length === 1 && f[0].s < fs[1].s && /kept take 2: complete, no false start/.test(f[0].reason), f);
  const sig = scoreTakes([{ ws: fs.slice(0, 4), prefixOf: true }, { ws: fs.slice(4), prefixOf: false }], null);
  ok('the take scores are measurable: complete, false start, pace, fillers', !sig[0].complete && sig[0].falseStart && sig[1].complete && sig[1].score > sig[0].score && sig[1].loud === null, sig);
  const price = talk('It costs $49 a month. | It costs $49 a month, no setup fee.');
  ok('a take holding a price is never proposed, even said twice', !proposeCleanup(price, null, 'aggressive', 20).some(c => c.kind === 'retake'));
  ok('Conservative proposes no retakes', !proposeCleanup(words, null, 'conservative', dur, { wave }).some(c => c.kind === 'retake'));
  const apart = talk('We launched the new plan last week. Then a lot happened. Prices went up. People called. We were busy. We launched the new plan last week.');
  ok('the same sentence far apart is not a retake', !proposeCleanup(apart, null, 'balanced', 40).some(c => c.kind === 'retake'));
}

console.log('\nShorten word gaps');
{
  const words = talk('One two three. | Four five / six seven.');
  const sil: [number, number][] = [[0, words[0].s - 0.02], ...words.slice(1).map((w, j) => [words[j].e + 0.02, w.s - 0.02] as [number, number]).filter(([a, b]) => b - a > 0.3)];
  const cuts = proposeCleanup(words, sil, 'conservative', 20, { maxPause: 0.3 });
  const gaps = cuts.filter(c => c.kind === 'gap' && c.id !== 'gap--1');
  const left = (k: number) => { const a = words[k].e, b = words[k + 1].s; const g = gaps.find(c => c.s >= a - 0.01 && c.e <= b + 0.01); return g ? (b - a) - (g.e - g.s) : b - a; };
  ok('every quiet pause longer than the chosen 0.3 s is cut down to it — and applied, the customer having set it', gaps.length === 2 && gaps.every(c => c.state === 'approved') && Math.abs(left(2) - 0.3) < 0.02 && Math.abs(left(4) - 0.3) < 0.02, { gaps, l2: left(2), l4: left(4) });
  ok('…shorter pauses are left as they are', Math.abs(left(0) - 0.12) < 0.01);
  const doc = applyOps(newDoc(parseRequest('x')), [{ op: 'cleanup.preset', preset: 'balanced', cuts, fillers: ['um', 'like'], maxPause: 0.3 }], 20).doc;
  ok('the chosen kinds and the gap are kept on the edit', doc.cleanup.maxPause === 0.3 && doc.cleanup.fillers?.join() === 'um,like');
  const off = applyOps(doc, [{ op: 'cleanup.preset', preset: 'balanced', cuts: [], maxPause: null }], 20).doc;
  ok('…and the gap can be switched off again', !off.cleanup.maxPause && off.cleanup.fillers?.join() === 'um,like');
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
  const noneLeft = parseVideoCommand('Remove the long pauses', { ...ctx, doc: { ...doc, cuts: doc.cuts.map(c => c.kind === 'gap' ? { ...c, state: 'approved' as const } : c) } });
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


console.log('\nLook, animation, tracking and words on screen');
{
  const doc: VideoDoc = newDoc(parseRequest('clean, 2 shorts'));
  let r = applyOps(doc, [{ op: 'look.set', target: 'short', patch: { filter: 'cinematic', temperature: 250, blur: -5, hue: 400 } }], 60);
  const l = r.doc.look!.short;
  ok('a look is clamped and kept per kind: −100…100, hue ±180, blur 0…100', l.filter === 'cinematic' && l.temperature === 100 && l.blur === 0 && l.hue === 180 && r.doc.look!.long.filter === 'none', l);
  r = applyOps(r.doc, [{ op: 'look.set', target: 'short', patch: { filter: 'bogus' as never } }], 60);
  ok('…an unknown filter is ignored, not stored', r.doc.look!.short.filter === 'cinematic');
  r = applyOps(r.doc, [{ op: 'look.set', target: 'short', patch: {}, reset: true }], 60);
  ok('…and Reset puts every value back', JSON.stringify(r.doc.look!.short) === JSON.stringify({ filter: 'none', temperature: 0, tint: 0, brightness: 0, contrast: 0, saturation: 0, exposure: 0, hue: 0, sharpness: 0, blur: 0, vignette: 0, grain: 0 }));
  r = applyOps(doc, [{ op: 'motion.set', target: 'long', patch: { speed: 9, zoom: 'punch', zoomAmount: 3, transition: 'flash', fadeIn: 1, progressBar: true } }], 60);
  const m = r.doc.motion!.long;
  ok('motion: speed at most 2×, zoom at most 35 %, the rest as asked', m.speed === 2 && m.zoom === 'punch' && m.zoomAmount === 1.35 && m.transition === 'flash' && m.fadeIn === 1 && m.progressBar, m);
  r = applyOps(doc, [{ op: 'tracking.set', target: 'short', mode: 'speaker' }, { op: 'tracking.set', target: 'long', mode: 'nonsense' as never }], 60);
  ok('tracking: speaker for the Shorts; an unknown mode refused', r.doc.tracking!.short === 'speaker' && r.doc.tracking!.long === 'off' && r.refused.length === 1, r.refused);
  r = applyOps(doc, [{ op: 'overlay.add', s: 10, e: 14, text: 'Three {\\b1}tips', style: 'cta', anim: 'slide' }, { op: 'overlay.add', s: 3, e: 3.1, text: 'too short' }], 60);
  ok('words on screen are added; a third of a second at least', r.doc.overlays!.length === 1 && r.refused.length === 1 && r.doc.overlays![0].style === 'cta', r);
  const ov = r.doc.overlays![0];
  r = applyOps(r.doc, [{ op: 'overlay.update', id: ov.id, patch: { s: 11, e: 16, text: 'Four tips' } }], 60);
  ok('…moved, stretched and re-worded', r.doc.overlays![0].s === 11 && r.doc.overlays![0].e === 16 && r.doc.overlays![0].text === 'Four tips');
  const keeps: [number, number][] = [[0, 12], [13, 60]];
  const ass = overlayAss([{ ...ov, text: 'Three {\\b1}tips' }], keeps, 1080, 1920, 1.25);
  ok('overlay ASS: re-timed through the cut and the speed, typed braces never become tags', /Dialogue: 1,0:00:08\.00,0:00:10\.40/.test(ass) && !ass.includes('{\\b1}') && ass.includes('(/b1)'), ass.split('\n').filter(x => x.startsWith('Dialogue')));
  ok('…an overlay inside a cut is not shown at all', overlaySpan({ s: 12.1, e: 12.9 }, keeps) === null);
  r = applyOps(doc, [{ op: 'clip.add', s: 5, e: 20 }], 60);
  const c0 = r.doc.clips[0];
  r = applyOps(r.doc, [{ op: 'clip.duplicate', id: c0.id }], 60);
  ok('a Short can be duplicated, next to the original, to try another version', r.doc.clips.length === 2 && r.doc.clips[1].s === 5 && r.doc.clips[1].id !== c0.id && /\(copy\)/.test(r.doc.clips[1].title));
}

console.log('\nThe camera, cuts and zooms on the output clock');
{
  const rows: TrackRow[] = [[0, 0.25, 0.44, 0.3, 1], [15, 0.75, 0.43, 0.3, 1], [29, 0.25, 0.44, 0.3, 1]];
  ok('trackAt holds a speaker until the next cut (no drift across a cut)', trackAt(rows, 14.9)[0] === 0.25 && trackAt(rows, 15)[0] === 0.75 && trackAt(rows, 40)[0] === 0.25);
  const keeps: [number, number][] = [[0, 10], [12, 40]];
  const cam = cameraPath(rows, keeps);
  ok('cameraPath carries the switches into output time, marking each jump cut', JSON.stringify(cam.map(r => [r[0], r[1], r[3]])) === JSON.stringify([[0, 0.25, 1], [10, 0.25, 1], [13, 0.75, 1], [27, 0.25, 1]]), cam);
  ok('cutTimes: where kept stretches meet, and never a strobe', JSON.stringify(cutTimes([[0, 5], [6, 10], [10.2, 10.4], [11, 20]])) === JSON.stringify([5, 9]), cutTimes([[0, 5], [6, 10], [10.2, 10.4], [11, 20]]));
  const sents = [{ s: 0, e: 4 }, { s: 4.5, e: 8 }, { s: 8.5, e: 11 }, { s: 13, e: 18 }, { s: 18.5, e: 25 }];
  const sp = punchSpans(sents, [[0, 12], [12.5, 30]]);
  ok('punch-ins on every other sentence, in output time', JSON.stringify(sp) === JSON.stringify([[4.5, 8.5], [12.5, 18]]), sp);
  ok('the preview of a look is CSS filters, never "none" when something is set', cssLook({ filter: 'bw', temperature: 0, tint: 0, brightness: 20, contrast: 0, saturation: 0, exposure: 0, hue: 0, blur: 0, sharpness: 0 }).includes('grayscale(1)'));
}

console.log('\nExports and scores');
{
  const x = toXmeml({ name: 'Ep <12> & more', sourceName: 'talk 1.mp4', keeps: [[1, 3], [5, 6.5]], fps: 30, width: 1920, height: 1080, duration: 10, hasAudio: true });
  ok('XML for Premiere/Resolve: one clip per kept stretch, back to back, in frames', /<clipitem id="v-1">[\s\S]*?<start>0<\/start><end>60<\/end><in>30<\/in><out>90<\/out>/.test(x) && /<clipitem id="v-2">[\s\S]*?<start>60<\/start><end>105<\/end><in>150<\/in><out>195<\/out>/.test(x), x.slice(0, 600));
  ok('…names escaped, the file relinked by name, and it says what is not in it', x.includes('Ep &lt;12&gt; &amp; more') && x.includes('talk%201.mp4') && /cuts only/.test(x));
  const sc = editorialScore({ hook: 5, clarity: 4, relevance: 4, completeness: 4 });
  ok('an editorial score out of 100 with four grades', sc!.total === 84 && sc!.grades.map(g => g.grade).join() === 'A,B+,B+,B+', sc);
  ok('…and none for a Short nobody scored', editorialScore(null) === null);
}

console.log('\nVisual effects and Shorts layouts');
{
  const doc0 = newDoc(parseRequest('make two shorts'));
  const e1 = applyOps(doc0, [{ op: 'effects.set', target: 'short', effect: 'color', patch: { on: true, exposure: 400, kelvin: 3333, highlights: -20, color: 'x' } }], 60).doc;
  const c = effectsOf(e1, 'short').color;
  ok('colour adjustments are clamped and stepped: exposure to 100, kelvin to 50 K steps', c.on && c.exposure === 100 && c.kelvin === 3350 && c.highlights === -20, c);
  ok('…the long video keeps its own (off)', !effectsOf(e1, 'long').color.on);
  const e2 = applyOps(e1, [{ op: 'effects.set', target: 'short', effect: 'green', patch: { on: true, color: 'red', bg: '#112233', similarity: 99 } }], 60).doc;
  const g = effectsOf(e2, 'short').green;
  ok('green screen takes only a real colour and a similarity up to 60 %', g.on && g.color === '#00ff00' && g.bg === '#112233' && g.similarity === 60, g);
  const e3 = applyOps(e2, [{ op: 'effects.set', target: 'short', effect: 'color', patch: {}, remove: true }], 60).doc;
  ok('"Remove effect" turns it off and puts its settings back', JSON.stringify(effectsOf(e3, 'short').color) === JSON.stringify({ on: false, exposure: 0, contrast: 0, highlights: 0, shadows: 0, saturation: 0, kelvin: 6500 }));
  ok('an unknown effect is refused', applyOps(doc0, [{ op: 'effects.set', target: 'short', effect: 'beauty' as never, patch: { on: true } }], 60).refused.length === 1);
  ok('the preview approximates warm light with sepia, says nothing for an effect that is off', /sepia/.test(cssEffects({ color: c })) && cssEffects({}) === '');

  /* What a render depends on: an effect switched on changes the hash; a setting of one that is off does not. */
  const src = { key: 'v/a/p/source.mp4', probe: { duration: 60, width: 1280, height: 720, fps: 30, vcodec: 'h264', acodec: 'aac', hasAudio: true, format: 'mp4', rotation: 0 }, track: { key: 'v/a/p/prep/faces.json', at: 't' } };
  const withClip = applyOps(doc0, [{ op: 'clip.add', s: 5, e: 40 }], 60).doc;
  const out = { kind: 'short' as const, clip_id: withClip.clips[0].id };
  const h0 = renderSpec(withClip, src, out, null)!.hash;
  const offTweak = applyOps(withClip, [{ op: 'effects.set', target: 'short', effect: 'shadow', patch: { blur: 50 } }], 60).doc;
  const onTurn = applyOps(withClip, [{ op: 'effects.set', target: 'short', effect: 'shadow', patch: { on: true } }], 60).doc;
  ok('an effect switched on means "Edited — render again"; a setting of one that is off does not', renderSpec(offTweak, src, out, null)!.hash === h0 && renderSpec(onTurn, src, out, null)!.hash !== h0);
  const studio = applyOps(withClip, [{ op: 'audio.set', patch: { studio: true, strength: 80 } }], 60).doc;
  ok('Studio Sound and its strength are on the edit and in the hash', studio.audio.studio === true && studio.audio.strength === 80 && renderSpec(studio, src, out, null)!.hash !== h0);

  const id = withClip.clips[0].id;
  const sp = applyOps(withClip, [{ op: 'clip.update', id, patch: { layout: 'speaker' } }], 60).doc;
  ok('the "speaker" layout is a crop that follows the speaker', sp.clips[0].layout === 'speaker' && sp.clips[0].reframe.mode === 'crop' && renderSpec(sp, src, out, null)!.tracking === 'speaker');
  const split = applyOps(withClip, [{ op: 'clip.update', id, patch: { layout: 'split' } }], 60).doc;
  const ss = renderSpec(split, src, out, null)!;
  ok('a split layout is in the spec and the hash', ss.layout === 'split' && ss.hash !== h0);
  ok('…and an unknown layout is refused', applyOps(withClip, [{ op: 'clip.update', id, patch: { layout: 'diagonal' as never } }], 60).refused.length === 1);
  ok('…a layout can be cleared back to the crop', applyOps(split, [{ op: 'clip.update', id, patch: { layout: null } }], 60).doc.clips[0].layout === undefined);

  const bubble = { detector: 'yunet', fps: 5, frames: 200, seen: 0.95, faces: 1, tracks: 1, switches: { speaker: 0, face: 0 }, speaker: [], face: [], people: [{ cx: 0.87, cy: 0.8, w: 0.08, h: 0.14, share: 0.95 }] };
  const two = { ...bubble, faces: 2, tracks: 2, people: [{ cx: 0.233, cy: 0.442, w: 0.102, h: 0.23, share: 1 }, { cx: 0.746, cy: 0.424, w: 0.109, h: 0.258, share: 1 }] };
  const host = { ...bubble, people: [{ cx: 0.5, cy: 0.4, w: 0.2, h: 0.4, share: 0.98 }] };
  const opt = (tf: typeof bubble | null, k: string) => layoutOptions(tf).find(o => o.key === k)!;
  ok('without the faces found, only "screen only" is offered — the rest say to find faces first', opt(null, 'screen').ok && !opt(null, 'split').ok && /Find faces first/.test(opt(null, 'split').why));
  ok('a screen recording with a webcam bubble offers split and picture-in-picture, not two people', opt(bubble, 'split').ok && opt(bubble, 'pip').ok && !opt(bubble, 'two').ok && /one person/i.test(opt(bubble, 'two').why));
  ok('two people taking turns offer "both people", not the webcam split', opt(two, 'two').ok && !opt(two, 'split').ok && /two people/.test(opt(two, 'split').why));
  ok('a talking head (one big face in the middle) offers the speaker, not a webcam split', opt(host, 'speaker').ok && !opt(host, 'split').ok && !opt(host, 'pip').ok);
  const pl = layoutPlan('split', bubble, 1280, 720, 1080, 1920)!;
  const [bx, by, bw, bh] = pl.boxes[1];
  ok('split: the screen whole above, the camera cropped round the face below, at the half\'s shape', JSON.stringify(pl.boxes[0]) === '[0,0,1280,720]' && Math.abs(bw / bh - 1080 / 960) < 0.02 && bx + bw <= 1280 && by + bh <= 720 && bx <= 0.87 * 1280 && bx + bw >= 0.87 * 1280, pl);
  const pt = layoutPlan('two', two, 1280, 720, 1080, 1920)!;
  ok('two people: the left one on top, each cropped round their own face', pt.boxes[0][0] < 400 && pt.boxes[1][0] + pt.boxes[1][2] > 900 && pt.boxes.every(b => b[0] >= 0 && b[0] + b[2] <= 1280 && b[1] + b[3] <= 720), pt.boxes);
  const pp = layoutPlan('pip', bubble, 1280, 720, 1080, 1920)!;
  ok('picture-in-picture: a square camera crop, the bubble on the webcam\'s side, inside the frame', pp.boxes[0][2] === pp.boxes[0][3] && pp.inset!.x > 540 && pp.inset!.x + pp.inset!.size <= 1080 && pp.inset!.y + pp.inset!.size <= 1920, pp);
  ok('a layout the recording cannot carry has no plan', layoutPlan('two', bubble, 1280, 720, 1080, 1920) === null && layoutPlan('split', two, 1280, 720, 1080, 1920) === null);
  const skin = skinBox({ ...two, face: [[0, 0.233, 0.44, 0.23, 1], [5, 0.24, 0.44, 0.23, 0]] }, [[0, 10]], 1280, 720);
  ok('the skin-smoothing box is the face\'s size with a margin, following the face', !!skin && skin.w > 0.1 * 1280 && skin.h > 0.23 * 720 && skin.path.length >= 2, skin);
}

console.log('\nThumbnail words');
{
  ok('the highlighted word is a figure when there is one', pickHighlight('It costs $49 a month') === '$49');
  ok('…else the longest of the last three words', pickHighlight('Why follow-up wins the deal') === 'deal' || pickHighlight('Why follow-up wins the deal') === 'wins');
  ok('three to five words, cut at a word', thumbWords('How AI Prospecting finds 30 businesses a day') === 'How AI Prospecting finds 30');
  const f = { layout: 'bold', text: 'x', highlight: '', at: 5, accent: '#facc15', color: '#000000', textColor: '#ffffff', border: true, zoom: 0.5 };
  const sp = cleanThumbSpec({ layout: 'evil;drawtext', text: 'Hi\u0000there', accent: 'red', zoom: 9, at: -3 }, f);
  ok('a designed thumbnail is held to known layouts, colours and ranges', sp.layout === 'bold' && sp.text === 'Hi there' && sp.accent === '#facc15' && sp.zoom === 1 && sp.at === 0, sp);
}


console.log('\nThe assistant, for the new edits');
{
  const doc: VideoDoc = newDoc(parseRequest('clean, 2 shorts'));
  const ctx = { doc, words: [], sentences: [], duration: 120, playhead: 42 };
  const fs = parseVideoCommand('Follow the speaker in the Shorts', ctx);
  ok('"follow the speaker" sets speaker tracking on the Shorts', fs.ops[0]?.op === 'tracking.set' && (fs.ops[0] as { mode: string }).mode === 'speaker' && (fs.ops[0] as { target: string }).target === 'short', fs);
  const sp = parseVideoCommand('Speed the shorts up to 1.25x', ctx);
  ok('"speed the shorts up to 1.25x"', sp.ops.length === 1 && (sp.ops[0] as { patch: { speed: number } }).patch.speed === 1.25 && (sp.ops[0] as { target: string }).target === 'short', sp);
  const fast = parseVideoCommand('Make Short 1 faster', { ...ctx, doc: { ...doc, clips: [{ id: 'c1', title: 'One', topic: '', reason: '', s: 5, e: 30, scores: null, by: 'ai', aspect: '9:16', reframe: { mode: 'crop', x: 0.5, y: 0.5 } }] } });
  ok('…while "make Short 1 faster" still means tightening its pauses', !fast.ops.some(o => o.op === 'motion.set'), fast);
  const bw = parseVideoCommand('Make everything black and white', ctx);
  ok('"make everything black and white" sets the filter on every video', bw.ops.length === 2 && bw.ops.every(o => o.op === 'look.set' && (o as { patch: { filter: string } }).patch.filter === 'bw'), bw);
  const z = parseVideoCommand('add punch-in zooms and also follow the speaker', ctx);
  ok('two new edits in one sentence', z.ops.some(o => o.op === 'motion.set') && z.ops.some(o => o.op === 'tracking.set'), z);
  const title = parseVideoCommand('Add a title "Three ways to win"', ctx);
  ok('"add a title …" puts the words at the playhead', title.ops[0]?.op === 'overlay.add' && (title.ops[0] as { s: number; text: string }).s === 42 && (title.ops[0] as { text: string }).text === 'Three ways to win', title);
  ok('…and without quotes, asks for them rather than guessing', !parseVideoCommand('Add a title', ctx).ops.length);
}

console.log('\nA project from the customer\'s own YouTube video');
{
  const id = 'dQw4w9WgXcQ';
  const good: [string, string][] = [
    [`https://www.youtube.com/watch?v=${id}`, 'watch'], [`https://youtube.com/watch?v=${id}&t=42s&list=PL123`, 'watch'], [`youtube.com/watch?v=${id}`, 'watch'],
    [`https://m.youtube.com/watch?v=${id}`, 'watch'], [`https://youtu.be/${id}?si=abc`, 'share'], [`youtu.be/${id}`, 'share'],
    [`https://www.youtube.com/shorts/${id}`, 'short'], [`https://youtube.com/live/${id}?feature=share`, 'live'], [`https://www.youtube.com/embed/${id}`, 'watch'],
    [`  https://www.youtube.com/watch?v=${id}  `, 'watch'],
  ];
  for (const [u, kind] of good) {
    const r = parseYoutubeUrl(u);
    ok(`a link is read to its id: ${u.trim()}`, r.ok && r.id === id && r.kind === kind && r.url === `https://www.youtube.com/watch?v=${id}`, r);
  }
  const bad: [string, RegExp][] = [
    ['', /Paste the link/], ['not a link at all', /not a link|not YouTube|is to/], [`https://vimeo.com/${id}`, /vimeo\.com, not YouTube/],
    [`https://www.youtube.com.evil.example/watch?v=${id}`, /not YouTube/], [`https://evil.example/?u=youtube.com/watch?v=${id}`, /not YouTube/],
    ['https://www.youtube.com/playlist?list=PL1234567', /playlist/], ['https://www.youtube.com/@growthshow', /channel/], ['https://www.youtube.com/results?search_query=x', /search/],
    ['https://www.youtube.com/watch?v=short', /11 letters/], [`https://www.youtube.com/watch?v=${id}x`, /11 letters/], ['https://www.youtube.com/watch', /does not name a video/],
    [`javascript:alert(1)//youtube.com/watch?v=${id}`, /not a web link|not YouTube|not a link/], [`https://user:pw@www.youtube.com/watch?v=${id}`, /not a YouTube link/],
    [`ftp://www.youtube.com/watch?v=${id}`, /not a web link/],
  ];
  for (const [u, why] of bad) {
    const r = parseYoutubeUrl(u);
    ok(`…and refused by name: ${u || '(empty)'}`, !r.ok && why.test(r.error), r);
  }
  ok('the still shown is YouTube\'s own, by id only', youtubeThumb(id) === `https://i.ytimg.com/vi/${id}/hqdefault.jpg` && youtubeThumb('../x') === '');

  const bot = youtubeRefusal('ytdlp: ERROR: [youtube] dQw4w9WgXcQ: Sign in to confirm you’re not a bot. Use --cookies-from-browser or --cookies for the authentication.');
  ok('"Sign in to confirm you\'re not a bot" is a refusal no retry changes, said plainly, with the way forward', bot.terminal && bot.code === 'bot' && /not a bot/.test(bot.message) && bot.message.endsWith(YOUTUBE_WAY_FORWARD), bot);
  ok('…a private video', youtubeRefusal('ytdlp: ERROR: [youtube] x: Private video. Sign in if you\'ve been granted access to this video').code === 'private');
  const age = youtubeRefusal('ytdlp: ERROR: [youtube] x: Sign in to confirm your age. This video may be inappropriate for some users.');
  ok('…an age-restricted one (not mistaken for the bot check)', age.code === 'age' && age.terminal, age);
  ok('…members only', youtubeRefusal('ytdlp: ERROR: [youtube] x: Join this channel to get access to members-only content like this video').code === 'members');
  ok('…unavailable', youtubeRefusal('ytdlp: ERROR: [youtube] x: Video unavailable. This video has been removed by the uploader').code === 'unavailable');
  ok('…too many requests is YouTube refusing the server', youtubeRefusal('ytdlp: ERROR: unable to download video data: HTTP Error 429: Too Many Requests').code === 'bot');
  const long = youtubeRefusal('refused: youtube:too_long:14400:10800');
  ok('the engine\'s own check: too long, in minutes', long.terminal && /240 minutes/.test(long.message) && /180 minutes/.test(long.message), long);
  const over = youtubeRefusal('refused: youtube:over_allowance:3000:600');
  ok('…over this month\'s allowance, saying how much is left', over.terminal && /50 minutes/.test(over.message) && /10 minutes of this month/.test(over.message), over);
  ok('…a live stream not finished', youtubeRefusal('refused: youtube:live').code === 'live');
  const net = youtubeRefusal('ytdlp: ERROR: Unable to download webpage: <urlopen error [Errno 104] Connection reset by peer>');
  ok('a network hiccup is retried, not a refusal — and still says the way forward', !net.terminal && net.code === 'unknown' && net.message.endsWith(YOUTUBE_WAY_FORWARD), net);
  ok('oEmbed\'s answer is kept to a title and a channel, markup dropped', JSON.stringify(cleanOembed({ title: 'How we <b>grow</b>\n', author_name: 'Growth Show', html: '<iframe>' })) === JSON.stringify({ title: 'How we b grow /b', author: 'Growth Show' }), cleanOembed({ title: 'How we <b>grow</b>\n', author_name: 'Growth Show' }));
  ok('…and nothing without a title', cleanOembed({ author_name: 'x' }) === null && cleanOembed(null) === null);
}

console.log('\nTrending thumbnails: one plan for the engine and the preview');
{
  const face = { x: 0.2, y: 0.2, w: 0.2, h: 0.35 };
  const src = { w: 1920, h: 1080 };
  ok('eight trending layouts, including the 9:16 Shorts cover', TREND_LAYOUTS.length === 8 && TREND_LAYOUTS.includes('short') && TREND_LAYOUTS.includes('glow'));
  const evil = normaliseSpec({ layout: 'bold;drawtext=x', sticker: 'skull', side: 'up', pointer: 'laser', accent: 'red', textSize: 9, badge: 'x'.repeat(80), hlStyle: 'neon' });
  ok('every option is held to the engine\'s own lists and ranges', evil.layout === 'bold' && evil.sticker === '' && evil.side === 'auto' && evil.pointer === 'auto' && evil.accent === '#facc15' && evil.textSize === 1.4 && evil.badge.length === 28 && evil.hlStyle === 'color', evil);
  const inFrame = (pl: ReturnType<typeof thumbPlan>) => pl.lines.every(l => { const r = lineRect(l); return r.x0 >= -2 && r.x1 <= pl.W + 2 && r.y0 >= -2 && r.y1 <= pl.H + 2; });
  for (const layout of TREND_LAYOUTS) for (const [W, H] of [[1280, 720], [1080, 1920]]) {
    const pl = thumbPlan({ layout, text: 'I tried this for 30 days', highlight: '30', sticker: 'check', pointer: 'both', badge: '@show' }, W, H, src, face);
    ok(`${layout} at ${W}×${H}: every line of words inside the picture, the words all there`, inFrame(pl) && pl.lines.map(l => l.runs.map(r => r.t).join('')).join(' ').replace(/\s+/g, ' ').includes('30'), pl.lines.map(l => [l.x, l.y, l.w, l.fs]));
  }
  const box = thumbPlan({ layout: 'glow', text: 'Stop doing this now', highlight: 'stop', hlStyle: 'box' }, 1280, 720, src, face);
  ok('a boxed highlight gets a line of its own, in a tilted accent box with ink that reads on it', box.lines.some(l => l.box && l.runs.length === 1 && l.runs[0].t === 'STOP' && l.box.tilt === -3 && l.runs[0].color === '#0b0b0f'), box.lines);
  const coloured = thumbPlan({ layout: 'bold', text: 'Why nobody buys', highlight: 'nobody', accent: '#22d3ee' }, 1280, 720, src, face);
  ok('…or coloured in the accent, two-tone, in its line', coloured.lines.some(l => l.runs.some(r => r.t.trim() === 'NOBODY' && r.color === '#22d3ee') && l.runs.some(r => r.color === '#ffffff')));
  const noFace = thumbPlan({ layout: 'callout', text: 'Look at this', pointer: 'both' }, 1280, 720, src, null);
  ok('with no face found nothing is ringed, pointed at or glowed round', !noFace.ring && !noFace.arrow && !noFace.halo);
  const ring = thumbPlan({ layout: 'callout', text: 'Big news for owners', pointer: 'both' }, 1280, 720, src, face);
  ok('a callout rings the face and points at it — the arrow never through the words', !!ring.ring && !!ring.arrow && ring.arrow.pts.every(([x, y]) => !ring.lines.map(lineRect).some(r => x > r.x0 + 4 && x < r.x1 - 4 && y > r.y0 + 4 && y < r.y1 - 4)), ring.arrow);
  const glow = thumbPlan({ layout: 'glow', text: 'Do this first' }, 1280, 720, src, face);
  ok('glow: the frame blurred under the gradient, the face sharp in a spotlight with a halo of the accent', glow.grade.blur > 0 && !!glow.spot && !!glow.halo && glow.fills.length > 0);
  const side = thumbPlan({ layout: 'bold', text: 'Two words', side: 'right' }, 1280, 720, src, face);
  ok('face on the right puts the words on the left', side.lines.every(l => l.x < 640));
  const num = thumbPlan({ layout: 'number', text: '8 hours of work in 1' }, 1280, 720, src, face);
  ok('the number layout puts the figure on its own tile', !!num.tile && num.lines[0].runs.map(r => r.t).join('') === '8 HOURS');
  ok('…and with no figure is drawn as "bold", saying so', thumbPlan({ layout: 'number', text: 'No figure here' }, 1280, 720, src, face).layout === 'bold');
  ok('the Shorts cover is a 9:16 layout; on 16:9 it is drawn as "bold"', thumbPlan({ layout: 'short', text: 'x y' }, 1080, 1920, src, face).layout === 'short' && thumbPlan({ layout: 'short', text: 'x y' }, 1280, 720, src, face).layout === 'bold');
  const vs = thumbPlan({ layout: 'split', text: 'Before vs After' }, 1280, 720, src, face, face);
  ok('"A vs B" splits the words under each half, with a VS disc', !!vs.split?.vs && vs.lines.length === 2 && vs.lines[0].x < 640 && vs.lines[1].x > 640 && !!vs.crop && !!vs.crop2);
  for (const k of STICKERS) {
    const st = thumbPlan({ layout: 'headline', text: 'Words here', sticker: k }, 1280, 720, src, null).sticker;
    ok(`sticker "${k}" drawn inside the picture`, !!st && st.cx - st.r >= 0 && st.cx + st.r <= 1280 && st.cy - st.r >= 0 && st.cy + st.r <= 720 && (!!st.mark || !!st.glyph), st);
  }
  ok('even lines: "of work in 1" is never left with "1" alone', num.lines.slice(1).every(l => l.runs.map(r => r.t).join('').trim().split(' ').length >= 2), num.lines.map(l => l.runs.map(r => r.t).join('')));
  const spec = cleanThumbSpec({ layout: 'glow', text: 'A b c', sticker: 'star', side: 'left', color2: '#123456', textSize: 0.2 }, { layout: 'bold', text: 'x', highlight: '', at: 5, accent: '#facc15', color: '#000000', textColor: '#ffffff', border: true, zoom: 0.5 });
  ok('a designed spec keeps the new options, cleaned', spec.layout === 'glow' && spec.sticker === 'star' && spec.side === 'left' && spec.color2 === '#123456' && spec.textSize === 0.6, spec);
}

console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
