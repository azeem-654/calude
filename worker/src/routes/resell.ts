/**
 * Reselling at your own price: a reseller bills the clients whose workspaces
 * they run, on their own payment account.
 *
 * ── The pot of money this is ──
 *
 * Not the operator's (routes/billing.ts) and not a shop's (routes/storefront.ts).
 * A reseller connects their own Stripe or Creem here, sets what each client
 * pays, and sends that client a subscription link drawn on the reseller's own
 * key. The client's money lands in the reseller's account. Protected Central
 * never touches it, never sees the card, and earns no affiliate commission on
 * it — commissions are on the operator's billing only.
 *
 * ── Trust ──
 *
 * The price is the reseller's own decision about their own client, so it is
 * theirs to set — but it is stored here and read back at checkout, never taken
 * from the checkout request. A reseller may set a price, and send a link, only
 * for a workspace they own (crm_workspaces). Each reseller's webhook address
 * carries their own `hook_id`; the event is checked with their own secret, and
 * may only change the status of a client that belongs to them.
 *
 *   status · connect · test · disconnect · set_price · checkout
 *   /api/resell-webhook.php?r=<hook_id>
 */
import { addr, body, fail, json } from '../lib/http';
import { installSecret, nowIso, userFromToken, type Env, type SessionUser } from '../lib/db';
import { decryptSecret, encryptSecret } from '../lib/crypto';
import { DEFAULT_PROVIDER, providerChoices, providerFor, type ProviderContext } from '../lib/payments';

const SECRET_KEY = 'mailbox_key';

interface Req {
  token?: string; action?: string; provider?: string; apiKey?: string; webhookSecret?: string;
  accountId?: string; amount?: number; currency?: string; email?: string; label?: string;
}
interface Row { owner_email: string; provider: string; credentials: string; provider_ref: string; hook_id: string; status: string; last_error: string }
interface ClientRow { account_id: string; owner_email: string; amount_cents: number; currency: string; status: string; last_paid_at: string | null; updated_at: string }

const randomId = () => [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');

async function loadRow(env: Env, email: string) {
  return env.DB.prepare('SELECT * FROM crm_reseller_billing WHERE owner_email = ?').bind(email).first<Row>();
}
async function creds(env: Env, row: Row | null): Promise<{ key: string; webhookSecret: string }> {
  if (!row?.credentials) return { key: '', webhookSecret: '' };
  try {
    const c = JSON.parse(await decryptSecret(await installSecret(env.DB, SECRET_KEY), row.credentials)) as { key?: string; webhookSecret?: string };
    return { key: c.key ?? '', webhookSecret: c.webhookSecret ?? '' };
  } catch { return { key: '', webhookSecret: '' }; }
}
const context = (env: Env, row: Row, company: string): ProviderContext => ({
  providerRef: row.provider_ref,
  companyName: company,
  remember: async (ref: string) => {
    await env.DB.prepare('UPDATE crm_reseller_billing SET provider_ref = ?, updated_at = ? WHERE owner_email = ?')
      .bind(ref.slice(0, 4000), nowIso(), row.owner_email).run();
  },
});
/** A workspace this reseller owns — the only ones they may price or bill. */
const owns = async (env: Env, user: SessionUser, accountId: string) =>
  !!(await env.DB.prepare('SELECT 1 AS n FROM crm_workspaces WHERE account_id = ? AND owner_email = ?')
    .bind(accountId, user.email.toLowerCase()).first());

export async function handleResell(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });
  if (user.role !== 'agency') return fail('Only the owner of an agency account can bill clients.', 403);
  const me = user.email.toLowerCase();
  const act = String(d.action ?? 'status');
  const origin = new URL(req.url).origin;

  const state = async () => {
    const row = await loadRow(env, me);
    const c = await creds(env, row);
    const provider = providerFor(row?.provider ?? DEFAULT_PROVIDER);
    const { results } = await env.DB.prepare('SELECT * FROM crm_reseller_clients WHERE owner_email = ?').bind(me).all<ClientRow>();
    return {
      connected: !!c.key,
      provider: row?.provider ?? null,
      providerLabel: provider?.label ?? null,
      mode: c.key && provider ? provider.modeOf(c.key) : null,
      webhookSet: !!c.webhookSecret,
      webhookUrl: row ? `${origin}/api/resell-webhook.php?r=${row.hook_id}` : '',
      status: row?.status ?? 'unknown',
      lastError: row?.last_error ?? '',
      choices: providerChoices(),
      clients: (results ?? []).map(r => ({ accountId: r.account_id, amountCents: r.amount_cents, currency: r.currency, status: r.status, lastPaidAt: r.last_paid_at })),
    };
  };

  if (act === 'status') return json({ success: true, resell: await state() });

  if (act === 'disconnect') {
    await env.DB.prepare("UPDATE crm_reseller_billing SET credentials = '', provider_ref = '', status = 'unknown', last_error = '', updated_at = ? WHERE owner_email = ?").bind(nowIso(), me).run();
    return json({ success: true, resell: await state() });
  }

  if (act === 'test') {
    const row = await loadRow(env, me);
    const c = await creds(env, row);
    const provider = providerFor(row?.provider ?? '');
    if (!row || !c.key || !provider) return fail('Connect your payment account first.', 200, { field: 'resell.key' });
    const r = await provider.verify(c.key);
    await env.DB.prepare('UPDATE crm_reseller_billing SET status = ?, last_error = ?, updated_at = ? WHERE owner_email = ?')
      .bind(r.ok ? 'ok' : 'failed', r.ok ? '' : r.error.slice(0, 500), nowIso(), me).run();
    if (!r.ok) return json({ success: false, error: r.error, message: r.error, diagnosis: { summary: r.error, steps: r.steps }, resell: await state() });
    return json({ success: true, account: { name: r.name, mode: r.mode, chargesEnabled: r.chargesEnabled }, resell: await state() });
  }

  if (act === 'connect') {
    const wanted = String(d.provider ?? DEFAULT_PROVIDER);
    const provider = providerFor(wanted);
    if (!provider) return fail(`"${wanted}" is not a payment processor this app supports.`);
    const row = await loadRow(env, me);
    const existing = await creds(env, row);
    const switching = !!row?.provider && row.provider !== wanted;
    const given = String(d.apiKey ?? '').trim();
    if (!given && (switching || !existing.key)) return fail(`Paste your ${provider.label} key.`, 200, { field: 'resell.key' });
    if (given) { const why = provider.validateKey(given); if (why) return fail(why, 200, { field: 'resell.key' }); }
    const key = given || existing.key;
    const wh = String(d.webhookSecret ?? '').trim() || (switching ? '' : existing.webhookSecret);
    const enc = await encryptSecret(await installSecret(env.DB, SECRET_KEY), JSON.stringify({ key, webhookSecret: wh }));
    await env.DB.prepare(
      `INSERT INTO crm_reseller_billing (owner_email, provider, credentials, provider_ref, hook_id, status, last_error, updated_at)
       VALUES (?,?,?,?,?, 'unknown', '', ?)
       ON CONFLICT(owner_email) DO UPDATE SET provider = excluded.provider, credentials = excluded.credentials,
         provider_ref = CASE WHEN crm_reseller_billing.provider = excluded.provider THEN crm_reseller_billing.provider_ref ELSE '' END,
         status = 'unknown', last_error = '', updated_at = excluded.updated_at`,
    ).bind(me, wanted, enc, '', randomId(), nowIso()).run();
    return json({ success: true, resell: await state() });
  }

  if (act === 'set_price') {
    const accountId = String(d.accountId ?? '').trim();
    if (!accountId || !(await owns(env, user, accountId))) return fail('That client workspace is not yours to bill.', 403);
    const amount = Number(d.amount);
    if (!Number.isFinite(amount) || amount < 1 || amount > 100000) return fail('Set a monthly price between 1 and 100,000.', 200, { field: 'resell.price' });
    const currency = (String(d.currency ?? 'USD') || 'USD').toUpperCase().slice(0, 3);
    await env.DB.prepare(
      `INSERT INTO crm_reseller_clients (account_id, owner_email, amount_cents, currency, status, updated_at) VALUES (?,?,?,?, 'none', ?)
       ON CONFLICT(account_id) DO UPDATE SET amount_cents = excluded.amount_cents, currency = excluded.currency, updated_at = excluded.updated_at
       WHERE crm_reseller_clients.owner_email = excluded.owner_email`,
    ).bind(accountId, me, Math.round(amount * 100), currency, nowIso()).run();
    return json({ success: true, resell: await state() });
  }

  if (act === 'checkout') {
    const accountId = String(d.accountId ?? '').trim();
    if (!accountId || !(await owns(env, user, accountId))) return fail('That client workspace is not yours to bill.', 403);
    const row = await loadRow(env, me);
    const c = await creds(env, row);
    const provider = providerFor(row?.provider ?? '');
    if (!row || !c.key || !provider) return fail('Connect your own payment account first — your clients pay you, not Protected Central.', 200, { field: 'resell.key' });
    /* The price as the reseller saved it, read here. A checkout request that
       carried its own figure would be a second, unchecked place to set it. */
    const price = await env.DB.prepare('SELECT * FROM crm_reseller_clients WHERE account_id = ? AND owner_email = ?').bind(accountId, me).first<ClientRow>();
    if (!price) return fail('Set this client\'s monthly price first.', 200, { field: 'resell.price' });
    if (provider.currencies.length && !provider.currencies.includes(price.currency)) {
      return fail(`${provider.label} cannot bill in ${price.currency} — it accepts ${provider.currencies.join(' and ')}.`, 200, { field: 'resell.price' });
    }
    const r = await provider.subscribe(c.key, {
      reference: accountId,
      planName: String(d.label ?? 'Monthly plan').slice(0, 120) || 'Monthly plan',
      amountCents: price.amount_cents,
      currency: price.currency,
      email: addr(d.email) ?? '',
      successUrl: `${origin}/?paid=1`,
      cancelUrl: `${origin}/?paid=0`,
    }, context(env, row, String(d.label ?? '')));
    if (!r.ok) return json({ success: false, error: r.error, message: r.error, ...(r.steps.length ? { diagnosis: { summary: r.error, steps: r.steps } } : {}) });
    await env.DB.prepare("UPDATE crm_reseller_clients SET status = CASE WHEN status = 'active' THEN status ELSE 'checkout_sent' END, updated_at = ? WHERE account_id = ?")
      .bind(nowIso(), accountId).run();
    return json({ success: true, url: r.url, expiresNote: r.expiresNote, resell: await state() });
  }

  return fail(`"${act}" is not something this endpoint does.`);
}

/** A reseller's own processor telling us their client paid. */
export async function handleResellWebhook(req: Request, env: Env): Promise<Response> {
  const hook = new URL(req.url).searchParams.get('r') ?? '';
  if (!/^[a-f0-9]{24}$/.test(hook)) return new Response('unknown', { status: 404 });
  const row = await env.DB.prepare('SELECT * FROM crm_reseller_billing WHERE hook_id = ?').bind(hook).first<Row>();
  if (!row) return new Response('unknown', { status: 404 });
  const c = await creds(env, row);
  const provider = providerFor(row.provider);
  if (!c.webhookSecret || !provider) return new Response('webhook-not-configured', { status: 400 });
  const payload = await req.text();
  if (!(await provider.verifySignature(c.webhookSecret, payload, req.headers))) return new Response('bad-signature', { status: 400 });
  const event = provider.readEvent(payload);
  if (!event) return new Response('bad-json', { status: 400 });

  /* Each delivery once — Creem signatures never expire (see billing.ts). */
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
    const id = `resell:${[...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')}`;
    const fresh = await env.DB.prepare('INSERT OR IGNORE INTO crm_webhook_events (id, source, created_at) VALUES (?, ?, ?)').bind(id, provider.id, nowIso()).run();
    if (!fresh.meta.changes) return new Response('ok (already handled)', { status: 200 });
  } catch { /* carry on */ }

  if (event.reference) {
    const status = event.kind === 'paid' ? 'active' : event.kind === 'refunded' ? 'cancelled' : event.kind === 'failed' ? 'past_due' : '';
    if (status) {
      /* Only this reseller's own client: another reseller's processor cannot
         reach here, and this one cannot speak for anybody else's. */
      await env.DB.prepare(
        `UPDATE crm_reseller_clients SET status = ?, last_paid_at = CASE WHEN ? = 'active' THEN ? ELSE last_paid_at END, updated_at = ?
         WHERE account_id = ? AND owner_email = ?`,
      ).bind(status, status, nowIso(), nowIso(), event.reference, row.owner_email).run();
    }
  }
  return new Response('ok', { status: 200 });
}
