/**
 * The remaining endpoints, each small enough that a file of its own would be
 * more ceremony than code.
 *
 *   imap-fetch      read the customer's inbox
 *   mail-probe      what can this deployment actually reach?
 *   sms-send        Twilio, over HTTPS
 *   deliverability  suppression list and domain checks
 *   blog-publish    push a post to WordPress
 *   diagnostics     is this install healthy?
 *   install         no longer a thing, and says so
 */
import { body, fail, headerSafe, json, ok } from '../lib/http';
import { canAccess, dataGet, dataPut, hasAnyUser, requireSessionForSocket, userFromToken, type Env } from '../lib/db';
import { imapFetch } from '../lib/imap';
import { smtpVerify } from '../lib/smtp';

/* ── Inbox ───────────────────────────────────────────────────────────────── */

export async function handleImapFetch(req: Request, env: Env): Promise<Response> {
  const d = await body<{
    token?: string; host?: string; port?: number; encryption?: string;
    username?: string; password?: string; folder?: string; limit?: number;
  }>(req);

  const gate = await requireSessionForSocket(env.DB, d.token);
  if ('denied' in gate) return gate.denied;

  const host = String(d.host ?? '').trim();
  const username = String(d.username ?? '').trim();
  if (!host || !username) return fail('Mailbox host and username are required.');
  if (!/^[a-z0-9.\-]+$/i.test(host)) return fail(`"${host}" is not a valid mailbox host.`);

  const r = await imapFetch({
    host,
    port: Number(d.port) || 993,
    encryption: d.encryption === 'tls' ? 'tls' : d.encryption === 'none' ? 'none' : 'ssl',
    username,
    password: String(d.password ?? ''),
    folder: String(d.folder ?? 'INBOX'),
  }, Number(d.limit) || 20);

  return json({ success: r.ok, messages: r.messages, error: r.ok ? undefined : r.error, message: r.ok ? undefined : r.error });
}

/* ── What can this deployment reach? ─────────────────────────────────────── */

/**
 * On Freehostia this answered a question that mattered enormously: which mail
 * ports does this shared host let out? Cloudflare's answer is different and
 * mostly better — 443 always works, and outbound 25 never does — so this now
 * reports what is true here rather than pretending the old uncertainty.
 */
export async function handleMailProbe(req: Request, env: Env): Promise<Response> {
  const d = await body<{ token?: string; host?: string; port?: number; encryption?: string }>(req);
  const gate = await requireSessionForSocket(env.DB, d.token);
  if ('denied' in gate) return gate.denied;

  const apis = ['https://api.brevo.com/v3/account', 'https://api.resend.com/domains', 'https://api.mailjet.com/v3/REST/sender'];
  const apiResults = await Promise.all(apis.map(async url => {
    const started = Date.now();
    try {
      const r = await fetch(url, { method: 'GET' });
      return { label: new URL(url).hostname, open: true, ms: Date.now() - started, detail: `answered HTTP ${r.status}` };
    } catch (e) {
      return { label: new URL(url).hostname, open: false, ms: Date.now() - started, detail: e instanceof Error ? e.message : 'no response' };
    }
  }));

  /* The customer's own server is the only port test worth running: a generic
     sweep of public relays told them about Cloudflare's network, not theirs. */
  const ports: { label: string; port: number; open: boolean; detail: string }[] = [];
  const host = String(d.host ?? '').trim();
  if (host && /^[a-z0-9.\-]+$/i.test(host)) {
    const port = Number(d.port) || 587;
    const r = await smtpVerify({
      host, port,
      username: '', password: '',
      encryption: d.encryption === 'ssl' ? 'ssl' : d.encryption === 'none' ? 'none' : 'tls',
    });
    for (const a of r.attempts) {
      ports.push({
        label: `${host}:${a.port}`, port: a.port, open: a.ok || a.reachable,
        detail: a.ok ? 'reachable and speaking SMTP' : (a.detail || 'no answer'),
      });
    }
  }

  const anyPort = ports.some(p => p.open);
  const anyApi = apiResults.some(a => a.open);

  return json({
    success: true,
    env: { platform: 'cloudflare-workers', sockets: true, https: anyApi, mail: false },
    ports, apis: apiResults,
    route: anyPort ? 'smtp' : anyApi ? 'api' : 'none',
    headline: anyPort
      ? 'Your mail server is reachable from this deployment.'
      : anyApi
        ? 'HTTPS mail APIs are reachable. Your own SMTP server was not tested, or did not answer.'
        : 'Nothing was reachable, which is unusual on this platform — check the host name.',
    advice: anyPort
      ? 'Nothing is in the way. Send a delivery check to prove it end to end.'
      : 'Cloudflare allows outbound SMTP on 587, 465 and 2525, and blocks port 25 as every network does. '
        + 'If your own server did not answer, the host name or port is likely wrong rather than blocked.',
    checkedAt: new Date().toISOString(),
  });
}

/* ── SMS ─────────────────────────────────────────────────────────────────── */

export async function handleSmsSend(req: Request, env: Env): Promise<Response> {
  const d = await body<{ token?: string; accountSid?: string; authToken?: string; from?: string; to?: string; body?: string }>(req);
  const gate = await requireSessionForSocket(env.DB, d.token);
  if ('denied' in gate) return gate.denied;

  const sid = String(d.accountSid ?? '').trim();
  const auth = String(d.authToken ?? '').trim();
  const from = String(d.from ?? '').trim();
  const to = String(d.to ?? '').trim();
  const text = String(d.body ?? '').trim();

  if (!sid || !auth || !from) return fail('Add your Twilio SID, auth token and sending number in Settings → Email & SMS.');
  if (!/^\+[1-9]\d{6,14}$/.test(to)) return fail(`"${to}" is not a phone number in international format, e.g. +15551234567.`);
  if (!text) return fail('The message is empty.');
  if (!/^AC[0-9a-f]{32}$/i.test(sid)) return fail('That does not look like a Twilio Account SID — they start with "AC".');

  const form = new URLSearchParams({ From: from, To: to, Body: text.slice(0, 1600) });
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + btoa(`${sid}:${auth}`), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const data = await r.json<{ sid?: string; message?: string; code?: number }>().catch(() => ({}) as { sid?: string; message?: string; code?: number });
    if (r.ok) return json({ success: true, id: data.sid ?? 'sent', message: 'Twilio accepted the message.' });
    return fail(`Twilio refused it (HTTP ${r.status}): ${data.message ?? 'no reason given'}`);
  } catch (e) {
    return fail(`Could not reach Twilio: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/* ── Deliverability ──────────────────────────────────────────────────────── */

/**
 * The suppression list, and the DNS records that decide whether a campaign
 * reaches an inbox at all. DNS is resolved through Cloudflare's own DNS-over-
 * HTTPS, which needs no extension and no configuration.
 */
export async function handleDeliverability(req: Request, env: Env): Promise<Response> {
  const d = await body<{ token?: string; action?: string; accountId?: string; domain?: string; selector?: string; list?: unknown }>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });

  const accountId = String(d.accountId ?? '').trim();
  if (accountId && !canAccess(user, accountId)) return fail('That workspace is not yours to read.', 403);

  if (d.action === 'get_suppressions') {
    const raw = await dataGet(env.DB, accountId || '__agency__', 'crm_suppressions');
    return json({ success: true, suppressions: raw ? JSON.parse(raw) : [] });
  }

  if (d.action === 'save_suppressions') {
    await dataPut(env.DB, accountId || '__agency__', 'crm_suppressions', JSON.stringify(d.list ?? []));
    return ok();
  }

  if (d.action === 'check_domain') {
    const domain = String(d.domain ?? '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9.\-]{1,253}$/.test(domain)) return fail('Enter the domain you send from, e.g. yourbusiness.com');
    const selector = String(d.selector ?? 'default').replace(/[^a-z0-9_\-]/gi, '') || 'default';

    /**
     * "We asked and there is no record" and "we could not ask" are different
     * answers and must not collapse into the same one. Telling somebody their
     * SPF record is missing when the lookup itself failed sends them to edit
     * DNS that was already correct.
     */
    const resolve = async (name: string, type: 'TXT' | 'MX'): Promise<{ asked: boolean; records: string[]; why: string }> => {
      try {
        const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, {
          headers: { Accept: 'application/dns-json' },
        });
        if (!r.ok) return { asked: false, records: [], why: `the DNS service answered HTTP ${r.status}` };
        const j = await r.json<{ Answer?: { data: string }[] }>();
        return {
          asked: true,
          records: (j.Answer ?? []).map(a => a.data.replace(/^"|"$/g, '').replace(/"\s+"/g, '')),
          why: '',
        };
      } catch (e) {
        return { asked: false, records: [], why: e instanceof Error ? e.message : 'the DNS lookup failed' };
      }
    };

    const [spfR, dmarcR, dkimR, mxR] = await Promise.all([
      resolve(domain, 'TXT'),
      resolve(`_dmarc.${domain}`, 'TXT'),
      resolve(`${selector}._domainkey.${domain}`, 'TXT'),
      resolve(domain, 'MX'),
    ]);

    /* If the lookups could not run at all, say that rather than reporting four
       missing records. */
    if (!spfR.asked && !dmarcR.asked && !dkimR.asked && !mxR.asked) {
      return fail(`The DNS records could not be checked right now — ${spfR.why}. Nothing about your domain has changed; try again shortly.`);
    }

    const spf = spfR.records, dmarc = dmarcR.records, dkim = dkimR.records, mx = mxR.records;

    const spfRecord = spf.find(t => t.toLowerCase().startsWith('v=spf1')) ?? '';
    const dmarcRecord = dmarc.find(t => t.toLowerCase().startsWith('v=dmarc1')) ?? '';
    const dkimRecord = dkim.find(t => t.toLowerCase().includes('p=')) ?? '';

    return json({
      success: true,
      domain,
      spf: { found: !!spfRecord, record: spfRecord, checked: spfR.asked },
      dmarc: { found: !!dmarcRecord, record: dmarcRecord, checked: dmarcR.asked },
      dkim: { found: !!dkimRecord, record: dkimRecord, selector, checked: dkimR.asked },
      mx: { found: mx.length > 0, records: mx, checked: mxR.asked },
    });
  }

  return fail(`"${d.action ?? ''}" is not something this endpoint does.`);
}

/* ── Blog publishing ─────────────────────────────────────────────────────── */

export async function handleBlogPublish(req: Request, env: Env): Promise<Response> {
  const d = await body<{
    token?: string; siteUrl?: string; username?: string; appPassword?: string;
    title?: string; content?: string; status?: string; excerpt?: string;
  }>(req);
  const gate = await requireSessionForSocket(env.DB, d.token);
  if ('denied' in gate) return gate.denied;

  const site = String(d.siteUrl ?? '').trim().replace(/\/$/, '');
  const username = String(d.username ?? '').trim();
  const appPassword = String(d.appPassword ?? '').trim();
  if (!site || !username || !appPassword) {
    return fail('Connect a WordPress site first — it needs the site URL, a username and an application password.');
  }
  let base: URL;
  try {
    base = new URL(site);
    if (base.protocol !== 'https:') return fail('The WordPress site must be reachable over https.');
  } catch { return fail(`"${site}" is not a valid site address.`); }

  const title = headerSafe(d.title, 250);
  if (!title) return fail('The post needs a title.');

  try {
    const r = await fetch(`${base.origin}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${username}:${appPassword}`),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        content: String(d.content ?? ''),
        excerpt: String(d.excerpt ?? '').slice(0, 500),
        status: d.status === 'publish' ? 'publish' : 'draft',
      }),
    });
    const data = await r.json<{ id?: number; link?: string; message?: string }>().catch(() => ({}) as { id?: number; link?: string; message?: string });
    if (r.ok) return json({ success: true, id: data.id, link: data.link, message: 'Published to WordPress.' });
    return fail(`WordPress refused the post (HTTP ${r.status}): ${data.message ?? 'no reason given'}`);
  } catch (e) {
    return fail(`Could not reach that WordPress site: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/* ── Health ──────────────────────────────────────────────────────────────── */

export async function handleDiagnostics(req: Request, env: Env): Promise<Response> {
  const d = await body<{ token?: string }>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user && (await hasAnyUser(env.DB))) {
    return fail('Your session has expired. Sign in again, then re-run the checks.', 401, { code: 'unauthorised' });
  }

  const checks: { id: string; label: string; status: 'pass' | 'warn' | 'fail'; detail: string }[] = [];
  const add = (id: string, label: string, status: 'pass' | 'warn' | 'fail', detail: string) =>
    checks.push({ id, label, status, detail });

  /* A real query, not a binding check: a bound database that cannot be read
     looks identical from here otherwise. */
  try {
    await env.DB.prepare('SELECT 1 AS n').first();
    add('database', 'D1 database', 'pass', 'connected and answering');
  } catch (e) {
    add('database', 'D1 database', 'fail', `not reachable: ${e instanceof Error ? e.message : String(e)}`);
  }

  for (const [table, why] of [
    ['crm_users', 'accounts and passwords'],
    ['crm_sessions', 'who is signed in'],
    ['crm_data', 'the workspace records the app syncs'],
    ['crm_track', 'campaign opens and clicks'],
    ['crm_unsubscribes', 'the opt-out list'],
    ['crm_bookings', 'guest bookings'],
  ] as const) {
    try {
      const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
      add(`table_${table}`, table, 'pass', `${row?.n ?? 0} row(s) — ${why}`);
    } catch {
      add(`table_${table}`, table, 'fail', `missing — ${why} will not work. Run the migration.`);
    }
  }

  add('sockets', 'Outbound SMTP', 'pass', 'this runtime can open mail connections, so any customer SMTP server works');
  add('stripe', 'Stripe', env.STRIPE_SECRET_KEY ? 'pass' : 'warn',
    env.STRIPE_SECRET_KEY ? 'secret key configured' : 'not configured — run: wrangler secret put STRIPE_SECRET_KEY');

  return json({ success: true, checks, platform: 'cloudflare-workers' });
}

/**
 * There is nothing to install any more.
 *
 * On Freehostia this created a MySQL table and wrote a config.php with the
 * database password in it. Here the database is a binding and the schema is a
 * migration, so the honest answer is to say so rather than pretend a wizard
 * still does something.
 */
export function handleInstall(): Response {
  return json({
    success: true,
    installed: true,
    message: 'Nothing to install — this deployment uses D1, set up by its migration. '
      + 'Run `wrangler d1 migrations apply crmpro` if the tables are missing.',
  });
}
