/**
 * The patient-information net (worker/src/lib/phiGuard.ts): catches what is
 * unmistakably patient data, leaves ordinary marketing words alone.
 * `npm run test:phi`.
 */
import { REDACTED, findPhi, phiRefusal, redactPhi } from '../worker/src/lib/phiGuard';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d: unknown = '') => { if (c) pass++; else fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c ? '' : ` — ${JSON.stringify(d).slice(0, 300)}`}`); };
const kinds = (t: string) => findPhi(t).map(f => f.kind);

ok('an SSN', kinds('SSN 123-45-6789 on file').includes('Social Security number'));
ok('not an impossible SSN or a phone number', !kinds('000-12-3456').length && !kinds('Call 555-123-4567').length);
ok('a Medicare number, with or without dashes', kinds('MBI 1EG4-TE5-MK73').includes('Medicare number') && kinds('1EG4TE5MK73').includes('Medicare number'));
ok('a labelled date of birth, in three spellings', kinds('DOB: 04/12/1961').includes('date of birth') && kinds('date of birth 1961-04-12').includes('date of birth') && kinds('born on March 4, 1961').includes('date of birth'));
ok('a labelled record number and member ID', kinds('MRN 448812').includes('medical record number') && kinds('Member ID: W123456789').includes('insurance member ID'));
ok('a patient named next to a date', kinds('Patient: Jane Smith seen 03/02/2024').includes('patient name and date of birth'));
ok('ordinary marketing copy passes', !findPhi('Spring sale ends 03/31/2026 — 20% off every AC tune-up. Order #48213. Call 555-0142.').length && !findPhi('Our open house is on June 4, 2026 at 10am').length);
ok('the refusal names the kind, never the value', /date of birth/.test(phiRefusal(findPhi('DOB 01/02/1980'), 'the AI') ?? '') && !/01\/02\/1980/.test(phiRefusal(findPhi('DOB 01/02/1980'), 'the AI') ?? ''));
const r = redactPhi('Hi, my DOB is 01/02/1980 and SSN 123-45-6789, can you help?');
ok('redaction replaces each finding and keeps the rest', r.removed === 2 && r.text.includes(REDACTED) && r.text.startsWith('Hi, my') && r.text.endsWith('can you help?') && !/1980|6789/.test(r.text), r);
ok('nothing found, nothing changed', redactPhi('Hello there').removed === 0 && redactPhi('Hello there').text === 'Hello there');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
