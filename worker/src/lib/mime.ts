/**
 * Building the message itself.
 *
 * Split out from the SMTP client because the provider APIs need the same
 * headers — a List-Unsubscribe that only appears on the SMTP route means a
 * campaign's deliverability depends on which transport happened to carry it.
 */
import { headerSafe } from './http';

export interface MessageInput {
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  /** RFC 8058 one-click opt-out. Gmail and Yahoo have required it on bulk
   *  mail since 2024; without it a campaign is filtered before anybody gets
   *  to decide whether they wanted it. */
  unsubscribeUrl?: string;
}

const enc = new TextEncoder();

function b64(s: string): string {
  const bytes = enc.encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** RFC 2047, so a subject with an em dash or an emoji survives the wire. */
function encodeHeader(value: string): string {
  return /^[\x20-\x7E]*$/.test(value) ? value : `=?UTF-8?B?${b64(value)}?=`;
}

/** Split base64 into the 76-character lines the transfer encoding requires. */
function chunk(s: string, n = 76): string {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out.join('\r\n');
}

export function buildMime(msg: MessageInput, helloHost: string): string {
  const msgId = `${crypto.randomUUID()}@${helloHost.replace(/[^a-z0-9.\-]/gi, '') || 'localhost'}`;
  const subject = encodeHeader(headerSafe(msg.subject, 300) || '(no subject)');
  const fromName = encodeHeader(headerSafe(msg.fromName, 120));
  const reply = msg.replyTo || msg.fromEmail;

  let head =
    `From: ${fromName} <${msg.fromEmail}>\r\n` +
    `To: <${msg.to}>\r\n` +
    `Subject: ${subject}\r\n` +
    `Date: ${new Date().toUTCString()}\r\n` +
    `Message-ID: <${msgId}>\r\n` +
    `Reply-To: <${reply}>\r\n`;

  if (msg.unsubscribeUrl) {
    head += `List-Unsubscribe: <${msg.unsubscribeUrl}>\r\n`;
    head += 'List-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n';
  }

  head +=
    'MIME-Version: 1.0\r\n' +
    'Content-Type: text/html; charset=UTF-8\r\n' +
    'Content-Transfer-Encoding: base64\r\n' +
    '\r\n';

  const body = chunk(b64(msg.html));

  /* Dot-stuffing: a line consisting of a single dot ends the DATA block, so a
     body that happens to contain one has to be escaped or the message is
     truncated there and the rest is read as SMTP commands. */
  return (head + body).replace(/^\.$/gm, '..');
}
