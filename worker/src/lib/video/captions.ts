/**
 * Captions — from the words that survive the edit, on the output's clock.
 *
 * Every caption file is made from `retimeWords` (edit.ts), never stored: a
 * cut moves every caption after it, and a caption kept anywhere but here
 * would be out of step the moment somebody restored a sentence.
 *
 * Three outputs from the same cues: SRT and VTT to download, and ASS for the
 * engine to burn in. ASS goes through libass, which shapes Arabic script
 * (Urdu) and lays it right to left; the Noto fonts in the engine's image
 * cover Turkish's ğ ş ı İ and Urdu. A cue in Arabic script is set in Noto
 * Naskh Arabic — Nastaliq rendered as empty boxes in libass when tested.
 *
 * Pure: imported by the browser too.
 */
import type { CaptionStyle, TimedWord } from './edit';

export interface Cue { s: number; e: number; text: string; words: TimedWord[]; speaker?: number }

const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
export const isRtl = (s: string) => ARABIC.test(s);

/**
 * Words into cues. Shorts read a few words at a time in large type; a long
 * video carries up to two lines. A cue breaks at a sentence's end, at a
 * pause, at a change of speaker, or when it is full.
 */
export function cuesOf(words: TimedWord[], kind: 'long' | 'short'): Cue[] {
  const maxChars = kind === 'short' ? 18 : 84;
  const maxWords = kind === 'short' ? 4 : 16;
  const maxDur = kind === 'short' ? 2.2 : 5;
  const out: Cue[] = [];
  let cur: TimedWord[] = [];
  const flush = () => {
    if (!cur.length) return;
    out.push({ s: cur[0].s, e: cur[cur.length - 1].e, text: cur.map(w => w.w).join(' '), words: cur, speaker: cur[0].sp });
    cur = [];
  };
  for (let j = 0; j < words.length; j++) {
    const w = words[j];
    if (cur.length) {
      const prev = cur[cur.length - 1];
      const len = cur.map(x => x.w).join(' ').length + 1 + w.w.length;
      if (w.s - prev.e > 0.7 || len > maxChars || cur.length >= maxWords || w.e - cur[0].s > maxDur || (w.sp !== undefined && w.sp !== prev.sp)) flush();
    }
    cur.push(w);
    if (/[.!?…۔؟]$/.test(w.w)) flush();
  }
  flush();
  /* A cue stays up until the next begins when the gap is small, so captions
     do not blink off between every phrase; never longer than a beat over. */
  for (let j = 0; j < out.length; j++) {
    const next = out[j + 1];
    out[j].e = next ? Math.min(next.s, Math.max(out[j].e, Math.min(out[j].e + 0.6, next.s))) : out[j].e + 0.4;
    if (out[j].e - out[j].s < 0.5) out[j].e = next ? Math.min(next.s, out[j].s + 0.5) : out[j].s + 0.5;
  }
  return out;
}

const pad = (n: number, l = 2) => String(n).padStart(l, '0');
function stamp(t: number, sep: ',' | '.'): string {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1000, 3)}`;
}

/** Long video lines wrap at about 42 characters, on a word. */
function wrap(text: string, kind: 'long' | 'short'): string {
  if (kind === 'short' || text.length <= 42) return text;
  const words = text.split(' ');
  let best = text, diff = Infinity;
  for (let k = 1; k < words.length; k++) {
    const a = words.slice(0, k).join(' '), b = words.slice(k).join(' ');
    const d = Math.abs(a.length - b.length);
    if (d < diff && a.length <= 46 && b.length <= 46) { diff = d; best = `${a}\n${b}`; }
  }
  return best;
}

export function toSrt(cues: Cue[], kind: 'long' | 'short' = 'long', labels = false): string {
  return cues.map((c, i) => `${i + 1}\n${stamp(c.s, ',')} --> ${stamp(c.e, ',')}\n${labels && c.speaker !== undefined ? `[Speaker ${c.speaker + 1}] ` : ''}${wrap(c.text, kind)}\n`).join('\n');
}

export function toVtt(cues: Cue[], kind: 'long' | 'short' = 'long', labels = false): string {
  const body = cues.map(c => `${stamp(c.s, '.')} --> ${stamp(c.e, '.')}\n${labels && c.speaker !== undefined ? `<v Speaker ${c.speaker + 1}>` : ''}${wrap(c.text, kind).replace(/</g, '&lt;')}`).join('\n\n');
  return `WEBVTT\n\n${body}\n`;
}

/* ── ASS, for burning in ─────────────────────────────────────────────────── */

/** #RRGGBB → ASS &HAABBGGRR. */
function assColour(hex: string, alpha = 0): string {
  const h = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : 'ffffff';
  return `&H${alpha.toString(16).padStart(2, '0')}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
}

/** Text that cannot open an override block or start an escape. */
const assText = (s: string) => s.replace(/[{}]/g, '').replace(/\\/g, '∖').replace(/\n/g, '\\N');

/** Numbers, prices and the keywords given are the words worth a colour. */
const EMPHASIS = /^[$€£₺₨]?\d[\d.,%]*[kKmM%]?$/;

function assTime(t: number): string {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), s = Math.floor((cs % 6000) / 100);
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs % 100)}`;
}

export function toAss(cues: Cue[], st: CaptionStyle, width: number, height: number, kind: 'long' | 'short', keywords: string[] = []): string {
  const portrait = height > width;
  const base = kind === 'short' ? (portrait ? 88 : 64) : Math.round(height * 0.05);
  const size = Math.round(base * st.size);
  const align = st.position === 'top' ? 8 : st.position === 'middle' ? 5 : 2;
  const marginV = st.position === 'middle' ? 0 : Math.round(height * (kind === 'short' && st.position === 'bottom' ? 0.2 : 0.06));
  const outline = st.box ? 0 : st.outline ? Math.max(2, Math.round(size / 14)) : 0;
  const shadow = st.box ? 0 : st.shadow ? Math.max(1, Math.round(size / 28)) : 0;
  const borderStyle = st.box ? 3 : 1;
  const back = st.box ? assColour('#000000', 0x40) : assColour('#000000', 0x80);
  const style = (name: string, font: string) =>
    `Style: ${name},${font},${size},${assColour(st.color)},${assColour(st.highlight)},${assColour('#000000')},${back},-1,0,0,0,100,100,0,0,${borderStyle},${st.box ? Math.round(size / 5) : outline},${shadow},${align},${Math.round(width * 0.06)},${Math.round(width * 0.06)},${marginV},1`;
  const kw = new Set(keywords.map(k => k.toLowerCase()));
  const lines = cues.map(c => {
    const rtl = isRtl(c.text);
    const words = c.words.map(w => {
      const shown = st.uppercase && !rtl ? w.w.toLocaleUpperCase() : w.w;
      const bare = w.w.toLowerCase().replace(/[^\p{L}\p{N}$€£₺₨%.,]/gu, '');
      const hit = (st.preset === 'highlight' || st.preset === 'bold') && (EMPHASIS.test(bare) || kw.has(bare));
      return hit ? `{\\c${assColour(st.highlight)}}${assText(shown)}{\\c${assColour(st.color)}}` : assText(shown);
    });
    const label = st.speakerLabels && c.speaker !== undefined ? `Speaker ${c.speaker + 1}: ` : '';
    const textOut = kind === 'long' ? assText(wrap(label + c.words.map(w => w.w).join(' '), 'long')) : label + words.join(' ');
    return `Dialogue: 0,${assTime(c.s)},${assTime(c.e)},${rtl ? 'Rtl' : 'Main'},,0,0,0,,${textOut}`;
  });
  return [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${width}`, `PlayResY: ${height}`, 'WrapStyle: 0', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    style('Main', 'Noto Sans'), style('Rtl', 'Noto Naskh Arabic'), '',
    '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...lines, '',
  ].join('\n');
}

/* ── Thumbnails' words, set exactly ──────────────────────────────────────── */

/**
 * The headline as an ASS script for one still: the engine draws it with the
 * same shaping as captions, so the text on a thumbnail is exactly what was
 * typed — never an image model's guess at spelling.
 */
export function thumbAss(headline: string, layout: 'left' | 'band' | 'frame', width: number, height: number, accent = '#a3e635'): string {
  const rtl = isRtl(headline);
  const len = headline.length;
  const size = Math.round(height * (len <= 18 ? 0.15 : len <= 34 ? 0.115 : len <= 60 ? 0.09 : 0.07));
  const align = layout === 'band' ? 1 : layout === 'left' ? 4 : 8;
  const marginR = layout === 'left' ? Math.round(width * 0.44) : Math.round(width * 0.06);
  const marginV = layout === 'band' ? Math.round(height * 0.07) : Math.round(height * 0.08);
  const font = rtl ? 'Noto Naskh Arabic' : 'Noto Sans';
  const words = headline.split(/\s+/);
  /* The last word in the accent colour: one emphasised word reads as design;
     every word coloured reads as noise. */
  const shown = words.length > 2 && !rtl
    ? `${assText(words.slice(0, -1).join(' '))} {\\c${assColour(accent)}}${assText(words[words.length - 1])}`
    : assText(headline);
  return [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${width}`, `PlayResY: ${height}`, 'WrapStyle: 0', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: H,${font},${size},&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,${Math.max(3, Math.round(size / 16))},${layout === 'band' ? 0 : 2},${align},${Math.round(width * 0.06)},${marginR},${marginV},1`,
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    `Dialogue: 0,0:00:00.00,0:00:10.00,H,,0,0,0,,${shown}`, '',
  ].join('\n');
}
