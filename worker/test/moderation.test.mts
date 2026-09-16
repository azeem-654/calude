/**
 * The content policy, argued with in both directions.
 *
 * Run it with `npm run test:moderation`. It needs no database and no network,
 * because `screenText` is pure — which is the whole reason it was written that
 * way.
 *
 * ── Why the innocent list is the longer one ──
 *
 * A filter is only ever tested against the things it is supposed to catch, and
 * that is the half that was never in doubt. What decides whether this is usable
 * is the plumber who writes "we drill hard", the photographer who "shoots"
 * weddings, and the security firm selling "escort services" — none of whom will
 * report a false positive, because from where they sit the product simply did
 * not work. Every entry below is copy one of this product's actual customers
 * could write.
 *
 * Three real faults were found by running it the first time, and all three were
 * in this direction: an accountant mentioning the general election was held, a
 * sweet shop's `lollipop` collapsed into the worst term on the list, and an
 * adult site scored high enough to be refused outright on a platform whose
 * owner had asked to review exactly that himself.
 */
import { screenText } from '../src/lib/moderation';

const out: string[] = [];
const ok = (n: string, pass: boolean, d = '') => out.push(`${pass ? 'PASS' : 'FAIL'}  ${n}${pass ? '' : ` — ${d}`}`);

/* ── Must pass. Real copy from the trades this product sells to. ── */
const INNOCENT: [string, string][] = [
  ['plumber', 'We drill hard into concrete and ram the drain rod right through the blockage. Same-day callouts.'],
  ['photographer', 'Book a photo shoot today. We shoot weddings, headshots and product video across Manchester.'],
  ['security firm', 'Close protection and vehicle escort services. Our security escort teams are SIA licensed.'],
  ['private ambulance', 'Medical escort and patient transfer, including funeral escort for families.'],
  ['butcher', 'Hand-cut steaks, dry-aged on the bone. Our weapons of choice are a sharp knife and 28 days.'],
  ['accountant', 'The general election may change corporation tax. We will keep you posted on the manifesto detail.'],
  ['recruiter', 'You could be the ideal candidate for this job. We think you are a strong candidate for the role.'],
  ['sexual health clinic', 'Confidential sexual health screening and advice. Free to anyone over 18.'],
  ['HR consultancy', 'Training on sexual harassment, discrimination and workplace wellbeing.'],
  ['data firm', 'Our analysis of the passenger list found six duplicate records in the assassin dataset.'],
  ['coffee roaster', 'Our secret weapon is a weapons-grade single origin. Strong enough to shoot you out of bed.'],
  ['charity', 'We campaign against female genital mutilation and fund safeguarding work.'],
  ['raffle', 'Drop your ticket in the ballot box prize draw at the summer raffle.'],
  ['car dealer', 'Used Ford Escort, 1998, MOT until March. Tour buses also available.'],
  ['gym', 'Kickboxing classes. Learn to throw a punch properly, in a safe and supervised room.'],
  ['sweet shop', 'Handmade lollipop bars and retro lollies, wrapped to order.'],
  ['ordinary', 'Spring offer: 20% off your first month. Book a call and we will sort it.'],
];
for (const [who, text] of INNOCENT) {
  const r = screenText(text);
  ok(`lets through: ${who}`, r.verdict === 'allow', `${r.verdict}/${r.category} ${r.score} [${r.matched}]`);
}

/* ── Must be held. ── */
const HELD: [string, string, string][] = [
  ['adult site', 'Premium pornography, updated daily. Hardcore sex in HD.', 'adult'],
  ['obfuscated', 'the best p0rn and pr0n videos anywhere', 'adult'],
  ['spaced out', 'p o r n  clips, free access', 'adult'],
  ['stretched', 'poooorn tube, thousands of videos', 'adult'],
  ['camming', 'Join our webcam girls live now — onlyfans links in bio.', 'adult'],
  ['escort, uncancelled', 'Discreet escort service, incall and outcall, available tonight.', 'adult'],
  ['electioneering', 'Vote for us at the polling station. Our election campaign needs your political donation.', 'politics'],
  ['gore', 'Uncensored beheading and gore video archive.', 'violence'],
  ['hate', 'Content on racial superiority and holocaust denial.', 'hate'],
];
for (const [who, text, cat] of HELD) {
  const r = screenText(text);
  ok(`holds: ${who}`, r.verdict === 'review' && r.category === cat, `${r.verdict}/${r.category} ${r.score} [${r.matched}]`);
}

/* ── Must be refused outright, and never queued. ── */
for (const text of ['child porn links', 'ch1ld p0rn', 'underage nude gallery', 'jailbait pics']) {
  const r = screenText(text);
  ok(`blocks outright: "${text}"`, r.verdict === 'block' && r.category === 'illegal', `${r.verdict}/${r.category}`);
}

/* ── Edge cases the thresholds depend on. ── */
const weak = screenText('Our lingerie range is seductive.');
ok('two weak adult terms alone are not enough', weak.verdict === 'allow', `${weak.score} ${weak.matched}`);
const empty = screenText('');
ok('empty text is allowed and scores nothing', empty.verdict === 'allow' && empty.score === 0);
const reason = screenText('Premium pornography, updated daily.');
ok('a held item explains itself in one sentence', /Held for review/.test(reason.reason) && reason.reason.includes('pornography'), reason.reason);

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
if (failed) process.exit(1);
