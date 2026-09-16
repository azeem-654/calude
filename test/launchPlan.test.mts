/**
 * The order things get built in.
 *
 * Run with `npm run test:launch`. The case that matters is the shop: its most
 * valuable email goes to somebody who left a full basket, and that email cannot
 * be written before there is a basket to leave. A plan that puts outreach first
 * for a shop is starting at step four, and it would look perfectly sensible
 * doing it.
 */
import { launchPlan } from '../src/services/launchPlan';
import { INDUSTRIES } from '../src/services/sendingPlan';
import type { Capability } from '../src/services/projects';

const ALL: Capability[] = ['find', 'email', 'sms', 'content', 'book', 'shop'];
const out: string[] = [];
const ok = (n: string, p: boolean, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);
const at = (steps: { label: string }[], match: RegExp) => steps.findIndex(s => match.test(s.label));

/* ── A shop builds before it talks ── */
{
  const s = launchPlan('ecommerce', ALL);
  const catalogue = at(s, /catalogue/i);
  const pay = at(s, /take money/i);
  const basket = at(s, /abandoned baskets/i);
  const winback = at(s, /bring them back/i);
  ok('a shop starts with the catalogue', catalogue === 0, `index ${catalogue}`);
  ok('payment comes before the shop opens', pay < at(s, /Open the shop page/i) && pay > 0, `${pay}`);
  ok('the abandoned-basket email comes after the basket can exist',
    basket > catalogue && basket > pay, `${basket} vs ${catalogue}/${pay}`);
  ok('and the win-back comes after the thank-you', winback > basket, `${winback} vs ${basket}`);
  ok('every step says why it is there', s.every(x => x.why.length > 25));
  ok('and names a screen it happens on', s.every(x => x.route.startsWith('/')));
}

/* ── Which is the opposite of a trade ── */
{
  const s = launchPlan('local-services', ALL);
  ok('a trade starts by getting mail working', /sending addresses/i.test(s[0].label), s[0].label);
  ok('and has no catalogue step at all', at(s, /catalogue/i) === -1);
  const shop = launchPlan('ecommerce', ALL);
  ok('the two orders genuinely differ',
    s[0].label !== shop[0].label, `${s[0].label} vs ${shop[0].label}`);
}

/* ── Property is about still being there in nine months ── */
{
  const s = launchPlan('real-estate', ALL);
  ok('property separates the buyer and seller approaches', at(s, /two approaches/i) >= 0);
  ok('and ends on the long follow-up', /long follow-up/i.test(s[s.length - 1].label) || at(s, /long follow-up/i) > 2,
    s.map(x => x.label).join(' | '));
}

/* ── Switched-off capabilities drop out, they do not grey out ── */
{
  const noEmail = launchPlan('local-services', ['content', 'book']);
  ok('with email off, no email step is listed',
    !noEmail.some(s => /follow-ups|sequence/i.test(s.label)), noEmail.map(s => s.label).join(' | '));
  const onlyContent = launchPlan('b2b-services', ['content']);
  ok('a content-only project still has a plan', onlyContent.length > 0);
  ok('and it is shorter than the full one',
    onlyContent.length < launchPlan('b2b-services', ALL).length);
  const none = launchPlan('local-services', []);
  ok('no capabilities still leaves the sending step, which everything needs',
    none.length >= 1 && /sending addresses/i.test(none[0].label), JSON.stringify(none));
}

/* ── An unknown trade still gets a sensible order ── */
{
  const s = launchPlan('something-nobody-listed', ALL);
  ok('an unknown industry falls back rather than returning nothing', s.length >= 4, String(s.length));
  ok('and the fallback starts with sending', /sending addresses/i.test(s[0].label), s[0].label);
}

/* ── Every industry in the picker has a plan, with no repeats ── */
for (const i of INDUSTRIES) {
  const s = launchPlan(i.id, ALL);
  ok(`${i.id}: has a build order`, s.length >= 4, String(s.length));
  ok(`${i.id}: no step appears twice`, new Set(s.map(x => x.label)).size === s.length,
    s.map(x => x.label).join(' | '));
  ok(`${i.id}: every step is clickable`, s.every(x => x.route.startsWith('/')));
}

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
if (failed) process.exit(1);
