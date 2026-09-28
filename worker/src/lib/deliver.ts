/**
 * Send one email from a workspace's mailbox, however that mailbox sends.
 *
 * Settings has always offered two kinds of mailbox — "its own SMTP server", or
 * a provider's API (Brevo, Resend, SendGrid, …) — but every sender on the
 * server was written against the first: each built MIME and called
 * `smtpSend(mb.smtp, …)`, and each decided whether a workspace could email at
 * all by asking `mb.smtp.host`. A provider mailbox has no host, so to the
 * campaign cron, Autopilot, replies, digests, automations and sign-in codes it
 * was no mailbox. Nothing failed loudly; nothing was sent.
 *
 * So there is one door. `canSend` answers "can this mailbox send" the same way
 * for every caller, and `deliver` routes by the mailbox's own setting. A new
 * sender calls these, never `smtpSend` directly — a second door is how the
 * first one drifted.
 */
import { buildMime, type MessageInput } from './mime';
import { smtpSend } from './smtp';
import { providerLabel, sendViaProvider } from './providerApi';
import type { Mailbox } from '../routes/mailbox';

export interface Delivered { ok: boolean; error: string; via: 'smtp' | 'api'; id?: string; port?: number }

/** Does this mailbox send through a provider's API rather than SMTP? */
export const sendsViaApi = (mb: Pick<Mailbox, 'provider'>): boolean =>
  !!mb.provider.name && mb.provider.name !== 'smtp';

/** Can this mailbox send at all, by whichever route it is set to? */
export function canSend(mb: Mailbox | null | undefined): mb is Mailbox {
  if (!mb) return false;
  if (sendsViaApi(mb)) return !!mb.provider.key;
  return !!mb.smtp.host && !(mb.smtp.username && !mb.smtp.password);
}

/** Why not, in the words of the settings screen that fixes it. */
export function cannotSendReason(mb: Mailbox | null | undefined): string {
  if (!mb) return 'No mailbox is connected, so nothing could be sent.';
  if (sendsViaApi(mb)) return `The ${providerLabel(mb.provider.name)} API key for this mailbox is missing or could not be read. Enter it again in Settings → Email & SMS.`;
  if (!mb.smtp.host) return 'This mailbox has no outgoing mail server set. Add one in Settings → Email & SMS.';
  return 'The saved mailbox password could not be read back. Enter it again in Settings → Email & SMS.';
}

/** The From address a mailbox sends as. SMTP falls back to its login. */
export const fromAddressOf = (mb: Mailbox): string =>
  mb.from.email || (sendsViaApi(mb) ? '' : mb.smtp.username);

export async function deliver(mb: Mailbox, msg: MessageInput): Promise<Delivered> {
  if (!canSend(mb)) return { ok: false, error: cannotSendReason(mb), via: sendsViaApi(mb) ? 'api' : 'smtp' };
  if (sendsViaApi(mb)) {
    if (!msg.fromEmail) return { ok: false, error: 'This mailbox has no From address. Add one in Settings → Email & SMS.', via: 'api' };
    const r = await sendViaProvider(mb.provider, msg);
    return { ok: r.ok, error: r.error, via: 'api', id: r.id };
  }
  const mime = buildMime(msg, mb.smtp.host);
  const r = await smtpSend(mb.smtp, { from: msg.fromEmail, to: msg.to, mime });
  return { ok: r.ok, error: r.error, via: 'smtp', port: r.port };
}

/**
 * `canSend` as a SQL condition on crm_mailbox_accounts, for the queries that
 * pick which workspaces a tick visits. It was `smtp_host != ''` in each of
 * them, which left every provider mailbox out of every run.
 */
export const CAN_SEND_SQL = "(smtp_host != '' OR (COALESCE(provider, '') NOT IN ('', 'smtp') AND COALESCE(provider_key, '') != ''))";
