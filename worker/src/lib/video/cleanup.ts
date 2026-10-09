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

const FILLER = /^(u+h+m*|u+m+|e+r+m+|e+r+|h+m+|m{2,}h*|a{2,}h*|ah+|e{2,}h*|ı{2,}|i{3,}|öh+m*|eh+m*|hm+)$/i;
const bare = (w: string) => w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
export const isFiller = (w: string) => FILLER.test(bare(w));

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

export function proposeCleanup(words: Word[], silences: [number, number][] | null, preset: CleanupPreset, duration: number): Cut[] {
  const L = LEVEL[preset];
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
     words around it close up naturally rather than leaving two short gaps. */
  for (let j = 0; j < words.length; j++) {
    const w = words[j];
    if (!isFiller(w.w)) continue;
    const prevE = j ? words[j - 1].e : 0, nextS = j + 1 < words.length ? words[j + 1].s : duration;
    const s = Math.max(prevE + 0.02, w.s - 0.06), e = Math.min(nextS - 0.02, w.e + 0.06);
    if (e - s < 0.08) continue;
    /* A whole-token filler is a filler; only a transcriber unsure of what it
       heard lowers that, because then it may have been a real word. */
    const alone = w.s - prevE > 0.12 || nextS - w.e > 0.12;
    const conf = r2(Math.min(0.95, 0.88 + (alone ? 0.04 : 0) - (w.c !== undefined && w.c < 0.5 ? 0.12 : 0)));
    cuts.push({ id: `fil-${w.i}`, s: r2(s), e: r2(e), kind: 'filler', state: L.autoFiller && conf >= 0.85 ? 'approved' : 'proposed', reason: `Filler “${bare(w.w)}”`, conf, by: 'rule' });
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
