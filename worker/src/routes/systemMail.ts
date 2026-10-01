/**
 * System email — the mailbox the install itself writes from.
 *
 * Sign-in codes, sign-up confirmation codes, the trial emails on days 1, 3
 * and 5, the owner's daily digest and the notices sent from Sign-ups & trials
 * all go out from one mailbox in a workspace the install owner owns
 * (routes/auth.ts `installMailbox`). Which one used to be implicit — the first
 * validated mailbox — and nothing said so. This is the install owner's view of
 * it: which mailbox is in use and why, a choice among theirs, and a test that
 * sends one real message through exactly the path a sign-in code takes.
 *
 * Owner only. Nothing here returns a credential; a candidate is described by
 * its address, how it sends and whether it has passed validation.
 */
import { body, fail, json } from '../lib/http';
import { metaGet, metaPut, userFromToken, type Env, type SessionUser } from '../lib/db';
import { deliver, fromAddressOf } from '../lib/deliver';
import { providerLabel } from '../lib/providerApi';
import { installMailbox, systemCandidates, SYSTEM_MAILBOX_KEY } from './auth';

interface Req { token?: string; action?: string; id?: string }

const isOwner = (u: SessionUser) => u.role === 'agency' && !u.accountId;

/** What the install sends from this mailbox — shown so the choice has consequences on screen. */
const SENDS = [
  'Sign-in codes and "sign in instantly" links',
  'Sign-up confirmation codes',
  'Trial emails on days 1, 3 and 5',
  'Your daily sign-ups digest',
  'Messages you send from Sign-ups & trials',
];

export async function systemMailStatus(env: Env) {
  const all = await systemCandidates(env);
  const chosenId = (await metaGet(env.DB, SYSTEM_MAILBOX_KEY).catch(() => null)) ?? '';
  const inUse = await installMailbox(env);
  const candidates = all.map(c => ({
    id: c.id,
    label: c.label,
    fromEmail: c.fromEmail,
    via: c.provider && c.provider !== 'smtp' ? providerLabel(c.provider) : (c.smtpHost ? `SMTP · ${c.smtpHost}` : 'Not set up'),
    validated: !!c.verifiedAt,
    usable: !!(c.canSend && c.verifiedAt),
    lastError: c.verifiedAt ? '' : c.lastError.slice(0, 240),
    chosen: c.id === chosenId,
  }));
  const chosen = candidates.find(c => c.chosen);
  /* Said in words, because the owner acts on this sentence. */
  const why = !inUse
    ? (candidates.length
      ? 'None of your mailboxes has passed "Save & validate" yet, so no system email can be sent. Until one does, sign-up works without the email check and code sign-in is off.'
      : 'You have not connected a mailbox yet. Add one below, then press "Save & validate".')
    : chosen && chosen.id !== inUse.id
      ? `You chose ${chosen.fromEmail || chosen.label}, but it has not passed validation, so ${fromAddressOf(inUse)} is being used instead.`
      : chosen
        ? 'The mailbox you chose.'
        : 'Chosen automatically: your first validated mailbox. Pick one to fix it.';
  return {
    inUse: inUse ? { id: inUse.id, fromEmail: fromAddressOf(inUse), fromName: inUse.from.name } : null,
    chosenId,
    why,
    candidates,
    sends: SENDS,
  };
}

export async function handleSystemMail(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });
  if (!isOwner(user)) return fail('Only the install owner can choose the system mailbox.', 403);
  const action = String(d.action ?? '');

  if (action === 'status') return json({ success: true, ...(await systemMailStatus(env)) });

  if (action === 'choose') {
    const id = String(d.id ?? '').trim();
    /* Empty means "choose for me" — the first validated mailbox. */
    if (id) {
      const known = (await systemCandidates(env)).some(c => c.id === id);
      if (!known) return fail('That mailbox is not in one of your own workspaces.', 200, { field: 'system.mailbox' });
    }
    await metaPut(env.DB, SYSTEM_MAILBOX_KEY, id);
    return json({ success: true, ...(await systemMailStatus(env)) });
  }

  /* One real message to the owner, through the same door a sign-in code uses,
     so a green answer here means codes will arrive — not just that a key is
     accepted. */
  if (action === 'test') {
    const mb = await installMailbox(env);
    if (!mb) return fail('No mailbox can send system email yet. Validate one first.', 200, { field: 'system.mailbox' });
    const r = await deliver(mb, {
      fromName: mb.from.name || 'Protected Central',
      fromEmail: fromAddressOf(mb),
      to: user.email,
      subject: 'Test: system email from Protected Central',
      html: `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.6;color:#17191c;max-width:520px">
        <p>This is a test of your system email.</p>
        <p>Sign-in codes, sign-up confirmations, trial emails and your digest go out from <b>${fromAddressOf(mb)}</b>, exactly the way this one did.</p>
        <p style="color:#64748b;font-size:12.5px">Sent from Settings → Email &amp; SMS → System email.</p></div>`,
    });
    return json(r.ok
      ? { success: true, message: `Sent to ${user.email} from ${fromAddressOf(mb)}. If it is not in your inbox within a minute, check spam — and that the address is a verified sender with your provider.` }
      : { success: false, error: r.error, message: r.error });
  }

  return fail(`"${action}" is not something this endpoint does.`);
}
