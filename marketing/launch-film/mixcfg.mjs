import fs from 'node:fs';
const sfx = JSON.parse(fs.readFileSync('sfx.json'));
const lines = JSON.parse(fs.readFileSync('lines.json'));
const cfg = {
  dur: 178.6, fadeOut: 1.2,
  sections: [
    { a: 0, b: 2.9, kind: 'intro' }, { a: 2.9, b: 6.4, kind: 'break' }, { a: 6.4, b: 27.2, kind: 'build' },
    { a: 27.2, b: 54.0, kind: 'full' }, { a: 54.0, b: 63.0, kind: 'break' }, { a: 63.0, b: 71.2, kind: 'rebuild' },
    { a: 71.2, b: 124.4, kind: 'full' }, { a: 124.4, b: 132.0, kind: 'rebuild' }, { a: 132.0, b: 153.6, kind: 'lift' },
    { a: 153.6, b: 160.6, kind: 'break' }, { a: 160.6, b: 167.9, kind: 'rebuild' }, { a: 167.9, b: 177.0, kind: 'outro' },
    { a: 177.0, b: 999, kind: 'none' },
  ],
  risers: [{ a: 0.3, b: 2.9, gain: 0.3 }, { a: 25.0, b: 27.2, gain: 0.22 }, { a: 60.8, b: 63.0, gain: 0.22 }, { a: 129.8, b: 132.0, gain: 0.26 }, { a: 158.4, b: 160.6, gain: 0.22 }, { a: 165.9, b: 167.9, gain: 0.3 }],
  sfx,
  vo: lines.map(([k, t]) => ({ t, file: `vo/${k}.wav` })),
};
fs.writeFileSync('mix_film.json', JSON.stringify(cfg));
console.log('sections', cfg.sections.length, 'vo', cfg.vo.length, 'sfx', sfx.length);
