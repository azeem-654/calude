/**
 * "Report a problem" — one implementation for both ways in.
 *
 * Signed in, the app's own sheet sends it (routes/supportReport.ts, with a
 * screenshot taken by the page); anybody else — a visitor on the marketing
 * site, a signed-out customer — sends it from the help widget (engage.php
 * `report`). Both used to differ in the one way that mattered to the owner
 * (2026-11-15): the app's report was only an email, so it could not be found
 * again under "Check ticket status". Now every report is a ticket first and
 * an email second:
 *
 *  - **The ticket** is in the widget owner's Customer Engagement → Tickets,
 *    category `problem`, priority high, with its pictures kept beside it in
 *    `crm_chat_files` (conversation_id = the ticket id — a ticket id is never
 *    a conversation, so the public `file` action cannot reach them). It is
 *    what the customer looks up later, by their email.
 *  - **The email** (house widget only — support@ with a copy to the owner's
 *    Gmail, the 2026-11-14 request) carries the pictures as attachments
 *    through the one door. No mailbox is no longer a failure: the ticket is
 *    saved and the answer says the email part did not go.
 */
import { deliver } from './deliver';
import { alertMailbox } from './aiHealth';
import { MAX_IMAGE_BYTES, sniffImage, storeChatFile } from './chatFiles';
import { guestKey, nextTicketRef, recordEvent, rid, upsertPerson } from './engagement';
import { scrubSecrets } from './aiToolHealth';
import { nowIso, type Env } from './db';
import type { MailAttachment } from './mime';

export const REPORT_TO = 'support@protectedcentral.com';
export const REPORT_COPY = 'azeem654@gmail.com';
export const MAX_REPORT_TEXT = 4000;
export const MAX_PICTURES = 4;

const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };

export interface ReportPicture extends MailAttachment { bytes: Uint8Array }

/** A data: URL (or bare base64) → the picture, if it is one we accept. */
function picture(raw: unknown, filename: string): ReportPicture | { error: string } | null {
  if (typeof raw !== 'string' || !raw) return null;
  const b64 = raw.replace(/^data:[^;,]*;base64,/, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return { error: 'One of the pictures could not be read.' };
  if (Math.floor(b64.length * 3 / 4) > MAX_IMAGE_BYTES) return { error: 'One of the pictures is too large — 1.5 MB at most.' };
  let bin: string;
  try { bin = atob(b64); } catch { return { error: 'One of the pictures could not be read.' }; }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const mime = sniffImage(bytes);
  if (!mime) return { error: 'Only pictures can be attached (JPEG, PNG, GIF or WebP).' };
  return { filename: `${filename}.${EXT[mime]}`, mime, base64: b64, bytes };
}

/** The screenshot plus their own pictures, checked by their bytes, or why not. */
export function readPictures(screenshot: unknown, pictures: unknown):
  { ok: true; pics: ReportPicture[]; shot: boolean } | { ok: false; message: string; field?: string } {
  const pics: ReportPicture[] = [];
  const shot = picture(screenshot, 'screen');
  if (shot && 'error' in shot) return { ok: false, message: shot.error };
  if (shot) pics.push(shot);
  const added = Array.isArray(pictures) ? pictures.slice(0, MAX_PICTURES + 1) : [];
  if (added.length + pics.length > MAX_PICTURES) return { ok: false, message: `Up to ${MAX_PICTURES} pictures in one report.`, field: 'report.pictures' };
  for (const [i, p] of added.entries()) {
    const got = picture(p, `picture-${i + 1}`);
    if (!got) continue;
    if ('error' in got) return { ok: false, message: got.error, field: 'report.pictures' };
    pics.push(got);
  }
  return { ok: true, pics, shot: !!shot };
}

export interface FiledReport { id: string; reference: string; guestKey: string }

/** The report as a ticket in `accountId`, its pictures kept beside it. */
export async function fileProblemTicket(env: Env, accountId: string, r: {
  email: string; name: string; described: string; page: string; pics: ReportPicture[]; context?: Record<string, unknown>;
}): Promise<FiledReport> {
  const person = await upsertPerson(env, accountId, { email: r.email, name: r.name, source: 'report', context: r.context });
  const reference = await nextTicketRef(env, accountId);
  const key = guestKey();
  const id = rid('tkt');
  const now = nowIso();
  const first = r.described.split(/\n/)[0].replace(/\s+/g, ' ').trim();
  const subject = `Problem: ${first.slice(0, 120)}${first.length > 120 ? '…' : ''}`;
  const body = `${r.described}${r.page ? `\n\nScreen: ${r.page}` : ''}${r.pics.length ? `\n\n${r.pics.length} picture${r.pics.length === 1 ? '' : 's'} attached.` : ''}`;
  await env.DB.prepare(
    `INSERT INTO crm_tickets
     (id, account_id, reference, person_id, subject, body, category, priority, source, guest_key, created_at, updated_at)
     VALUES (?,?,?,?,?,?, 'problem', 'high', 'report', ?,?,?)`,
  ).bind(id, accountId, reference, person.id, subject, body, key, now, now).run();
  for (const p of r.pics) {
    await storeChatFile(env, { accountId, conversationId: id, messageId: '', uploadedBy: 'visitor', bytes: p.bytes, mime: p.mime, now })
      .catch(() => null); // a picture that cannot be stored never loses the ticket; it is also in the email
  }
  await recordEvent(env, accountId, { kind: 'ticket.created', personId: person.id, refId: id, summary: `${reference}: ${subject}` });
  return { id, reference, guestKey: key };
}

/**
 * Mail it to support@ and the owner's copy. `none` when no mailbox can send
 * (said, never pretended); `partial` when only one of the two went.
 */
export async function mailProblem(env: Env, r: {
  described: string; name: string; email: string; rows: [string, string][];
  pics: ReportPicture[]; shot: boolean; reference?: string; signedIn: boolean;
}): Promise<{ sent: 'all' | 'partial' | 'none'; error?: string }> {
  const box = await alertMailbox(env);
  if (!box) return { sent: 'none', error: 'no_mailbox' };
  const row = (k: string, v: string) => v ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top">${k}</td><td style="padding:4px 0">${esc(v)}</td></tr>` : '';
  const extra = r.pics.length - (r.shot ? 1 : 0);
  const html = `<div style="font:14px/1.5 system-ui,sans-serif;color:#0f172a;max-width:640px">
<h2 style="margin:0 0 8px">Problem reported ${r.signedIn ? 'from the app' : 'from the help button'}${r.reference ? ` — ${esc(r.reference)}` : ''}</h2>
<p style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px">${esc(r.described)}</p>
<table style="border-collapse:collapse;font-size:13px">
${row('From', `${r.name || ''} <${r.email}>`.trim())}
${row('Signed in', r.signedIn ? 'yes — the address is from their session' : 'no — the address was typed, not proved')}
${r.rows.map(([k, v]) => row(k, v)).join('\n')}
${row('When', new Date().toUTCString())}
</table>
<p style="color:#64748b">Attached: ${r.shot ? 'a screenshot of their screen' : 'no screenshot of the screen'}${extra > 0 ? ` and ${extra} picture${extra === 1 ? '' : 's'} they added` : ''}.${r.reference ? ` It is also ticket ${esc(r.reference)} in Customer Engagement → Tickets.` : ''} Reply to this email to answer ${esc(r.email)} directly.${box.from.toLowerCase() === REPORT_TO ? '' : ` Sent from ${esc(box.from)} because ${REPORT_TO} is not a connected, validated mailbox.`}</p>
</div>`;
  const subject = `${r.reference ? `[${r.reference}] ` : ''}Problem report: ${r.described.replace(/\s+/g, ' ').slice(0, 70)}${r.described.length > 70 ? '…' : ''}`;
  const attachments: MailAttachment[] = r.pics.map(p => ({ filename: p.filename, mime: p.mime, base64: p.base64 }));
  const msg = { fromName: 'Protected Central support', fromEmail: box.from, subject, html, replyTo: r.email, attachments };
  const first = await deliver(box.mb, { ...msg, to: REPORT_TO }).catch(e => ({ ok: false, error: String(e) }));
  const copy = await deliver(box.mb, { ...msg, to: REPORT_COPY }).catch(e => ({ ok: false, error: String(e) }));
  if (!first.ok && !copy.ok) return { sent: 'none', error: scrubSecrets(String((first as { error?: string }).error ?? '')) };
  return { sent: first.ok && copy.ok ? 'all' : 'partial' };
}
