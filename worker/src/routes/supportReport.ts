/**
 * "Report a problem" — from the floating Protron (owner, 2026-11-14: a button
 * inside Protron that takes a screenshot and sends it, with the problem the
 * customer describes, to support@protectedcentral.com with a copy to
 * azeem654@gmail.com).
 *
 * ── Why mail, and why attachments ──
 *
 * The owner reads support@ and Gmail, not a screen in the app, and a link to
 * a picture would need either a sign-in on whichever device opens the mail or
 * a public address for a screenshot of somebody's CRM. So the pictures travel
 * as attachments through the one door (lib/deliver.ts), which now carries
 * them on SMTP and every provider. Deliver has no Cc, so the copy is a second
 * send — exactly as the AI health alerts do it (lib/aiHealth.ts).
 *
 * ── What is trusted ──
 *
 * Who sent it comes from the session, never the body; the workspace is
 * checked with canAccess. Pictures are decided by their bytes (sniffImage),
 * capped in size and number, and only ever attached — nothing here serves
 * them back. The description is cleaned of anything patient-shaped
 * (phiGuard), as a support ticket is. Five reports an hour per person.
 *
 * Nothing pretends to have worked: with no mailbox that can send, the
 * customer is told so and pointed at the help button's ticket; one copy
 * failing is reported as partly sent.
 */
import { fail, json } from '../lib/http';
import { canAccess, userFromToken, type Env } from '../lib/db';
import { deliver } from '../lib/deliver';
import { alertMailbox } from '../lib/aiHealth';
import { MAX_IMAGE_BYTES, sniffImage } from '../lib/chatFiles';
import { redactPhi } from '../lib/phiGuard';
import { rateLimit } from '../lib/rateLimit';
import { scrubSecrets } from '../lib/aiToolHealth';
import type { MailAttachment } from '../lib/mime';

export const REPORT_TO = 'support@protectedcentral.com';
export const REPORT_COPY = 'azeem654@gmail.com';
const MAX_TEXT = 4000;
const MAX_PICTURES = 4;

const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };

/** A data: URL (or bare base64) → its bytes' base64, if it is a picture we accept. */
function picture(raw: unknown): { base64: string; mime: string; size: number } | { error: string } | null {
  if (typeof raw !== 'string' || !raw) return null;
  const b64 = raw.replace(/^data:[^;,]*;base64,/, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return { error: 'One of the pictures could not be read.' };
  const size = Math.floor(b64.length * 3 / 4);
  if (size > MAX_IMAGE_BYTES) return { error: 'One of the pictures is too large — 1.5 MB at most.' };
  const head = atob(b64.slice(0, 24));
  const bytes = new Uint8Array(head.length);
  for (let i = 0; i < head.length; i++) bytes[i] = head.charCodeAt(i);
  const mime = sniffImage(bytes);
  if (!mime) return { error: 'Only pictures can be attached (JPEG, PNG, GIF or WebP).' };
  return { base64: b64, mime, size };
}

export async function handleSupportReport(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return fail('Send this as a POST.', 405);
  let d: Record<string, unknown>;
  try { d = await req.json() as Record<string, unknown>; } catch { return fail('That was not a valid request.'); }
  const user = await userFromToken(env.DB, String(d.token ?? ''));
  if (!user) return fail('Sign in again — this needs a current session.', 401, { code: 'unauthorised' });
  const accountId = String(d.accountId ?? '').trim();
  if (!accountId || !(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours.', 403);

  const described = redactPhi(String(d.description ?? '').trim().slice(0, MAX_TEXT)).text;
  if (described.length < 5) return fail('Say what went wrong, in a sentence or two.', 200, { field: 'report.description' });

  const pics: MailAttachment[] = [];
  const shot = picture(d.screenshot);
  if (shot && 'error' in shot) return fail(shot.error);
  if (shot) pics.push({ filename: `screen.${EXT[shot.mime]}`, mime: shot.mime, base64: shot.base64 });
  const added = Array.isArray(d.pictures) ? d.pictures.slice(0, MAX_PICTURES + 1) : [];
  if (added.length + pics.length > MAX_PICTURES) return fail(`Up to ${MAX_PICTURES} pictures in one report.`, 200, { field: 'report.pictures' });
  for (const [i, p] of added.entries()) {
    const got = picture(p);
    if (!got) continue;
    if ('error' in got) return fail(got.error, 200, { field: 'report.pictures' });
    pics.push({ filename: `picture-${i + 1}.${EXT[got.mime]}`, mime: got.mime, base64: got.base64 });
  }

  const gate = await rateLimit(env, { what: 'support-report', who: user.email.toLowerCase(), max: 5, windowSeconds: 3600 });
  if (!gate.allowed) return fail(`That is five reports this hour — please wait ${Math.ceil(gate.retryAfter / 60)} minutes, or use the Help button's ticket.`, 429);

  const box = await alertMailbox(env);
  if (!box) {
    return fail(`Support email is not connected yet, so this could not be sent. Please use the Help button → Submit a ticket, or write to ${REPORT_TO}.`, 503, { code: 'no_mailbox' });
  }

  const path = String(d.path ?? '').slice(0, 300);
  const pageTitle = String(d.pageTitle ?? '').slice(0, 160);
  const view = String(d.viewport ?? '').slice(0, 40);
  const agent = (req.headers.get('user-agent') ?? '').slice(0, 300);
  const where = String(env.APP_ORIGIN ?? new URL(req.url).origin).replace(/\/$/, '');
  const shotNote = shot ? 'a screenshot of their screen' : 'no screenshot of the screen';
  const extra = pics.length - (shot ? 1 : 0);
  const row = (k: string, v: string) => v ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top">${k}</td><td style="padding:4px 0">${esc(v)}</td></tr>` : '';
  const html = `<div style="font:14px/1.5 system-ui,sans-serif;color:#0f172a;max-width:640px">
<h2 style="margin:0 0 8px">Problem reported from the app</h2>
<p style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px">${esc(described)}</p>
<table style="border-collapse:collapse;font-size:13px">
${row('From', `${user.name || ''} <${user.email}>`.trim())}
${row('Workspace', accountId)}
${row('Login', user.accountId == null && user.role === 'agency' ? 'install owner' : user.role === 'client' ? 'client login' : 'customer')}
${row('Screen', `${where}${path}${pageTitle ? ` — “${pageTitle}”` : ''}`)}
${row('Window', view)}
${row('Browser', agent)}
${row('When', new Date().toUTCString())}
</table>
<p style="color:#64748b">Attached: ${shotNote}${extra > 0 ? ` and ${extra} picture${extra === 1 ? '' : 's'} they added` : ''}. Reply to this email to answer ${esc(user.email)} directly.${box.from.toLowerCase() === REPORT_TO ? '' : ` Sent from ${esc(box.from)} because ${REPORT_TO} is not a connected, validated mailbox.`}</p>
</div>`;
  const subject = `Problem report: ${described.replace(/\s+/g, ' ').slice(0, 70)}${described.length > 70 ? '…' : ''}`;
  const msg = { fromName: 'Protected Central support', fromEmail: box.from, subject, html, replyTo: user.email, attachments: pics };
  const first = await deliver(box.mb, { ...msg, to: REPORT_TO }).catch(e => ({ ok: false, error: String(e) }));
  const copy = await deliver(box.mb, { ...msg, to: REPORT_COPY }).catch(e => ({ ok: false, error: String(e) }));
  if (!first.ok && !copy.ok) {
    return fail(`Your report could not be sent: ${scrubSecrets(first.error)}. Please use the Help button → Submit a ticket, or write to ${REPORT_TO}.`, 502);
  }
  return json({
    success: true,
    sent: first.ok && copy.ok ? 'all' : 'partial',
    pictures: pics.length,
    message: first.ok ? 'Sent to our support team — they reply by email.' : 'Sent, but only one of the two support addresses received it.',
  });
}
