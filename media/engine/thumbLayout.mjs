/**
 * The trending thumbnail layouts, as geometry — one plan, two painters.
 *
 * The media engine (server.mjs) turns a plan into an FFmpeg graph and an ASS
 * file and makes the PNG; the designer in the browser
 * (src/components/VideoStudio/ThumbnailDesigner.tsx) draws the same plan with
 * CSS and SVG as its live preview. Because both read the same numbers — where
 * the face lands, how big each line of words is and where, which word sits in
 * the box, where the arrow starts — the preview is the PNG's layout, not a
 * guess at it. (The preview's fonts and blur are the browser's, so it is
 * close, and says so; the PNG is exact.)
 *
 * Pure, no imports, plain JavaScript: the engine image runs it as it is, and
 * the app and the Worker import it through thumbLayout.d.mts.
 *
 * ── What it draws, and why ──
 *
 * The owner's examples of trending thumbnails (long videos and Shorts) and
 * creators' own advice agree: one subject, a face, big; three to five words,
 * huge, condensed, uppercase, a thick black outline and a drop shadow so they
 * read at phone size; one or two words in a bright accent — coloured, or in a
 * tilted box; a strong colour gradient behind (purple→blue, red→black,
 * orange); a glow on the subject; a vignette; an arrow or ring used sparingly;
 * an emoji-like sticker; a split before/after or "vs"; a bold number; a
 * channel strip. Eight layouts follow that:
 *   bold       face close on one side, the words huge on a gradient panel
 *   callout    the whole frame, a ring round the face and an arrow to it
 *   cinematic  letterboxed and graded, small wide words — finance, documentary
 *   split      two moments side by side; "A vs B" puts each half under its own
 *   number     the figure in the words, enormous, on an accent tile
 *   glow       the frame blurred into the gradient, the face sharp in a glow —
 *              a spotlight, not a cut-out (background removal needs a provider)
 *   headline   words first: huge stacked lines over a darkened frame
 *   short      the 9:16 Shorts cover: face high, a strip on top, words low
 *
 * Layout names, sticker names and every choice are fixed lists here. A request
 * carries names, numbers and colours; anything else falls back to a default.
 * Nothing a customer types becomes filter text: the engine builds its graph
 * from this plan's numbers, and the words go only into ASS text (escaped).
 */

export const TREND_LAYOUTS = ['bold', 'callout', 'cinematic', 'split', 'number', 'glow', 'headline', 'short'];
export const STICKERS = ['check', 'cross', 'up', 'down', 'money', 'alert', 'question', 'star'];
export const SIDES = ['auto', 'left', 'right', 'center'];
export const TEXT_POS = ['auto', 'top', 'middle', 'bottom'];
export const POINTERS = ['auto', 'none', 'arrow', 'circle', 'both'];
export const HL_STYLES = ['color', 'box'];

const HEX = /^#[0-9a-fA-F]{6}$/;
const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const pick = (v, list, d) => (list.includes(v) ? v : d);
const hex = (v, d) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : d);
const r1 = n => Math.round(n * 10) / 10;

/** Black or white, whichever reads on this colour. */
export function inkOn(bg) {
  const h = hex(bg, '#000000');
  const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.32 ? '#0b0b0f' : '#ffffff';
}

/* A figure worth a tile: "$49", "30%", "10x", "4 million", "8 hours", "#10". */
export const NUMBER = /#?[$€£₺₨]?\d[\d.,]*(?:\s?(?:%|[kKmMbB](?![a-z])|[xX](?![a-z])|\+))?(?:\s(?:million|billion|thousand|percent|hours?|days?|minutes?|years?))?/i;
const RTL = /[֐-ࣿיִ-﷿ﹰ-ﻼ]/;

/** The words, kept to what a thumbnail can hold. */
const cleanText = t => String(t ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
const bare = w => w.replace(/[^\p{L}\p{N}$€£%#]/gu, '');

/**
 * Every field of a thumbnail request, defaulted and clamped. Older specs
 * (before these options) come out exactly as they were drawn.
 */
export function normaliseSpec(it) {
  const s = it ?? {};
  const layout = pick(String(s.layout), TREND_LAYOUTS, 'bold');
  return {
    layout,
    text: cleanText(s.text) || 'Watch this',
    highlight: String(s.highlight ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 30),
    accent: hex(s.accent, '#facc15'),
    color: hex(s.color, '#0b0b12'),
    color2: hex(s.color2, ''),
    textColor: hex(s.textColor, '#ffffff'),
    border: s.border !== false,
    zoom: clamp(s.zoom, 0, 1, 0.5),
    hlStyle: pick(s.hlStyle, HL_STYLES, layout === 'glow' || layout === 'headline' || layout === 'short' ? 'box' : 'color'),
    side: pick(s.side, SIDES, 'auto'),
    textPos: pick(s.textPos, TEXT_POS, 'auto'),
    textSize: clamp(s.textSize, 0.6, 1.4, 1),
    sticker: pick(s.sticker, STICKERS, ''),
    pointer: pick(s.pointer, POINTERS, 'auto'),
    badge: cleanText(s.badge).slice(0, 28),
  };
}

/* ── Words into lines ─────────────────────────────────────────────────────── */

/**
 * Sizes are ASS font sizes, which in libass are the font's whole height
 * (ascent + descent) — for Noto Sans the em is 0.734 of it, which is what the
 * browser preview sets as its CSS font-size (`EM`). A bold capital advances
 * about 0.62 em, so 0.46 of an ASS size before the 90% condensing; measured
 * on the engine's own PNGs, with a little room to spare.
 */
const CHAR = 0.48;
/**
 * The glow behind a spotlit subject: a ring of the accent, alpha `max` (of
 * 255), rising from `inner` spot-radii and fading out by `outer` — a ring, so
 * the middle of the subject is never tinted even where the spotlight thins.
 */
export const HALO = { max: 200, inner: 0.88, rise: 0.14, outer: 1.25, soft: 0.3 };
export const CONDENSE = 90;
export const EM = 0.734;

/**
 * Lines of words for a box `area` ({x, y, w, h}): as large as fits, at most
 * `size` tall, two or three words a line; with a boxed highlight its word gets
 * a line of its own (that is how the examples do it). Each line is runs of
 * {t, color} so one word can be the accent.
 */
function setLines(sp, area, { size, per = 2, maxLines = 4, align = 'center', anchor = 'middle', box = null, upper = true, gap = 1.06, color, spacing = 0 }) {
  const rtl = RTL.test(sp.text);
  const shown = upper && !rtl ? sp.text.toLocaleUpperCase() : sp.text;
  const words = shown.split(' ').filter(Boolean);
  const hl = bare(String(sp.highlight).toLocaleUpperCase());
  const isHl = w => !!hl && bare(w.toLocaleUpperCase()) === hl;
  const boxed = box && sp.hlStyle === 'box' && words.some(isHl);
  const groups = [];
  let cur = [];
  /* A run of words into lines of even length — "OF WORK / IN 1", never "OF WORK IN / 1". */
  const flush = () => {
    if (!cur.length) return;
    const k = Math.ceil(cur.length / per), each = Math.ceil(cur.length / k);
    for (let i = 0; i < cur.length; i += each) groups.push({ words: cur.slice(i, i + each), box: false });
    cur = [];
  };
  for (const w of words) {
    if (boxed && isHl(w)) { flush(); groups.push({ words: [w], box: true }); continue; }
    cur.push(w);
  }
  flush();
  /* More lines than room: the last ones join the line before. */
  while (groups.length > maxLines) {
    const last = groups.pop();
    const prev = groups[groups.length - 1];
    if (prev.box || last.box) { groups.splice(groups.length - 1, 1, { words: [...prev.words, ...last.words], box: false }); } else prev.words.push(...last.words);
  }
  const lens = groups.map(g => g.words.join(' ').length + (g.box ? 0.6 : 0));
  const longest = Math.max(1, ...lens);
  const n = groups.length;
  const condense = CONDENSE / 100;
  let fs = Math.min(size * sp.textSize, area.w / (longest * CHAR * condense + (boxed ? 0.3 : 0.1)), area.h / (n * gap + (boxed ? 0.3 : 0)));
  fs = Math.max(14, Math.round(fs));
  const lh = fs * gap;
  const total = lh * n + (boxed ? fs * 0.25 : 0);
  const top = anchor === 'top' ? area.y : anchor === 'bottom' ? area.y + area.h - total : area.y + (area.h - total) / 2;
  const x = align === 'left' ? area.x : align === 'right' ? area.x + area.w : area.x + area.w / 2;
  let y = top;
  const out = [];
  for (const g of groups) {
    const h = g.box ? lh + fs * 0.25 : lh;
    const text = g.words.join(' ');
    const line = {
      x: r1(x), y: r1(y + h / 2), fs, align, font: rtl ? 'Noto Naskh Arabic' : 'Noto Sans',
      /* Estimated width, for placing the arrow and the sticker clear of the words. */
      w: Math.round(text.length * CHAR * condense * fs + (g.box ? fs * 0.28 : 0)),
      runs: g.words.map((w, i) => ({ t: (i ? ' ' : '') + w, color: !g.box && isHl(w) ? sp.accent : g.box ? inkOn(box) : color })),
      box: g.box ? { color: box, pad: Math.round(fs * 0.14), tilt: -3 } : null,
      stroke: g.box ? 0 : Math.max(2, Math.round(fs * 0.075)),
      shadow: Math.max(2, Math.round(fs * 0.06)),
      glow: g.box ? 0 : Math.round(fs * 0.16),
      spacing,
    };
    out.push(line);
    y += h;
  }
  return out;
}

/* ── Shapes, in pixels, for ASS (m … l …) and SVG (M … L … Z) alike ──────── */

/** An arrow from (x1,y1) to (x2,y2) as one filled polygon. */
export function arrowPoly(x1, y1, x2, y2, width) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const head = Math.min(len * 0.45, width * 3.2), hw = width * 1.6, w = width / 2;
  const bx = x2 - ux * head, by = y2 - uy * head;
  return [[x1 + nx * w, y1 + ny * w], [bx + nx * w, by + ny * w], [bx + nx * hw, by + ny * hw], [x2, y2], [bx - nx * hw, by - ny * hw], [bx - nx * w, by - ny * w], [x1 - nx * w, y1 - ny * w]].map(([a, b]) => [Math.round(a), Math.round(b)]);
}

/** A sticker: a coloured disc and its mark — a polygon, or a glyph from the font. */
export function stickerShape(name, cx, cy, r) {
  const P = pts => pts.map(([a, b]) => [Math.round(cx + a * r), Math.round(cy + b * r)]);
  const star = n => Array.from({ length: n * 2 }, (_, i) => { const a = (Math.PI / n) * i - Math.PI / 2; const k = i % 2 ? 0.42 : 0.92; return [Math.cos(a) * k, Math.sin(a) * k]; });
  switch (name) {
    case 'check': return { disc: '#22c55e', mark: P([[-0.48, 0.02], [-0.3, -0.16], [-0.12, 0.04], [0.32, -0.42], [0.5, -0.24], [-0.12, 0.38]]), glyph: '' };
    case 'cross': return { disc: '#ef4444', mark: P([[-0.42, -0.26], [-0.26, -0.42], [0, -0.16], [0.26, -0.42], [0.42, -0.26], [0.16, 0], [0.42, 0.26], [0.26, 0.42], [0, 0.16], [-0.26, 0.42], [-0.42, 0.26], [-0.16, 0]]), glyph: '' };
    case 'up': return { disc: '#16a34a', mark: P([[0, -0.52], [0.44, -0.04], [0.16, -0.04], [0.16, 0.46], [-0.16, 0.46], [-0.16, -0.04], [-0.44, -0.04]]), glyph: '' };
    case 'down': return { disc: '#dc2626', mark: P([[0, 0.52], [0.44, 0.04], [0.16, 0.04], [0.16, -0.46], [-0.16, -0.46], [-0.16, 0.04], [-0.44, 0.04]]), glyph: '' };
    case 'star': return { disc: '#f59e0b', mark: P(star(5)), glyph: '' };
    case 'money': return { disc: '#15803d', mark: null, glyph: '$' };
    case 'alert': return { disc: '#f97316', mark: null, glyph: '!' };
    case 'question': return { disc: '#2563eb', mark: null, glyph: '?' };
    default: return null;
  }
}

/* ── The plan ─────────────────────────────────────────────────────────────── */

/**
 * One thumbnail as geometry, in output pixels.
 *   it      the request (normaliseSpec'd here)
 *   W, H    the PNG's size (1280×720 for a long video, 1080×1920 for a Short)
 *   src     the frame's own size {w, h}
 *   face    the largest face in the frame as fractions {x, y, w, h}, or null —
 *           then nothing is ringed or glowed round, because circling nothing in
 *           particular is the clickbait the advice warns against.
 *   face2   the second moment's face, for "split" (each half frames its own).
 * Returns everything both painters need; `layout` is what was actually drawn
 * ("number" with no figure in the words is drawn as "bold", "short" on a
 * landscape picture as "bold").
 */
export function thumbPlan(it, W, H, src, face, face2 = null) {
  const sp = normaliseSpec(it);
  const portrait = H > W;
  const srcW = Math.max(1, Number(src?.w) || W), srcH = Math.max(1, Number(src?.h) || H);
  let layout = sp.layout;
  if (layout === 'number' && !NUMBER.test(sp.text)) layout = 'bold';
  if (layout === 'short' && !portrait) layout = 'bold';
  const c0 = sp.color, c1 = sp.color2 || shade(sp.color, layout === 'glow' || layout === 'headline' ? 0.55 : 0.2);
  const fx = face ? face.x + face.w / 2 : 0.5, fy = face ? face.y + face.h / 2 : 0.45;
  /** The crop of a frame that puts its face at (px, py) of an OW×OH picture, `fh` of its height tall — and where the face really lands. */
  const aimAt = (f, OW, OH, px, py, fh) => {
    const cx0 = f ? f.x + f.w / 2 : 0.5, cy0 = f ? f.y + f.h / 2 : 0.45;
    let s = f ? (fh * OH) / (f.h * srcH) : Math.max(OW / srcW, OH / srcH);
    s = Math.max(s, OW / srcW, OH / srcH);
    const cw = Math.min(srcW, OW / s), ch = Math.min(srcH, OH / s);
    const x = Math.min(srcW - cw, Math.max(0, cx0 * srcW - px * cw)), y = Math.min(srcH - ch, Math.max(0, cy0 * srcH - py * ch));
    /* Where the face really lands once the crop met the edge of the frame. */
    const scale = OW / cw;
    const at = f ? { cx: (cx0 * srcW - x) * scale, cy: (cy0 * srcH - y) * scale, rx: (f.w * srcW * scale) / 2, ry: (f.h * srcH * scale) / 2 } : null;
    return { crop: { x: Math.round(x), y: Math.round(y), w: Math.round(cw), h: Math.round(ch) }, at };
  };
  const aim = (px, py, fh) => aimAt(face, W, H, px, py, fh);
  const plan = {
    layout, portrait, W, H, spec: sp,
    crop: null, crop2: null,
    grade: { contrast: 1.12, saturation: 1.3, brightness: 0, sharpen: true, cinematic: false, blur: 0 },
    fills: [], spot: null, halo: null, vignette: false, bars: 0,
    edge: sp.border ? { color: sp.accent, t: Math.round(Math.min(W, H) * 0.018) } : null,
    lines: [], ring: null, arrow: null, sticker: null, badge: null, tile: null, split: null, rule: null,
  };
  /** The words' side when the face is on the other: the face goes where `side` says, or where it is. */
  const faceLeft = sp.side === 'left' ? true : sp.side === 'right' ? false : fx <= 0.5;
  const centred = sp.side === 'center';
  const vAnchor = d => (sp.textPos === 'auto' ? d : sp.textPos);
  const pointer = sp.pointer === 'auto' ? (layout === 'callout' ? 'both' : 'none') : sp.pointer;
  let faceAt = null;

  if (layout === 'bold' || layout === 'number' || layout === 'glow' || layout === 'headline' || layout === 'short') {
    if (portrait) {
      const fh = layout === 'short' ? 0.26 + 0.14 * sp.zoom : layout === 'headline' ? 0.2 : 0.3 + 0.18 * sp.zoom;
      const a = aim(0.5, layout === 'short' ? 0.34 : 0.32, fh);
      plan.crop = a.crop; faceAt = a.at;
      plan.fills.push({ alpha: { axis: 'y', from: 0.42, to: 0.66, max: 0.94 }, c0solid: c0, c1solid: c1 });
    } else if (centred || layout === 'headline') {
      const a = aim(0.5, layout === 'headline' ? 0.42 : 0.36, layout === 'headline' ? 0.42 : 0.42 + 0.2 * sp.zoom);
      plan.crop = a.crop; faceAt = a.at;
      if (layout !== 'headline') plan.fills.push({ alpha: { axis: 'y', from: 0.5, to: 0.78, max: 0.92 }, c0solid: c0, c1solid: c1 });
    } else {
      const a = aim(faceLeft ? 0.3 : 0.7, 0.46, 0.5 + 0.28 * sp.zoom);
      plan.crop = a.crop; faceAt = a.at;
      plan.fills.push(faceLeft
        ? { alpha: { axis: 'x', from: 0.4, to: 0.6, max: 0.93 }, c0solid: c0, c1solid: c1 }
        : { alpha: { axis: 'x', from: 0.6, to: 0.4, max: 0.93 }, c0solid: c0, c1solid: c1 });
    }
    if (layout === 'glow' || layout === 'headline') {
      /* The frame becomes the background: blurred and drenched in the gradient. */
      plan.grade = { contrast: 1.08, saturation: 1.1, brightness: layout === 'headline' ? -0.12 : -0.05, sharpen: false, cinematic: false, blur: layout === 'headline' ? Math.round(Math.min(W, H) * 0.012) : Math.round(Math.min(W, H) * 0.03) };
      plan.fills = [{ alpha: { axis: 'full', max: layout === 'headline' ? 0.72 : 0.62 }, c0solid: c0, c1solid: c1, angle: 135 }];
      if (layout === 'headline') plan.fills.push({ alpha: { axis: 'y', from: 0.35, to: 1, max: 0.6 }, c0solid: '#000000', c1solid: '#000000' });
      plan.vignette = true;
    }
    if (layout === 'glow' || (layout === 'short' && faceAt)) {
      const at = faceAt ?? { cx: (portrait ? 0.5 : faceLeft ? 0.3 : 0.7) * W, cy: (portrait ? 0.32 : 0.46) * H, rx: Math.min(W, H) * 0.14, ry: Math.min(W, H) * 0.18 };
      /* The subject sharp in a spotlight round the head and shoulders, feathered
         into the background — and, round a found face only, a glow of the
         accent behind it, so the subject seems lit from behind. Without a
         person cut out (that needs background removal, which is not here),
         this is the honest version of the "face on a glowing gradient" look. */
      const k = portrait ? 1.8 : 2.0;
      plan.spot = { cx: r1(at.cx), cy: r1(at.cy + at.ry * 0.2), rx: r1(at.rx * k), ry: r1(at.ry * k * 1.08), feather: 0.32 };
      if (faceAt) plan.halo = { ...plan.spot, color: sp.accent };
    }
    /* The words' room. */
    let area, align = 'center', anchor = 'middle', size;
    if (portrait) {
      area = layout === 'short' ? { x: W * 0.07, y: H * 0.55, w: W * 0.86, h: H * 0.32 } : { x: W * 0.06, y: H * 0.62, w: W * 0.88, h: H * 0.3 };
      anchor = vAnchor(layout === 'short' ? 'middle' : 'middle');
      if (sp.textPos === 'top') area = { x: W * 0.06, y: H * 0.08, w: W * 0.88, h: H * 0.26 };
      size = H * (layout === 'short' ? 0.1 : 0.095);
    } else if (layout === 'headline') {
      area = { x: W * 0.06, y: H * 0.08, w: W * 0.88, h: H * 0.84 };
      anchor = vAnchor('middle'); size = H * 0.24;
    } else if (centred) {
      area = sp.textPos === 'top' ? { x: W * 0.05, y: H * 0.05, w: W * 0.9, h: H * 0.3 } : { x: W * 0.05, y: H * 0.62, w: W * 0.9, h: H * 0.32 };
      size = H * 0.17;
    } else {
      area = faceLeft ? { x: W * 0.58, y: H * 0.07, w: W * 0.39, h: H * 0.86 } : { x: W * 0.03, y: H * 0.07, w: W * 0.39, h: H * 0.86 };
      anchor = vAnchor('middle'); size = H * 0.19;
    }
    if (layout === 'number') {
      const n = (sp.text.match(NUMBER) ?? [''])[0].trim();
      const rest = sp.text.replace(n, '').replace(/\s+/g, ' ').trim();
      const tile = portrait ? { x: W * 0.12, y: H * 0.64, w: W * 0.76, h: H * 0.15 } : { x: area.x + area.w * 0.04, y: H * 0.12, w: area.w * 0.92, h: H * 0.42 };
      plan.tile = { ...roundBox(tile), color: sp.accent };
      plan.lines.push(...setLines({ ...sp, text: n, highlight: '' }, { x: tile.x + tile.w * 0.05, y: tile.y, w: tile.w * 0.9, h: tile.h }, { size: tile.h * 0.86, per: 3, maxLines: 1, color: inkOn(sp.accent) })
        .map(l => ({ ...l, stroke: 0, glow: 0, shadow: 0 })));
      if (rest) plan.lines.push(...setLines({ ...sp, text: rest }, portrait ? { x: W * 0.06, y: H * 0.81, w: W * 0.88, h: H * 0.13 } : { x: area.x, y: H * 0.58, w: area.w, h: H * 0.32 },
        { size: H * (portrait ? 0.05 : 0.11), per: 3, maxLines: 2, color: sp.textColor, box: sp.accent }));
    } else {
      plan.lines = setLines(sp, area, { size, per: layout === 'headline' ? 3 : 2, maxLines: layout === 'headline' ? 4 : 4, align, anchor, color: sp.textColor, box: sp.accent });
    }
    if (layout === 'short' && sp.badge) plan.badge = { ...roundBox({ x: W * 0.2, y: H * 0.045, w: W * 0.6, h: H * 0.045 }), text: sp.badge, color: '#000000', ink: '#ffffff', bar: sp.accent };
  } else if (layout === 'callout') {
    const cf = portrait ? 0.24 + 0.1 * sp.zoom : 0.42 + 0.2 * sp.zoom;
    const [px, py] = portrait ? [0.5, 0.58] : centred ? [0.5, 0.56] : [faceLeft ? 0.38 : 0.62, 0.5];
    const a = aim(px, py, face ? cf : 0.4);
    plan.crop = a.crop; faceAt = a.at;
    plan.grade = { contrast: 1.1, saturation: 1.35, brightness: 0, sharpen: true, cinematic: false, blur: 0 };
    plan.vignette = true;
    const textLeft = portrait || !faceAt || !faceLeft || centred;
    const anchor = vAnchor('top');
    const area = portrait ? { x: W * 0.05, y: anchor === 'bottom' ? H * 0.78 : H * 0.05, w: W * 0.9, h: H * 0.17 }
      : { x: textLeft ? W * 0.04 : W * 0.5, y: anchor === 'bottom' ? H * 0.62 : H * 0.05, w: W * 0.46, h: H * 0.33 };
    plan.lines = setLines(sp, area, { size: H * (portrait ? 0.085 : 0.15), per: 2, maxLines: 3, align: textLeft ? 'left' : 'right', anchor: anchor === 'bottom' ? 'bottom' : 'top', color: sp.textColor, box: sp.accent });

  } else if (layout === 'cinematic') {
    const a = aim(0.5, 0.42, 0.38);
    plan.crop = a.crop; faceAt = a.at;
    plan.grade = { contrast: 1.08, saturation: 0.72, brightness: 0, sharpen: false, cinematic: true, blur: 0 };
    plan.vignette = true;
    plan.bars = Math.round(H * (portrait ? 0.06 : 0.1));
    const top = sp.textPos === 'top';
    plan.rule = { ...roundBox({ x: W * 0.42, y: top ? H * 0.33 : H * 0.69, w: W * 0.16, h: Math.max(3, H * 0.006) }), color: sp.accent };
    plan.lines = setLines(sp, top ? { x: W * 0.07, y: H * 0.13, w: W * 0.86, h: H * 0.18 } : { x: W * 0.07, y: H * 0.72, w: W * 0.86, h: H * 0.16 },
      { size: H * (portrait ? 0.045 : 0.085), per: 4, maxLines: 2, color: sp.textColor, spacing: Math.round(H * 0.006), box: null })
      .map(l => ({ ...l, stroke: Math.max(1, Math.round(l.fs * 0.03)), glow: Math.round(l.fs * 0.12) }));
  } else if (layout === 'split') {
    plan.split = { vertical: portrait, divider: { color: sp.accent, t: Math.round((portrait ? H : W) * 0.012) }, vs: null };
    const vs = sp.text.match(/^(.*?)\s+(?:vs\.?|versus|→|->)\s+(.*)$/i);
    const half = portrait ? { w: W, h: H / 2 } : { w: W / 2, h: H };
    /* Each half framed on its own face (or its middle), not cut blindly down the centre. */
    plan.crop = aimAt(face, half.w, half.h, 0.5, portrait ? 0.4 : 0.42, face ? 0.45 : 0.4).crop;
    plan.crop2 = aimAt(face2 ?? face, half.w, half.h, 0.5, portrait ? 0.4 : 0.42, (face2 ?? face) ? 0.45 : 0.4).crop;
    if (vs) {
      const r = Math.round(Math.min(W, H) * 0.085);
      plan.split.vs = { cx: W / 2, cy: H / 2, r, color: sp.accent, ink: inkOn(sp.accent), text: 'VS' };
      const [a, b] = [vs[1], vs[2]];
      const sz = { size: H * (portrait ? 0.05 : 0.11), per: 2, maxLines: 2, color: sp.textColor, box: sp.accent };
      plan.lines = portrait
        ? [...setLines({ ...sp, text: a }, { x: W * 0.06, y: H * 0.3, w: W * 0.88, h: H * 0.15 }, sz), ...setLines({ ...sp, text: b }, { x: W * 0.06, y: H * 0.8, w: W * 0.88, h: H * 0.15 }, sz)]
        : [...setLines({ ...sp, text: a }, { x: W * 0.03, y: H * 0.66, w: W * 0.42, h: H * 0.28 }, sz), ...setLines({ ...sp, text: b }, { x: W * 0.55, y: H * 0.66, w: W * 0.42, h: H * 0.28 }, sz)];
    } else {
      plan.lines = setLines(sp, portrait ? { x: W * 0.05, y: H * 0.42, w: W * 0.9, h: H * 0.16 } : { x: W * 0.05, y: H * (sp.textPos === 'top' ? 0.06 : 0.7), w: W * 0.9, h: H * 0.26 },
        { size: H * (portrait ? 0.06 : 0.12), per: 3, maxLines: 2, color: sp.textColor, box: sp.accent });
    }
    plan.half = half;
  }
  plan.faceAt = faceAt;
  /* The words' footprint, so the arrow, the ring and the sticker keep clear of them. */
  const boxes = plan.lines.map(lineRect);
  if (plan.tile) boxes.push({ x0: plan.tile.x, y0: plan.tile.y, x1: plan.tile.x + plan.tile.w, y1: plan.tile.y + plan.tile.h });
  const block = boxes.length ? { x0: Math.min(...boxes.map(b => b.x0)), y0: Math.min(...boxes.map(b => b.y0)), x1: Math.max(...boxes.map(b => b.x1)), y1: Math.max(...boxes.map(b => b.y1)) } : null;
  /* The ring and the arrow point at a found face only (split shows two moments, so neither). */
  if (faceAt && layout !== 'split') {
    const ring = { cx: r1(faceAt.cx), cy: r1(faceAt.cy), rx: r1(faceAt.rx * (portrait ? 1.35 : 1.5)), ry: r1(faceAt.ry * (portrait ? 1.3 : 1.42)) };
    const wantRing = pointer === 'circle' || pointer === 'both';
    if (wantRing) plan.ring = { ...ring, color: '#ef4444', t: Math.round(Math.min(W, H) * 0.012) };
    if ((pointer === 'arrow' || pointer === 'both') && block) {
      /* From the words to the edge of the ring (or of the face), pointing in — starting
         from the side of the words that faces it, and never from inside the target. */
      const tgt = wantRing ? ring : { cx: ring.cx, cy: ring.cy, rx: faceAt.rx * 1.15, ry: faceAt.ry * 1.15 };
      const gap = Math.min(W, H) * 0.03;
      const below = block.y0 > tgt.cy + tgt.ry * 0.5, above = block.y1 < tgt.cy - tgt.ry * 0.5;
      const bx = (block.x0 + block.x1) / 2;
      /* Where it could start: the side of the words facing the target, under them, over them. */
      const starts = [
        below || above ? { x: Math.min(block.x1, Math.max(block.x0, bx + (tgt.cx - bx) * 0.4)), y: below ? block.y0 - gap : block.y1 + gap }
          : { x: block.x0 > tgt.cx ? block.x0 - gap : block.x1 + gap, y: (block.y0 + block.y1) / 2 },
        { x: bx + (tgt.cx > bx ? 1 : -1) * (block.x1 - block.x0) * 0.2, y: block.y1 + gap },
        { x: bx + (tgt.cx > bx ? 1 : -1) * (block.x1 - block.x0) * 0.2, y: block.y0 - gap },
      ];
      const want = Math.min(W, H) * 0.17;
      let best = null;
      for (const st of starts) {
        if (st.y < 0 || st.y > H || Math.hypot((st.x - tgt.cx) / tgt.rx, (st.y - tgt.cy) / tgt.ry) < 1.08) continue;
        const ang = Math.atan2(st.y - tgt.cy, st.x - tgt.cx);
        const end = { x: tgt.cx + Math.cos(ang) * tgt.rx * 1.04, y: tgt.cy + Math.sin(ang) * tgt.ry * 1.04 };
        const len = Math.hypot(end.x - st.x, end.y - st.y);
        if (len < Math.min(W, H) * 0.07) continue;
        /* Never through the words. */
        if (crosses(st, end, boxes)) continue;
        if (!best || Math.abs(len - want) < Math.abs(best.len - want)) best = { st, end, len };
      }
      /* No room for one: none is drawn (the designer says so), rather than an arrow through the words. */
      if (best) {
        const { st, end, len } = best;
        /* Too long reads as a line across the picture: shortened from its start. */
        const k = len > want * 1.6 ? (len - want * 1.6) / len : 0;
        const sx = st.x + (end.x - st.x) * k, sy = st.y + (end.y - st.y) * k;
        plan.arrow = { pts: arrowPoly(sx, sy, end.x, end.y, Math.min(W, H) * 0.026), color: '#ef4444' };
      }
    }
  }
  /* A channel strip: small, in a corner the words leave free. */
  if (sp.badge && !plan.badge) {
    const h = Math.round(H * (portrait ? 0.04 : 0.07));
    const w = Math.min(W * 0.6, sp.badge.length * h * 0.32 + h * 1.1);
    const atTop = !(block && block.y0 < H * 0.3);
    const left = !(block && block.x0 < W * 0.3 && !atTop);
    plan.badge = { ...roundBox({ x: left ? W * 0.035 : W - w - W * 0.035, y: atTop ? H * 0.05 + (plan.bars || 0) : H - h - H * 0.05 - (plan.bars || 0), w, h }), text: sp.badge, color: '#000000', ink: '#ffffff', bar: sp.accent };
  }
  if (sp.sticker) {
    const r = Math.round(Math.min(W, H) * (portrait ? 0.075 : 0.085));
    const m = r * 1.25;
    /* Near the face (beside its top, either side), else a free corner: the first place clear of the words, the ring and the arrow. */
    const cands = [];
    if (faceAt) {
      const ox = (plan.ring?.rx ?? faceAt.rx * 1.3) + r * 0.4, oy = (plan.ring?.ry ?? faceAt.ry * 1.3) * 0.75;
      for (const sgn of faceAt.cx < W / 2 ? [1, -1] : [-1, 1]) cands.push([faceAt.cx + sgn * ox, faceAt.cy - oy], [faceAt.cx + sgn * ox, faceAt.cy + oy * 0.6]);
    }
    const top = m + (plan.bars || 0), bottom = H - m - (plan.bars || 0);
    cands.push([W - m, top], [m, top], [W - m, bottom], [m, bottom], [W / 2, top]);
    const arrowBox = plan.arrow ? { x0: Math.min(...plan.arrow.pts.map(q => q[0])), y0: Math.min(...plan.arrow.pts.map(q => q[1])), x1: Math.max(...plan.arrow.pts.map(q => q[0])), y1: Math.max(...plan.arrow.pts.map(q => q[1])) } : null;
    const clear = (cx, cy) => {
      const me = { x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r };
      const hit = b => b && !(me.x1 < b.x0 || me.x0 > b.x1 || me.y1 < b.y0 || me.y0 > b.y1);
      /* Off the ring's line, too: its centre more than a radius from the ellipse. */
      const onRing = plan.ring && Math.abs(Math.hypot((cx - plan.ring.cx) / plan.ring.rx, (cy - plan.ring.cy) / plan.ring.ry) - 1) * Math.min(plan.ring.rx, plan.ring.ry) < r * 1.1;
      return cx >= m * 0.9 && cx <= W - m * 0.9 && cy >= m * 0.9 && cy <= H - m * 0.9 && !boxes.some(hit) && !hit(arrowBox) && !onRing && !(plan.badge && hit({ x0: plan.badge.x, y0: plan.badge.y, x1: plan.badge.x + plan.badge.w, y1: plan.badge.y + plan.badge.h }));
    };
    const [cx, cy] = cands.find(([x, y]) => clear(x, y)) ?? cands[cands.length - 1];
    const shape = stickerShape(sp.sticker, cx, cy, r);
    if (shape) plan.sticker = { name: sp.sticker, cx: Math.round(cx), cy: Math.round(cy), r, ...shape };
  }
  return plan;
}

const roundBox = b => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) });

/** Does the segment a→b pass through any of these rectangles? (sampled — the arrow is wide, the words are big) */
function crosses(a, b, rects) {
  for (let i = 1; i < 24; i++) {
    const x = a.x + ((b.x - a.x) * i) / 24, y = a.y + ((b.y - a.y) * i) / 24;
    if (rects.some(r => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1)) return true;
  }
  return false;
}

/** Where a line of words sits, as a rectangle (its estimated width, its full height). */
export function lineRect(l) {
  const x0 = l.align === 'left' ? l.x : l.align === 'right' ? l.x - l.w : l.x - l.w / 2;
  const pad = l.box ? l.box.pad : l.stroke;
  return { x0: x0 - pad, x1: x0 + l.w + pad, y0: l.y - l.fs * 0.55 - pad, y1: l.y + l.fs * 0.55 + pad };
}

/** A darker (k < 0.5) or a hue-shifted partner for a one-colour gradient: the same colour toward black. */
export function shade(h, k) {
  const c = hex(h, '#0b0b12');
  const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const m = v => Math.round(v * (1 - k)).toString(16).padStart(2, '0');
  return `#${m(r)}${m(g)}${m(b)}`;
}

/** Split a #rrggbb into numbers (the engine builds its colour expressions from these, never from text). */
export const rgbOf = h => { const c = hex(h, '#000000'); return [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); };
