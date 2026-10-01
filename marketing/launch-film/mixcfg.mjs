/* Music sections, risers, sound cues and voice lines → mix_film.json for
   ../launch-ad/mix.mjs. Section edges follow the scenes (timing.js), so the
   music lifts where the film does: the shop and the many-projects scenes,
   and the money end of the agency story. */
import fs from 'node:fs';
const sfx = JSON.parse(fs.readFileSync('sfx.json'));
const vo = JSON.parse(fs.readFileSync('vo.json'));
const src = fs.readFileSync('timing.js', 'utf8');
const NT = JSON.parse(src.match(/window\.NT = (.*);/)[1]);
const dur = +src.match(/window\.DURATION = ([\d.]+)/)[1];
const at = k => NT[k][0];
const sections = [
  { a: 0, b: 2.9, kind: 'intro' }, { a: 2.9, b: 5.9, kind: 'break' }, { a: 5.9, b: at('plan'), kind: 'build' },
  { a: at('plan'), b: at('money'), kind: 'full' }, { a: at('money'), b: at('lib'), kind: 'lift' },
  { a: at('lib'), b: at('blog'), kind: 'full' }, { a: at('blog'), b: at('s7'), kind: 'lift' },
  { a: at('s7'), b: at('agency'), kind: 'full' }, { a: at('agency'), b: at('dev'), kind: 'lift' },
  { a: at('dev'), b: at('trust'), kind: 'full' }, { a: at('trust'), b: at('s10'), kind: 'break' },
  { a: at('s10'), b: at('cta'), kind: 'rebuild' }, { a: at('cta'), b: dur - 1.2, kind: 'outro' }, { a: dur - 1.2, b: 999, kind: 'none' },
];
const riser = (k, g) => ({ a: at(k) - 2.2, b: at(k), gain: g });
const cfg = {
  dur, fadeOut: 1.2, sections,
  risers: [{ a: 0.3, b: 2.9, gain: 0.3 }, riser('money', 0.26), riser('blog', 0.2), riser('agency', 0.24), riser('s10', 0.22), riser('cta', 0.3)],
  sfx,
  vo: vo.map(v => ({ t: v.t, file: `vo/${v.id}.wav` })),
};
fs.writeFileSync('mix_film.json', JSON.stringify(cfg));
console.log('dur', dur, 'sections', sections.length, 'vo', cfg.vo.length, 'sfx', sfx.length);
