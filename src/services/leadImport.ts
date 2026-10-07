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

/** Comma, semicolon or tab — whichever the header line has most of. */
export function sniffDelimiter(firstLine: string): string {
  const count = (c: string) => firstLine.split(c).length - 1;
  return [',', ';', '\t'].sort((a, b) => count(b) - count(a))[0];
}

/* ── The columns ────────────────────────────────────────────────────────── */

export type LeadField = 'name' | 'first' | 'last' | 'title' | 'level' | 'department' | 'company' | 'website' | 'email' | 'phone'
  | 'linkedin' | 'industry' | 'city' | 'state' | 'country' | 'postal' | 'size' | 'revenue' | 'founded' | 'keywords';

/**
 * What each field is called in the files people have: Leads.cm's export
 * (the owner's sample) first, then the usual CRM and data-vendor names. In
 * order of preference — a person's own phone before the company's switchboard,
 * where the person lives before where the company does.
 */
export const ALIASES: Record<LeadField, string[]> = {
  name: ['name', 'full name', 'fullname', 'contact name', 'person name', 'contact'],
  first: ['first name', 'firstname', 'first', 'given name'],
  last: ['last name', 'lastname', 'last', 'surname', 'family name'],
  title: ['title', 'job title', 'jobtitle', 'position', 'designation', 'role'],
  level: ['managementlevel', 'management level', 'seniority', 'level'],
  department: ['department', 'departments', 'function'],
  company: ['company', 'company name', 'companyname', 'organization', 'organisation', 'account name', 'business name', 'employer'],
  website: ['website', 'company website', 'domain', 'company domain', 'url', 'web', 'website url'],
  email: ['email', 'email address', 'e mail', 'work email', 'business email', 'emails', 'email 1', 'primary email'],
  phone: ['phone', 'direct phone', 'mobile', 'mobile phone', 'phone number', 'work phone', 'telephone', 'cphone', 'company phone', 'corporate phone'],
  linkedin: ['linkedin', 'linkedin url', 'person linkedin url', 'linkedin profile', 'profile url'],
  industry: ['industry', 'industries', 'sector'],
  city: ['city', 'person city', 'location city', 'ccity', 'company city'],
  state: ['state', 'region', 'province', 'person state', 'state province', 'cstate', 'company state'],
  country: ['country', 'person country', 'ccountry', 'company country'],
  postal: ['postalcode', 'postal code', 'zip', 'zip code', 'zipcode', 'postcode', 'cpostalcode'],
  size: ['companysize', 'company size', 'employees', 'employee count', 'number of employees', 'size', 'headcount'],
  revenue: ['revenue', 'annual revenue', 'company revenue'],
  founded: ['foundedyear', 'founded year', 'founded', 'year founded'],
  keywords: ['keywords', 'company keywords', 'specialties', 'specialities', 'tags'],
};

const hkey = (h: string) => h.replace(/^\ufeff/, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** For each field, the columns that may hold it, best first. A field with none is simply not imported. */
export type Mapping = Partial<Record<LeadField, number[]>>;

export function mapHeader(header: string[]): Mapping {
  const keys = header.map(hkey);
  const out: Mapping = {};
  for (const f of Object.keys(ALIASES) as LeadField[]) {
    const cols: number[] = [];
    for (const a of ALIASES[f]) {
      keys.forEach((k, i) => { if ((k === a || k.replace(/ /g, '') === a.replace(/ /g, '')) && !cols.includes(i)) cols.push(i); });
    }
    if (cols.length) out[f] = cols;
  }
  return out;
}

/** Whether the file can make a directory row at all: somebody's name or address. */
export function mappingUsable(m: Mapping): boolean {
  return !!(m.email || m.name || (m.first && m.last));
}

export type LeadRow = Partial<Record<LeadField, string>>;

/** One CSV row → the fields the directory keeps, each the first non-empty column for it. */
export function rowToLead(row: string[], m: Mapping): LeadRow | null {
  const out: LeadRow = {};
  for (const f of Object.keys(m) as LeadField[]) {
    for (const i of m[f]!) {
      const v = (row[i] ?? '').trim();
      /* Company descriptions run to hundreds of kilobytes; nothing kept is longer than this. */
      if (v) { out[f] = v.slice(0, 400); break; }
    }
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
    const reader = stream.pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>).getReader();
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
