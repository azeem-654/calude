/**
 * Cleanup proposals — fillers, long pauses, repeated words and false starts —
 * as cuts with a reason and a confidence, never as edits already made.
 *
 * ── Context, not a word list ──
 *
 * Deleting every "um" and every quiet moment makes a recording sound like a
 * ransom note. So:
 *   - a pause is shortened, never removed: some of it is always left, and it
 *     is cut only where the *sound* is quiet too (the engine's silences) — a
 *     gap between words with sound in it is laughter, music or a demo;
 *   - a filler is cut only when it stands alone as a token, so "umbrella" or
 *     Turkish "ee" inside a word is never touched;
 *   - a repeat or a false start is *proposed*, never applied, and never when
 *     what would go contains a number, a price, a date or a negation.
 *
 * Only fillers and pauses with high confidence start approved (Balanced and
 * Aggressive); everything that changes what is said waits for a person.
 *
 * Ids are deterministic (kind + word index), so running cleanup again at a
 * different level keeps the decisions somebody already made.
 *
 * Pure: imported by the browser too.
 */
import type { CleanupPreset, Cut, Word } from './edit';
import { sentencesOf } from './edit';

const FILLER = /^(u+h+m*|u+m+|e+r+m+|e+r+|h+m+|m{2,}h*|a{2,}h*|ah+|e{2,}h*|ı{2,}|i{3,}|öh+m*|eh+m*|hm+)$/i;
const bare = (w: string) => w.toLowerCase().replace(/’/g, "'").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
export const isFiller = (w: string) => FILLER.test(bare(w));

/* ── Filler words, by kind ────────────────────────────────────────────────── */

/**
 * The kinds of filler the customer can tick. Only the hesitation sounds are
 * fillers wherever they stand; every other kind is a real word that is
 * sometimes filler and sometimes meaning ("I like it", "what kind of car"),
 * so each has a context rule below and is only ever *proposed*.
 */
export const FILLER_KINDS = ['um', 'like', 'you_know', 'i_mean', 'hedge', 'adverb', 'tag', 'starter'] as const;
export type FillerKind = typeof FILLER_KINDS[number];
export const FILLER_INFO: Record<FillerKind, { label: string; keeps: string }> = {
  um: { label: 'Um, uh, er, ah, hmm', keeps: 'Only when the sound stands alone — never inside a word.' },
  like: { label: '“Like” as a filler', keeps: 'Kept as a verb or a comparison: “I like it”, “looks like”, “like this”.' },
  you_know: { label: '“You know”', keeps: 'Kept in a question or before what is known: “do you know”, “you know what…”.' },
  i_mean: { label: '“I mean”', keeps: 'Kept when it means something: “what I mean”, “I mean it”.' },
  hedge: { label: '“Sort of”, “kind of”', keeps: 'Kept after “what”, “this”, “a”… — “what kind of car”.' },
  adverb: { label: '“Basically”, “actually”, “literally”', keeps: 'Only when set off by a comma or a pause.' },
  tag: { label: '“Right?” ending a sentence', keeps: 'Never when it is the whole sentence, or “that’s right”.' },
  starter: { label: '“So” / “and” starting a sentence, then a pause', keeps: 'Only at the start of a sentence and followed by a pause.' },
};
/** Ticked unless the customer says otherwise: the hedges and the adverbs carry meaning too often to be on by default. */
export const DEFAULT_FILLERS: FillerKind[] = ['um', 'like', 'you_know', 'i_mean', 'tag', 'starter'];

export interface FillerHit { kind: FillerKind; j0: number; j1: number; conf: number; text: string }

const LIKE_VERB = new Set(['i', 'you', 'we', 'they', 'he', 'she', "i'd", "you'd", "we'd", "they'd", 'would', 'really', 'do', 'does', 'did', "don't", "didn't", "doesn't", 'not',
  'look', 'looks', 'looked', 'looking', 'feel', 'feels', 'felt', 'sound', 'sounds', 'sounded', 'seem', 'seems', 'seemed', 'something', 'anything', 'nothing', 'more', 'much', 'just', 'also', 'what', 'to', "i'll", "you'll", 'people', 'customers']);
const LIKE_OBJECT = new Set(['this', 'that', 'these', 'those', 'a', 'an', 'the', 'me', 'you', 'him', 'her', 'us', 'them', 'it', 'my', 'your', 'his', 'our', 'their']);
const KNOW_PREV = new Set(['do', 'did', "don't", "didn't", 'if', 'as', 'would', 'could', 'what', 'how', 'let', 'should', 'will', "won't", 'to']);
const KNOW_NEXT = new Set(['what', 'how', 'that', 'why', 'where', 'who', 'when', 'if', 'whether', 'the', 'a', 'an', 'him', 'her', 'it', 'them', 'me', 'us', 'about', 'this', 'your', 'my']);
const MEAN_NEXT = new Set(['it', 'that', 'this', 'what', 'to', 'you', 'them', 'him', 'her', 'business']);
const DETERMINER = new Set(['what', "what's", 'this', 'that', "that's", 'a', 'an', 'the', 'any', 'every', 'some', 'which', 'one', 'no', 'same', 'these', 'those', 'all', 'other', 'another', 'each',
  'my', 'your', 'our', 'their', 'his', 'her', 'its', 'different', 'right', 'wrong', 'new', 'best', 'worst', 'first', 'last', 'only', 'whatever']);
const END_P = /[.!?…۔؟]["')\]]*$/;
const COMMA = /[,;:—–-]["')\]]*$/;

/**
 * Where the fillers are, by kind, with the context rule that let each one
 * through. Positions are indexes into `words` (array order, not `Word.i`).
 */
export function findFillers(words: Word[]): FillerHit[] {
  const out: FillerHit[] = [];
  const n = words.length;
  for (let j = 0; j < n; j++) {
    const w = words[j], b = bare(w.w);
    if (!b) continue;
    const prev = words[j - 1], next = words[j + 1], after = words[j + 2];
    const pb = prev ? w.s - prev.e : 9;
    const pa = (k: number) => (words[k + 1] ? words[k + 1].s - words[k].e : 9);
    const commaAfter = (k: number) => !!words[k] && COMMA.test(words[k].w);
    const start = !prev || END_P.test(prev.w) || pb > 1.2;
    const pBare = prev ? bare(prev.w) : '';
    const hit = (kind: FillerKind, j1: number, conf: number) => { out.push({ kind, j0: j, j1, conf, text: words.slice(j, j1 + 1).map(x => bare(x.w)).join(' ') }); j = j1; };
    if (FILLER.test(b)) {
      const alone = pb > 0.12 || pa(j) > 0.12;
      hit('um', j, Math.min(0.95, 0.88 + (alone ? 0.04 : 0) - (w.c !== undefined && w.c < 0.5 ? 0.12 : 0)));
      continue;
    }
    if (b === 'like') {
      if (LIKE_VERB.has(pBare) || /'d$/.test(pBare)) continue;
      const set = COMMA.test(w.w) || (prev && COMMA.test(prev.w));
      const paused = pb >= 0.3 || pa(j) >= 0.3;
      if (!set && (!paused || (next && LIKE_OBJECT.has(bare(next.w))))) continue;
      if (!next || END_P.test(w.w)) continue;
      hit('like', j, set ? 0.72 : 0.6);
      continue;
    }
    if (b === 'you' && next && bare(next.w) === 'know') {
      if (KNOW_PREV.has(pBare) || /\?$/.test(next.w)) continue;
      const set = commaAfter(j + 1) || pa(j + 1) >= 0.3 || END_P.test(next.w);
      if (!set || (after && !COMMA.test(next.w) && KNOW_NEXT.has(bare(after.w)))) continue;
      hit('you_know', j + 1, 0.7);
      continue;
    }
    if (b === 'i' && next && bare(next.w) === 'mean') {
      if (pBare === 'what' || pBare === 'do' || pBare === "don't") continue;
      const set = commaAfter(j + 1) || pa(j + 1) >= 0.3;
      if (!set || (after && !COMMA.test(next.w) && MEAN_NEXT.has(bare(after.w)))) continue;
      hit('i_mean', j + 1, 0.7);
      continue;
    }
    if ((b === 'sort' || b === 'kind') && next && bare(next.w) === 'of' && after) {
      if (DETERMINER.has(pBare) || END_P.test(next.w)) continue;
      hit('hedge', j + 1, 0.55);
      continue;
    }
    if (b === 'basically' || b === 'actually' || b === 'literally') {
      const set = COMMA.test(w.w) || (prev && COMMA.test(prev.w) && !END_P.test(prev.w));
      if (!(set || (pb >= 0.3 && pa(j) >= 0.3) || (start && pa(j) >= 0.3)) || !next) continue;
      hit('adverb', j, 0.55);
      continue;
    }
    if (b === 'right' && /\?["')\]]*$/.test(w.w) && !start && pBare !== "that's" && pBare !== 'that' && pBare !== 'is' && pBare !== 'all') {
      hit('tag', j, 0.75);
      continue;
    }
    if ((b === 'so' || b === 'and') && start && next && (COMMA.test(w.w) || pa(j) >= 0.3)) {
      hit('starter', j, 0.65);
      continue;
    }
  }
  return out;
}

/** How many of each kind the recording has — for the options panel, ticked or not. */
export function fillerCounts(words: Word[]): Record<FillerKind, number> {
  const c = Object.fromEntries(FILLER_KINDS.map(k => [k, 0])) as Record<FillerKind, number>;
  for (const h of findFillers(words)) c[h.kind]++;
  return c;
}

export const cleanFillerKinds = (v: unknown): FillerKind[] | null =>
  Array.isArray(v) ? [...new Set(v.filter((k): k is FillerKind => (FILLER_KINDS as readonly string[]).includes(k as string)))] : null;

/** Words whose loss changes meaning: numbers, money, dates, negation (English, Turkish, Urdu). */
const NEGATION = new Set(['no', 'not', 'never', 'none', 'nothing', 'nobody', 'neither', 'nor', 'without', 'cannot', 'hayır', 'değil', 'yok', 'asla', 'hiç', 'nahi', 'nahin', 'mat', 'نہیں', 'نہ', 'مت', 'کبھی']);
const MONTHS = /^(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|yesterday|ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)$/i;
const NUMBER_WORD = /^(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|half|percent|dollars?|euros?|pounds?|lira|rupees?|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on|yüz|bin|milyon)$/i;

export function meaningful(w: string): boolean {
  const raw = w.toLowerCase();
  const b = bare(w);
  return /\d/.test(raw) || /[$€£₺₨%]/.test(raw) || NEGATION.has(b) || /n['’]t$/.test(b) || MONTHS.test(b) || NUMBER_WORD.test(b);
}

const LEVEL: Record<CleanupPreset, { gap: number; leave: number; repeats: boolean; falseStarts: boolean; autoFiller: boolean; autoGap: number }> = {
  conservative: { gap: 1.6, leave: 0.55, repeats: false, falseStarts: false, autoFiller: false, autoGap: 2.5 },
  balanced: { gap: 0.9, leave: 0.35, repeats: true, falseStarts: false, autoFiller: true, autoGap: 0.9 },
  aggressive: { gap: 0.6, leave: 0.22, repeats: true, falseStarts: true, autoFiller: true, autoGap: 0.6 },
};

/** How much of [a, b] is inside the quiet stretches the engine measured. */
function quietShare(a: number, b: number, silences: [number, number][]): number {
  let q = 0;
  for (const [s, e] of silences) {
    if (e <= a) continue;
    if (s >= b) break;
    q += Math.min(b, e) - Math.max(a, s);
  }
  return b > a ? q / (b - a) : 0;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface CleanupOptions {
  /** Which kinds of filler to look for; DEFAULT_FILLERS when not given. */
  fillers?: FillerKind[] | null;
  /** "Shorten word gaps": every quiet pause longer than this (seconds) is cut down to it, and applied. */
  maxPause?: number | null;
  /** The engine's waveform (20 peaks a second, 0–255) — the loudness signals for choosing between retakes. */
  wave?: Uint8Array | null;
}

export function proposeCleanup(words: Word[], silences: [number, number][] | null, preset: CleanupPreset, duration: number, opts: CleanupOptions = {}): Cut[] {
  const base = LEVEL[preset];
  const maxPause = opts.maxPause && opts.maxPause >= 0.15 && opts.maxPause <= 3 ? opts.maxPause : null;
  /* A chosen maximum pause replaces the level's: anything longer is cut down
     to it, and — because the customer set the number — applied where quiet. */
  const L = maxPause ? { ...base, gap: maxPause + 0.25, leave: Math.max(0, maxPause - 0.1), autoGap: maxPause + 0.25 } : base;
  const kinds = new Set(opts.fillers ?? DEFAULT_FILLERS);
  const cuts: Cut[] = [];
  const sil = (silences ?? []).slice().sort((x, y) => x[0] - y[0]);
  const hasSound = silences !== null;

  /* Pauses — the opening one too, which is the commonest complaint. */
  const gapAt = (a: number, b: number, at: number, label: string) => {
    const len = b - a;
    if (len < L.gap) return;
    const leaveA = at === -1 ? 0.25 : L.leave / 2 + 0.05, leaveB = L.leave / 2 + 0.05;
    const s = a + leaveA, e = b - leaveB;
    if (e - s < 0.25) return;
    const quiet = hasSound ? quietShare(s, e, sil) : 1;
    if (quiet < 0.8) {
      /* Words stop but sound goes on: a demo, music, laughter. Offered only at
         the aggressive level, and never applied without a person. */
      if (preset !== 'aggressive') return;
      cuts.push({ id: `gap-${at}`, s: r2(s), e: r2(e), kind: 'gap', state: 'proposed', reason: `${len.toFixed(1)} s without words, but not silent — check before cutting`, conf: 0.45, by: 'rule' });
      return;
    }
    const conf = hasSound ? Math.min(0.97, 0.75 + quiet * 0.2) : 0.7;
    const auto = len >= L.autoGap && conf >= 0.8;
    cuts.push({ id: `gap-${at}`, s: r2(s), e: r2(e), kind: 'gap', state: auto ? 'approved' : 'proposed', reason: `${label} of ${len.toFixed(1)} s shortened to ${(len - (e - s)).toFixed(1)} s`, conf: r2(conf), by: 'rule' });
  };
  if (words.length) gapAt(0, words[0].s, -1, 'Opening pause');
  for (let j = 0; j + 1 < words.length; j++) gapAt(words[j].e, words[j + 1].s, words[j].i, 'Pause');
  if (words.length) {
    const tail = duration - words[words.length - 1].e;
    const ts = words[words.length - 1].e + 1.2;
    const quiet = hasSound ? quietShare(ts, duration, sil) : 1;
    if (tail > 2.5 && quiet >= 0.8) cuts.push({ id: 'gap-end', s: r2(ts), e: r2(duration), kind: 'gap', state: L.autoFiller ? 'approved' : 'proposed', reason: `${tail.toFixed(1)} s of silence after the last word`, conf: 0.85, by: 'rule' });
  }

  /* Fillers. The cut reaches into the pauses either side a little, so the
     words around it close up naturally rather than leaving two short gaps.
     A whole-token hesitation is a filler (only a transcriber unsure of what
     it heard lowers that, because then it may have been a real word) and
     starts applied at Balanced; the word fillers wait for a person. */
  for (const h of findFillers(words)) {
    if (!kinds.has(h.kind)) continue;
    const a = words[h.j0], z = words[h.j1];
    const prevE = h.j0 ? words[h.j0 - 1].e : 0, nextS = h.j1 + 1 < words.length ? words[h.j1 + 1].s : duration;
    const s = Math.max(prevE + 0.02, a.s - 0.06), e = Math.min(nextS - 0.02, z.e + 0.06);
    if (e - s < 0.08) continue;
    const conf = r2(h.conf);
    const auto = h.kind === 'um' && L.autoFiller && conf >= 0.85;
    cuts.push({ id: h.kind === 'um' ? `fil-${a.i}` : `fil-${h.kind}-${a.i}`, s: r2(s), e: r2(e), kind: 'filler', sub: h.kind, state: auto ? 'approved' : 'proposed', reason: `Filler “${h.text}”`, conf, by: 'rule' });
  }

  /* An immediately repeated word or phrase ("we can we can"): the first
     take goes, the fluent second one stays. */
  if (L.repeats) {
    for (let j = 0; j < words.length; j++) {
      for (let n = 4; n >= 1; n--) {
        if (j + 2 * n > words.length) continue;
        const a = words.slice(j, j + n), b = words.slice(j + n, j + 2 * n);
        if (!a.every((w, k) => bare(w.w) && bare(w.w) === bare(b[k].w))) continue;
        if (a.some(w => meaningful(w.w) || isFiller(w.w))) continue;
        if (n === 1 && bare(a[0].w).length <= 1 && !/^(i|a)$/.test(bare(a[0].w))) continue;
        if (b[0].s - a[n - 1].e > 1.2) continue;
        cuts.push({ id: `rep-${a[0].i}`, s: r2(a[0].s - 0.03), e: r2(b[0].s - 0.03), kind: 'repeat', state: 'proposed',
          reason: `Said twice: “${a.map(w => bare(w.w)).join(' ')}”`, conf: n === 1 ? 0.72 : 0.64, by: 'rule' });
        j += n - 1;
        break;
      }
    }
  }

  /* A false start: a few words, a stop, and the same opening again
     ("So we— so we built it"). Proposed at the aggressive level only. */
  if (L.falseStarts) {
    for (let j = 0; j < words.length; j++) {
      for (let n = 2; n <= 5 && j + n < words.length; n++) {
        const frag = words.slice(j, j + n), after = words[j + n];
        if (after.s - frag[n - 1].e < 0.25) continue;
        if (bare(after.w) !== bare(frag[0].w) || !bare(after.w)) continue;
        if (frag.some(w => meaningful(w.w))) break;
        if (/[.!?…۔؟]$/.test(frag[n - 1].w)) break;
        if (cuts.some(c => c.kind === 'repeat' && c.s <= frag[0].s && c.e >= frag[0].s)) break;
        cuts.push({ id: `fs-${frag[0].i}`, s: r2(frag[0].s - 0.03), e: r2(after.s - 0.03), kind: 'false_start', state: 'proposed',
          reason: `Started again: “${frag.map(w => bare(w.w)).join(' ')}…”`, conf: 0.55, by: 'rule' });
        j += n - 1;
        break;
      }
    }
  }

  /* Whole sentences said again — retakes — with the best take kept. */
  if (L.repeats) cuts.push(...proposeRetakes(words, opts.wave ?? null, duration));

  /* A pause cut that would swallow a protected word is impossible by
     construction (pauses have no words), but a repeat or false start that
     overlaps a filler cut keeps only the longer of the two. */
  const sorted = cuts.sort((x, y) => x.s - y.s || (y.e - y.s) - (x.e - x.s));
  const out: Cut[] = [];
  for (const c of sorted) {
    const last = out[out.length - 1];
    if (last && c.s < last.e && c.e <= last.e) continue;
    out.push(c);
  }
  return out;
}

/* ── Retakes, and which take to keep ──────────────────────────────────────── */

/**
 * What each take measured — the customer is told which of these decided.
 * `loud` and `vary` come from the waveform (mean peak, and how much the
 * peaks move: a flat read sounds tired, a lively one moves); null without one.
 */
export interface TakeSignals { s: number; e: number; words: number; complete: boolean; falseStart: boolean; fillers: number; wps: number; loud: number | null; vary: number | null; score: number }

const tokens = (ws: Word[]) => ws.map(w => bare(w.w)).filter(t => t && !FILLER.test(t));
function lcs(a: string[], b: string[]): number {
  const dp = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}
/** One sentence is another said again: mostly the same words, or the start of it broken off. */
function sameTake(a: string[], b: string[]): { same: boolean; prefixOf: boolean } {
  if (a.length < 2 || b.length < 2) return { same: false, prefixOf: false };
  const k = Math.min(a.length, b.length, 4);
  const opens = a.slice(0, k).every((t, i) => t === b[i]);
  const common = lcs(a, b);
  const prefixOf = opens && a.length < b.length && common >= a.length * 0.8;
  const same = Math.min(a.length, b.length) >= 3 && common / Math.max(a.length, b.length) >= 0.6 && (opens || common / Math.min(a.length, b.length) >= 0.8);
  return { same: same || prefixOf, prefixOf };
}

function peaks(wave: Uint8Array | null, s: number, e: number): { loud: number; vary: number } | null {
  if (!wave || !wave.length) return null;
  const a = Math.max(0, Math.floor(s * 20)), b = Math.min(wave.length, Math.ceil(e * 20));
  const xs: number[] = [];
  for (let i = a; i < b; i++) if (wave[i] > 6) xs.push(wave[i]);
  if (xs.length < 3) return null;
  const mean = xs.reduce((n, x) => n + x, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((n, x) => n + (x - mean) ** 2, 0) / xs.length);
  return { loud: mean, vary: sd / Math.max(1, mean) };
}

/**
 * Score the takes of one sentence. Complete beats broken off (a false start
 * is never the take to keep); then louder and livelier (from the waveform),
 * fewer fillers inside, a brisker pace; ties go to the last take, which is
 * usually the one the speaker meant.
 */
export function scoreTakes(takes: { ws: Word[]; prefixOf: boolean }[], wave: Uint8Array | null): TakeSignals[] {
  const sig = takes.map(t => {
    const first = t.ws[0], last = t.ws[t.ws.length - 1];
    const len = Math.max(0.3, last.e - first.s);
    const fil = t.ws.filter(w => FILLER.test(bare(w.w))).length;
    const pk = peaks(wave, first.s, last.e);
    return { s: first.s, e: last.e, words: t.ws.length, complete: END_P.test(last.w) && !t.prefixOf, falseStart: t.prefixOf, fillers: fil, wps: (t.ws.length - fil) / len, loud: pk?.loud ?? null, vary: pk?.vary ?? null, score: 0 };
  });
  const z = (k: 'wps' | 'loud' | 'vary' | 'fillers') => {
    const xs = sig.map(x => x[k]).filter((v): v is number => v !== null);
    if (xs.length !== sig.length || xs.length < 2) return sig.map(() => 0);
    const m = xs.reduce((n, x) => n + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((n, x) => n + (x - m) ** 2, 0) / xs.length);
    return sig.map(x => (sd > 1e-6 ? ((x[k] as number) - m) / sd : 0));
  };
  const [zl, zv, zw, zf] = [z('loud'), z('vary'), z('wps'), z('fillers')];
  sig.forEach((x, i) => { x.score = Math.round(((x.complete ? 3 : 0) - (x.falseStart ? 2 : 0) + zl[i] + zv[i] + 0.5 * zw[i] - 1.2 * zf[i] + (i === sig.length - 1 ? 0.3 : 0)) * 100) / 100; });
  return sig;
}

/** The signals on which the kept take beat every other, in words. */
export function whyKept(sig: TakeSignals[], k: number): string[] {
  const me = sig[k], others = sig.filter((_, i) => i !== k);
  const why: string[] = [];
  if (me.complete && others.some(o => !o.complete)) why.push('complete');
  if (!me.falseStart && others.some(o => o.falseStart)) why.push('no false start');
  if (me.loud !== null && others.every(o => o.loud !== null && me.loud! > o.loud * 1.05)) why.push('louder');
  if (me.vary !== null && others.every(o => o.vary !== null && me.vary! > o.vary * 1.05)) why.push('livelier');
  if (others.every(o => me.fillers < o.fillers)) why.push('fewer fillers');
  if (others.every(o => me.wps > o.wps * 1.08)) why.push('brisker');
  if (!why.length) why.push(k === sig.length - 1 ? 'the takes measure alike, so the last one' : 'the best overall');
  return why;
}

/**
 * Sentences said more than once within a few sentences of each other — a
 * retake, or a sentence broken off and started again. Each group keeps the
 * take that scores best; the others are proposed as cuts saying which take
 * was kept and why. A take holding a number, a price, a date or a negation
 * is never proposed, even when the kept take says the same.
 */
export function proposeRetakes(words: Word[], wave: Uint8Array | null, duration: number): Cut[] {
  const sents = sentencesOf(words);
  const pos = new Map(words.map((w, j) => [w.i, j]));
  const toks = sents.map(s => tokens(words.slice(pos.get(s.w0)!, pos.get(s.w1)! + 1)));
  const group = new Array(sents.length).fill(-1);
  const prefix = new Array(sents.length).fill(false);
  const groups: number[][] = [];
  for (let a = 0; a < sents.length; a++) {
    for (let b = a + 1; b < Math.min(sents.length, a + 4); b++) {
      if (sents[b].s - sents[a].e > 20) break;
      const m = sameTake(toks[a], toks[b]);
      if (!m.same) continue;
      if (m.prefixOf) prefix[a] = true;
      const g = group[a] >= 0 ? group[a] : group[b] >= 0 ? group[b] : groups.push([]) - 1;
      for (const x of [a, b]) if (group[x] < 0) { group[x] = g; groups[g].push(x); }
      break;
    }
  }
  const out: Cut[] = [];
  for (const g of groups) {
    const ids = [...new Set(g)].sort((x, y) => x - y);
    if (ids.length < 2) continue;
    const takes = ids.map(x => ({ ws: words.slice(pos.get(sents[x].w0)!, pos.get(sents[x].w1)! + 1), prefixOf: prefix[x] }));
    const sig = scoreTakes(takes, wave);
    let k = 0;
    sig.forEach((x, i) => { if (x.score >= sig[k].score) k = i; });
    const why = whyKept(sig, k).join(', ');
    const opening = toks[ids[k]].slice(0, 5).join(' ');
    ids.forEach((x, i) => {
      if (i === k) return;
      const ws = takes[i].ws;
      if (ws.some(w => meaningful(w.w))) return;
      const last = pos.get(sents[x].w1)!;
      const nextS = last + 1 < words.length ? words[last + 1].s : duration;
      const s = ws[0].s - 0.03, e = Math.min(nextS - 0.03, Math.max(ws[ws.length - 1].e + 0.05, nextS - 0.25));
      if (e - s < 0.2) return;
      out.push({ id: `ret-${ws[0].i}`, s: r2(s), e: r2(e), kind: 'retake', state: 'proposed', conf: sig[i].falseStart ? 0.7 : 0.62, by: 'rule',
        reason: `Take ${i + 1} of ${ids.length} of “${opening}…” — kept take ${k + 1}: ${why}` });
    });
  }
  return out;
}

/** What the proposals add up to, for the screen. */
export function cleanupSummary(cuts: Cut[]): { kind: string; n: number; seconds: number; approved: number }[] {
  const m = new Map<string, { kind: string; n: number; seconds: number; approved: number }>();
  for (const c of cuts) {
    if (c.by === 'you') continue;
    const x = m.get(c.kind) ?? { kind: c.kind, n: 0, seconds: 0, approved: 0 };
    x.n++; x.seconds += c.e - c.s; if (c.state === 'approved') x.approved++;
    m.set(c.kind, x);
  }
  return [...m.values()].map(x => ({ ...x, seconds: Math.round(x.seconds * 10) / 10 }));
}
