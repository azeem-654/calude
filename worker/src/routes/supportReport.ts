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
 * Since 2026-11-15 it is also a ticket in the house widget's workspace
 * (lib/problemReport.ts), so it is found again under Help → Check ticket
 * status. Nothing pretends to have worked: with neither a ticket nor a
 * mailbox, the customer is told so; one copy failing is reported as partly
 * sent, and a saved ticket whose email could not go says it was saved.
 */
import { fail, json } from '../lib/http';
import { canAccess, userFromToken, type Env } from '../lib/db';
import { redactPhi } from '../lib/phiGuard';
import { rateLimit } from '../lib/rateLimit';
import { fileProblemTicket, mailProblem, MAX_REPORT_TEXT, readPictures, REPORT_COPY, REPORT_TO } from '../lib/problemReport';
import { houseWidgetAccount } from './engage';

export { REPORT_TO, REPORT_COPY };

export async function handleSupportReport(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return fail('Send this as a POST.', 405);
  let d: Record<string, unknown>;
  try { d = await req.json() as Record<string, unknown>; } catch { return fail('That was not a valid request.'); }
  const user = await userFromToken(env.DB, String(d.token ?? ''));
  if (!user) return fail('Sign in again — this needs a current session.', 401, { code: 'unauthorised' });
  const accountId = String(d.accountId ?? '').trim();
  if (!accountId || !(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours.', 403);

  const described = redactPhi(String(d.description ?? '').trim().slice(0, MAX_REPORT_TEXT)).text;
  if (described.length < 5) return fail('Say what went wrong, in a sentence or two.', 200, { field: 'report.description' });

  const read = readPictures(d.screenshot, d.pictures);
  if (!read.ok) return fail(read.message, 200, read.field ? { field: read.field } : {});
  const { pics, shot } = read;

  const gate = await rateLimit(env, { what: 'support-report', who: user.email.toLowerCase(), max: 5, windowSeconds: 3600 });
  if (!gate.allowed) return fail(`That is five reports this hour — please wait ${Math.ceil(gate.retryAfter / 60)} minutes, or use the Help button's ticket.`, 429);

  const path = String(d.path ?? '').slice(0, 300);
  const pageTitle = String(d.pageTitle ?? '').slice(0, 160);
  const where = String(env.APP_ORIGIN ?? new URL(req.url).origin).replace(/\/$/, '');
  const screen = `${where}${path}${pageTitle ? ` — “${pageTitle}”` : ''}`;

  /* A ticket first, in the house widget's workspace — what "Check ticket
     status" finds again from the session's email. No house widget, no
     ticket: the email alone, as before. */
  const house = await houseWidgetAccount(env);
  const filed = house
    ? await fileProblemTicket(env, house, {
      email: user.email, name: user.name || '', described, page: screen, pics,
      context: { page: screen, workspace: accountId, signedIn: true },
    }).catch(() => null)
    : null;

  const mail = await mailProblem(env, {
    described, name: user.name || '', email: user.email, pics, shot, reference: filed?.reference, signedIn: true,
    rows: [
      ['Workspace', accountId],
      ['Login', user.accountId == null && user.role === 'agency' ? 'install owner' : user.role === 'client' ? 'client login' : 'customer'],
      ['Screen', screen],
      ['Window', String(d.viewport ?? '').slice(0, 40)],
      ['Browser', (req.headers.get('user-agent') ?? '').slice(0, 300)],
    ],
  });

  if (!filed && mail.sent === 'none') {
    return mail.error === 'no_mailbox'
      ? fail(`Support email is not connected yet, so this could not be sent. Please use the Help button → Submit a ticket, or write to ${REPORT_TO}.`, 503, { code: 'no_mailbox' })
      : fail(`Your report could not be sent: ${mail.error}. Please use the Help button → Submit a ticket, or write to ${REPORT_TO}.`, 502);
  }
  const ref = filed ? ` Your reference is ${filed.reference} — find it again under Help → Check ticket status.` : '';
  return json({
    success: true,
    sent: mail.sent === 'all' ? 'all' : 'partial',
    pictures: pics.length,
    reference: filed?.reference ?? '',
    message: mail.sent === 'all' ? `Sent to our support team — they reply by email.${ref}`
      : mail.sent === 'partial' ? `Sent, but only one of the two support addresses received it.${ref}`
        : `Saved as a ticket for our support team — they reply by email.${ref}`,
  });
}
