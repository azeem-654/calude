/**
 * An SMTP client for the Workers runtime.
 *
 * This is the piece that makes "every customer brings their own mail server"
 * work. It speaks the protocol over a raw TCP socket, the same conversation
 * the PHP did, because the alternative — forcing every customer onto one
 * provider's HTTPS API — is not the product that was asked for.
 *
 * Verified against a real SMTP server through workerd before it was written:
 * the runtime's `connect()` opens the socket, the greeting arrives, EHLO is
 * answered with the server's capability list. What Cloudflare does block is
 * outbound port 25, which is why the ladder below never offers it when
 * encryption was requested and why 587/2525/465 are the useful rungs.
 *
 * Two details carried over from the PHP, both of which were bugs there first:
 *
 *  - A refused password stops immediately. Walking the rest of the port ladder
 *    would send the same wrong credentials three more times and lock the
 *    account.
 *  - Fallback rungs are never less protected than what was asked for. Somebody
 *    who chose TLS and hit a blocked port has not agreed to send their password
 *    in the clear on another one.
 */
import { connect } from 'cloudflare:sockets';

export type Encryption = 'tls' | 'ssl' | 'none';

export interface SmtpCreds {
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: Encryption;
}

export interface SmtpAttempt {
  port: number;
  encryption: Encryption;
  ok: boolean;
  /** True when something answered — as opposed to nothing being there at all. */
  reachable: boolean;
  detail: string;
}

export interface SmtpResult {
  ok: boolean;
  port?: number;
  error: string;
  attempts: SmtpAttempt[];
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/** A reader that hands back whole SMTP replies, not arbitrary chunks. */
class Wire {
  private buf = '';
  constructor(
    private reader: ReadableStreamDefaultReader<Uint8Array>,
    private writer: WritableStreamDefaultWriter<Uint8Array>,
  ) {}

  async send(line: string): Promise<void> {
    await this.writer.write(enc.encode(line + '\r\n'));
  }

  async sendRaw(text: string): Promise<void> {
    await this.writer.write(enc.encode(text));
  }

  /**
   * Read one reply.
   *
   * A multi-line reply is "250-first" repeated then "250 last" — the space in
   * the fourth character marks the end. Reading a fixed number of bytes
   * instead, as a naive port would, hangs on servers that split the capability
   * list across packets.
   */
  async reply(timeoutMs = 15_000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const complete = this.takeComplete();
      if (complete !== null) return complete;
      if (Date.now() > deadline) throw new Error('timed out waiting for the mail server');
      const { value, done } = await this.reader.read();
      if (done) {
        const rest = this.buf; this.buf = '';
        if (rest) return rest;
        throw new Error('the mail server closed the connection');
      }
      this.buf += dec.decode(value, { stream: true });
    }
  }

  private takeComplete(): string | null {
    const lines = this.buf.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.length >= 4 && l[3] === ' ') {
        const upto = lines.slice(0, i + 1).join('\r\n');
        this.buf = lines.slice(i + 1).join('\r\n');
        return upto;
      }
    }
    return null;
  }
}

const code = (reply: string) => Number(reply.slice(0, 3)) || 0;

function b64(s: string): string {
  const bytes = enc.encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * The ports to try, in order.
 *
 * The chosen one always goes first — if it works nothing else is touched. The
 * rest exist because networks block outbound mail ports and which ones varies:
 * 2525 has no standard behind it, which is exactly why Brevo, Mailjet, SMTP2GO
 * and SendGrid all listen there.
 */
export function portLadder(chosen: number, encryption: Encryption): [number, Encryption][] {
  const fallbacks: [number, Encryption][] = encryption === 'none'
    ? [[587, 'none'], [2525, 'none'], [25, 'none']]
    : [[587, 'tls'], [2525, 'tls'], [465, 'ssl']];
  const ladder: [number, Encryption][] = [[chosen, encryption]];
  for (const step of fallbacks) if (step[0] !== chosen) ladder.push(step);
  return ladder;
}

interface AttemptOutcome {
  ok: boolean;
  /** Worth trying another port: nothing answered, so this says nothing about
   *  the credentials. A refusal from a server that did answer is final. */
  retry: boolean;
  error: string;
}

/** One conversation with one host on one port. */
async function attempt(
  creds: SmtpCreds,
  port: number,
  encryption: Encryption,
  /** null means "prove the login works and stop" — the connection test. */
  envelope: { from: string; to: string; mime: string } | null,
): Promise<AttemptOutcome> {
  let socket: ReturnType<typeof connect> | null = null;
  try {
    socket = connect(
      { hostname: creds.host, port },
      // 465 is implicit TLS from the first byte; 587 opens in the clear and
      // upgrades, which the runtime models as 'starttls' + startTls().
      { secureTransport: encryption === 'ssl' ? 'on' : encryption === 'tls' ? 'starttls' : 'off', allowHalfOpen: false },
    );

    let active = socket;
    let wire = new Wire(active.readable.getReader(), active.writable.getWriter());

    const greeting = await wire.reply();
    if (code(greeting) !== 220) {
      return { ok: false, retry: true, error: `Bad greeting from ${creds.host}:${port}: ${greeting.trim()}` };
    }

    await wire.send('EHLO crmpro.worker');
    const ehlo = await wire.reply();
    if (code(ehlo) !== 250) {
      return { ok: false, retry: true, error: `EHLO refused on port ${port}: ${ehlo.trim()}` };
    }

    if (encryption === 'tls') {
      await wire.send('STARTTLS');
      const st = await wire.reply();
      if (code(st) !== 220) {
        /* Retryable, but only because every remaining rung is encrypted too
           when encryption was asked for — moving on sends nothing in clear. */
        return { ok: false, retry: true, error: `The server refused STARTTLS on port ${port}, so nothing was sent.` };
      }
      const secure = active.startTls();
      active = secure as unknown as typeof active;
      wire = new Wire(active.readable.getReader(), active.writable.getWriter());
      await wire.send('EHLO crmpro.worker');
      const again = await wire.reply();
      if (code(again) !== 250) {
        return { ok: false, retry: true, error: `EHLO after STARTTLS refused on port ${port}: ${again.trim()}` };
      }
    }

    if (creds.username && creds.password) {
      await wire.send('AUTH LOGIN');
      const prompt = await wire.reply();
      let auth: string;
      if (code(prompt) === 334) {
        await wire.send(b64(creds.username));
        await wire.reply();
        await wire.send(b64(creds.password));
        auth = await wire.reply();
      } else {
        await wire.send('AUTH PLAIN ' + b64(`\0${creds.username}\0${creds.password}`));
        auth = await wire.reply();
      }
      if (code(auth) !== 235) {
        // A real answer. Trying the same credentials on three more ports would
        // only lock the account.
        return { ok: false, retry: false, error: `Auth failed: ${auth.trim()}` };
      }
    }

    /* The connection test stops here: it has proved the host is reachable on
       this port, that TLS engaged if it was asked for, and that the login was
       accepted. Going further would mean sending somebody a real message just
       to check a password. */
    if (!envelope) {
      await wire.send('QUIT').catch(() => {});
      return { ok: true, retry: false, error: '' };
    }

    await wire.send(`MAIL FROM: <${envelope.from}>`);
    const mf = await wire.reply();
    if (code(mf) !== 250) {
      return {
        ok: false, retry: false,
        error: `The server rejected the from address "${envelope.from}" (MAIL FROM): ${mf.trim()}. `
             + 'Most hosts require this to be an address on the authenticated account.',
      };
    }

    await wire.send(`RCPT TO: <${envelope.to}>`);
    const rc = await wire.reply();
    if (code(rc) !== 250 && code(rc) !== 251) {
      return { ok: false, retry: false, error: `The server rejected the recipient "${envelope.to}" (RCPT TO): ${rc.trim()}` };
    }

    await wire.send('DATA');
    const dt = await wire.reply();
    if (code(dt) !== 354) {
      return { ok: false, retry: false, error: `The server refused to accept message data (DATA): ${dt.trim()}` };
    }

    await wire.sendRaw(envelope.mime + '\r\n.\r\n');
    const sent = await wire.reply(30_000);
    await wire.send('QUIT').catch(() => {});

    if (code(sent) === 250) return { ok: true, retry: false, error: '' };
    return { ok: false, retry: false, error: `The server rejected the message body: ${sent.trim()}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    /* A connection that never opened says nothing about the credentials, so
       the next port is worth trying. */
    return { ok: false, retry: true, error: `Cannot reach ${creds.host}:${port} (${msg})` };
  } finally {
    try { await socket?.close(); } catch { /* already gone */ }
  }
}

/**
 * Send one message — or, with a null envelope, just prove the login works —
 * walking down the ports until one gets through.
 */
export async function smtpSend(
  creds: SmtpCreds,
  envelope: { from: string; to: string; mime: string } | null,
): Promise<SmtpResult> {
  const attempts: SmtpAttempt[] = [];
  let lastError = '';

  for (const [port, encryption] of portLadder(creds.port, creds.encryption)) {
    const r = await attempt(creds, port, encryption, envelope);
    attempts.push({ port, encryption, ok: r.ok, reachable: !r.retry, detail: r.error });
    if (r.ok) return { ok: true, port, error: '', attempts };
    lastError = r.error;
    if (!r.retry) break;   // a real answer; another port would repeat it
  }

  /* Only blame the host when nothing answered anywhere. A run that ended in
     "authentication credentials invalid" reached a mail server and was told
     no; saying "this host blocks SMTP" in the same breath as quoting that
     reply sends the customer to argue with their provider about a password. */
  const blockedEverywhere = attempts.length > 1 && !attempts.some(a => a.ok || a.reachable);
  const suffix = blockedEverywhere
    ? ` Ports ${attempts.map(a => a.port).join(', ')} were all tried and none got through.`
    : '';
  return { ok: false, error: (lastError || 'The message could not be sent over SMTP') + suffix, attempts };
}

/** Open a connection, greet, upgrade, authenticate, hang up. Sends nothing. */
export function smtpVerify(creds: SmtpCreds): Promise<SmtpResult> {
  return smtpSend(creds, null);
}
