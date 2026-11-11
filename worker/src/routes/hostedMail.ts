/**
 * /api/hosted-mail.php — email on the customer's own domain (lib/hostedMail.ts).
 *
 * Workspace actions (`status`, `add_domain`, `refresh`, `remove_domain`,
 * `add_address`, `remove_address`) are checked against the workspace on the
 * server, and every row is read and written with `account_id = ?` — a domain
 * or address id from another workspace finds nothing. The operator's
 * Cloudflare token and sending key (`config`, `save_config`) are the install
 * owner's alone and never returned.
 */
import { body, fail, json } from '../lib/http';
import { mailWebhookUrl } from '../lib/bounces';
import { canAccess, userFromToken, type Env, type SessionUser } from '../lib/db';
import {
  addAddress, addDomain, hostedConfig, hostedConfigView, listAddresses, listDomains, refreshDomain, removeAddress, removeDomain,
  saveHostedConfig, type DomainRow,
} from '../lib/hostedMail';

interface Req {
  token?: string; action?: string; accountId?: string; domain?: string; domainId?: string; addressId?: string; local?: string; name?: string;
  cfToken?: string; cfAccountId?: string; workerName?: string; sendProvider?: string; sendKey?: string; eventsSecret?: string;
}

const isOwner = (u: SessionUser) => u.role === 'agency' && !u.accountId;

/** A domain as the screen shows it: the state of each step, never a key. */
function view(d: DomainRow) {
  let ns: string[] = [];
  try { ns = JSON.parse(d.nameservers) as string[]; } catch { ns = []; }
  return {
    id: d.id, domain: d.domain, nameservers: ns, zone: d.zone_status, receiving: d.routing_status, sending: d.send_status,
    sendProvider: d.send_provider, error: d.last_error, checkedAt: d.checked_at, createdAt: d.created_at,
  };
}

export async function handleHostedMail(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this needs a current session.', 401, { code: 'unauthorised' });
  const act = String(d.action ?? 'status');

  /* The operator's side. */
  if (act === 'config' || act === 'save_config') {
    if (!isOwner(user)) return fail('Only the owner of this installation can change this.', 403, { code: 'not_owner' });
    /* The bounce-and-complaint address to paste at the provider (E-7). The
       owner only: the token in it is what lets a post suppress addresses. */
    const configView = async () => {
      const v = await hostedConfigView(env);
      const origin = (env.APP_ORIGIN ?? new URL(req.url).origin).replace(/\/$/, '');
      return { ...v, eventsUrl: await mailWebhookUrl(env, origin, v.sendProvider === 'brevo' ? 'brevo' : 'resend') };
    };
    if (act === 'config') return json({ success: true, config: await configView() });
    const r = await saveHostedConfig(env, {
      cfToken: d.cfToken, cfAccountId: d.cfAccountId, workerName: d.workerName,
      sendProvider: d.sendProvider === 'brevo' ? 'brevo' : d.sendProvider === 'resend' ? 'resend' : undefined, sendKey: d.sendKey,
      eventsSecret: d.eventsSecret,
    });
    if (!r.ok) return fail(r.error, 200, r.field ? { field: r.field } : {});
    return json({ success: true, config: await configView() });
  }

  const accountId = String(d.accountId ?? '').trim();
  if (!/^[A-Za-z0-9_.\-]{1,64}$/.test(accountId)) return fail('A valid workspace is required.');
  if (!(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours.', 403);

  const domainRow = async () => (d.domainId ? env.DB.prepare('SELECT * FROM crm_hosted_domains WHERE id = ? AND account_id = ?').bind(String(d.domainId), accountId).first<DomainRow>() : null);
  const status = async () => {
    const [domains, addresses, c] = await Promise.all([listDomains(env, accountId), listAddresses(env, accountId), hostedConfig(env)]);
    return {
      available: !!c, sending: !!c?.sendKey,
      domains: domains.map(view),
      addresses: addresses.map(a => ({ id: a.id, domainId: a.domain_id, address: a.address, mailboxId: a.mailbox_id, messages: a.messages, createdAt: a.created_at })),
    };
  };

  if (act === 'status') return json({ success: true, ...(await status()) });

  if (act === 'add_domain') {
    const r = await addDomain(env, accountId, String(d.domain ?? ''));
    if (!r.ok) return fail(r.error, 200, r.field ? { field: r.field } : {});
    await refreshDomain(env, r.row);
    return json({ success: true, ...(await status()) });
  }
  if (act === 'refresh') {
    const row = await domainRow();
    if (!row) return fail('That domain is not in this workspace.', 404);
    await refreshDomain(env, row);
    return json({ success: true, ...(await status()) });
  }
  if (act === 'remove_domain') {
    const row = await domainRow();
    if (!row) return fail('That domain is not in this workspace.', 404);
    const r = await removeDomain(env, row);
    return json({ success: true, warning: r.ok ? undefined : r.error, ...(await status()) });
  }
  if (act === 'add_address') {
    const r = await addAddress(env, accountId, String(d.domainId ?? ''), String(d.local ?? ''), String(d.name ?? ''));
    if (!r.ok) return fail(r.error, 200, r.field ? { field: r.field } : {});
    return json({ success: true, address: r.address, ...(await status()) });
  }
  if (act === 'remove_address') {
    if (!(await removeAddress(env, accountId, String(d.addressId ?? '')))) return fail('That address is not in this workspace.', 404);
    return json({ success: true, ...(await status()) });
  }
  return fail(`"${act}" is not something this endpoint does.`);
}
