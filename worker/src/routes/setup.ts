/**
 * /api/setup.php — the Digital Business Setup endpoint.
 *
 * ── The boundary this file is ──
 *
 * Everything a customer knows about domains passes through here, and nothing
 * that reaches them came from a provider unfiltered. Concretely:
 *
 * - `search` gets wholesale costs back from the registrar and returns retail
 *   figures. The cost is used to compute the price and then dropped; it is
 *   never on a response object, so it cannot be leaked by a new field somebody
 *   adds later without thinking.
 * - Provider error text goes to `last_error`, which only the owner's admin
 *   actions return. Customer-facing actions return `detail`, written by us.
 * - The provider's name appears in exactly one place a browser can reach: the
 *   owner's own settings panel.
 *
 * ── Why the owner actions live here too ──
 *
 * Because they are the same subject, and splitting them would mean two files
 * that both know how credentials are stored. The split that matters is not by
 * file but by `isOwner`, checked on every action that can spend money or read
 * a cost.
 */
import { addr, body, fail, json } from '../lib/http';
import {
  installSecret, nowIso, userFromToken, workspaceAccess,
  type Env, type SessionUser,
} from '../lib/db';
import { decryptSecret } from '../lib/crypto';
import {
  connectedProvider, providerChoices, recordProviderStatus, saveProviderCreds,
  SETUP_KIND, type Check, type DnsRecord,
} from '../lib/registrars';
import {
  loadPrices, quoteBasket, RETAIL_CURRENCY, retailForDomain, savePrice,
  type Quote,
} from '../lib/retail';
import { advanceOrder, STEPS, type OrderRow, type SetupOptions } from '../lib/setupRun';
import { billingProcessor } from './billing';
import { providerFor } from '../lib/payments';

interface Req {
  token?: string;
  accountId?: string;
  action?: string;
  [k: string]: unknown;
}

const rid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const isOwner = (u: SessionUser) => u.accountId === null && u.role === 'agency';

function parse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

/**
 * The extensions offered first, and why these.
 *
 * A small business wants the .com and will take the .co or .net when it has
 * gone. Offering forty extensions turns a two-second decision into a research
 * project, and the long tail is still reachable by typing a name in full.
 */
const DEFAULT_TLDS = ['com', 'net', 'org', 'co', 'biz', 'online'];

/** "ABC Roofing & Sons Ltd." → "abcroofing". */
function slugify(company: string): string {
  return company.toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\b(ltd|limited|llc|inc|incorporated|plc|gmbh|pty|co)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 48);
}

export async function handleSetup(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });

  const act = String(d.action ?? '').trim();
  const origin = new URL(req.url).origin;

  /* ── Owner-only: the provider account ─────────────────────────────────── */

  if (act === 'provider_get' || act === 'provider_save' || act === 'provider_test') {
    if (!isOwner(user)) return fail('Only the installation owner can set this up.', 403);

    if (act === 'provider_save') {
      const r = await saveProviderCreds(env, String(d.provider ?? 'openprovider'), {
        username: String(d.username ?? ''),
        password: String(d.password ?? ''),
        resellerId: String(d.resellerId ?? ''),
        sandbox: !!d.sandbox,
        mailHost: String(d.mailHost ?? ''),
      });
      if (!r.ok) return fail(r.error);
    }

    let checks: Check[] = [];
    if (act === 'provider_test') {
      const conn = await connectedProvider(env);
      if (!conn) return fail('Nothing is connected yet.');
      /* Every check at once, and each one answerable on its own. A single
         pass/fail here told the owner there was a problem and nothing about
         which of four unrelated things it was. Nothing is bought: pressing Test
         twice leaves no trace in the operator's account. */
      checks = await conn.provider.diagnose(conn.creds);
      const blocked = checks.find(c => c.blocking && c.state === 'failed');
      await recordProviderStatus(env, !blocked, blocked ? `${blocked.label}: ${blocked.detail}` : '');
    }

    const row = await env.DB.prepare(
      'SELECT provider, credentials, status, last_error, updated_at FROM crm_install_providers WHERE kind = ?',
    ).bind(SETUP_KIND).first<{ provider: string; credentials: string; status: string; last_error: string; updated_at: string }>();

    /* Whether a secret is set, never what it is — not even a masked tail. */
    let username = '';
    let sandbox = false;
    let mailHost = '';
    if (row?.credentials) {
      try {
        const key = await installSecret(env.DB, 'mailbox_key');
        const c = JSON.parse(await decryptSecret(key, row.credentials)) as { username?: string; sandbox?: boolean; mailHost?: string };
        username = c.username ?? '';
        sandbox = !!c.sandbox;
        mailHost = c.mailHost ?? '';
      } catch { /* an unreadable blob reports as not connected */ }
    }

    return json({
      success: true,
      setup: {
        provider: row?.provider ?? '',
        connected: !!username,
        username,
        sandbox,
        mailHost,
        hasPassword: !!row?.credentials,
        status: row?.status ?? 'unknown',
        lastError: row?.last_error ?? '',
        updatedAt: row?.updated_at ?? '',
        choices: providerChoices(),
        /* Empty on a plain read. Only a Test produces them, so the screen shows
           the last thing that was actually checked rather than a stale verdict
           redrawn as though it were fresh. */
        checks,
      },
    });
  }

  /* ── Owner-only: prices ───────────────────────────────────────────────── */

  if (act === 'prices') {
    if (!isOwner(user)) return fail('Only the installation owner can see this.', 403);
    return json({ success: true, prices: await loadPrices(env), currency: RETAIL_CURRENCY });
  }

  if (act === 'save_price') {
    if (!isOwner(user)) return fail('Only the installation owner can change prices.', 403);
    const r = await savePrice(env, String(d.kind ?? ''), String(d.code ?? ''), {
      retailCents: Math.round(Number(d.retailCents) || 0),
      markupPct: Math.round(Number(d.markupPct) || 0),
      label: String(d.label ?? ''),
    });
    if (!r.ok) return fail(r.error);
    return json({ success: true, prices: await loadPrices(env) });
  }

  /* ── Owner-only: every job, and what really went wrong ────────────────── */

  if (act === 'admin_jobs') {
    if (!isOwner(user)) return fail('Only the installation owner can see this.', 403);
    const { results: orders } = await env.DB.prepare(
      `SELECT id, account_id AS accountId, project_id AS projectId, domain, status,
              total_cents AS totalCents, monthly_cents AS monthlyCents, currency,
              company_name AS companyName, contact_email AS contactEmail,
              last_error AS lastError, created_at AS createdAt, paid_at AS paidAt, finished_at AS finishedAt
       FROM crm_setup_orders ORDER BY created_at DESC LIMIT 100`,
    ).all();
    const { results: steps } = await env.DB.prepare(
      `SELECT id, order_id AS orderId, seq, step, status, attempts, label, detail,
              last_error AS lastError, finished_at AS finishedAt
       FROM crm_setup_steps ORDER BY order_id, seq`,
    ).all();
    const { results: domains } = await env.DB.prepare(
      `SELECT domain, account_id AS accountId, status, cost_cents AS costCents,
              retail_cents AS retailCents, currency, expires_at AS expiresAt
       FROM crm_owned_domains ORDER BY created_at DESC LIMIT 200`,
    ).all();
    return json({ success: true, orders: orders ?? [], steps: steps ?? [], domains: domains ?? [] });
  }

  /* ── Owner-only: what was sold, what it cost, what it made ────────────── */

  if (act === 'admin_earnings') {
    if (!isOwner(user)) return fail('Only the installation owner can see this.', 403);

    const { results: items } = await env.DB.prepare(
      `SELECT i.id, i.account_id AS accountId, i.order_id AS orderId, i.kind, i.item,
              i.cost_cents AS costCents, i.retail_cents AS retailCents, i.currency,
              i.period, i.provider, i.created_at AS createdAt,
              COALESCE(o.company_name, '') AS companyName
       FROM crm_sold_items i
       LEFT JOIN crm_setup_orders o ON o.id = i.order_id
       ORDER BY i.created_at DESC LIMIT 500`,
    ).all();

    /*
     * Totalled per period, never across them.
     *
     * A yearly domain and a monthly mailbox cannot be added: the sum is a
     * number that is true of no month and no year, and it is the number
     * somebody would put in a spreadsheet. So the report answers two questions
     * — what came in once, and what comes in every month — and leaves the
     * annualising to whoever wants it.
     */
    const totals: Record<string, { kind: string; period: string; count: number; costCents: number; retailCents: number }> = {};
    for (const raw of items ?? []) {
      const r = raw as { kind: string; period: string; costCents: number; retailCents: number };
      const key = `${r.kind}:${r.period}`;
      const t = totals[key] ?? (totals[key] = { kind: r.kind, period: r.period, count: 0, costCents: 0, retailCents: 0 });
      t.count++;
      t.costCents += Number(r.costCents) || 0;
      t.retailCents += Number(r.retailCents) || 0;
    }

    /* The supplier's own balance, so the one number the owner needs before
       taking more orders is on the same screen as the earnings. */
    const conn = await connectedProvider(env);
    const bal = conn ? await conn.provider.balance(conn.creds) : null;

    return json({
      success: true,
      items: items ?? [],
      totals: Object.values(totals),
      supplierBalanceCents: bal ? bal.cents : null,
    });
  }

  if (act === 'admin_retry') {
    if (!isOwner(user)) return fail('Only the installation owner can do that.', 403);
    const orderId = String(d.orderId ?? '').trim();
    const order = await env.DB.prepare(
      `SELECT id, account_id, project_id, domain, options, status, contact_email, company_name
       FROM crm_setup_orders WHERE id = ?`,
    ).bind(orderId).first<OrderRow>();
    if (!order) return fail('No such order.');

    /* The attempt counter is what stopped it, so retrying has to clear it —
       otherwise the button does nothing and looks broken. */
    await env.DB.prepare(
      "UPDATE crm_setup_steps SET status = 'pending', attempts = 0, updated_at = ? WHERE order_id = ? AND status = 'failed'",
    ).bind(nowIso(), orderId).run();
    await env.DB.prepare("UPDATE crm_setup_orders SET status = 'running', updated_at = ? WHERE id = ?")
      .bind(nowIso(), orderId).run();

    const r = await advanceOrder(env, order);
    return json({ success: true, done: r.done, failed: r.failed });
  }

  /* ── Everything below is scoped to one workspace ──────────────────────── */

  const accountId = String(d.accountId ?? '').trim();
  if (!accountId) return fail('Which workspace?');
  const access = await workspaceAccess(env.DB, user, accountId);
  if (!access.ok) return fail(access.message ?? 'That workspace is not yours.', 403, { code: access.code });

  /* ── Domain search ────────────────────────────────────────────────────── */

  if (act === 'search') {
    const conn = await connectedProvider(env);
    if (!conn) {
      /* Named as our problem, not theirs, and without naming a provider. */
      return fail('Domain registration is not switched on for this installation yet.', 200, { code: 'not_connected' });
    }

    const company = String(d.company ?? '').trim();
    const typed = String(d.domain ?? '').trim().toLowerCase();
    const base = slugify(company);
    if (!base && !typed) return fail('Tell us the business name and we will find a domain for it.');

    /* The names to ask about: the obvious ones on each extension first, then
       whatever the registrar suggests to fill the gaps. Asked in one call
       because a check per extension is six round trips a customer waits for. */
    const candidates = new Set<string>();
    if (typed && typed.includes('.')) candidates.add(typed);
    for (const tld of DEFAULT_TLDS) if (base) candidates.add(`${base}.${tld}`);

    if (base && candidates.size < 10) {
      const s = await conn.provider.suggest(conn.creds, base, DEFAULT_TLDS, 8);
      for (const dm of s.domains) { if (candidates.size >= 14) break; candidates.add(dm); }
    }

    const checked = await conn.provider.check(conn.creds, [...candidates]);
    if (!checked.ok) {
      return fail('We could not look up domains just now. Try again in a moment.', 200, { code: 'lookup_failed' });
    }

    const prices = await loadPrices(env);
    /*
     * The filter that makes this feature safe.
     *
     * Only three fields survive: the name, whether it is free, and what *we*
     * charge. `cost`, `reason`, `premium` pricing and every other thing the
     * registrar said stops at this map.
     */
    const results = checked.results
      .map(r => {
        const retail = retailForDomain(prices, r.domain, r.cost, r.premium);
        return {
          domain: r.domain,
          available: r.available,
          priceCents: retail,
          currency: RETAIL_CURRENCY,
          premium: r.premium,
        };
      })
      /* An available domain nobody can price is worse than no suggestion: it
         renders as free. Dropped rather than shown at zero. */
      .filter(r => !r.available || r.priceCents !== null)
      .sort((a, b) => (Number(b.available) - Number(a.available)) || (a.priceCents ?? 0) - (b.priceCents ?? 0));

    return json({ success: true, results });
  }

  /* ── What a basket costs ──────────────────────────────────────────────── */

  const quoteFor = async (): Promise<{ quote: Quote; domain: string } | { error: string }> => {
    const domain = String(d.domain ?? '').trim().toLowerCase();
    if (!domain.includes('.')) return { error: 'Choose a domain first.' };

    const conn = await connectedProvider(env);
    if (!conn) return { error: 'Domain registration is not switched on for this installation yet.' };

    const checked = await conn.provider.check(conn.creds, [domain]);
    const row = checked.results[0];
    if (!checked.ok || !row) return { error: 'We could not price that domain just now.' };
    if (!row.available) return { error: `${domain} has already been taken. Pick another.` };

    const prices = await loadPrices(env);
    const costed = quoteBasket(prices, {
      domain,
      domainCost: row.cost,
      domainPremium: row.premium,
      mailboxes: Math.min(Math.max(Math.round(Number(d.mailboxes) || 0), 0), 20),
      hosting: !!d.hosting,
      crm: !!d.crm,
    });
    if (!costed) return { error: 'We could not price that domain just now.' };
    /* `costed.wholesaleCents` stops here. Only `quote` is returned. */
    return { quote: costed.quote, domain };
  };

  /**
   * What this order would cost *us*, for the guard above and nothing else.
   *
   * Deliberately not part of `quoteFor`, which returns the shape that goes to a
   * browser. Keeping the two apart is what stops a cost being added to that
   * shape by accident later.
   */
  const wholesaleOf = async (domain: string): Promise<number | null> => {
    const conn = await connectedProvider(env);
    if (!conn) return null;
    const checked = await conn.provider.check(conn.creds, [domain]);
    const cost = checked.results[0]?.cost;
    return cost ? cost.cents : null;
  };

  if (act === 'quote') {
    const q = await quoteFor();
    if ('error' in q) return fail(q.error);
    return json({ success: true, quote: q.quote });
  }

  /* ── One checkout for the lot ─────────────────────────────────────────── */

  if (act === 'checkout') {
    const q = await quoteFor();
    if ('error' in q) return fail(q.error);

    /*
     * Do not take money for something that cannot be delivered.
     *
     * The supplier is prepaid: a registration is charged to the operator's
     * balance the instant it happens, and a balance that will not cover it
     * fails *after* the customer has paid. Provisioning would retry four times
     * and give up, and the customer would be sitting on a progress list that
     * never finishes with their money already gone.
     *
     * So the balance is read before the checkout link is made. Refusing here is
     * a customer who tries again tomorrow; refusing later is a refund, an
     * apology and a support ticket.
     *
     * The wholesale cost is compared, never shown — the message says the app is
     * not ready, which is true, and not what anything cost.
     */
    const conn = await connectedProvider(env);
    if (conn) {
      const bal = await conn.provider.balance(conn.creds);
      const costed = await wholesaleOf(q.domain);
      /*
       * A balance we could not read is not a balance of zero.
       *
       * Blocking every sale because the supplier's account endpoint had a bad
       * minute would be worse than the problem — the registration itself would
       * have worked. Unknown lets it through; known-and-short does not.
       */
      if (bal && costed !== null && bal.cents < costed) {
        return fail(
          'This is temporarily unavailable — we cannot set up new domains right now. Nothing has been charged. Please try again shortly.',
          200,
          { code: 'supplier_balance' },
        );
      }
    }

    const processor = await billingProcessor(env);
    if (!processor) return fail('This app cannot take payments yet — its owner has not connected a payment processor.');
    const pay = providerFor(processor.id);
    if (!pay) return fail('The connected payment processor is not one this app supports.');

    const email = addr(d.contactEmail) ?? user.email;
    const company = String(d.companyName ?? '').trim().slice(0, 160);

    /*
     * Due today is the yearly lines plus one month of the monthly ones.
     *
     * Said plainly rather than bundled: the domain is a year, the services are
     * a month, and a customer who is charged for both without being told which
     * was which has a reason to dispute it. The recurring charge after that is
     * the operator's subscription, set up separately — this endpoint does not
     * pretend to have created one.
     */
    const dueToday = q.quote.dueTodayCents + q.quote.monthlyCents;
    if (dueToday <= 0) return fail('There is nothing to pay for in that order.');

    const orderId = rid('so');
    const options: SetupOptions = {
      mailboxes: Array.isArray(d.mailboxes)
        ? (d.mailboxes as unknown[]).map(m => String(m)).slice(0, 20)
        : [],
      hosting: !!d.hosting,
      crm: !!d.crm,
      owner: (d.owner ?? {}) as SetupOptions['owner'],
    };

    const now = nowIso();
    await env.DB.prepare(
      `INSERT INTO crm_setup_orders
       (id, account_id, project_id, domain, options, lines, total_cents, monthly_cents, currency,
        status, checkout_ref, contact_email, company_name, last_error, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?, 'awaiting_payment', '', ?,?,'',?,?)`,
    ).bind(
      orderId, accountId, String(d.projectId ?? '').trim(), q.domain,
      JSON.stringify(options), JSON.stringify(q.quote.lines),
      dueToday, q.quote.monthlyCents, q.quote.currency,
      email, company, now, now,
    ).run();

    const safe = (given: unknown, fallback: string) => {
      try {
        const u = new URL(String(given ?? ''), origin);
        return u.origin === origin ? u.toString() : origin + fallback;
      } catch { return origin + fallback; }
    };

    const r = await pay.checkout(processor.key, {
      reference: orderId,
      amountCents: dueToday,
      currency: q.quote.currency,
      description: `${q.domain} — business setup`,
      email,
      successUrl: safe(d.successUrl, `/autopilot?setup=${orderId}`),
      cancelUrl: safe(d.cancelUrl, `/autopilot?setup=cancelled`),
      needsShipping: false,
    }, {
      providerRef: processor.row?.provider_ref ?? '',
      companyName: 'Protected Central',
      remember: async (ref: string) => {
        await env.DB.prepare('UPDATE crm_install_providers SET provider_ref = ?, updated_at = ? WHERE kind = ?')
          .bind(ref.slice(0, 4000), nowIso(), 'payments').run();
      },
    });

    if (!r.ok) {
      await env.DB.prepare("UPDATE crm_setup_orders SET status = 'draft', last_error = ?, updated_at = ? WHERE id = ?")
        .bind(r.error.slice(0, 500), nowIso(), orderId).run();
      return fail(r.error);
    }

    await env.DB.prepare('UPDATE crm_setup_orders SET checkout_ref = ?, updated_at = ? WHERE id = ?')
      .bind(r.sessionId || '', nowIso(), orderId).run();

    return json({ success: true, orderId, url: r.url });
  }

  /* ── Watching it happen ───────────────────────────────────────────────── */

  if (act === 'status') {
    const orderId = String(d.orderId ?? '').trim();
    const order = await env.DB.prepare(
      `SELECT id, account_id, project_id AS projectId, domain, status, total_cents AS totalCents,
              monthly_cents AS monthlyCents, currency, lines, company_name AS companyName,
              created_at AS createdAt, paid_at AS paidAt, finished_at AS finishedAt
       FROM crm_setup_orders WHERE id = ? AND account_id = ?`,
    ).bind(orderId, accountId).first<Record<string, unknown>>();
    if (!order) return fail('No such order in this workspace.');

    const { results } = await env.DB.prepare(
      `SELECT seq, step, status, label, detail, finished_at AS finishedAt
       FROM crm_setup_steps WHERE order_id = ? ORDER BY seq`,
    ).bind(orderId).all();

    /*
     * `last_error` is absent from that query on purpose.
     *
     * It is the provider's own wording — it names them, and half of it is in
     * Dutch. What the customer gets is `detail`, which we wrote.
     */
    return json({
      success: true,
      order: { ...order, lines: parse<unknown[]>(String(order.lines ?? '[]'), []) },
      steps: results ?? [],
      /* So a screen can draw the whole list before the first step has run. */
      plan: STEPS.map((s, i) => ({ seq: i + 1, step: s.step, label: s.label })),
    });
  }

  if (act === 'orders') {
    const { results } = await env.DB.prepare(
      `SELECT id, domain, status, created_at AS createdAt, finished_at AS finishedAt
       FROM crm_setup_orders WHERE account_id = ? ORDER BY created_at DESC LIMIT 20`,
    ).bind(accountId).all();
    return json({ success: true, orders: results ?? [] });
  }

  /* ── Domains this workspace owns ──────────────────────────────────────── */

  if (act === 'domains') {
    const { results } = await env.DB.prepare(
      /* No cost column. A customer must never learn what their domain cost us. */
      `SELECT domain, status, expires_at AS expiresAt FROM crm_owned_domains
       WHERE account_id = ? ORDER BY created_at DESC`,
    ).bind(accountId).all();
    return json({ success: true, domains: results ?? [] });
  }

  /* ── DNS ──────────────────────────────────────────────────────────────── */

  const ownsDomain = async (domain: string): Promise<boolean> => {
    const row = await env.DB.prepare('SELECT 1 AS n FROM crm_owned_domains WHERE domain = ? AND account_id = ?')
      .bind(domain, accountId).first();
    return !!row;
  };

  if (act === 'dns_list' || act === 'dns_save') {
    const domain = String(d.domain ?? '').trim().toLowerCase();
    /*
     * Ownership checked against our own table, not the registrar's.
     *
     * Asking the provider "does this zone exist" answers a different question —
     * it exists for every customer on the install — and would let anybody with
     * a session read and rewrite a stranger's DNS by typing their domain.
     */
    if (!await ownsDomain(domain)) return fail('That domain is not in this workspace.', 403);

    const conn = await connectedProvider(env);
    if (!conn) return fail('DNS is not available on this installation right now.');

    if (act === 'dns_save') {
      const raw = Array.isArray(d.records) ? d.records as Array<Record<string, unknown>> : [];
      const allowed = new Set(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA']);
      const records: DnsRecord[] = [];
      for (const r of raw.slice(0, 200)) {
        const type = String(r.type ?? '').toUpperCase();
        const value = String(r.value ?? '').trim();
        if (!allowed.has(type) || !value) continue;
        records.push({
          name: String(r.name ?? '').trim().replace(/[^A-Za-z0-9._*-]/g, '').slice(0, 120),
          type: type as DnsRecord['type'],
          value: value.slice(0, 1000),
          ttl: Math.min(Math.max(Math.round(Number(r.ttl) || 3600), 60), 86400),
          ...(r.prio === undefined || r.prio === null ? {} : { prio: Math.min(Math.max(Math.round(Number(r.prio) || 0), 0), 65535) }),
        });
      }
      if (!records.length) return fail('A zone needs at least one record. Nothing was changed.');

      const saved = await conn.provider.replaceRecords(conn.creds, domain, records);
      if (!saved.ok) return fail('We could not save those records. Check them and try again.');
    }

    const listed = await conn.provider.listRecords(conn.creds, domain);
    if (!listed.ok) return fail('We could not read your DNS records just now.');
    return json({ success: true, domain, records: listed.records });
  }

  /* ── Mailboxes ────────────────────────────────────────────────────────── */

  if (act === 'mailbox_list') {
    const { results } = await env.DB.prepare(
      /* Never a password, encrypted or otherwise. */
      `SELECT id, label, from_email AS address, is_primary AS isPrimary,
              out_verified_at AS outVerifiedAt, in_verified_at AS inVerifiedAt,
              created_at AS createdAt
       FROM crm_mailbox_accounts WHERE account_id = ? ORDER BY is_primary DESC, created_at`,
    ).bind(accountId).all();
    return json({ success: true, mailboxes: results ?? [] });
  }

  if (act === 'mailbox_create') {
    const domain = String(d.domain ?? '').trim().toLowerCase();
    if (!await ownsDomain(domain)) return fail('That domain is not in this workspace.', 403);

    const local = String(d.localPart ?? '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (!local) return fail('What should the address be? For example "sales".');

    const address = `${local}@${domain}`;
    const existing = await env.DB.prepare(
      'SELECT 1 AS n FROM crm_mailbox_accounts WHERE account_id = ? AND from_email = ?',
    ).bind(accountId, address).first();
    if (existing) return fail(`${address} already exists.`);

    const conn = await connectedProvider(env);
    if (!conn) return fail('Business email is not available on this installation right now.');

    const owned = await env.DB.prepare('SELECT owner_handle FROM crm_owned_domains WHERE domain = ?')
      .bind(domain).first<{ owner_handle: string }>();
    const enabled = await conn.provider.enableEmail(conn.creds, domain, owned?.owner_handle ?? '');
    if (!enabled.ok) return fail('We could not add a mailbox to that domain just now.');

    const r = await conn.provider.createMailbox(conn.creds, domain, local, String(d.displayName ?? local));
    if (!r.ok || !r.mailbox) return fail('We could not create that mailbox just now.');

    const settings = conn.provider.mailSettings(conn.creds);
    const key = await installSecret(env.DB, 'mailbox_key');
    const { encryptSecret } = await import('../lib/crypto');
    const pw = await encryptSecret(key, r.mailbox.password);
    const now = nowIso();

    const count = await env.DB.prepare('SELECT count(*) AS n FROM crm_mailbox_accounts WHERE account_id = ?')
      .bind(accountId).first<{ n: number }>();

    await env.DB.prepare(
      `INSERT INTO crm_mailbox_accounts
       (id, account_id, label, is_primary, smtp_host, smtp_port, smtp_encryption, smtp_username, smtp_password,
        from_name, from_email, imap_host, imap_port, imap_encryption, imap_username, imap_password, imap_folder,
        provider, created_at, updated_at)
       VALUES (?,?,?,?,?,?, 'tls', ?,?,?,?,?,?, 'ssl', ?,?, 'INBOX', 'smtp', ?,?)`,
    ).bind(
      rid('mb'), accountId, String(d.displayName ?? local).slice(0, 60), (count?.n ?? 0) === 0 ? 1 : 0,
      settings.smtpHost, settings.smtpPort, address, pw,
      String(d.displayName ?? local).slice(0, 60), address,
      settings.imapHost, settings.imapPort, address, pw,
      now, now,
    ).run();

    return json({ success: true, address });
  }

  return fail(`"${act}" is not something this endpoint does.`);
}

/**
 * A setup order has been paid for.
 *
 * Called from the billing webhook, which is the only thing that may say so —
 * a browser reporting its own success is a browser that can have a domain
 * registered for free.
 *
 * Provisioning is started here rather than left to the next cron tick, because
 * a customer is watching a progress list at this moment. The scheduled sweep
 * still exists and still matters: it is what finishes an order whose Worker was
 * killed halfway through this call.
 */
export async function markSetupPaid(env: Env, reference: string): Promise<boolean> {
  const order = await env.DB.prepare(
    `SELECT id, account_id, project_id, domain, options, status, contact_email, company_name
     FROM crm_setup_orders WHERE id = ? OR checkout_ref = ?`,
  ).bind(reference, reference).first<OrderRow>();
  if (!order) return false;

  /* Only from awaiting_payment. The same rule the storefront uses, and for the
     same reason: Creem's webhook signature has no timestamp, so a captured
     delivery stays valid for ever and the state check is what stops a replay
     provisioning a second time. */
  if (order.status !== 'awaiting_payment' && order.status !== 'draft') return true;

  await env.DB.prepare("UPDATE crm_setup_orders SET status = 'paid', paid_at = ?, updated_at = ? WHERE id = ?")
    .bind(nowIso(), nowIso(), order.id).run();

  try {
    await advanceOrder(env, { ...order, status: 'paid' });
  } catch {
    /* Left for the sweep. A webhook that returns non-2xx is retried by the
       processor, and a retry here would try to provision twice. */
  }
  return true;
}
