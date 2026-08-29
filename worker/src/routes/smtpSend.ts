/**
 * Sending through the customer's own SMTP server.
 *
 * Each customer of this app brings their own mail server, so this is the
 * endpoint that matters most: it takes credentials belonging to whoever is
 * signed in and holds a real SMTP conversation with their host.
 *
 * The route ladder, the fail-closed TLS rule, and the refusal to blame the
 * network for an answer a server actually gave are all carried over from the
 * PHP — each of them was a real bug there before it was a rule.
 */
import { addr, body, fail, headerSafe, json } from '../lib/http';
import { requireSessionForSocket, type Env } from '../lib/db';
import { smtpSend, smtpVerify, type Encryption } from '../lib/smtp';
import { buildMime } from '../lib/mime';
import { loadMailbox } from './mailbox';

interface SendBody {
  token?: string;
  /** When given, credentials are taken from this workspace's stored mailbox
   *  instead of the request — which is how a browser sends without ever
   *  holding the password. */
  accountId?: string;
  host?: string; port?: number; username?: string; password?: string; encryption?: string;
  fromName?: string; fromEmail?: string;
  to?: string; subject?: string; html?: string;
  replyTo?: string; unsubscribeUrl?: string;
  /** Set by the connection test: prove the login, send nothing. */
  verifyOnly?: boolean;
}

function encryptionOf(v: unknown): Encryption {
  return v === 'ssl' ? 'ssl' : v === 'none' ? 'none' : 'tls';
}

export async function handleSmtpSend(
  req: Request,
  env: Env,
  opts: { forceVerify?: boolean } = {},
): Promise<Response> {
  const d = await body<SendBody>(req);

  const gate = await requireSessionForSocket(env.DB, d.token);
  if ('denied' in gate) return gate.denied;

  /**
   * Where the credentials come from.
   *
   * Explicit ones in the request still work — the setup wizard tests details
   * before they are saved, and has nothing stored yet. Everything else passes
   * only an accountId and the server resolves that workspace's own mailbox,
   * so the password never leaves the database.
   */
  let host = String(d.host ?? '').trim();
  let username = String(d.username ?? '').trim();
  let password = String(d.password ?? '');
  let port = Number(d.port) || 587;
  let encryption = encryptionOf(d.encryption);
  let storedFrom: { name: string; email: string; replyTo: string } | null = null;

  if (!host && d.accountId) {
    const mb = await loadMailbox(env, String(d.accountId));
    if (!mb || !mb.smtp.host) {
      return fail('This workspace has no mail server set up yet. Add one in Settings → Email & SMS.');
    }
    if (mb.smtp.username && !mb.smtp.password) {
      return fail('The saved mailbox password could not be read back. Enter it again in Settings → Email & SMS.');
    }
    host = mb.smtp.host; username = mb.smtp.username; password = mb.smtp.password;
    port = mb.smtp.port; encryption = mb.smtp.encryption;
    storedFrom = mb.from;
  }

  if (!host) return fail('Add an SMTP host in Settings → Email & SMS.');
  /* A hostname is all this should ever be. Anything else is an attempt to
     point the connection somewhere it was not meant to go. */
  if (!/^[a-z0-9.\-]+$/i.test(host)) return fail(`"${host}" is not a valid mail server name.`);

  const creds = { host, port, username, password, encryption };

  if (opts.forceVerify || d.verifyOnly) {
    const r = await smtpVerify(creds);
    return json({
      success: r.ok, transport: 'smtp', port: r.port, attempts: r.attempts,
      message: r.ok
        ? `Signed in to ${host}:${r.port} successfully.`
        : r.error,
      error: r.ok ? undefined : r.error,
    });
  }

  const to = addr(d.to);
  if (!String(d.to ?? '').trim()) return fail('Recipient address is required');
  if (!to) return fail(`"${d.to}" is not a valid email address`);

  const fromEmail = addr(d.fromEmail) ?? addr(storedFrom?.email) ?? addr(username);
  if (!fromEmail) {
    return fail(`"${d.fromEmail ?? username}" is not a valid sending address. Set one in Settings → Email & SMS.`);
  }

  const replyToRaw = String(d.replyTo ?? storedFrom?.replyTo ?? '').trim();
  if (replyToRaw && !addr(replyToRaw)) return fail(`"${replyToRaw}" is not a valid reply-to address`);

  /* A List-Unsubscribe header carries a URL and nothing else. */
  let unsubscribeUrl = String(d.unsubscribeUrl ?? '').trim();
  if (unsubscribeUrl) {
    try {
      const u = new URL(unsubscribeUrl);
      if (!/^https?:$/.test(u.protocol) || /[\r\n\0<>]/.test(unsubscribeUrl)) unsubscribeUrl = '';
    } catch { unsubscribeUrl = ''; }
  }

  const mime = buildMime({
    fromName: headerSafe(d.fromName ?? storedFrom?.name ?? 'CRM', 120),
    fromEmail,
    to,
    subject: headerSafe(d.subject ?? '', 300),
    html: String(d.html ?? ''),
    replyTo: replyToRaw || undefined,
    unsubscribeUrl: unsubscribeUrl || undefined,
  }, host);

  const r = await smtpSend(creds, { from: fromEmail, to, mime });

  if (r.ok) {
    const moved = r.port !== port;
    return json({
      success: true, transport: 'smtp', port: r.port, attempts: r.attempts,
      message: moved
        /* Worth saying plainly: it worked, but not the way it was configured,
           and the setting should be corrected so every later send does not
           pay for the blocked attempt first. */
        ? `Email accepted by ${host}:${r.port}. Port ${port} was blocked, so port ${r.port} was used instead — change the port in Settings to ${r.port} to skip that delay next time.`
        : `Email accepted by ${host}:${r.port}`,
    });
  }

  return json({ success: false, transport: 'smtp', attempts: r.attempts, message: r.error, error: r.error });
}
