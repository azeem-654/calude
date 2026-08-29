/**
 * A small IMAP client, enough to read an inbox.
 *
 * The PHP called `imap_open()` — a C extension that does all of this out of
 * sight. Workers have no extensions, so the protocol is spoken directly. This
 * deliberately implements the read path only: log in, select a folder, list
 * recent messages, fetch their headers and a text preview. Nothing here moves,
 * deletes or writes anything, which keeps the blast radius of a bug in it to
 * "the inbox does not display".
 *
 * IMAP is chattier than SMTP: every command is prefixed with a tag and the
 * reply is finished when a line starting with that tag arrives.
 */
import { connect } from 'cloudflare:sockets';

export interface ImapCreds {
  host: string;
  port: number;
  encryption: 'ssl' | 'tls' | 'none';
  username: string;
  password: string;
  folder: string;
}

export interface ImapMessage {
  uid: string;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  date: string;
  seen: boolean;
  snippet: string;
  body: string;
  bodyType: 'HTML' | 'TEXT';
}

const enc = new TextEncoder();
const dec = new TextDecoder();

class ImapWire {
  private buf = '';
  private tag = 0;

  constructor(
    private reader: ReadableStreamDefaultReader<Uint8Array>,
    private writer: WritableStreamDefaultWriter<Uint8Array>,
  ) {}

  nextTag(): string { return `a${String(++this.tag).padStart(4, '0')}`; }

  async raw(text: string): Promise<void> { await this.writer.write(enc.encode(text)); }

  /** Hand the streams back before startTls() takes the socket over. */
  release(): void {
    try { this.reader.releaseLock(); } catch { /* already released */ }
    try { this.writer.releaseLock(); } catch { /* already released */ }
  }

  /** Send a tagged command and read until its own tagged reply comes back. */
  async command(cmd: string, timeoutMs = 20_000): Promise<{ ok: boolean; lines: string[]; status: string }> {
    const tag = this.nextTag();
    await this.raw(`${tag} ${cmd}\r\n`);
    const deadline = Date.now() + timeoutMs;
    const lines: string[] = [];

    for (;;) {
      const idx = this.buf.indexOf('\r\n');
      if (idx === -1) {
        if (Date.now() > deadline) throw new Error('the mailbox stopped responding');
        const { value, done } = await this.reader.read();
        if (done) throw new Error('the mailbox closed the connection');
        this.buf += dec.decode(value, { stream: true });
        continue;
      }
      const line = this.buf.slice(0, idx);
      this.buf = this.buf.slice(idx + 2);

      if (line.startsWith(tag + ' ')) {
        const status = line.slice(tag.length + 1).trim();
        return { ok: /^OK/i.test(status), lines, status };
      }
      lines.push(line);
    }
  }

  /** The untagged greeting the server sends before any command. */
  async greeting(timeoutMs = 15_000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const idx = this.buf.indexOf('\r\n');
      if (idx !== -1) { const l = this.buf.slice(0, idx); this.buf = this.buf.slice(idx + 2); return l; }
      if (Date.now() > deadline) throw new Error('the mailbox did not greet us');
      const { value, done } = await this.reader.read();
      if (done) throw new Error('the mailbox closed the connection');
      this.buf += dec.decode(value, { stream: true });
    }
  }
}

/** A quoted IMAP string — the password may legitimately contain a quote. */
function quoted(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function headerValue(block: string, name: string): string {
  /* Headers fold onto continuation lines that begin with whitespace, so a
     naive line-by-line match truncates long subjects. */
  const re = new RegExp(`^${name}:\\s*((?:.*(?:\\r?\\n[ \\t].*)*))$`, 'im');
  const m = block.match(re);
  return m ? m[1].replace(/\r?\n[ \t]+/g, ' ').trim() : '';
}

/** RFC 2047 — "=?UTF-8?B?…?=" — which real subjects are full of. */
function decodeWords(value: string): string {
  return value.replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_all, _cs, kind: string, text: string) => {
    try {
      if (kind.toUpperCase() === 'B') {
        const bin = atob(text);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
      }
      return text.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
    } catch { return text; }
  });
}

function splitAddress(value: string): { name: string; email: string } {
  const decoded = decodeWords(value);
  const angled = decoded.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (angled) return { name: angled[1].replace(/^"|"$/g, '').trim(), email: angled[2].trim() };
  return { name: '', email: decoded.trim() };
}

export async function imapFetch(creds: ImapCreds, limit: number): Promise<{ ok: boolean; error: string; messages: ImapMessage[] }> {
  let socket: ReturnType<typeof connect> | null = null;
  try {
    socket = connect(
      { hostname: creds.host, port: creds.port },
      { secureTransport: creds.encryption === 'ssl' ? 'on' : creds.encryption === 'tls' ? 'starttls' : 'off', allowHalfOpen: false },
    );
    let active = socket;
    let wire = new ImapWire(active.readable.getReader(), active.writable.getWriter());

    const hello = await wire.greeting();
    if (!/^\*\s+OK/i.test(hello)) return { ok: false, error: `The mailbox refused the connection: ${hello.trim()}`, messages: [] };

    if (creds.encryption === 'tls') {
      const st = await wire.command('STARTTLS');
      if (!st.ok) return { ok: false, error: 'The mailbox refused STARTTLS, so nothing was sent.', messages: [] };
      wire.release();
      active = active.startTls() as unknown as typeof active;
      wire = new ImapWire(active.readable.getReader(), active.writable.getWriter());
    }

    const login = await wire.command(`LOGIN ${quoted(creds.username)} ${quoted(creds.password)}`);
    if (!login.ok) {
      return { ok: false, error: `The mailbox rejected the login: ${login.status}`, messages: [] };
    }

    const folder = creds.folder || 'INBOX';
    const select = await wire.command(`SELECT ${quoted(folder)}`);
    if (!select.ok) return { ok: false, error: `Could not open "${folder}": ${select.status}`, messages: [] };

    const search = await wire.command('UID SEARCH ALL');
    if (!search.ok) return { ok: false, error: `Could not list the mailbox: ${search.status}`, messages: [] };

    const uids = (search.lines.find(l => /^\* SEARCH/i.test(l)) ?? '')
      .replace(/^\* SEARCH\s*/i, '').trim().split(/\s+/).filter(Boolean);
    const wanted = uids.slice(-Math.max(1, Math.min(50, limit)));
    if (!wanted.length) { await wire.command('LOGOUT').catch(() => {}); return { ok: true, error: '', messages: [] }; }

    const messages: ImapMessage[] = [];
    for (const uid of wanted.reverse()) {
      /* PEEK, so reading the inbox in this app does not mark mail read in the
         customer's own client. A 4KB slice of the body is plenty for a preview
         and keeps one enormous message from blowing the response size. */
      const r = await wire.command(
        `UID FETCH ${uid} (FLAGS BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE)] BODY.PEEK[TEXT]<0.4096>)`,
      ).catch(() => null);
      if (!r?.ok) continue;

      const blob = r.lines.join('\r\n');
      const headerPart = blob.match(/HEADER\.FIELDS[^\r\n]*\r?\n([\s\S]*?)(?:\r?\n\)|BODY\[TEXT\])/i)?.[1] ?? blob;
      const textPart = blob.match(/BODY\[TEXT\][^\r\n]*\r?\n([\s\S]*)$/i)?.[1] ?? '';

      const from = splitAddress(headerValue(headerPart, 'From'));
      const body = textPart.replace(/\r?\n\)\s*$/, '').trim();
      const looksHtml = /<\/?(?:p|div|br|a|table|span|h[1-6])\b/i.test(body);

      messages.push({
        uid,
        from: from.email,
        fromName: from.name,
        to: splitAddress(headerValue(headerPart, 'To')).email,
        subject: decodeWords(headerValue(headerPart, 'Subject')) || '(no subject)',
        date: headerValue(headerPart, 'Date'),
        seen: /\\Seen/i.test(blob),
        snippet: body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200),
        body,
        bodyType: looksHtml ? 'HTML' : 'TEXT',
      });
    }

    await wire.command('LOGOUT').catch(() => {});
    return { ok: true, error: '', messages };
  } catch (e) {
    return { ok: false, error: `Could not reach ${creds.host}:${creds.port} (${e instanceof Error ? e.message : String(e)})`, messages: [] };
  } finally {
    try { await socket?.close(); } catch { /* already gone */ }
  }
}
