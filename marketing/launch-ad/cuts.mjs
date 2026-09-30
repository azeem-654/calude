import fs from 'node:fs';
const sfx = JSON.parse(fs.readFileSync('sfx.json'));
const V = k => `vo/en_US-ryan-high_${k}.wav`;
const CUTS = {
  c30: {
    segs: [[0, 11.3], [11.3, 15.2], [17.6, 19.9], [29.8, 32.6], [38.2, 41.4], [49.95, 52.0], [51.9, 55.8]],
    vo: [['l01', 0.2], ['l02', 3.3], ['l03', 5.3], ['l04', 11.6], ['l05', 15.3], ['l08', 17.6], ['l11', 20.4], ['l13', 24.15], ['l15', 26.0]],
    sections: k => [{ a: 0, b: 2.28, kind: 'intro' }, { a: 2.28, b: 4, kind: 'break' }, { a: 4, b: 11.3, kind: 'build' }, { a: 11.3, b: k[5], kind: 'full' }, { a: k[5], b: k[6], kind: 'rebuild' }, { a: k[6], b: k[6] + 2.2, kind: 'outro' }, { a: k[6] + 2.2, b: 99, kind: 'none' }],
    risers: k => [{ a: 0.3, b: 2.28, gain: 0.3 }, { a: 9.2, b: 11.3, gain: 0.22 }, { a: k[6] - 1.8, b: k[6], gain: 0.3 }],
  },
  c15: {
    segs: [[0, 4.4], [8.6, 11.3], [12.0, 14.4], [39.0, 40.6], [51.9, 55.8]],
    vo: [['l01', 0.2], ['l02', 3.3], ['l14', 4.6], ['l15', 11.6]],
    sections: k => [{ a: 0, b: 2.28, kind: 'intro' }, { a: 2.28, b: 4.4, kind: 'break' }, { a: 4.4, b: k[4], kind: 'full' }, { a: k[4], b: k[4] + 2.2, kind: 'outro' }, { a: k[4] + 2.2, b: 99, kind: 'none' }],
    risers: k => [{ a: 0.3, b: 2.28, gain: 0.3 }, { a: k[4] - 1.6, b: k[4], gain: 0.3 }],
  },
};
for (const [name, c] of Object.entries(CUTS)) {
  const starts = []; let acc = 0; const out = [];
  for (const [a, b] of c.segs) {
    starts.push(acc);
    for (const s of sfx) if (s.t >= a && s.t < b) out.push({ ...s, t: s.t - a + acc });
    acc += b - a;
  }
  const cfg = { dur: +acc.toFixed(3), fadeOut: 0.5, sections: c.sections(starts), risers: c.risers(starts), sfx: out, vo: c.vo.map(([k, t]) => ({ t, file: V(k) })) };
  fs.writeFileSync(`mix_${name}.json`, JSON.stringify(cfg));
  fs.writeFileSync(`segs_${name}.json`, JSON.stringify(c.segs));
  console.log(name, cfg.dur, 'starts', starts.map(x => x.toFixed(2)).join(' '));
}
