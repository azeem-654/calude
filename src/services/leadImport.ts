/**
 * Reading a lead file of any size in the owner's own browser, for the lead
 * directory (worker/src/routes/leaddir.ts, docs/LEAD-DIRECTORY.md).
 *
 * ── Why the browser reads it ──
 *
 * The owner's first load is a 3.3 GB ZIP of ~6 GB of CSV. Uploading that in
 * one request is impossible (a Worker takes 100 MB at most), and no upload is
 * needed: `File` can be read a slice at a time from the disk. So the file
 * never leaves the machine whole — it is unzipped and parsed here, and only
 * the columns the directory keeps go to the server, 500 rows a request.
 *
 * ── Resuming ──
 *
 * The server counts the rows it has been sent for this file
 * (`ld_imports.rows_seen`). Starting the same file again re-reads it from the
 * top and skips that many rows without sending them: parsing gigabytes
 * locally takes a minute; sending them again would take an hour and count
 * every one as a duplicate.
 *
 * Pure apart from the streams, so `npm run test:leadimport` runs it in Node.
 */

/* ── CSV, a chunk at a time ─────────────────────────────────────────────── */

/**
 * RFC 4180 with the usual departures: CRLF or LF, a BOM, a quote inside an
 * unquoted field taken literally, any delimiter. A field may be any length
 * (one company description in the sample is 190 KB) and may span chunks.
 */
export class CsvParser {
  private field = '';
  private row: string[] = [];
  private inQ = false;
  /** A quote ended the last chunk inside a quoted field: escaped ("") or closing — the next chunk says which. */
  private qPending = false;
  /** A CR ended the last chunk; a LF starting the next belongs to it. */
  private skipLF = false;
  private started = false;
  private readonly re: RegExp;
  readonly delim: string;
  constructor(delim = ',') {
    this.delim = delim;
    this.re = new RegExp(`[${delim === '\t' ? '\\t' : delim.replace(/[\]\\^-]/g, '\\$&')}\\r\\n"]`, 'g');
  }

  /** Feed text; get back the rows it completed. */
  push(text: string): string[][] {
    const out: string[][] = [];
    let i = 0;
    const n = text.length;
    if (!this.started) { this.started = true; if (text.charCodeAt(0) === 0xfeff) i = 1; }
    if (this.qPending && n) {
      this.qPending = false;
      if (text[i] === '"') { this.field += '"'; i++; } else this.inQ = false;
    }
    if (this.skipLF && n) { this.skipLF = false; if (text[i] === '\n' && !this.inQ) i++; }
    while (i < n) {
      if (this.inQ) {
        const j = text.indexOf('"', i);
        if (j < 0) { this.field += text.slice(i); break; }
        this.field += text.slice(i, j);
        if (j + 1 === n) { this.qPending = true; break; }
        if (text[j + 1] === '"') { this.field += '"'; i = j + 2; } else { this.inQ = false; i = j + 1; }
        continue;
      }
      this.re.lastIndex = i;
      const m = this.re.exec(text);
      if (!m) { this.field += text.slice(i); break; }
      const j = m.index;
      const c = text[j];
      if (c === '"') {
        /* A quote opens a quoted field only at its start. */
        if (j === i && this.field === '') { this.inQ = true; i = j + 1; } else { this.field += text.slice(i, j + 1); i = j + 1; }
        continue;
      }
      this.field += text.slice(i, j);
      if (c === this.delim) { this.row.push(this.field); this.field = ''; i = j + 1; continue; }
      /* End of a row. */
      this.row.push(this.field); this.field = '';
      out.push(this.row); this.row = [];
      if (c === '\r') {
        if (j + 1 === n) this.skipLF = true;
        else if (text[j + 1] === '\n') { i = j + 2; continue; }
      }
      i = j + 1;
    }
    return out;
  }

  /** The last row, when the file does not end with a newline. */
  end(): string[][] {
    if (this.qPending) { this.qPending = false; this.inQ = false; }
    if (this.field !== '' || this.row.length) { this.row.push(this.field); this.field = ''; const r = this.row; this.row = []; return [r]; }
    return [];
  }
}

/** Comma, semicolon, tab or pipe — whichever the header line has most of, counted outside quotes. */
export function sniffDelimiter(firstLine: string): string {
  const bare = firstLine.replace(/"[^"]*"/g, '');
  const count = (c: string) => bare.split(c).length - 1;
  return [',', ';', '\t', '|'].sort((a, b) => count(b) - count(a))[0];
}

/* ── The columns ────────────────────────────────────────────────────────── */

export type LeadField = 'name' | 'first' | 'last' | 'title' | 'level' | 'department' | 'company' | 'website' | 'email' | 'phone'
  | 'linkedin' | 'industry' | 'city' | 'state' | 'country' | 'postal' | 'size' | 'revenue' | 'founded' | 'keywords'
  | 'address' | 'emailStatus' | 'companyLinkedin' | 'social' | 'codes' | 'technologies';

/**
 * What each field is called in the files people have: Leads.cm's export
 * (the owner's sample) first, then the usual CRM and data-vendor names
 * (Apollo, ZoomInfo, Seamless, Lusha, Hunter, UpLead and CRM exports). In
 * order of preference — a person's own phone before the company's switchboard,
 * where the person lives before where the company does, a work address before
 * a personal one. A column that matches none of these is not dropped: it is
 * kept with the person under its own header (`extra`).
 */
export const ALIASES: Record<LeadField, string[]> = {
  name: ['name', 'full name', 'fullname', 'contact name', 'person name', 'contact', 'contact full name', 'lead name', 'prospect name'],
  first: ['first name', 'firstname', 'first', 'given name', 'contact first name', 'fname', 'forename', 'prenom', 'vorname', 'nombre'],
  last: ['last name', 'lastname', 'last', 'surname', 'family name', 'contact last name', 'lname', 'nom', 'nachname', 'apellido'],
  title: ['title', 'job title', 'jobtitle', 'position', 'designation', 'role', 'contact title', 'job role', 'occupation', 'headline'],
  level: ['managementlevel', 'management level', 'seniority', 'level', 'seniority level', 'job level', 'management level seniority'],
  department: ['department', 'departments', 'function', 'job function', 'sub departments', 'division'],
  company: ['company', 'company name', 'companyname', 'organization', 'organisation', 'organization name', 'account name', 'business name', 'employer', 'company legal name', 'firm'],
  website: ['website', 'company website', 'domain', 'company domain', 'url', 'web', 'website url', 'company website domain', 'company url', 'web address', 'homepage', 'site'],
  email: ['email', 'email address', 'e mail', 'work email', 'business email', 'emails', 'email 1', 'primary email', 'contact email', 'corporate email',
    'professional email', 'email address 1', 'email 2', 'secondary email', 'other email', 'additional email', 'personal email', 'private email'],
  phone: ['phone', 'direct phone', 'direct phone number', 'direct dial', 'mobile', 'mobile phone', 'mobile number', 'cell', 'cell phone', 'phone number',
    'contact phone', 'contact phone 1', 'work phone', 'telephone', 'tel', 'cphone', 'phone 1', 'company phone', 'corporate phone', 'company hq phone',
    'hq phone', 'office phone', 'main phone', 'business phone', 'home phone', 'other phone'],
  linkedin: ['linkedin', 'linkedin url', 'person linkedin url', 'linkedin profile', 'linkedin profile url', 'profile url', 'contact linkedin url',
    'linkedin contact profile url', 'contact li profile url', 'li profile url', 'linkedin link'],
  industry: ['industry', 'industries', 'sector', 'primary industry', 'company industry', 'industry type', 'vertical', 'business type', 'category'],
  city: ['city', 'person city', 'location city', 'contact city', 'town', 'ccity', 'company city', 'hq city'],
  state: ['state', 'region', 'province', 'person state', 'state province', 'contact state', 'county', 'cstate', 'company state', 'hq state'],
  country: ['country', 'person country', 'contact country', 'country name', 'ccountry', 'company country', 'hq country'],
  postal: ['postalcode', 'postal code', 'zip', 'zip code', 'zipcode', 'postcode', 'post code', 'contact zip', 'cpostalcode', 'company zip', 'company postal code'],
  size: ['companysize', 'company size', 'employees', 'employee count', 'number of employees', 'num employees', 'size', 'headcount', 'employee range',
    'employees range', 'employee size', 'company employee count', 'staff count', 'company headcount'],
  revenue: ['revenue', 'annual revenue', 'company revenue', 'revenue range', 'revenue in 000s usd', 'revenue usd', 'estimated revenue', 'sales volume', 'turnover'],
  founded: ['foundedyear', 'founded year', 'founded', 'year founded', 'founding year', 'year established', 'established'],
  keywords: ['keywords', 'company keywords', 'specialties', 'specialities', 'tags', 'company description', 'description', 'services'],
  address: ['address', 'street', 'street address', 'address 1', 'address line 1', 'mailing address', 'contact address', 'company address',
    'company street address', 'company street', 'hq address', 'location', 'full address'],
  emailStatus: ['email status', 'email verification', 'email verification status', 'email verified', 'email confidence', 'email validity',
    'verification status', 'email quality', 'mx status', 'deliverability', 'email deliverability'],
  companyLinkedin: ['company linkedin url', 'company linkedin', 'company li profile url', 'organization linkedin url', 'linkedin company url', 'company linkedin profile'],
  social: ['facebook url', 'facebook', 'twitter url', 'twitter', 'x url', 'instagram', 'instagram url', 'youtube', 'youtube url', 'tiktok', 'company facebook url', 'company twitter url'],
  codes: ['sic code', 'sic codes', 'sic', 'primary sic', 'naics', 'naics code', 'naics codes', 'primary naics'],
  technologies: ['technologies', 'technology', 'tech stack', 'technographics', 'company technologies'],
};

/** A header as a key: no BOM, accents or punctuation, lower case. */
export const hkey = (h: string) => h.replace(/^\ufeff/, '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * For each field, the columns that may hold it, best first, and the columns
 * kept as they are (`extra`). A field with no column is simply not filled.
 * Fields that gather several columns (social links, codes) join them.
 */
export type Mapping = Partial<Record<LeadField, number[]>> & { extra?: number[]; header?: string[] };
const JOINED: LeadField[] = ['social', 'codes'];

export function mapHeader(header: string[]): Mapping {
  const keys = header.map(hkey);
  const out: Mapping = { header };
  const used = new Set<number>();
  for (const f of Object.keys(ALIASES) as LeadField[]) {
    const cols: number[] = [];
    for (const a of ALIASES[f]) {
      keys.forEach((k, i) => { if (!used.has(i) && (k === a || k.replace(/ /g, '') === a.replace(/ /g, '')) && !cols.includes(i)) cols.push(i); });
    }
    if (cols.length) { out[f] = cols; cols.forEach(i => used.add(i)); }
  }
  const extra = keys.map((k, i) => (k && !used.has(i) ? i : -1)).filter(i => i >= 0);
  if (extra.length) out.extra = extra;
  return out;
}

/** Whether the file can make a directory row at all: somebody's name or address. */
export function mappingUsable(m: Mapping): boolean {
  return !!(m.email || m.name || (m.first && m.last));
}

/** Which field each column went to, for the owner to read before loading: [header, field | 'kept' | 'empty header']. */
export function describeMapping(m: Mapping): { header: string; to: LeadField | 'kept' | 'blank' }[] {
  const h = m.header ?? [];
  return h.map((header, i) => {
    const f = (Object.keys(ALIASES) as LeadField[]).find(x => m[x]?.includes(i));
    return { header, to: f ?? (m.extra?.includes(i) ? 'kept' : 'blank') };
  });
}

export type LeadRow = Partial<Record<LeadField, string>> & { extra?: Record<string, string> };

const LOOKS_EMAIL = /^(mailto:)?[^\s@]+@[^\s@]+\.[a-z]{2,24}$/i;

/**
 * One CSV row → the fields the directory keeps, each the first non-empty
 * column for it — for an email, the first that is an address at all, so a
 * blank or "N/A" work email falls through to the next column. Columns no
 * field claimed go into `extra` by their own header.
 */
export function rowToLead(row: string[], m: Mapping): LeadRow | null {
  const out: LeadRow = {};
  for (const f of Object.keys(ALIASES) as LeadField[]) {
    const cols = m[f];
    if (!cols) continue;
    if (JOINED.includes(f)) {
      const vals = cols.map(i => (row[i] ?? '').trim()).filter(Boolean);
      if (vals.length) out[f] = vals.join(' · ').slice(0, 400);
      continue;
    }
    for (const i of cols) {
      /* Company descriptions run to hundreds of kilobytes; nothing kept is longer than this. */
      const v = (row[i] ?? '').trim();
      if (!v) continue;
      if (f === 'email') {
        const e = v.split(/[;,\s]+/).find(x => LOOKS_EMAIL.test(x));
        if (!e) continue;
        out.email = e.replace(/^mailto:/i, '');
        /* The verdict belongs to the address it was given for. */
        break;
      }
      out[f] = v.slice(0, 400);
      break;
    }
  }
  /* A file's email status speaks for its first email column; when that was
     blank and a later one was taken, the status is not this address's. */
  if (out.email && m.email && m.emailStatus) {
    const first = (row[m.email[0]] ?? '').trim();
    if (!first.includes(out.email)) delete out.emailStatus;
  }
  if (m.extra && m.header) {
    const extra: Record<string, string> = {};
    for (const i of m.extra) { const v = (row[i] ?? '').trim(); if (v) extra[m.header[i].replace(/^\ufeff/, '').trim().slice(0, 60)] = v.slice(0, 300); }
    if (Object.keys(extra).length) out.extra = extra;
  }
  return out.email || out.name || out.first || out.last ? out : null;
}

/* ── ZIP, read from its end ─────────────────────────────────────────────── */

export interface ZipEntry { name: string; method: number; compSize: number; size: number; offset: number }

const u16 = (v: DataView, o: number) => v.getUint16(o, true);
const u32 = (v: DataView, o: number) => v.getUint32(o, true);
const u64 = (v: DataView, o: number) => u32(v, o) + u32(v, o + 4) * 2 ** 32;
const view = async (b: Blob) => new DataView(await b.arrayBuffer());

/**
 * The entries of a ZIP, from its central directory — so a 3 GB archive is
 * listed by reading a few kilobytes at its end. ZIP64 (archives or entries
 * over 4 GB) included.
 */
export async function zipEntries(file: Blob): Promise<ZipEntry[]> {
  const tail = Math.min(file.size, 65_557);
  const t = await view(file.slice(file.size - tail));
  let eocd = -1;
  for (let i = t.byteLength - 22; i >= 0; i--) if (u32(t, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('This is not a ZIP file, or it is damaged (no central directory).');
  let count = u16(t, eocd + 10);
  let cdSize = u32(t, eocd + 12);
  let cdOff = u32(t, eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) {
    const loc = eocd - 20;
    if (loc < 0 || u32(t, loc) !== 0x07064b50) throw new Error('This ZIP64 archive has no locator — it may be damaged.');
    const z = await view(file.slice(u64(t, loc + 8), u64(t, loc + 8) + 56));
    if (u32(z, 0) !== 0x06064b50) throw new Error('This ZIP64 archive is damaged.');
    count = u64(z, 32); cdSize = u64(z, 40); cdOff = u64(z, 48);
  }
  const cd = await view(file.slice(cdOff, cdOff + cdSize));
  const out: ZipEntry[] = [];
  let p = 0;
  for (let k = 0; k < count && p + 46 <= cd.byteLength; k++) {
    if (u32(cd, p) !== 0x02014b50) break;
    const method = u16(cd, p + 10);
    let compSize = u32(cd, p + 20), size = u32(cd, p + 24);
    const nameLen = u16(cd, p + 28), extraLen = u16(cd, p + 30), commentLen = u16(cd, p + 32);
    let offset = u32(cd, p + 42);
    const name = new TextDecoder().decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen));
    /* ZIP64 sizes and offset, in that order, for whichever were too big for 32 bits. */
    let e = p + 46 + nameLen;
    const eEnd = e + extraLen;
    while (e + 4 <= eEnd) {
      const id = u16(cd, e), len = u16(cd, e + 2);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === 0xffffffff) { size = u64(cd, q); q += 8; }
        if (compSize === 0xffffffff) { compSize = u64(cd, q); q += 8; }
        if (offset === 0xffffffff) { offset = u64(cd, q); }
      }
      e += 4 + len;
    }
    out.push({ name, method, compSize, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** The files in an archive worth reading: CSV and TSV, not folders or macOS's shadow copies. */
export const readableEntry = (e: ZipEntry) =>
  /\.(csv|tsv|txt)$/i.test(e.name) && !/(^|\/)(__MACOSX|\.)/.test(e.name) && e.size > 0;

/** Counts the bytes going past — progress is measured on the file as it sits on disk. */
export function counted(s: ReadableStream<Uint8Array>, onBytes?: (n: number) => void): ReadableStream<Uint8Array> {
  if (!onBytes) return s;
  return s.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(c, ctl) { onBytes(c.byteLength); ctl.enqueue(c); } }));
}

/** One entry's bytes, decompressed as they are read. */
export async function entryStream(file: Blob, e: ZipEntry, onBytes?: (n: number) => void): Promise<ReadableStream<Uint8Array>> {
  const h = await view(file.slice(e.offset, e.offset + 30));
  if (u32(h, 0) !== 0x04034b50) throw new Error(`${e.name}: the archive is damaged at this file.`);
  const start = e.offset + 30 + u16(h, 26) + u16(h, 28);
  const raw = counted(file.slice(start, start + e.compSize).stream() as ReadableStream<Uint8Array>, onBytes);
  if (e.method === 0) return raw;
  if (e.method === 8) return raw.pipeThrough(new DecompressionStream('deflate-raw') as unknown as TransformStream<Uint8Array, Uint8Array>);
  throw new Error(`${e.name} is compressed in a way browsers cannot open (method ${e.method}). Re-save the ZIP with ordinary (Deflate) compression.`);
}

/* ── Text, in whatever encoding the file was saved in ─────────────────── */

/**
 * Which encoding the first bytes are in. Excel saves "Unicode text" as
 * UTF-16 with a byte-order mark, and an older "CSV" as Windows-1252; read as
 * UTF-8 either becomes a file of garbled names. A BOM says which; otherwise
 * the first 64 KB that are not valid UTF-8 mean Windows-1252.
 */
export function encodingOf(head: Uint8Array): string {
  if (head[0] === 0xff && head[1] === 0xfe) return 'utf-16le';
  if (head[0] === 0xfe && head[1] === 0xff) return 'utf-16be';
  /* A multi-byte character cut at the end of the sample is not an error. */
  let end = head.length;
  let lead = end - 1;
  while (lead > 0 && end - lead < 4 && (head[lead] & 0xc0) === 0x80) lead--;
  const need = head[lead] >= 0xf0 ? 4 : head[lead] >= 0xe0 ? 3 : head[lead] >= 0xc0 ? 2 : 1;
  if (lead >= 0 && need > 1 && end - lead < need) end = lead;
  try { new TextDecoder('utf-8', { fatal: true }).decode(head.subarray(0, end)); return 'utf-8'; }
  catch { return 'windows-1252'; }
}

/** The bytes as text: the first 64 KB are looked at to choose the encoding, then put back in front. */
export async function decoded(stream: ReadableStream<Uint8Array>): Promise<ReadableStream<string>> {
  const r = stream.getReader();
  const head: Uint8Array[] = [];
  let n = 0;
  let done = false;
  while (n < 65_536) { const x = await r.read(); if (x.done) { done = true; break; } head.push(x.value); n += x.value.byteLength; }
  const all = new Uint8Array(n);
  let o = 0;
  for (const c of head) { all.set(c, o); o += c.byteLength; }
  const enc = encodingOf(all);
  const joined = new ReadableStream<Uint8Array>({
    start(ctl) { if (n) ctl.enqueue(all); if (done) ctl.close(); },
    async pull(ctl) { const x = await r.read(); if (x.done) ctl.close(); else ctl.enqueue(x.value); },
    cancel(why) { return r.cancel(why); },
  });
  return joined.pipeThrough(new TextDecoderStream(enc) as unknown as TransformStream<Uint8Array, string>);
}

/* ── A whole file, row by row ───────────────────────────────────────────── */

export interface Source { name: string; size: number; open: (onBytes?: (n: number) => void) => Promise<ReadableStream<Uint8Array>> }

/** A CSV, a .csv.gz or a ZIP of CSVs → the parts to read, in a fixed order (resuming depends on it). */
export async function sourcesOf(file: File): Promise<Source[]> {
  if (/\.zip$/i.test(file.name)) {
    const entries = (await zipEntries(file)).filter(readableEntry);
    if (!entries.length) throw new Error('There is no CSV file in this ZIP.');
    return entries.map(e => ({ name: e.name, size: e.compSize, open: (cb) => entryStream(file, e, cb) }));
  }
  if (/\.gz$/i.test(file.name)) {
    return [{ name: file.name, size: file.size, open: async (cb) => counted(file.stream() as ReadableStream<Uint8Array>, cb).pipeThrough(new DecompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>) }];
  }
  return [{ name: file.name, size: file.size, open: async (cb) => counted(file.stream() as ReadableStream<Uint8Array>, cb) }];
}

/** Same file, same key: what lets an import resume (`import_start`). */
export const fileKey = (f: Pick<File, 'name' | 'size' | 'lastModified'>) => `${f.name}|${f.size}|${f.lastModified}`;

export interface ReadProgress { source: string; sourceIndex: number; sources: number; bytes: number; totalBytes: number; rows: number }

/**
 * Every data row of every part, as leads, in batches. `skip` data rows are
 * read and not handed over (resuming). Rows with nobody in them still count,
 * as `bad`, so the count the server keeps matches the file. A part whose
 * header has no name or email column is reported and passed over.
 */
export async function readLeads(
  sources: Source[],
  opts: { skip: number; batch: number; signal?: AbortSignal; onProgress?: (p: ReadProgress) => void; onSkipPart?: (name: string, why: string) => void },
  send: (rows: LeadRow[], bad: number, p: ReadProgress) => Promise<void>,
): Promise<{ rows: number }> {
  const totalBytes = sources.reduce((s, x) => s + x.size, 0);
  let doneBytes = 0;
  let index = 0;
  for (let si = 0; si < sources.length; si++) {
    const src = sources[si];
    let partBytes = 0;
    const stream = await src.open(n => { partBytes += n; });
    const reader = (await decoded(stream)).getReader();
    let parser: CsvParser | null = null;
    let mapping: Mapping | null = null;
    let header: string[] | null = null;
    let batch: LeadRow[] = [];
    let bad = 0;
    let skipPart = false;
    const progress = (): ReadProgress => ({ source: src.name, sourceIndex: si, sources: sources.length, bytes: doneBytes + Math.min(partBytes, src.size), totalBytes, rows: index });
    const flush = async () => { if (batch.length || bad) { const b = batch; const x = bad; batch = []; bad = 0; await send(b, x, progress()); } };
    const take = async (rows: string[][]) => {
      for (const r of rows) {
        if (!header) {
          header = r;
          mapping = mapHeader(r);
          if (!mappingUsable(mapping)) { skipPart = true; opts.onSkipPart?.(src.name, 'no column for a name or an email address'); return; }
          continue;
        }
        if (skipPart) return;
        const i = index++;
        if (i < opts.skip) continue;
        if (r.length === 1 && r[0] === '') { bad++; continue; }
        const lead = rowToLead(r, mapping!);
        if (lead) batch.push(lead); else bad++;
        if (batch.length + bad >= opts.batch) await flush();
      }
    };
    for (;;) {
      if (opts.signal?.aborted) { await reader.cancel().catch(() => {}); throw new DOMException('Paused', 'AbortError'); }
      const { value, done } = await reader.read();
      if (done) break;
      if (!parser) parser = new CsvParser(sniffDelimiter(value.slice(0, value.indexOf('\n') > 0 ? value.indexOf('\n') : 4000)));
      await take(parser.push(value));
      if (skipPart) { await reader.cancel().catch(() => {}); break; }
      opts.onProgress?.(progress());
    }
    if (parser && !skipPart) await take(parser.end());
    await flush();
    doneBytes += src.size;
    partBytes = 0;
    opts.onProgress?.(progress());
  }
  return { rows: index };
}

/* ── A look at the file before loading it ──────────────────────────────── */

export interface FilePreview {
  /** The parts that will be read (one for a CSV, each CSV in a ZIP). */
  parts: string[];
  /** The first part's columns and where each goes. */
  columns: { header: string; to: LeadField | 'kept' | 'blank' }[];
  /** The first few people as they would be kept. */
  sample: LeadRow[];
  encoding: string;
  delimiter: string;
  usable: boolean;
}

/**
 * The first part's header and first rows, mapped — so the owner sees which
 * column became which field (and which are kept as they are) before
 * millions of rows go in, rather than finding out afterwards.
 */
export async function previewFile(file: File): Promise<FilePreview> {
  const sources = await sourcesOf(file);
  const stream = await sources[0].open();
  const raw = stream.getReader();
  const head: Uint8Array[] = [];
  let n = 0;
  while (n < 262_144) { const x = await raw.read(); if (x.done) break; head.push(x.value); n += x.value.byteLength; }
  await raw.cancel().catch(() => {});
  const all = new Uint8Array(n);
  let o = 0;
  for (const c of head) { all.set(c, o); o += c.byteLength; }
  const encoding = encodingOf(all);
  let text = new TextDecoder(encoding).decode(all);
  /* The sample ends wherever the bytes did: drop the cut-off last line. */
  if (n >= 262_144) text = text.slice(0, Math.max(text.lastIndexOf('\n'), 0));
  const nl = text.indexOf('\n');
  const delimiter = sniffDelimiter(text.slice(0, nl > 0 ? nl : 4000));
  const p = new CsvParser(delimiter);
  const rows = [...p.push(text), ...p.end()];
  const header = rows[0] ?? [];
  const m = mapHeader(header);
  const sample = rows.slice(1, 40).map(r => rowToLead(r, m)).filter((x): x is LeadRow => !!x).slice(0, 3);
  return { parts: sources.map(s => s.name), columns: describeMapping(m), sample, encoding, delimiter: delimiter === '\t' ? 'tab' : delimiter, usable: mappingUsable(m) };
}

/** What each field is called on the preview. */
export const FIELD_LABEL: Record<LeadField, string> = {
  name: 'Full name', first: 'First name', last: 'Last name', title: 'Job title', level: 'Seniority', department: 'Department',
  company: 'Company', website: 'Website', email: 'Email', phone: 'Phone', linkedin: 'LinkedIn profile', industry: 'Industry',
  city: 'City', state: 'State / region', country: 'Country', postal: 'Postal code', size: 'Company size', revenue: 'Revenue',
  founded: 'Founded', keywords: 'Keywords', address: 'Street address', emailStatus: "File's email status",
  companyLinkedin: 'Company LinkedIn', social: 'Social profiles', codes: 'SIC / NAICS', technologies: 'Technologies',
};
