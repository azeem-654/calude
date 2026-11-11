/**
 * What a workspace's sending pool looks like today — its domains, mailboxes
 * per domain, and which domains are authenticated. Split out of
 * autopilotTick.ts so it can be tested without the mail stack (D-3).
 */
import type { Env } from './db';
import type { PoolState } from './sendingPool';

export async function poolState(env: Env, accountId: string, mailboxes: { from: { email: string }; smtp: { username: string } }[]): Promise<PoolState> {
  const byDomain: Record<string, number> = {};
  for (const mb of mailboxes) {
    const addr = mb.from.email || mb.smtp.username;
    const dm = addr.includes('@') ? addr.split('@')[1].toLowerCase() : '';
    if (dm) byDomain[dm] = (byDomain[dm] ?? 0) + 1;
  }

  /* crm_provisioned is infra.ts's own audit of what it set up, which is the
     only record of a domain having had its DNS written. */
  const rows = await env.DB.prepare(
    `SELECT DISTINCT kind, subject FROM crm_provisioned
     WHERE account_id = ? AND outcome = 'ok' AND kind IN ('domain','dns')`,
  ).bind(accountId).all<{ kind: string; subject: string }>();

  const domains = new Set<string>(Object.keys(byDomain));
  const authenticated = new Set<string>();

  for (const r of rows.results ?? []) {
    const dm = (r.subject ?? '').toLowerCase();
    if (!dm) continue;
    domains.add(dm);
    if (r.kind === 'dns') authenticated.add(dm);
  }
  /* A domain hosted here whose sending the provider verified is authenticated
     by construction — hostedMail.ts wrote its SPF, DKIM and DMARC (D-3). Only
     one already in the pool: a hosted domain is not added to it, since its
     addresses are made under Your own domain, not bought as mailboxes. */
  const hosted = await env.DB.prepare("SELECT domain FROM crm_hosted_domains WHERE account_id = ? AND send_status = 'verified'")
    .bind(accountId).all<{ domain: string }>().catch(() => ({ results: [] as { domain: string }[] }));
  for (const h of hosted.results ?? []) if (domains.has(h.domain.toLowerCase())) authenticated.add(h.domain.toLowerCase());

  return {
    domains: [...domains],
    mailboxesByDomain: byDomain,
    authenticated: [...authenticated],
  };
}
