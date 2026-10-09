/**
 * Choosing Shorts, and the words that go with every video.
 *
 * The AI reads the transcript and names passages by sentence number; nothing
 * it says is used until it has been checked here against the transcript:
 * whole sentences only (a Short never starts mid-word), the length asked
 * for, no two Shorts covering the same ground, no two on the same topic.
 * Without AI the passages are chosen by rule and the screen says so — a
 * passage between two pauses, complete sentences, spread across the
 * recording — with no scores, because a score nobody computed is invented.
 *
 * Scores are editorial estimates (hook, clarity, relevance, completeness,
 * 1–5). Nothing here predicts reach, views or "virality"; there is no data
 * that could support it.
 *
 * Pure: imported by the browser too.
 */
import type { Clip, Scores, Sentence } from './edit';

export interface ShortOpts { count: number; min: number; max: number; aspect: Clip['aspect'] }

/** The transcript as the AI sees it: numbered sentences with times. Capped so a three-hour recording still fits. */
export function transcriptForAi(sentences: Sentence[], maxChars = 90_000): string {
  const lines: string[] = [];
  let n = 0;
  for (const s of sentences) {
    const mm = Math.floor(s.s / 60), ss = Math.floor(s.s % 60);
    const line = `[${s.i}] (${mm}:${String(ss).padStart(2, '0')}) ${s.text}`;
    n += line.length + 1;
    if (n > maxChars) break;
    lines.push(line);
  }
  return lines.join('\n');
}

export interface RawPick {
  start_sentence?: unknown; end_sentence?: unknown; title?: unknown; topic?: unknown; reason?: unknown;
  hook?: unknown; clarity?: unknown; relevance?: unknown; completeness?: unknown;
}

const words = (s: string) => new Set(s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 2));
function similar(a: string, b: string): number {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size);
}
const overlap = (a: [number, number], b: [number, number]) => Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
const txt = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const score = (v: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : 3; };

/** Grow or shrink a sentence range to the length asked for, on sentence boundaries. */
function fit(sentences: Sentence[], a: number, b: number, min: number, max: number): [number, number] | null {
  if (a < 0 || b >= sentences.length || b < a) return null;
  const len = () => sentences[b].e - sentences[a].s;
  while (len() > max && b > a) b--;
  while (len() < min && b + 1 < sentences.length && sentences[b + 1].e - sentences[a].s <= max) b++;
  while (len() < min && a > 0 && sentences[b].e - sentences[a - 1].s <= max) a--;
  if (len() < Math.min(min, 8) || len() > max + 5) return null;
  return [a, b];
}

/**
 * The AI's picks, checked. Each becomes a clip on whole sentences, inside the
 * length range, overlapping no earlier pick by more than a fifth of the
 * shorter, on a topic not already taken.
 */
export function validatePicks(raw: RawPick[], sentences: Sentence[], opts: ShortOpts, taken: Clip[] = []): Clip[] {
  const out: Clip[] = [];
  const all = () => [...taken, ...out];
  for (const p of raw) {
    if (out.length >= opts.count) break;
    const a = Math.round(Number(p.start_sentence)), b = Math.round(Number(p.end_sentence));
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    let lo = a, hi = Math.max(a, b);
    /* A passage running into one already chosen is trimmed to the sentences
       outside it — two Shorts never share more than a breath of footage. */
    for (const c of all()) {
      while (lo <= hi && sentences[lo] && sentences[lo].s < c.e - 1 && sentences[lo].e > c.s + 1 && sentences[lo].s >= c.s) lo++;
      while (hi >= lo && sentences[hi] && sentences[hi].e > c.s + 1 && sentences[hi].s < c.e - 1 && sentences[hi].e <= c.e) hi--;
    }
    if (lo > hi) continue;
    const f = fit(sentences, lo, hi, opts.min, opts.max);
    if (!f) continue;
    const span: [number, number] = [sentences[f[0]].s, sentences[f[1]].e];
    const title = txt(p.title, 100), topic = txt(p.topic, 80);
    if (!title) continue;
    if (all().some(c => overlap([c.s, c.e], span) > 1)) continue;
    if (all().some(c => similar(c.topic || c.title, topic || title) >= 0.75)) continue;
    const scores: Scores = { hook: score(p.hook), clarity: score(p.clarity), relevance: score(p.relevance), completeness: score(p.completeness) };
    out.push({ id: `cl-${f[0]}-${f[1]}`, title, topic, reason: txt(p.reason, 240) || 'A complete point on its own', s: span[0], e: span[1],
      scores, by: 'ai', aspect: opts.aspect, reframe: { mode: 'crop', x: 0.5, y: 0.5 } });
  }
  return out;
}

const STOP = new Set(('the a an and or but so to of in on for with at by from is are was were be been it this that these those i you we they he she ' +
  'my your our their me us them as if then than just really very um uh like know think going get got have has had do does did can could would should will ' +
  'about into out up down over what which who when where why how there here also more some any all one two not no yes okay ok right well now ' +
  've bir ve bu da de için ile çok gibi ama ben sen biz siz o').split(' '));

export function keywordsOf(text: string, n = 6): string[] {
  const counts = new Map<string, number>();
  for (const w of text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)) {
    if (w.length < 4 || STOP.has(w) || /^\d+$/.test(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, n).map(([w]) => w);
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Without AI: complete passages that begin after a pause, end on a full
 * stop, and are spread across the recording. Labelled as chosen by rule.
 */
export function fallbackPicks(sentences: Sentence[], opts: ShortOpts, taken: Clip[] = []): Clip[] {
  if (!sentences.length || opts.count <= 0) return [];
  const target = (opts.min + opts.max) / 2;
  const windows: { a: number; b: number; s: number; e: number; score: number }[] = [];
  for (let a = 0; a < sentences.length; a++) {
    const pauseBefore = a === 0 ? 2 : sentences[a].s - sentences[a - 1].e;
    let b = a;
    while (b + 1 < sentences.length && sentences[b + 1].e - sentences[a].s <= target) b++;
    const f = fit(sentences, a, b, opts.min, opts.max);
    if (!f) continue;
    const s = sentences[f[0]].s, e = sentences[f[1]].e;
    const ends = /[.!?…۔؟]["')\]]*$/.test(sentences[f[1]].text) ? 1 : 0;
    windows.push({ a: f[0], b: f[1], s, e, score: Math.min(pauseBefore, 2) + ends - Math.abs(e - s - target) / target });
  }
  const out: Clip[] = [];
  const total = sentences[sentences.length - 1].e;
  /* Spread: the recording is split into as many bands as Shorts asked for,
     and the best passage in each band that overlaps nothing is taken. */
  for (let k = 0; k < opts.count; k++) {
    const lo = (total * k) / opts.count, hi = (total * (k + 1)) / opts.count;
    const pick = windows.filter(w => w.s >= lo - 1 && w.s < hi)
      .filter(w => ![...taken, ...out].some(c => overlap([c.s, c.e], [w.s, w.e]) > 0))
      .sort((x, y) => y.score - x.score)[0];
    if (!pick) continue;
    const text = sentences.slice(pick.a, pick.b + 1).map(s => s.text).join(' ');
    const kw = keywordsOf(text, 3);
    const first = sentences[pick.a].text.split(/\s+/).slice(0, 8).join(' ').replace(/[,.;:!?]+$/, '');
    out.push({ id: `cl-${pick.a}-${pick.b}`, title: titleCase(first), topic: kw.join(', '), reason: 'Chosen without AI: a complete passage between two pauses',
      s: pick.s, e: pick.e, scores: null, by: 'rules', aspect: opts.aspect, reframe: { mode: 'crop', x: 0.5, y: 0.5 } });
  }
  return out;
}

const ASK_NOISE = new Set('find make create give turn show section part bit piece short shorts clip reel about the a an on of one another more strongest best where i talk talks talked my me video please segment moment'.split(' '));

/**
 * "Find the section about AI Prospecting" — the passage where those words
 * are said most, widened to complete sentences of a Short's length. Null when
 * the words are not in the recording: better to say so than to offer a clip
 * about something else.
 */
export function findSection(query: string, sentences: Sentence[], opts: ShortOpts): { a: number; b: number; s: number; e: number; terms: string[] } | null {
  const terms = query.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 1 && !ASK_NOISE.has(w));
  if (!terms.length) return null;
  const stem = (w: string) => w.length > 5 ? w.slice(0, 5) : w;
  const stems = terms.map(stem);
  const hits = sentences.map(s => {
    const ws = s.text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).map(stem);
    return stems.reduce((n, t) => n + (ws.includes(t) ? 1 : 0), 0);
  });
  let best = -1, bestScore = 0;
  for (let j = 0; j < sentences.length; j++) {
    const around = hits[j] * 2 + (hits[j - 1] ?? 0) + (hits[j + 1] ?? 0);
    if (hits[j] > 0 && around > bestScore) { bestScore = around; best = j; }
  }
  if (best < 0 || hits[best] < Math.min(stems.length, 2) * 0.5) return null;
  let a = best;
  while (a > 0 && hits[a - 1] > 0) a--;
  /* Asked for by name, a passage shorter than the usual length is still
     offered — better than saying the subject is not there when it is. */
  const f = fit(sentences, a, best, opts.min, opts.max) ?? fit(sentences, a, best, Math.min(opts.min, 4), opts.max);
  if (!f) return null;
  return { a: f[0], b: f[1], s: sentences[f[0]].s, e: sentences[f[1]].e, terms };
}

/* ── Metadata — for every video, from its own words ──────────────────────── */

export interface VideoMeta {
  titles: string[];
  description: string;
  keywords: string[];
  tags: string[];
  hashtags: string[];
  chapters: { s: number; title: string }[];
  pinnedComment: string;
  cta: string;
  by: 'ai' | 'rules';
}

const uniq = (xs: string[]) => [...new Set(xs.map(x => x.trim()).filter(Boolean))];

export function cleanMeta(raw: Record<string, unknown>, kind: 'long' | 'short', duration: number): VideoMeta | null {
  const list = (v: unknown, n: number, len: number) => (Array.isArray(v) ? v : []).map(x => txt(x, len)).filter(Boolean).slice(0, n);
  const titles = uniq(list(raw.titles, 3, 100));
  const description = txt(raw.description, 4800);
  if (!titles.length || description.length < 20) return null;
  const hashtags = uniq(list(raw.hashtags, 8, 40).map(h => `#${h.replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '')}`).filter(h => h.length > 2));
  let chapters: VideoMeta['chapters'] = [];
  if (kind === 'long' && Array.isArray(raw.chapters)) {
    const cs = (raw.chapters as { s?: unknown; start?: unknown; title?: unknown }[])
      .map(c => ({ s: Math.max(0, Number(c.s ?? c.start)), title: txt(c.title, 80) }))
      .filter(c => Number.isFinite(c.s) && c.s < duration && c.title)
      .sort((a, b) => a.s - b.s);
    /* YouTube's rule: the first at 0:00, at least three, ten seconds apart. */
    for (const c of cs) if (!chapters.length || c.s - chapters[chapters.length - 1].s >= 10) chapters.push(c);
    if (chapters.length) chapters[0].s = 0;
    if (chapters.length < 3) chapters = [];
  }
  return {
    titles, description,
    keywords: uniq(list(raw.keywords, 12, 40)),
    tags: uniq(list(raw.tags, 15, 30)),
    hashtags,
    chapters,
    pinnedComment: txt(raw.pinnedComment ?? raw.pinned_comment, 500),
    cta: txt(raw.cta, 140),
    by: 'ai',
  };
}

/** Without AI: the passage's own first sentence and its commonest words. Plain, true, and labelled. */
export function fallbackMeta(text: string, kind: 'long' | 'short', brand: { company?: string; website?: string; cta?: string }): VideoMeta {
  const kw = keywordsOf(text, 8);
  const first = text.split(/(?<=[.!?…۔؟])\s+/)[0] ?? text;
  const title = titleCase(first.split(/\s+/).slice(0, 10).join(' ').replace(/[,.;:!?]+$/, ''));
  const summary = text.split(/(?<=[.!?…۔؟])\s+/).slice(0, kind === 'short' ? 2 : 4).join(' ').slice(0, 600);
  const cta = brand.cta || (brand.website ? `Learn more at ${brand.website}` : '');
  return {
    titles: [title],
    description: [summary, cta, brand.company ? `— ${brand.company}` : ''].filter(Boolean).join('\n\n'),
    keywords: kw,
    tags: kw.slice(0, 8),
    hashtags: kw.slice(0, kind === 'short' ? 3 : 5).map(k => `#${k.replace(/[^\p{L}\p{N}_]/gu, '')}`),
    chapters: [],
    pinnedComment: '',
    cta,
    by: 'rules',
  };
}

/**
 * Two videos must not carry the same words. When the AI repeats itself, the
 * later one falls back to its own passage's words rather than sharing a title.
 */
export function distinctMeta(items: { id: string; meta: VideoMeta; text: string; kind: 'long' | 'short' }[], brand: { company?: string; website?: string; cta?: string }): Map<string, VideoMeta> {
  const out = new Map<string, VideoMeta>();
  const seenTitles = new Set<string>(), seenDesc = new Set<string>();
  for (const it of items) {
    let m = it.meta;
    const t = m.titles[0]?.toLowerCase() ?? '';
    if (seenTitles.has(t) || seenDesc.has(m.description.toLowerCase())) m = fallbackMeta(it.text, it.kind, brand);
    seenTitles.add(m.titles[0]?.toLowerCase() ?? '');
    seenDesc.add(m.description.toLowerCase());
    out.set(it.id, m);
  }
  return out;
}
