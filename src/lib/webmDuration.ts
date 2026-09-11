/**
 * Writing the duration into a WebM that MediaRecorder left blank.
 *
 * ── The defect ──
 *
 * Chrome's MediaRecorder produces a WebM whose Segment › Info carries a
 * TimecodeScale and no Duration. Every byte of video is there — a measured
 * eight-second recording yields eight seconds of frames — but nothing in the
 * file says how long it is. Loaded anywhere, `video.duration` is `Infinity`
 * and `seekable.end(0)` is `Infinity`.
 *
 * What that costs, in the order people notice it:
 *
 *  - the scrub bar is dead, so a viewer cannot skip or go back;
 *  - players that trust the header stop early or refuse to seek at all;
 *  - upload a clip like this to most platforms and it is rejected or
 *    transcoded to the wrong length.
 *
 * This is a long-standing Chromium behaviour rather than a bug in the
 * recording above it, so it is fixed here, on the way out, once.
 *
 * ── Why bytes rather than a library ──
 *
 * `ts-ebml` does this and pulls in a full EBML reader and a Buffer polyfill for
 * one eleven-byte insertion. The surgery is small and bounded: find Info, put a
 * Duration in it, widen Info's own size field. Everything else — the clusters,
 * which are the whole file — is copied untouched, so a mistake here cannot
 * corrupt video data.
 */

const ID_SEGMENT = 0x18538067;
const ID_INFO = 0x1549a966;
const ID_DURATION = 0x4489;
const ID_TIMECODE_SCALE = 0x2ad7b1;

interface Elem {
  id: number;
  /** Where the element's id starts. */
  start: number;
  /** Where its payload starts. */
  dataStart: number;
  /** Payload length, or -1 when the writer declared it unknown. */
  size: number;
  /** Bytes the size field itself occupies. */
  sizeLen: number;
}

/** An EBML id: the leading zeros of the first byte give its width, and the
 *  marker bits are part of the value. */
function readId(b: Uint8Array, at: number): { id: number; len: number } | null {
  if (at >= b.length) return null;
  const first = b[at];
  let len = 0;
  for (let i = 0; i < 4; i++) if (first & (0x80 >> i)) { len = i + 1; break; }
  if (!len || at + len > b.length) return null;
  let id = 0;
  for (let i = 0; i < len; i++) id = (id << 8) | b[at + i];
  return { id: id >>> 0, len };
}

/** An EBML size: leading zeros give the width, and the marker bit is stripped.
 *  All-ones means "unknown", which is what MediaRecorder writes for Segment. */
function readSize(b: Uint8Array, at: number): { size: number; len: number } | null {
  if (at >= b.length) return null;
  const first = b[at];
  let len = 0;
  for (let i = 0; i < 8; i++) if (first & (0x80 >> i)) { len = i + 1; break; }
  if (!len || at + len > b.length) return null;
  let size = first & (0xff >> len);
  let allOnes = size === (0xff >> len);
  for (let i = 1; i < len; i++) {
    size = size * 256 + b[at + i];
    if (b[at + i] !== 0xff) allOnes = false;
  }
  return { size: allOnes ? -1 : size, len };
}

function readElem(b: Uint8Array, at: number): Elem | null {
  const id = readId(b, at);
  if (!id) return null;
  const size = readSize(b, at + id.len);
  if (!size) return null;
  return {
    id: id.id, start: at, dataStart: at + id.len + size.len,
    size: size.size, sizeLen: size.len,
  };
}

/** The children of a container, one level down. */
function* children(b: Uint8Array, from: number, to: number): Generator<Elem> {
  let at = from;
  while (at < to) {
    const e = readElem(b, at);
    if (!e) return;
    yield e;
    /* An unknown-size child would swallow the rest; only Segment does that and
       this never descends into one from here. */
    if (e.size < 0) return;
    at = e.dataStart + e.size;
  }
}

/** An EBML size field of the smallest width that fits, as bytes. */
function writeSize(size: number): Uint8Array {
  for (let len = 1; len <= 8; len++) {
    const max = Math.pow(2, 7 * len) - 1;
    if (size < max) {
      const out = new Uint8Array(len);
      let rest = size;
      for (let i = len - 1; i >= 0; i--) { out[i] = rest & 0xff; rest = Math.floor(rest / 256); }
      out[0] |= 0x80 >> (len - 1);
      return out;
    }
  }
  throw new Error('Size too large for an EBML element.');
}

/** Duration is a float, in timecode-scale units, which for MediaRecorder is
 *  milliseconds. Written as a 64-bit float because that is what players expect
 *  from Chromium-adjacent files and it costs three bytes over a 32-bit one. */
function durationElement(scaledDuration: number): Uint8Array {
  const out = new Uint8Array(11);
  out[0] = 0x44; out[1] = 0x89;      // id 0x4489
  out[2] = 0x88;                      // size: 8 bytes
  new DataView(out.buffer).setFloat64(3, scaledDuration, false);
  return out;
}

/**
 * Put `durationMs` into a WebM that has no Duration.
 *
 * Returns the original blob untouched when it is not a WebM, when the header
 * cannot be read, or when a Duration is already there and correct — a file this
 * does not understand is far better left alone than half-rewritten.
 */
export async function fixWebmDuration(blob: Blob, durationMs: number): Promise<Blob> {
  if (!(durationMs > 0) || !Number.isFinite(durationMs)) return blob;
  if (!/webm|matroska/i.test(blob.type)) return blob;

  let bytes: Uint8Array;
  try { bytes = new Uint8Array(await blob.arrayBuffer()); } catch { return blob; }
  if (bytes.length < 64) return blob;

  const segment = (() => {
    let at = 0;
    while (at < bytes.length) {
      const e = readElem(bytes, at);
      if (!e) return null;
      if (e.id === ID_SEGMENT) return e;
      if (e.size < 0) return null;
      at = e.dataStart + e.size;
    }
    return null;
  })();
  if (!segment) return blob;

  const segEnd = segment.size < 0 ? bytes.length : segment.dataStart + segment.size;
  let info: Elem | null = null;
  for (const c of children(bytes, segment.dataStart, segEnd)) {
    if (c.id === ID_INFO) { info = c; break; }
  }
  if (!info || info.size < 0) return blob;

  /* The scale says what unit Duration is in. Chromium writes 1,000,000ns — a
     millisecond — but reading it rather than assuming is the difference between
     a correct file and one that claims to be a thousand times too long. */
  let timecodeScale = 1_000_000;
  let existingDuration: Elem | null = null;
  for (const c of children(bytes, info.dataStart, info.dataStart + info.size)) {
    if (c.id === ID_TIMECODE_SCALE) {
      let v = 0;
      for (let i = 0; i < c.size; i++) v = v * 256 + bytes[c.dataStart + i];
      if (v > 0) timecodeScale = v;
    }
    if (c.id === ID_DURATION) existingDuration = c;
  }

  const scaled = durationMs * 1_000_000 / timecodeScale;

  /* Already there: overwrite in place, which changes no sizes at all. */
  if (existingDuration && existingDuration.size === 8) {
    const out = bytes.slice();
    new DataView(out.buffer, out.byteOffset).setFloat64(existingDuration.dataStart, scaled, false);
    return new Blob([out], { type: blob.type });
  }
  if (existingDuration) return blob;   // an odd width; leave it alone

  const dur = durationElement(scaled);
  const newInfoSize = writeSize(info.size + dur.length);
  const grew = newInfoSize.length - info.sizeLen;

  const out = new Uint8Array(bytes.length + dur.length + grew);
  let w = 0;
  /* Everything before Info's size field. */
  out.set(bytes.subarray(0, info.dataStart - info.sizeLen), w); w += info.dataStart - info.sizeLen;
  out.set(newInfoSize, w); w += newInfoSize.length;
  /* Duration first inside Info: order is not significant in EBML, and putting
     it first means a player that stops reading early still finds it. */
  out.set(dur, w); w += dur.length;
  out.set(bytes.subarray(info.dataStart), w);

  return new Blob([out], { type: blob.type });
}
