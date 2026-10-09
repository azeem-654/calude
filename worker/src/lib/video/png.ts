/**
 * Is this really a PNG? — checked from the bytes, not the file name.
 *
 * A thumbnail is called a PNG only when it starts with the PNG signature,
 * its first chunk is a well-formed IHDR whose CRC matches, it says the size
 * we asked for, and it ends with an IEND chunk. A WebP or JPEG renamed to
 * .png fails the first test; a truncated upload fails the last.
 *
 * Pure: imported by the browser too.
 */

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

let table: Uint32Array | null = null;
function crc32(bytes: Uint8Array, from: number, to: number): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = from; i < to; i++) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const u32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

export interface PngCheck { ok: boolean; width: number; height: number; reason: string }

export function checkPng(b: Uint8Array, want?: { width: number; height: number }): PngCheck {
  const no = (reason: string, width = 0, height = 0): PngCheck => ({ ok: false, width, height, reason });
  if (b.length < 57) return no('too short to be a PNG');
  for (let i = 0; i < 8; i++) if (b[i] !== SIG[i]) return no('not a PNG: the signature is missing');
  if (u32(b, 8) !== 13 || String.fromCharCode(b[12], b[13], b[14], b[15]) !== 'IHDR') return no('not a PNG: the first chunk is not IHDR');
  if (crc32(b, 12, 29) !== u32(b, 29)) return no('not a PNG: the header is corrupt');
  const width = u32(b, 16), height = u32(b, 20);
  if (!width || !height) return no('the PNG has no size');
  const n = b.length;
  if (String.fromCharCode(b[n - 8], b[n - 7], b[n - 6], b[n - 5]) !== 'IEND' || u32(b, n - 12) !== 0) return no('the PNG is cut short (no IEND)', width, height);
  if (want && (want.width !== width || want.height !== height)) return no(`the PNG is ${width}×${height}, not ${want.width}×${want.height}`, width, height);
  return { ok: true, width, height, reason: '' };
}
