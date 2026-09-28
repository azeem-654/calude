/**
 * Sending over HTTPS, for customers who use a provider rather than their own
 * SMTP server.
 *
 * This began as a way around shared hosting blocking outbound mail ports, where
 * 443 was the one route that always survived. Here SMTP works, so it is no
 * longer a fallback — it is simply the other thing customers use, and for
 * several of these the API is the only way in.
 *
 * It stays server-side for the reason it always should have been: none of
 * these APIs send an Access-Control-Allow-Origin header, so a browser refuses
 * the request before it is made, and a sending key in the page is a licence to
 * send as that customer sitting where any script can read it.
 */
import { signTrackedLinks } from '../lib/trackSign';
import { providerLabel, sendViaProvider } from '../lib/providerApi';
import { addr, body, fail, headerSafe, json } from '../lib/http';
import { requireSessionForSocket, denyForeignWorkspace, type Env } from '../lib/db';
import { loadMailbox } from './mailbox';
import { gate as contentGate } from '../lib/contentGate';

interface ProviderBody {
  token?: string;
  accountId?: string;
  provider?: string;
  apiKey?: string; apiSecret?: string; apiUrl?: string; domain?: string;
  fromName?: string; fromEmail?: string;
  to?: string; subject?: string; html?: string;
  replyTo?: string; unsubscribeUrl?: string;
}

export async function handleProviderSend(req: Request, env: Env): Promise<Response> {
  const d = await body<ProviderBody>(req);
  const gate = await requireSessionForSocket(env.DB, d.token);
  if ('denied' in gate) return gate.denied;
  const foreign = await denyForeignWorkspace(env.DB, gate.user, d.accountId);
  if (foreign) return foreign;

  /*
   * The key comes from the workspace's mailbox, not from the browser.
   *
   * It used to arrive in the request body, which meant a licence to send as the
   * customer sat in localStorage — readable by any script or extension on the
   * page — and that the cron could not use an API provider at all, because a
   * scheduler has no request to take a key from. The mailbox record already had
   * provider fields; this reads them.
   *
   * Explicit values still win, so the settings screen can test a key before
   * committing it. That path never carries a campaign.
   */
  let provider = String(d.provider ?? '').toLowerCase().trim();
  let apiKey = String(d.apiKey ?? '').trim();
  let apiSecret = String(d.apiSecret ?? '').trim();
  let domain = String(d.domain ?? '').trim();
  let apiUrl = String(d.apiUrl ?? '').trim();

  if (!apiKey && d.accountId) {
    const mb = await loadMailbox(env, String(d.accountId));
    if (mb?.provider.key) {
      provider = provider || mb.provider.name;
      apiKey = mb.provider.key;
      apiSecret = apiSecret || mb.provider.secret;
      domain = domain || mb.provider.domain;
      apiUrl = apiUrl || mb.provider.url;
    }
  }

  if (!provider) return fail('No provider was named.');
  if (!apiKey) return fail('No sending key is set up for this workspace. Add one in Settings → Email & SMS → Mailboxes.');
  if (!String(d.to ?? '').trim()) return fail('Recipient address is required');

  const to = addr(d.to);
  if (!to) return fail(`"${d.to}" is not a valid email address`);
  const fromEmail = addr(d.fromEmail);
  if (!String(d.fromEmail ?? '').trim()) return fail('A sending address is required. Set one in Settings → Email & SMS.');
  if (!fromEmail) return fail(`"${d.fromEmail}" is not a valid sending address.`);
  const replyRaw = String(d.replyTo ?? '').trim();
  if (replyRaw && !addr(replyRaw)) return fail(`"${replyRaw}" is not a valid reply-to address`);

  const fromName = headerSafe(d.fromName ?? 'CRM', 120);
  const subject = headerSafe(d.subject ?? '', 300) || '(no subject)';
  const html = await signTrackedLinks(env, String(d.html ?? ''));

  /* The other email exit. A workspace that sends through Resend or Brevo rather
     than its own SMTP is on the same terms — an exit guarded on one route and
     not its twin is not guarded. */
  if (d.accountId) {
    const verdict = await contentGate(env, String(d.accountId), 'email', `${subject}\n\n${html}`);
    if (!verdict.ok) {
      return json({ success: false, held: verdict.verdict === 'review', message: verdict.message, error: verdict.message });
    }
  }
  let unsub = String(d.unsubscribeUrl ?? '').trim();
  if (unsub) { try { const u = new URL(unsub); if (!/^https?:$/.test(u.protocol)) unsub = ''; } catch { unsub = ''; } }

  /* The sending itself is lib/providerApi, shared with every server-side
     sender through lib/deliver — one implementation per provider. */
  const r = await sendViaProvider(
    { name: provider, key: apiKey, secret: apiSecret, domain, url: apiUrl },
    { fromName, fromEmail, to, subject, html, replyTo: replyRaw || fromEmail, unsubscribeUrl: unsub || undefined },
  );
  if (r.ok) {
    return json({ success: true, transport: 'api', provider, id: r.id, message: `Accepted by ${providerLabel(provider)} over HTTPS.` });
  }
  return json({ success: false, transport: 'api', provider, status: r.status || undefined, message: r.error, error: r.error });
}
