/**
 * A logo read in this browser and its plain background taken out — shared
 * by the editor's Logo panel and the Screen Recorder's logo, so the two cut
 * a logo out the same way (the recorder's never leaves this browser).
 */
/** The picture as a canvas no larger than 1024 px on its longest side. */
export async function readPicture(f: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(f);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const k = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d')!.drawImage(img, 0, 0, w, h);
    return c;
  } finally { URL.revokeObjectURL(url); }
}

/**
 * The background taken out: the colour round the edge (the median of the
 * border's pixels) is followed inwards from every edge while it stays close,
 * and made see-through, softly at the boundary. A picture whose edge is
 * already see-through is left alone. Returns a new canvas, trimmed.
 */
export function cutOutBackground(src: HTMLCanvasElement, tolerance: number): { canvas: HTMLCanvasElement; changed: boolean } {
  const w = src.width, h = src.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(src, 0, 0);
  const im = g.getImageData(0, 0, w, h), px = im.data;
  const edge: number[] = [];
  for (let x = 0; x < w; x++) edge.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) edge.push(y * w, y * w + w - 1);
  const clear = edge.filter(i => px[i * 4 + 3] < 24).length;
  if (clear > edge.length * 0.6) return { canvas: trim(c), changed: false };
  const med = (ch: number) => { const v = edge.map(i => px[i * 4 + ch]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const bg = [med(0), med(1), med(2)];
  const T = Math.max(8, tolerance), hard = T * 0.7;
  const dist = (i: number) => Math.hypot(px[i * 4] - bg[0], px[i * 4 + 1] - bg[1], px[i * 4 + 2] - bg[2]);
  const seen = new Uint8Array(w * h);
  const q = new Int32Array(w * h);
  let head = 0, tail = 0, changed = false;
  for (const i of edge) if (!seen[i] && dist(i) <= T) { seen[i] = 1; q[tail++] = i; }
  while (head < tail) {
    const i = q[head++];
    const dd = dist(i);
    const a = dd <= hard ? 0 : Math.round(255 * Math.min(1, (dd - hard) / (T - hard)));
    if (a < px[i * 4 + 3]) { px[i * 4 + 3] = a; changed = true; }
    const x = i % w, y = (i - x) / w;
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
    for (const n of nb) if (n >= 0 && !seen[n] && dist(n) <= T) { seen[n] = 1; q[tail++] = n; }
  }
  g.putImageData(im, 0, 0);
  return { canvas: trim(c), changed };
}

/** Cut to the part that can be seen, so a corner sits on the logo, not on its empty margin. */
export function trim(c: HTMLCanvasElement): HTMLCanvasElement {
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const { data } = g.getImageData(0, 0, c.width, c.height);
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (data[(y * c.width + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0 || (x0 === 0 && y0 === 0 && x1 === c.width - 1 && y1 === c.height - 1)) return c;
  const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
  o.getContext('2d')!.drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
  return o;
}

