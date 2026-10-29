/**
 * The e-commerce agreement templates: draft-labelled, nothing invented, every
 * gap listed, the offer's own words carried over. `npm run test:agreements`.
 */
import { DRAFT_NOTICE, TBD, blankAgreement, scopeOfWork, serviceAgreement, toHtml, toText } from '../src/components/Agency/serviceAgreements';
import { ECOMMERCE_OFFER } from '../worker/src/lib/offers';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d: unknown = '') => { if (c) pass++; else fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c ? '' : ` — ${JSON.stringify(d).slice(0, 300)}`}`); };
const all = (d: ReturnType<typeof serviceAgreement>) => d.sections.flatMap(s => [s.heading, ...s.paragraphs]).join('\n');

const blank = blankAgreement('2026-11-01');
const a = serviceAgreement(blank), s = scopeOfWork(blank);
ok('a blank agreement prints placeholders, never invented terms', all(a).includes(TBD) && !/\b30 days\b|\b12 months\b|Delaware|New York law/.test(all(a)));
ok('…and lists every gap for the reviewer', a.missing.includes('Initial term') && a.missing.includes('Governing law') && a.missing.includes('Notice period') && a.missing.includes('Client’s legal name'));
ok('the fee defaults to the published price', all(a).includes('$2,200') && blank.monthlyFeeCents === ECOMMERCE_OFFER.monthlyCents);
ok('the offer’s exclusions, duties and no-guarantee are carried over word for word', ECOMMERCE_OFFER.separate.every(x => all(a).includes(x)) && ECOMMERCE_OFFER.clientDuties.every(x => all(a).includes(x)) && all(a).includes(ECOMMERCE_OFFER.noGuarantee));
ok('the agreement covers term, renewal, notice, termination, payment, confidentiality, data and signatures', ['Term and renewal', 'Ending the agreement', 'Fees and payment', 'What is not included', 'Client responsibilities', 'Additional work', 'Confidentiality', 'Data handling', 'Signatures'].every(h => a.sections.some(x => x.heading.includes(h))));
ok('the scope covers monthly deliverables, exclusions, responsibilities and signatures', ['Monthly deliverables', 'Not included', 'The Client’s part', 'Signatures'].every(h => s.sections.some(x => x.heading === h)));
const filled = { ...blank, providerName: 'Protected Central LLC', clientName: 'Acme Goods Inc', initialTermMonths: 3, noticeDays: 30, cureDays: 15, paymentDays: 15, governingLaw: 'the State of Texas', liabilityCapMonths: 3, additionalWorkRateCents: 12_500, renewal: 'monthly' as const };
const f = serviceAgreement(filled);
ok('filled terms are used as given', all(f).includes('3 months') && all(f).includes('30 days') && all(f).includes('the State of Texas') && all(f).includes('$125 an hour') && !f.missing.includes('Initial term'));
ok('renewal wording follows the choice', /month to month/.test(all(f)) && /renews for further periods/.test(all(serviceAgreement({ ...filled, renewal: 'same-term' }))) && /ends at the end of the Initial Term/.test(all(serviceAgreement({ ...filled, renewal: 'none' }))));
ok('every rendering says DRAFT, top and bottom', toHtml(f).split(DRAFT_NOTICE.replace(/&/g, '&amp;')).length === 3 && toText(f).startsWith(DRAFT_NOTICE) && toText(f).trim().endsWith(DRAFT_NOTICE));
ok('the HTML escapes what was typed', !toHtml(serviceAgreement({ ...filled, clientName: '<script>x</script>' })).includes('<script>x'));
ok('the invoice day is an ordinal', /21st day/.test(all(serviceAgreement({ ...filled, invoiceDay: 21 }))) && /2nd day/.test(all(serviceAgreement({ ...filled, invoiceDay: 2 }))) && /11th day/.test(all(serviceAgreement({ ...filled, invoiceDay: 11 }))));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
