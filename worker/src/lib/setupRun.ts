/**
 * The provisioning engine: seven steps, each one resumable.
 *
 * ── Why every step is a row ──
 *
 * Registering a domain, writing DNS, making mailboxes, publishing a site,
 * fitting out a workspace, sending a welcome and starting the content engine
 * are six calls to three different systems plus one of our own. Written as a
 * single function, the failure everybody actually hits — the domain registers,
 * the mailboxes do not — leaves a customer charged for something nobody can
 * find and no record of how far it got.
 *
 * So the runner never asks "did this order work". It asks "what is the first
 * step of this order that has not finished", does that, and stops. A retry is
 * therefore the same code path as a first attempt, and the only difference
 * between the two is a number in `attempts`.
 *
 * ── Idempotence is the price of that ──
 *
 * Every step must be safe to run twice, because a Worker can be killed between
 * doing the work and writing down that it did. Each one checks for its own
 * evidence first: a domain already in `crm_owned_domains`, a mailbox already in
 * `crm_mailbox_accounts`, a site already in the workspace's data. The one step
 * that cannot be made idempotent — spending money at a registrar — is the one
 * guarded hardest, because a second attempt there buys a second domain.
 *
 * ── What the customer reads, and what the owner reads ──
 *
 * `detail` is ours: "Your domain is registered." `last_error` is the provider's,
 * verbatim, and is never returned by a customer-facing route. That split is the
 * whole of "the customer never sees Openprovider" — not a filter applied at the
 * edge, but two different columns written by different code.
 */
import { encryptSecret } from './crypto';
import { dataGet, dataPut, installSecret, nowIso, type Env } from './db';
import { buildMime } from './mime';
import { connectedProvider, type DnsRecord } from './registrars';
import { smtpSend } from './smtp';

/** How many times a step is tried before it becomes somebody's problem. */
const MAX_ATTEMPTS = 4;

/**
 * The order, and why it is this order.
 *
 * DNS before mailboxes: a mailbox on a domain with no MX record is an address
 * that accepts nothing and says so to nobody. The website after the mailboxes
 * because a late site is embarrassing and late mail is lost. The handoff last
 * because it is the only step that is *supposed* to keep running afterwards.
 */
export const STEPS = [
  { step: 'domain',    label: 'Registering your domain' },
  { step: 'dns',       label: 'Pointing your domain at your services' },
  { step: 'mailboxes', label: 'Creating your business email' },
  { step: 'website',   label: 'Publishing your starter website' },
  { step: 'workspace', label: 'Setting up your CRM workspace' },
  { step: 'welcome',   label: 'Sending your welcome email' },
  { step: 'handoff',   label: 'Starting your content engine' },
] as const;

export interface OrderRow {
  id: string;
  account_id: string;
  project_id: string;
  domain: string;
  options: string;
  status: string;
  contact_email: string;
  company_name: string;
}

interface StepRow {
  id: string;
  order_id: string;
  account_id: string;
  seq: number;
  step: string;
  status: string;
  attempts: number;
}

export interface SetupOptions {
  mailboxes: string[];
  hosting: boolean;
  crm: boolean;
  owner?: {
    firstName?: string; lastName?: string; companyName?: string; email?: string;
    phoneCountry?: string; phoneArea?: string; phoneNumber?: string;
    street?: string; houseNumber?: string; city?: string; state?: string; zip?: string; country?: string;
  };
}

const rid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function parse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

/** Write the seven steps for a paid order. Safe to call twice. */
export async function createSteps(env: Env, order: OrderRow): Promise<void> {
  const existing = await env.DB.prepare('SELECT count(*) AS n FROM crm_setup_steps WHERE order_id = ?')
    .bind(order.id).first<{ n: number }>();
  if ((existing?.n ?? 0) > 0) return;

  const now = nowIso();
  const opts = parse<SetupOptions>(order.options, { mailboxes: [], hosting: false, crm: false });

  for (let i = 0; i < STEPS.length; i++) {
    const s = STEPS[i];
    /* A step nobody bought is recorded as skipped rather than left out, so the
       progress list a customer watches has the same shape for everybody and
       they can see that email was not part of what they chose. */
    const bought = s.step === 'mailboxes' ? opts.mailboxes.length > 0 : true;
    await env.DB.prepare(
      `INSERT INTO crm_setup_steps (id, order_id, account_id, seq, step, status, attempts, label, detail, last_error, updated_at)
       VALUES (?,?,?,?,?,?,0,?,?,'',?)`,
    ).bind(
      rid('st'), order.id, order.account_id, i + 1, s.step,
      bought ? 'pending' : 'skipped', s.label,
      bought ? '' : 'Not part of this order.', now,
    ).run();
  }
}

/* ── The steps ───────────────────────────────────────────────────────────── */

/** Where a customer's domain should point for mail and web. */
function plannedRecords(appHost: string, mailHost: string): DnsRecord[] {
  return [
    /* The site lives on this deployment, so the customer's domain points at it
       by name rather than by address — the Worker's IP is Cloudflare's and is
       not ours to hardcode. */
    { name: 'www', type: 'CNAME', value: appHost, ttl: 3600 },
    { name: '', type: 'MX', value: mailHost, ttl: 3600, prio: 10 },
    /*
     * SPF naming the mail host and nothing else.
     *
     * `~all` rather than `-all`: a soft fail on a brand-new domain lets a
     * misrouted message land in spam where somebody can find it, instead of
     * being destroyed in transit while the customer is still setting up. It is
     * tightened once sending is established, which is a decision, not a default.
     */
    { name: '', type: 'TXT', value: `v=spf1 mx a:${mailHost} ~all`, ttl: 3600 },
    /*
     * DMARC on p=none deliberately.
     *
     * A policy that quarantines before anybody has looked at a report will bin
     * the customer's own invoices on day one. It starts as observation.
     */
    { name: '_dmarc', type: 'TXT', value: 'v=DMARC1; p=none; sp=none; adkim=r; aspf=r', ttl: 3600 },
  ];
}

async function runDomain(env: Env, order: OrderRow): Promise<{ ok: boolean; detail: string; error: string }> {
  /* The guard that matters most: evidence of the purchase before making it. */
  const owned = await env.DB.prepare('SELECT status FROM crm_owned_domains WHERE domain = ?')
    .bind(order.domain).first<{ status: string }>();
  if (owned?.status === 'active') {
    return { ok: true, detail: `${order.domain} is registered and yours.`, error: '' };
  }

  const conn = await connectedProvider(env);
  if (!conn) {
    return { ok: false, detail: 'We could not register the domain — this is with our team.', error: 'No domain provider is connected on this installation.' };
  }

  const opts = parse<SetupOptions>(order.options, { mailboxes: [], hosting: false, crm: false });
  const o = opts.owner ?? {};
  const contact = order.contact_email || o.email || '';
  if (!contact) {
    return { ok: false, detail: 'We could not register the domain — this is with our team.', error: 'The order carries no contact email, and a registrant must have one.' };
  }

  const r = await conn.provider.register(conn.creds, {
    domain: order.domain,
    years: 1,
    owner: {
      firstName: o.firstName || (order.company_name || 'Business').split(' ')[0],
      lastName: o.lastName || 'Owner',
      companyName: o.companyName || order.company_name || '',
      email: contact,
      phoneCountry: o.phoneCountry || '+1',
      phoneArea: o.phoneArea || '',
      phoneNumber: o.phoneNumber || '',
      street: o.street || '',
      houseNumber: o.houseNumber || '',
      city: o.city || '',
      state: o.state || '',
      zip: o.zip || '',
      country: (o.country || 'US').toUpperCase().slice(0, 2),
    },
    /* The registrar's own nameservers, because the DNS step writes the zone
       there. Pointing elsewhere would leave that zone unread. */
    nameServers: ['ns1.openprovider.nl', 'ns2.openprovider.be', 'ns3.openprovider.eu'],
  });

  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO crm_owned_domains
     (id, account_id, domain, provider, provider_id, owner_handle, status, cost_cents, retail_cents, currency, expires_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,0,?,?,?,?)
     ON CONFLICT(domain) DO UPDATE SET
       provider_id = excluded.provider_id, owner_handle = excluded.owner_handle,
       status = excluded.status, cost_cents = excluded.cost_cents,
       expires_at = excluded.expires_at, updated_at = excluded.updated_at`,
  ).bind(
    rid('dm'), order.account_id, order.domain, conn.provider.id, r.providerId, r.ownerHandle,
    r.ok ? 'active' : 'failed', r.cost?.cents ?? 0, r.cost?.currency ?? 'USD',
    r.expiresAt || null, now, now,
  ).run();

  if (!r.ok) {
    return { ok: false, detail: 'We could not register that domain. Our team is on it and will be in touch.', error: r.error };
  }
  return { ok: true, detail: `${order.domain} is registered and yours.`, error: '' };
}

async function runDns(env: Env, order: OrderRow): Promise<{ ok: boolean; detail: string; error: string }> {
  const conn = await connectedProvider(env);
  if (!conn) return { ok: false, detail: 'We could not set up your domain records.', error: 'No domain provider is connected on this installation.' };

  const appHost = new URL(env.APP_ORIGIN || 'https://app.protectedcentral.com').hostname;
  const mailHost = conn.provider.mailSettings(conn.creds).smtpHost;

  const r = await conn.provider.createZone(conn.creds, order.domain, plannedRecords(appHost, mailHost));
  if (!r.ok) return { ok: false, detail: 'We could not set up your domain records.', error: r.error };

  return {
    ok: true,
    /* Named plainly, because a customer who later wonders why mail works and
       the bare domain does not deserves to have been told. */
    detail: `Mail routing, SPF and DMARC are set, and www.${order.domain} points at your site.`,
    error: '',
  };
}

async function runMailboxes(env: Env, order: OrderRow): Promise<{ ok: boolean; detail: string; error: string }> {
  const opts = parse<SetupOptions>(order.options, { mailboxes: [], hosting: false, crm: false });
  const wanted = opts.mailboxes.map(m => m.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')).filter(Boolean);
  if (!wanted.length) return { ok: true, detail: 'No mailboxes were part of this order.', error: '' };

  const conn = await connectedProvider(env);
  if (!conn) return { ok: false, detail: 'We could not create your mailboxes.', error: 'No email provider is connected on this installation.' };

  const owned = await env.DB.prepare('SELECT owner_handle FROM crm_owned_domains WHERE domain = ?')
    .bind(order.domain).first<{ owner_handle: string }>();

  const enabled = await conn.provider.enableEmail(conn.creds, order.domain, owned?.owner_handle ?? '');
  if (!enabled.ok) return { ok: false, detail: 'We could not create your mailboxes.', error: enabled.error };

  /* Which ones already exist, so a retry adds only what is missing rather than
     buying a second seat for every address that already worked. */
  const { results } = await env.DB.prepare(
    'SELECT from_email FROM crm_mailbox_accounts WHERE account_id = ?',
  ).bind(order.account_id).all<{ from_email: string }>();
  const have = new Set((results ?? []).map(r => r.from_email.toLowerCase()));

  const settings = conn.provider.mailSettings(conn.creds);
  const key = await installSecret(env.DB, 'mailbox_key');
  const made: string[] = [];
  const problems: string[] = [];

  for (const local of wanted) {
    const address = `${local}@${order.domain}`;
    if (have.has(address)) { made.push(address); continue; }

    const r = await conn.provider.createMailbox(conn.creds, order.domain, local, order.company_name || local);
    if (!r.ok || !r.mailbox) { problems.push(`${address}: ${r.error}`); continue; }

    /*
     * Saved before anything else can fail.
     *
     * The provider shows this password once. A Worker that dies between
     * creating the mailbox and storing the password leaves an address nobody
     * can ever sign into, and the only repair is deleting and remaking it.
     */
    const pw = await encryptSecret(key, r.mailbox.password);
    const now = nowIso();
    const isFirst = have.size === 0 && made.length === 0;
    await env.DB.prepare(
      `INSERT INTO crm_mailbox_accounts
       (id, account_id, label, is_primary, smtp_host, smtp_port, smtp_encryption, smtp_username, smtp_password,
        from_name, from_email, imap_host, imap_port, imap_encryption, imap_username, imap_password, imap_folder,
        provider, created_at, updated_at)
       VALUES (?,?,?,?,?,?, 'tls', ?,?,?,?,?,?, 'ssl', ?,?, 'INBOX', 'smtp', ?,?)`,
    ).bind(
      rid('mb'), order.account_id, local, isFirst ? 1 : 0,
      settings.smtpHost, settings.smtpPort, address, pw,
      order.company_name || local, address,
      settings.imapHost, settings.imapPort, address, pw,
      now, now,
    ).run();

    have.add(address);
    made.push(address);
  }

  if (!made.length) {
    return { ok: false, detail: 'We could not create your mailboxes.', error: problems.join(' | ') || 'No mailbox was created.' };
  }
  if (problems.length) {
    /*
     * Partial, and said as partial.
     *
     * Returning ok here would mark the step done and lose the addresses that
     * failed. It stays failed so the runner tries again, and the ones that
     * worked are skipped on that attempt by the check above.
     */
    return {
      ok: false,
      detail: `${made.length} of ${wanted.length} mailboxes are ready; we are still working on the rest.`,
      error: problems.join(' | '),
    };
  }
  return { ok: true, detail: `${made.join(', ')} ${made.length === 1 ? 'is' : 'are'} ready.`, error: '' };
}

/**
 * A real starter site, written where the app already reads sites from.
 *
 * Websites live in the workspace's own synced storage rather than a table of
 * their own, so this writes the same `crm_websites` key the builder does. That
 * is what makes the site appear in Websites → Sites the moment the customer
 * looks, already editable, rather than being a second kind of site that only
 * this feature understands.
 */
async function runWebsite(env: Env, order: OrderRow): Promise<{ ok: boolean; detail: string; error: string }> {
  const raw = await dataGet(env.DB, order.account_id, 'crm_websites');
  const sites = parse<Array<Record<string, unknown>>>(raw, []);
  const slug = order.domain.split('.')[0];

  if (sites.some(s => String(s.domain ?? '') === order.domain)) {
    return { ok: true, detail: 'Your starter website is published.', error: '' };
  }

  const company = order.company_name || slug;
  const now = nowIso();
  const site = {
    id: rid('ws'),
    name: `${company} — website`,
    slug,
    domain: order.domain,
    status: 'published',
    template: 'business',
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
    source: { origin: 'autopilot', title: 'Digital Business Setup', refId: order.id, route: '/autopilot' },
    pages: [{
      id: rid('pg'),
      name: 'Home',
      path: '/',
      blocks: [
        { id: rid('bl'), type: 'hero', props: {
          heading: company,
          subheading: 'Get in touch today — we reply the same day.',
          ctaLabel: 'Book a call', ctaHref: '#contact',
        } },
        { id: rid('bl'), type: 'features', props: {
          heading: 'What we do',
          items: [
            { title: 'Fast response', body: 'Tell us what you need and we come back to you the same day.' },
            { title: 'Straight prices', body: 'A clear quote before any work starts, with nothing added later.' },
            { title: 'Work that lasts', body: 'Done properly the first time, and guaranteed.' },
          ],
        } },
        { id: rid('bl'), type: 'contact', props: {
          heading: 'Get in touch',
          body: `Email us at hello@${order.domain}`,
        } },
      ],
    }],
  };

  sites.push(site);
  await dataPut(env.DB, order.account_id, 'crm_websites', JSON.stringify(sites));
  return { ok: true, detail: 'Your starter website is published and ready to edit.', error: '' };
}

/**
 * Fit out the workspace so the CRM is usable rather than empty.
 *
 * The company profile matters more than it looks: every writer in this app —
 * campaigns, the blog, the shorts — reads it, and without it the first thing
 * Autopilot produces is copy about a business it had to invent.
 */
async function runWorkspace(env: Env, order: OrderRow): Promise<{ ok: boolean; detail: string; error: string }> {
  const existing = parse<Record<string, unknown>>(await dataGet(env.DB, order.account_id, 'crm_onboarding'), {});
  const merged = {
    /* loadOnboarding() ignores anything without this, so a profile written
       without it is a profile the app cannot see. */
    version: 1,
    completed: true,
    ...existing,
    companyName: existing.companyName || order.company_name || order.domain,
    website: existing.website || `https://${order.domain}`,
    email: existing.email || order.contact_email,
  };
  await dataPut(env.DB, order.account_id, 'crm_onboarding', JSON.stringify(merged));

  await env.DB.prepare(
    'INSERT OR IGNORE INTO crm_workspaces (account_id, owner_email, created_at) VALUES (?,?,?)',
  ).bind(order.account_id, order.contact_email, nowIso()).run();

  return { ok: true, detail: 'Your CRM workspace is ready.', error: '' };
}

async function runWelcome(env: Env, order: OrderRow): Promise<{ ok: boolean; detail: string; error: string }> {
  const to = order.contact_email;
  if (!to) return { ok: true, detail: 'No address was given for the welcome email.', error: '' };

  /*
   * Sent from the customer's own new mailbox.
   *
   * Which makes the welcome email the first real delivery test of the thing
   * that was just built: if it arrives, their mail works, and they have proof
   * of it in their inbox. A failure here is genuinely worth retrying.
   */
  const row = await env.DB.prepare(
    `SELECT smtp_host, smtp_port, smtp_username, smtp_password, from_email, from_name
     FROM crm_mailbox_accounts WHERE account_id = ? ORDER BY is_primary DESC LIMIT 1`,
  ).bind(order.account_id).first<{
    smtp_host: string; smtp_port: number; smtp_username: string;
    smtp_password: string; from_email: string; from_name: string;
  }>();
  if (!row?.smtp_host) {
    return { ok: true, detail: 'No mailbox was set up, so there was nowhere to send a welcome from.', error: '' };
  }

  const { decryptSecret } = await import('./crypto');
  const key = await installSecret(env.DB, 'mailbox_key');
  const password = await decryptSecret(key, row.smtp_password);

  const origin = env.APP_ORIGIN || 'https://app.protectedcentral.com';
  const company = order.company_name || order.domain;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;color:#17191c">
      <h1 style="font-size:22px;margin:0 0 6px">${company} is live.</h1>
      <p style="font-size:15px;line-height:1.6;color:#475569;margin:0 0 18px">
        Everything you ordered is set up and running. Here is where it all is.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:9px 0;border-bottom:1px solid #e6e9f0;color:#64748b">Your domain</td>
            <td style="padding:9px 0;border-bottom:1px solid #e6e9f0;font-weight:600">${order.domain}</td></tr>
        <tr><td style="padding:9px 0;border-bottom:1px solid #e6e9f0;color:#64748b">Your email</td>
            <td style="padding:9px 0;border-bottom:1px solid #e6e9f0;font-weight:600">${row.from_email}</td></tr>
        <tr><td style="padding:9px 0;border-bottom:1px solid #e6e9f0;color:#64748b">Your dashboard</td>
            <td style="padding:9px 0;border-bottom:1px solid #e6e9f0;font-weight:600">${origin}</td></tr>
      </table>
      <p style="font-size:14px;line-height:1.6;color:#475569;margin:18px 0 0">
        This message was sent from your own new mailbox — so if you are reading it, your email is working.
      </p>
      <p style="font-size:14px;line-height:1.6;color:#475569;margin:14px 0 0">
        Your content plan is being written now. Sign in and it will be waiting for you to look over.
      </p>
    </div>`;

  const fromEmail = row.from_email || row.smtp_username;
  const mime = buildMime({
    fromName: row.from_name || company,
    fromEmail,
    to,
    subject: `${company} is set up and ready`,
    html,
  }, row.smtp_host);

  const r = await smtpSend(
    { host: row.smtp_host, port: row.smtp_port, encryption: 'tls', username: row.smtp_username, password },
    { from: fromEmail, to, mime },
  );
  if (!r.ok) return { ok: false, detail: 'We could not send your welcome email yet.', error: r.error };
  return { ok: true, detail: `Sent to ${to} from ${fromEmail}.`, error: '' };
}

/**
 * Hand over to the content engine.
 *
 * Nothing is generated here. The project is put in a state the planner already
 * knows how to act on — running, with no plan yet — and the tick that runs
 * minutes later writes the content. Generating from inside provisioning would
 * be a second implementation of the thing the whole app is built around, and it
 * would be the one nobody maintained.
 */
async function runHandoff(env: Env, order: OrderRow): Promise<{ ok: boolean; detail: string; error: string }> {
  if (!order.project_id) {
    return { ok: true, detail: 'No project was attached to this order.', error: '' };
  }
  const res = await env.DB.prepare(
    `UPDATE crm_projects SET status = 'running', last_planned_at = NULL, last_error = '', updated_at = ?
     WHERE id = ? AND account_id = ?`,
  ).bind(nowIso(), order.project_id, order.account_id).run();

  if (!res.meta.changes) {
    return { ok: false, detail: 'We could not start your content engine.', error: `Project ${order.project_id} is not in workspace ${order.account_id}.` };
  }
  return { ok: true, detail: 'Your content plan is being written now.', error: '' };
}

/* ── The runner ──────────────────────────────────────────────────────────── */

async function runStep(env: Env, order: OrderRow, step: string): Promise<{ ok: boolean; detail: string; error: string }> {
  switch (step) {
    case 'domain':    return runDomain(env, order);
    case 'dns':       return runDns(env, order);
    case 'mailboxes': return runMailboxes(env, order);
    case 'website':   return runWebsite(env, order);
    case 'workspace': return runWorkspace(env, order);
    case 'welcome':   return runWelcome(env, order);
    case 'handoff':   return runHandoff(env, order);
    default:
      return { ok: false, detail: 'Something in your setup is not recognised.', error: `Unknown step "${step}".` };
  }
}

/**
 * Carry one order as far as it will go this tick.
 *
 * Runs steps in sequence and stops at the first failure rather than skipping
 * past it: every step after `domain` assumes the domain exists, and running
 * `dns` for a domain that was never bought produces a second, more confusing
 * error on top of the real one.
 */
export async function advanceOrder(env: Env, order: OrderRow): Promise<{ done: boolean; failed: boolean }> {
  await createSteps(env, order);

  const { results } = await env.DB.prepare(
    `SELECT id, order_id, account_id, seq, step, status, attempts
     FROM crm_setup_steps WHERE order_id = ? ORDER BY seq`,
  ).bind(order.id).all<StepRow>();
  const steps = results ?? [];

  for (const s of steps) {
    if (s.status === 'done' || s.status === 'skipped') continue;

    if (s.attempts >= MAX_ATTEMPTS) {
      /* Stopped, not looping. A step that has failed four times is not going to
         succeed on the fifth, and the owner's admin view is where it belongs. */
      await env.DB.prepare('UPDATE crm_setup_orders SET status = ?, updated_at = ? WHERE id = ?')
        .bind('failed', nowIso(), order.id).run();
      return { done: false, failed: true };
    }

    await env.DB.prepare(
      'UPDATE crm_setup_steps SET status = ?, attempts = attempts + 1, started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?',
    ).bind('running', nowIso(), nowIso(), s.id).run();

    let out: { ok: boolean; detail: string; error: string };
    try {
      out = await runStep(env, order, s.step);
    } catch (e) {
      /* A thrown step must not take the other orders on this tick with it. */
      out = { ok: false, detail: 'Something went wrong on our side.', error: e instanceof Error ? e.message : String(e) };
    }

    await env.DB.prepare(
      `UPDATE crm_setup_steps SET status = ?, detail = ?, last_error = ?, finished_at = ?, updated_at = ? WHERE id = ?`,
    ).bind(
      out.ok ? 'done' : 'failed', out.detail.slice(0, 400), out.error.slice(0, 800),
      out.ok ? nowIso() : null, nowIso(), s.id,
    ).run();

    if (!out.ok) {
      await env.DB.prepare('UPDATE crm_setup_orders SET status = ?, last_error = ?, updated_at = ? WHERE id = ?')
        .bind('running', out.error.slice(0, 500), nowIso(), order.id).run();
      return { done: false, failed: false };
    }
  }

  await env.DB.prepare(
    "UPDATE crm_setup_orders SET status = 'done', last_error = '', finished_at = ?, updated_at = ? WHERE id = ?",
  ).bind(nowIso(), nowIso(), order.id).run();
  return { done: true, failed: false };
}

/**
 * Every order that has been paid for and is not finished.
 *
 * Driven from the cron as well as immediately after payment, because the
 * immediate run is the one that can be interrupted — a Worker killed mid-way
 * through a provisioning run is exactly the case the ledger exists for, and
 * without a scheduled sweep that order would wait for a customer to complain.
 */
export async function runPendingSetups(env: Env): Promise<{ advanced: number; done: number; failed: number }> {
  const { results } = await env.DB.prepare(
    `SELECT id, account_id, project_id, domain, options, status, contact_email, company_name
     FROM crm_setup_orders WHERE status IN ('paid','running') ORDER BY created_at LIMIT 20`,
  ).all<OrderRow>();

  let advanced = 0, done = 0, failed = 0;
  for (const order of results ?? []) {
    try {
      const r = await advanceOrder(env, order);
      advanced++;
      if (r.done) done++;
      if (r.failed) failed++;
    } catch {
      failed++;
    }
  }
  return { advanced, done, failed };
}
