/**
 * The lead directory's file reading and its server-side rules, without a
 * browser or a database: `npm run test:leadimport`.
 *
 * Every file here is made up on the spot — no real person's details belong
 * in the repository. The shapes are the hard ones a real export has: a BOM,
 * CRLF, quotes, line breaks inside a field, a 200 KB description, a ZIP of
 * several CSVs (and a ZIP64 one), and a resumed import that must not send a
 * row twice.
 */
import { deflateRawSync, gzipSync } from 'node:zlib';
import {
  CsvParser, describeMapping, encodingOf, mapHeader, readLeads, rowToLead, sniffDelimiter, sourcesOf, zipEntries, type LeadRow,
} from '../src/services/leadImport';
import { emailStatusOf, facetsOf, industriesLike, maskEmail, maskPhone, normalise, placeWhere, titleTerms } from '../worker/src/lib/leadDir';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d: unknown = '') => { if (c) pass++; else fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c ? '' : ` — ${JSON.stringify(d).slice(0, 300)}`}`); };

/* ── A CSV with every awkward thing in it ── */
const HEADER = 'name,title,department,managementlevel,industry,city,state,country,postalcode,linkedin,email,phone,cphone,website,company,companysize,description';
const big = 'x'.repeat(200_000);
const people = Array.from({ length: 1234 }, (_, i) => [
  `Person ${i}`, i % 7 === 0 ? 'Chief Executive Officer' : 'Agent', '', i % 3 ? 'Owner' : 'Entry', i % 2 ? 'Real estate' : 'Commercial real estate',
  i % 5 ? 'Tampa' : 'Austin', i % 5 ? 'Florida' : 'TX', 'United States', '', `http://www.linkedin.com/in/p${i}`,
  i % 4 ? `p${i}@ex${i % 9}.example` : '', '', '(813) 449-4323', `http://www.ex${i % 9}.example`, i % 11 ? `Ex "${i}" Realty, Inc.` : 'Line\nbreak Co',
  'Small Team', i === 10 ? big : 'Says "hi", twice',
]);
const q = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csvText = '\ufeff' + [HEADER, ...people.map(r => r.map(q).join(','))].join('\r\n') + '\r\n';

function parseAll(text: string, sizes: number[]): string[][] {
  const p = new CsvParser(',');
  const rows: string[][] = [];
  let i = 0, k = 0;
  while (i < text.length) { const n = sizes[k++ % sizes.length]; rows.push(...p.push(text.slice(i, i + n))); i += n; }
  rows.push(...p.end());
  return rows;
}
const whole = parseAll(csvText, [csvText.length]);
ok('a CSV parses to its header and every row', whole.length === 1 + people.length, whole.length);
ok('the BOM is not part of the first column', whole[0][0] === 'name');
ok('quotes, commas and line breaks inside fields survive', whole[1 + 11][14] === 'Line\nbreak Co' && whole[1 + 1][14] === 'Ex "1" Realty, Inc.', [whole[12][14], whole[2][14]]);
ok('a 200 KB field is read whole', whole[1 + 10][16].length === 200_000);
for (const sizes of [[1], [2, 3, 5, 7], [64], [4093, 1], [1, 1, 1, 65_536]]) {
  const r = parseAll(csvText, sizes);
  ok(`chunked ${JSON.stringify(sizes)} reads exactly the same rows`, JSON.stringify(r) === JSON.stringify(whole));
}
ok('a last row without a newline is kept', parseAll('a,b\n1,"2"', [3]).length === 2);
ok('the delimiter is sniffed', sniffDelimiter('a;b;c') === ';' && sniffDelimiter('a\tb\tc') === '\t' && sniffDelimiter('a,b;c,d') === ',');

/* ── Columns ── */
const m = mapHeader(whole[0]);
ok('Leads.cm columns are recognised', !!(m.name && m.email && m.title && m.level && m.industry && m.state && m.company && m.size && m.linkedin), m);
ok('a person\'s own phone is preferred, the company\'s used when it is empty', JSON.stringify(m.phone) === JSON.stringify([11, 12]), m.phone);
const lead = rowToLead(whole[1 + 10], m)!;
ok('nothing kept is longer than 400 characters', Object.values(lead).every(v => String(v).length <= 400));
ok('the description is not a field the directory keeps', !('description' in lead));
const m2 = mapHeader(['First Name', 'Last Name', 'Email Address', 'Company Name', 'Job Title', 'Zip Code']);
ok('the usual CRM column names are recognised', !!(m2.first && m2.last && m2.email && m2.company && m2.title && m2.postal), m2);

/* ── ZIP (stored, deflated, ZIP64) and gzip, read the way the browser does ── */
function zip(files: { name: string; data: Buffer; deflate: boolean }[], zip64 = false): Buffer {
  const parts: Buffer[] = [], cds: Buffer[] = [];
  let off = 0;
  for (const f of files) {
    const comp = f.deflate ? deflateRawSync(f.data) : f.data;
    const name = Buffer.from(f.name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(f.deflate ? 8 : 0, 8);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(f.data.length, 22); lh.writeUInt16LE(name.length, 26);
    parts.push(lh, name, comp);
    const extra = zip64 ? Buffer.alloc(4 + 24) : Buffer.alloc(0);
    if (zip64) { extra.writeUInt16LE(1, 0); extra.writeUInt16LE(24, 2); extra.writeBigUInt64LE(BigInt(f.data.length), 4); extra.writeBigUInt64LE(BigInt(comp.length), 12); extra.writeBigUInt64LE(BigInt(off), 20); }
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(f.deflate ? 8 : 0, 10);
    cd.writeUInt32LE(zip64 ? 0xffffffff : comp.length, 20); cd.writeUInt32LE(zip64 ? 0xffffffff : f.data.length, 24);
    cd.writeUInt16LE(name.length, 28); cd.writeUInt16LE(extra.length, 30); cd.writeUInt32LE(zip64 ? 0xffffffff : off, 42);
    cds.push(cd, name, extra);
    off += 30 + name.length + comp.length;
  }
  const cdBuf = Buffer.concat(cds);
  const tail: Buffer[] = [];
  if (zip64) {
    const z = Buffer.alloc(56); z.writeUInt32LE(0x06064b50, 0); z.writeBigUInt64LE(BigInt(files.length), 32);
    z.writeBigUInt64LE(BigInt(cdBuf.length), 40); z.writeBigUInt64LE(BigInt(off), 48);
    const loc = Buffer.alloc(20); loc.writeUInt32LE(0x07064b50, 0); loc.writeBigUInt64LE(BigInt(off + cdBuf.length), 8);
    tail.push(z, loc);
  }
  const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0);
  e.writeUInt16LE(zip64 ? 0xffff : files.length, 10); e.writeUInt32LE(zip64 ? 0xffffffff : cdBuf.length, 12); e.writeUInt32LE(zip64 ? 0xffffffff : off, 16);
  return Buffer.concat([...parts, cdBuf, ...tail, e]);
}
const half = Math.floor(people.length / 2);
const partA = '\ufeff' + [HEADER, ...people.slice(0, half).map(r => r.map(q).join(','))].join('\r\n') + '\r\n';
const partB = [HEADER, ...people.slice(half).map(r => r.map(q).join(','))].join('\n');
const files = [
  { name: 'leads/part-a.csv', data: Buffer.from(partA), deflate: true },
  { name: '__MACOSX/leads/._part-a.csv', data: Buffer.from('junk'), deflate: false },
  { name: 'leads/readme.pdf', data: Buffer.from('%PDF'), deflate: false },
  { name: 'leads/part-b.csv', data: Buffer.from(partB), deflate: false },
];

async function collect(file: File, skip = 0, batch = 100) {
  const sources = await sourcesOf(file);
  const got: LeadRow[] = []; let bad = 0; let last = 0;
  const r = await readLeads(sources, { skip, batch, onProgress: p => { last = p.bytes / p.totalBytes; } }, async (rows, b) => { got.push(...rows); bad += b; });
  return { got, bad, rows: r.rows, progress: last, parts: sources.map(s => s.name) };
}

for (const [label, z64] of [['ZIP', false], ['ZIP64', true]] as const) {
  const f = new File([zip(files, z64)], 'leads.zip');
  const ent = await zipEntries(f);
  ok(`${label}: the central directory lists every entry`, ent.length === 4 && ent[0].name === 'leads/part-a.csv', ent.map(e => e.name));
  const r = await collect(f);
  ok(`${label}: only the CSVs are read, in order`, JSON.stringify(r.parts) === JSON.stringify(['leads/part-a.csv', 'leads/part-b.csv']), r.parts);
  ok(`${label}: every row of both parts arrives, once`, r.rows === people.length && r.got.length === people.length, [r.rows, r.got.length]);
  ok(`${label}: progress reaches the end of the file`, Math.abs(r.progress - 1) < 0.001, r.progress);
}

const gz = new File([gzipSync(Buffer.from(csvText))], 'leads.csv.gz');
ok('a .csv.gz is read', (await collect(gz)).got.length === people.length);

/* Resuming: what was sent before, plus what is sent now, is the file — no gaps, no repeats. */
{
  const f = new File([zip(files)], 'leads.zip');
  const first = await collect(f, 0, 100);
  const sentBefore = 700;
  const rest = await collect(f, sentBefore, 100);
  const names = (rows: LeadRow[]) => rows.map(x => x.name).join('|');
  ok('a resumed import starts at the row after the last one sent', names(rest.got) === names(first.got.slice(sentBefore)), [rest.got[0]?.name]);
}

/* A part with no column for a person is passed over and said so. */
{
  const f = new File([zip([{ name: 'a.csv', data: Buffer.from('foo,bar\n1,2\n'), deflate: true }, { name: 'b.csv', data: Buffer.from('email\nx@y.example\n'), deflate: true }])], 'x.zip');
  const skipped: string[] = [];
  const got: LeadRow[] = [];
  await readLeads(await sourcesOf(f), { skip: 0, batch: 10, onSkipPart: n => skipped.push(n) }, async rows => { got.push(...rows); });
  ok('a CSV with no name or email column is skipped by name', skipped[0] === 'a.csv' && got.length === 1, { skipped, got });
}
ok('a file that is not a ZIP says so', await zipEntries(new File(['hello'], 'x.zip')).then(() => false, e => /not a ZIP/.test(String(e))));

/* ── The server's side of a row ── */
const n = normalise({ name: '  Ann  Lee ', email: 'ANN@Lee-Realty.example ', website: 'www.lee-realty.example/', state: 'FL', country: 'USA', city: 'Tampa', industry: 'Real estate', title: 'CEO & Founder', linkedin: 'javascript:alert(1)' })!;
ok('a row is tidied: spaces, case, the state code, the country', n.name === 'Ann Lee' && n.email === 'ann@lee-realty.example' && n.state === 'Florida' && n.st_k === 'florida' && n.co_k === 'united states', n);
ok('the domain comes from the website', n.domain === 'lee-realty.example' && n.website === 'https://www.lee-realty.example');
ok('a link that is not LinkedIn is not kept as one', n.linkedin === '');
ok('the same email is the same person', normalise({ name: 'A', email: 'ann@lee-realty.example' })!.dedupe === n.dedupe);
ok('without an email, the same name at the same company is the same person',
  normalise({ name: 'Bo Ray', website: 'ray.example' })!.dedupe === normalise({ name: 'bo  ray', email: 'not-an-email', website: 'https://www.ray.example' })!.dedupe);
ok('a row with nobody in it is dropped', normalise({ company: 'Nobody Inc' }) === null);
ok('an invalid address is not kept', normalise({ name: 'X', email: 'x@@y' })!.email === '');
ok('facets count industry, state, country, level and size', facetsOf({ ...n, level: 'Owner', size: 'Small Team' }).length === 5);

const states = new Set(['florida', 'texas']), countries = new Set(['united states']);
ok('"Tampa, Florida" is a city in a state', JSON.stringify(placeWhere('Tampa, Florida', states, countries).args) === '["tampa","florida"]');
ok('"FL" and "Florida" are the state', placeWhere('FL', states, countries).args[0] === 'florida' && placeWhere('florida', states, countries).sql === 'st_k = ?');
ok('"USA" is the country', placeWhere('USA', states, countries).sql === 'co_k = ?');
ok('anything else is a city', placeWhere('Tampa', states, countries).sql === 'ct_k = ?');
ok('"CEO" finds "Chief Executive Officer" too', titleTerms('CEO').includes('chief executive'));
ok('"owner or founder" is two titles', titleTerms('owner or founder').length === 2);
const inds = industriesLike('real estate agents', [{ value: 'real estate', n: 10 }, { value: 'commercial real estate', n: 3 }, { value: 'dental', n: 9 }]);
ok('an industry is matched on its words', JSON.stringify(industriesLike('real estate', [{ value: 'real estate', n: 10 }, { value: 'commercial real estate', n: 3 }, { value: 'dental', n: 9 }])) === '["real estate","commercial real estate"]');
ok('a word the industries do not have finds nothing rather than everything', inds.length === 0, inds);
ok('an address is masked to its first letter and domain', maskEmail('kkelly@trammellcrow.com') === 'k•••••@trammellcrow.com', maskEmail('kkelly@trammellcrow.com'));
ok('a phone keeps its area code only', maskPhone('(813) 449-4323') === '(813) •••-••••', maskPhone('(813) 449-4323'));

/* ── A data vendor's export: every column either becomes a field or is kept ── */
{
  const H = ['First Name', 'Last Name', 'Title', 'Company Name', 'Company Domain', 'Corporate Phone', 'Mobile Phone', 'Person Linkedin Url',
    'Company Linkedin Url', 'City', 'State', 'Country', 'Zip', 'Industry', '# Employees', 'Employee Range', 'Annual Revenue', 'Seniority',
    'Departments', 'Email Status', 'Street', 'Facebook Url', 'Twitter Url', 'SIC Code', 'NAICS', 'Technologies', 'Founded Year',
    'Work Email', 'Personal Email', 'Lead Source', 'Prénom'];
  const m = mapHeader(H);
  const d = describeMapping(m);
  const to = (h: string) => d.find(x => x.header === h)?.to;
  ok('first and last names are found', to('First Name') === 'first' && to('Last Name') === 'last');
  ok('a work email before a personal one', JSON.stringify(m.email?.map(i => H[i])) === '["Work Email","Personal Email"]', m.email);
  ok('street, email status, company profile, social, codes and technologies all have a field',
    to('Street') === 'address' && to('Email Status') === 'emailStatus' && to('Company Linkedin Url') === 'companyLinkedin'
    && to('Facebook Url') === 'social' && to('Twitter Url') === 'social' && to('SIC Code') === 'codes' && to('NAICS') === 'codes' && to('Technologies') === 'technologies', d);
  ok('"# Employees" and "Employee Range" are company size', to('# Employees') === 'size' && to('Employee Range') === 'size');
  ok('an accented header is read ("Prénom" is a first name)', to('Prénom') === 'first', d);
  ok('a column nothing claims is kept, not dropped', to('Lead Source') === 'kept', d);
  const row = ['Ana', 'Ruiz', 'Owner', 'Ruiz Homes', 'ruizhomes.example', '(305) 555-0100', '', 'https://www.linkedin.com/in/ana', '',
    'Miami', 'FL', 'USA', '33130', 'Real estate', '12', '11-50', '$2M', 'Owner', 'Sales', 'Verified', '1 Brickell Ave',
    'https://facebook.com/ruiz', 'https://x.com/ruiz', '6531', '531210', 'WordPress', '2009', 'N/A', 'ana.ruiz@mail.example', 'Expo 2026', 'Ana'];
  const r = rowToLead(row, m)!;
  ok('a blank or "N/A" work email falls through to the next address', r.email === 'ana.ruiz@mail.example', r);
  ok('the file\'s email status is not given to a different address', r.emailStatus === undefined, r);
  ok('kept columns travel under their own header', r.extra?.['Lead Source'] === 'Expo 2026', r.extra);
  ok('social links and codes are joined, not just the first', r.social === 'https://facebook.com/ruiz · https://x.com/ruiz' && r.codes === '6531 · 531210', r);
  const row2 = [...row]; row2[27] = 'ana@ruizhomes.example';
  const r2 = rowToLead(row2, m)!;
  ok('the status stays with the address it was given for', r2.email === 'ana@ruizhomes.example' && r2.emailStatus === 'Verified', r2);
  const n = normalise({ ...r2, extra: r2.extra })!;
  ok('kept as the directory keeps it: valid status, street, codes, extras', n.email_status === 'valid' && n.address === '1 Brickell Ave' && n.codes === '6531 · 531210'
    && JSON.parse(n.extra)['Lead Source'] === 'Expo 2026', n);
}
ok('vendor verdicts read into four words', [emailStatusOf('Verified'), emailStatusOf('Catch-all'), emailStatusOf('Invalid'), emailStatusOf('Unverified'), emailStatusOf('Guessed'), emailStatusOf('Deliverable'), emailStatusOf('')].join() === 'valid,risky,invalid,unknown,risky,valid,',
  [emailStatusOf('Verified'), emailStatusOf('Catch-all'), emailStatusOf('Invalid'), emailStatusOf('Unverified'), emailStatusOf('Guessed'), emailStatusOf('Deliverable')]);
ok('a pipe-separated file is read as one', sniffDelimiter('name|email|"a, b"|city') === '|');
ok('Excel "Unicode text" (UTF-16) is recognised', encodingOf(new Uint8Array([0xff, 0xfe, 0x6e, 0])) === 'utf-16le');
ok('an old Windows CSV (é as one byte) is read as Windows-1252', encodingOf(new Uint8Array([0x4a, 0x6f, 0x73, 0xe9, 0x2c, 0x61])) === 'windows-1252');
ok('UTF-8 cut mid-character at the end of the sample is still UTF-8', encodingOf(new Uint8Array([0x4a, 0x6f, 0x73, 0xc3, 0xa9, 0x2c, 0xc3])) === 'utf-8');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
