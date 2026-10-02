// Writes hls/master.m3u8 from what was actually encoded: BANDWIDTH is the
// busiest segment's rate, AVERAGE-BANDWIDTH the whole rendition's.
import fs from 'node:fs';
const R = [
  ['1080', 1920, 1080, 'avc1.640028'],
  ['720', 1280, 720, 'avc1.64001f'],
  ['480', 854, 480, 'avc1.4d401f'],
  ['360', 640, 360, 'avc1.4d401e'],
];
let out = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-INDEPENDENT-SEGMENTS\n';
for (const [n, w, h, codec] of R) {
  const pl = fs.readFileSync(`hls/${n}/index.m3u8`, 'utf8').split('\n');
  let peak = 0, bytes = 0, secs = 0, d = 0;
  for (const l of pl) {
    if (l.startsWith('#EXTINF:')) d = parseFloat(l.slice(8));
    else if (l.endsWith('.ts')) {
      const b = fs.statSync(`hls/${n}/${l}`).size;
      bytes += b; secs += d; peak = Math.max(peak, b * 8 / d);
    }
  }
  out += `#EXT-X-STREAM-INF:BANDWIDTH=${Math.ceil(peak)},AVERAGE-BANDWIDTH=${Math.ceil(bytes * 8 / secs)},RESOLUTION=${w}x${h},FRAME-RATE=30.000,CODECS="${codec},mp4a.40.2"\n${n}/index.m3u8\n`;
  console.log(n, Math.round(peak / 1000), 'kb/s peak', Math.round(bytes * 8 / secs / 1000), 'avg');
}
fs.writeFileSync('hls/master.m3u8', out);
