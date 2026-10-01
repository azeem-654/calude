/* captions.vtt from the voice lines as placed (vo.json) — the muted film on
   the site is read, not heard, so a long line is split at its sentences and
   each part shown for its share of the line's time.
   node captions.mjs > captions.vtt */
import fs from 'node:fs';
const lines = Object.fromEntries(JSON.parse(fs.readFileSync(new URL('./lines.json', import.meta.url))).map(([id, , t]) => [id, t]));
const vo = JSON.parse(fs.readFileSync(new URL('./vo.json', import.meta.url)));
const ts = s => { const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${x.toFixed(3).padStart(6, '0')}`; };
/* A.I. and S.E.O. are spelled for the voice; the captions say AI and SEO. */
const show = t => t.replace(/A\.I\./g, 'AI').replace(/S\.E\.O\./g, 'SEO');
let n = 0, out = 'WEBVTT\n';
for (const v of vo) {
  const parts = [];
  for (const s of show(lines[v.id]).match(/[^.!?]+[.!?]+(\s|$)/g) ?? [show(lines[v.id])]) {
    const last = parts[parts.length - 1];
    if (last && (last + s).length <= 84) parts[parts.length - 1] = last + s; else parts.push(s);
  }
  /* A sentence too long to read in one go breaks at the comma nearest its middle. */
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.length <= 84) continue;
    const cuts = [...p.matchAll(/, /g)].map(m => m.index + 1);
    if (!cuts.length) continue;
    const c = cuts.reduce((b, x) => Math.abs(x - p.length / 2) < Math.abs(b - p.length / 2) ? x : b);
    parts.splice(i, 1, p.slice(0, c), p.slice(c + 1)); i--;
  }
  const total = parts.reduce((a, p) => a + p.length, 0);
  let t = v.t;
  for (const p of parts) {
    const d = v.d * p.length / total;
    out += `\n${++n}\n${ts(t)} --> ${ts(t + d)}\n${p.trim()}\n`;
    t += d;
  }
}
process.stdout.write(out);
