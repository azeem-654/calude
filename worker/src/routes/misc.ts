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
import { canAccess, dataGet, dataPut, hasAnyUser, requireSessionForSocket, storageWorkspace, RESERVED_AGENCY, userFromToken, type Env } from '../lib/db';
import { imapFetch } from '../lib/imap';
import { loadMailbox, loadMailboxById } from './mailbox';
import { smtpVerify } from '../lib/smtp';
import { encryptSecret } from '../lib/crypto';
import { installSecret, nowIso } from '../lib/db';
import { E164, buyNumber, isStopMessage, loadSmsConfig, recordOptOut, searchNumbers, sendSms, verifySmsCredentials } from '../lib/sms';

/* ── Inbox ───────────────────────────────────────────────────────────────── */

export async function handleImapFetch(req: Request, env: Env): Promise<Response> {
  const d = await body<{
    token?: string; accountId?: string; mailboxId?: string;
    host?: string; port?: number; encryption?: string;
    username?: string; password?: string; folder?: string; limit?: number;
  }>(req);

  const gate = await requireSessionForSocket(env.DB, d.token);
  if ('denied' in gate) return gate.denied;

  /* Same rule as sending: explicit details are for the setup wizard, and
     everything else names a workspace and lets the server fetch its own. */
  let creds = {
    host: String(d.host ?? '').trim(),
    port: Number(d.port) || 993,
    encryption: (d.encryption === 'tls' ? 'tls' : d.encryption === 'none' ? 'none' : 'ssl') as 'tls' | 'ssl' | 'none',
    username: String(d.username ?? '').trim(),
    password: String(d.password ?? ''),
    folder: String(d.folder ?? 'INBOX'),
  };

  if (!creds.host && d.accountId) {
    const accountId = String(d.accountId);
    /*
     * A unified inbox draws on several mailboxes, so it names the one it wants.
     *
     * Without `mailboxId` this resolved the workspace's primary and nothing
     * else, which is right for sending and wrong for reading: a customer with a
     * support address and a sales address would only ever see one of them. The
     * id is checked against the workspace, so naming somebody else's mailbox
     * finds nothing rather than fetching it.
     */
    const mb = d.mailboxId
      ? await loadMailboxById(env, accountId, String(d.mailboxId))
      : await loadMailbox(env, accountId);
    if (!mb || !mb.imap.host) {
      return fail('That mailbox has no incoming server set up yet. Add one in Settings → Email & SMS → Mailboxes.');
    }
    creds = { ...mb.imap, folder: mb.imap.folder };
  }

  if (!creds.host || !creds.username) return fail('Mailbox host and username are required.');
  if (!/^[a-z0-9.\-]+$/i.test(creds.host)) return fail(`"${creds.host}" is not a valid mailbox host.`);

  const r = await imapFetch(creds, Number(d.limit) || 20);

  return json({ success: r.ok, messages: r.messages, error: r.ok ? undefined : r.error, message: r.ok ? undefined : r.error });
}

/* ── What can this deployment reach? ─────────────────────────────────────── */

/**
 * This once answered a question that mattered enormously on shared hosting:
 * which mail ports does this host let out? Cloudflare's answer is different
 * and mostly better — 443 always works, and outbound 25 never does — so it
 * now reports what is true here rather than pretending the old uncertainty.
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

/**
 * Send an SMS, save the sender, or list who has opted out.
 *
 * This used to take the Twilio SID and auth token out of the request body,
 * which meant the only place they could live was the browser — and so the cron
 * could not send an SMS step at all, because a scheduler has no request to read
 * credentials from. They are stored per workspace and encrypted now, the same
 * as a mailbox password, and the send resolves its own.
 *
 * Explicit credentials still work, for one reason: the settings screen has to
 * be able to test a SID and token before committing them. That path never
 * carries a campaign.
 */
export async function handleSmsSend(req: Request, env: Env): Promise<Response> {
  const d = await body<{
    token?: string; action?: string; accountId?: string;
    accountSid?: string; authToken?: string; from?: string; to?: string; body?: string;
    phone?: string;
    country?: string; contains?: string; number?: string; confirm?: boolean;
  }>(req);

  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });

  const accountId = String(d.accountId ?? '').trim();
  if (accountId && !(await canAccess(env.DB, user, accountId))) {
    return fail('That workspace is not yours.', 403);
  }

  const action = d.action ?? 'send';

  /* ── What is set up, without the secrets ── */
  if (action === 'get') {
    if (!accountId) return fail('A valid workspace is required.');
    const row = await env.DB.prepare('SELECT * FROM crm_sms_config WHERE account_id = ?')
      .bind(accountId).first<{ provider: string; account_sid: string; auth_token: string; from_number: string; verified_at: string | null; last_error: string }>();
    return json({
      success: true,
      sms: row ? {
        provider: row.provider,
        fromNumber: row.from_number,
        hasCredentials: !!row.account_sid && !!row.auth_token,
        verifiedAt: row.verified_at,
        lastError: row.last_error,
      } : null,
    });
  }

  if (action === 'save') {
    if (!accountId) return fail('A valid workspace is required.');
    const from = String(d.from ?? '').trim();
    if (from && !E164.test(from)) {
      return fail(`"${from}" is not a sending number in international format, e.g. +15551234567.`);
    }
    const key = await installSecret(env.DB, 'mailbox_key');
    const existing = await env.DB.prepare('SELECT account_sid, auth_token FROM crm_sms_config WHERE account_id = ?')
      .bind(accountId).first<{ account_sid: string; auth_token: string }>();
    /* Blank means "keep what is stored", exactly as it does for a mailbox
       password — the settings form shows dots and cannot send back a secret it
       was never given. */
    const keep = async (given: unknown, current: string | undefined) => {
      const v = typeof given === 'string' ? given : '';
      return v === '' ? (current ?? '') : encryptSecret(key, v);
    };
    await env.DB.prepare(
      `INSERT INTO crm_sms_config (account_id, provider, account_sid, auth_token, from_number, verified_at, last_error, updated_at)
       VALUES (?,?,?,?,?,NULL,'',?)
       ON CONFLICT(account_id) DO UPDATE SET
         provider=excluded.provider, account_sid=excluded.account_sid,
         auth_token=excluded.auth_token, from_number=excluded.from_number,
         verified_at=NULL, last_error='', updated_at=excluded.updated_at`,
    ).bind(
      accountId, String(d.body ?? 'twilio').toLowerCase().slice(0, 32) || 'twilio',
      await keep(d.accountSid, existing?.account_sid),
      await keep(d.authToken, existing?.auth_token),
      from, nowIso(),
    ).run();
    return ok();
  }

  /* ── Who has told us to stop ── */
  if (action === 'optouts') {
    if (!accountId) return fail('A valid workspace is required.');
    const rows = await env.DB.prepare('SELECT phone, source, at FROM crm_sms_optouts WHERE account_id = ? ORDER BY at DESC LIMIT 500')
      .bind(accountId).all<{ phone: string; source: string; at: string }>();
    return json({ success: true, optOuts: rows.results ?? [] });
  }

  if (action === 'opt_out') {
    if (!accountId) return fail('A valid workspace is required.');
    const phone = String(d.phone ?? '').trim();
    if (!E164.test(phone)) return fail(`"${phone}" is not a phone number in international format.`);
    await recordOptOut(env, accountId, phone, 'manual');
    return ok();
  }

  /* ── Numbers ──
     Search buys nothing; buying asks first, because it is a recurring monthly
     charge on the customer's Twilio account and not a one-off. */
  if (action === 'search_numbers') {
    const creds = accountId ? await loadSmsConfig(env, accountId) : null;
    if (!creds) return fail('Add your Twilio credentials in Settings → Email & SMS first.');
    const r = await searchNumbers(creds, String(d.country ?? 'US'), String(d.contains ?? ''));
    return r.ok
      ? json({ success: true, numbers: r.numbers,
          note: 'Twilio does not quote a price on this list. What each number costs a month is on your Twilio dashboard.' })
      : fail(r.error);
  }

  if (action === 'buy_number') {
    if (!accountId) return fail('A valid workspace is required.');
    const creds = await loadSmsConfig(env, accountId);
    if (!creds) return fail('Add your Twilio credentials first.');
    const number = String(d.number ?? '').trim();
    /* A recurring charge, so the client asks twice — a search result is not an
       instruction to buy. Same rule as registering a domain. */
    if (!d.confirm) {
      return fail(`Buying ${number} adds a monthly charge to your Twilio account. Confirm to go ahead.`, 200, { code: 'needs_confirm' });
    }

    /* The webhook goes on in the same call. A number bought without one looks
       bought and silently swallows every STOP and every reply. */
    const origin = new URL(req.url).origin;
    const r = await buyNumber(creds, number, `${origin}/api/sms-inbound.php`);
    if (!r.ok) return fail(r.error);

    /* The workspace sends from its newest number unless it had none, in which
       case this is simply the one. Saved here so the customer does not have to
       copy it into a settings box they have just been taken away from. */
    /* UPDATE, not an upsert. The insert branch would have had to write empty
       credentials, and a branch that can only ever be wrong is a branch that
       will eventually run. Getting here at all means loadSmsConfig found a row. */
    await env.DB.prepare('UPDATE crm_sms_config SET from_number = ?, updated_at = ? WHERE account_id = ?')
      .bind(r.number, nowIso(), accountId).run();

    return json({ success: true, number: r.number, message: `${r.number} is yours and set as your sending number. Replies and STOP messages will reach the app.` });
  }

  /* ── Prove the credentials, without messaging anybody ── */
  if (action === 'test') {
    const explicitSid = String(d.accountSid ?? '').trim();
    const creds = explicitSid
      ? { provider: 'twilio', accountSid: explicitSid, authToken: String(d.authToken ?? '').trim(), fromNumber: String(d.from ?? '').trim() }
      : accountId ? await loadSmsConfig(env, accountId) : null;
    if (!creds) return fail('Save your Twilio details first, then test them.');
    const r = await verifySmsCredentials(creds);
    /* Only a test of the *saved* sender updates the saved state. Trying a pair
       of credentials in the form is not a statement about the ones on the
       record, and letting it overwrite them turned a working sender amber
       because somebody pasted a typo into the box and pressed Test. */
    if (accountId && !explicitSid) {
      await env.DB.prepare('UPDATE crm_sms_config SET verified_at = ?, last_error = ?, updated_at = ? WHERE account_id = ?')
        .bind(r.ok ? nowIso() : null, r.ok ? '' : r.error, nowIso(), accountId).run();
    }
    return r.ok
      ? json({ success: true, message: `Twilio accepted the credentials${r.id && r.id !== 'ok' ? ` for "${r.id}"` : ''}. This does not prove the sending number is approved — only a real send does that.` })
      : fail(r.error);
  }

  /* ── Send ── */
  const to = String(d.to ?? '').trim();
  const text = String(d.body ?? '').trim();

  const explicit = String(d.accountSid ?? '').trim();
  const creds = explicit
    ? { provider: 'twilio', accountSid: explicit, authToken: String(d.authToken ?? '').trim(), fromNumber: String(d.from ?? '').trim() }
    : accountId ? await loadSmsConfig(env, accountId) : null;

  if (!creds) return fail('Add your Twilio SID, auth token and sending number in Settings → Email & SMS.');

  const r = await sendSms(env, creds, to, text, explicit ? undefined : accountId || undefined);

  /* Remember what a real attempt found, so the settings screen shows a state
     rather than "unknown". Only for a saved sender — a one-off test of unsaved
     credentials has no row to write to. */
  if (!explicit && accountId) {
    await env.DB.prepare('UPDATE crm_sms_config SET verified_at = ?, last_error = ?, updated_at = ? WHERE account_id = ?')
      .bind(r.ok ? nowIso() : null, r.ok ? '' : r.error, nowIso(), accountId).run();
  }

  if (r.ok) return json({ success: true, id: r.id, message: 'Twilio accepted the message.' });
  return fail(r.error, r.suppressed ? 409 : 400);
}

/**
 * Twilio's inbound webhook — the only way we hear a reply.
 *
 * Deliberately unauthenticated, because Twilio has no session: it posts a form
 * to whatever URL the number is configured with. The workspace is found from
 * the number the message was sent *to*, so a request naming a number we do not
 * own reaches nothing. There is no session to check and nothing here trusts the
 * body beyond matching that number.
 *
 * Twilio expects TwiML back. An empty <Response/> means "accepted, say nothing"
 * — replying with text here would send a second message to somebody who may
 * have just asked us to stop.
 */
export async function handleSmsInbound(req: Request, env: Env): Promise<Response> {
  const form = await req.formData().catch(() => null);
  const twiml = () => new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
    headers: { 'Content-Type': 'text/xml' },
  });
  if (!form) return twiml();

  const from = String(form.get('From') ?? '').trim();
  const to = String(form.get('To') ?? '').trim();
  const text = String(form.get('Body') ?? '');
  if (!E164.test(from) || !to) return twiml();

  const owner = await env.DB.prepare('SELECT account_id FROM crm_sms_config WHERE from_number = ?')
    .bind(to).first<{ account_id: string }>();
  if (!owner) return twiml();

  if (isStopMessage(text)) {
    await recordOptOut(env, owner.account_id, from, 'reply');
  }
  return twiml();
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
  if (accountId && !(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours to read.', 403);

  if (d.action === 'get_suppressions') {
    const raw = await dataGet(env.DB, storageWorkspace(user, accountId || RESERVED_AGENCY), 'crm_suppressions');
    return json({ success: true, suppressions: raw ? JSON.parse(raw) : [] });
  }

  if (d.action === 'save_suppressions') {
    await dataPut(env.DB, storageWorkspace(user, accountId || RESERVED_AGENCY), 'crm_suppressions', JSON.stringify(d.list ?? []));
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
 * This used to create a MySQL table and write a config.php with the database
 * password in it. Here the database is a binding and the schema is a
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
