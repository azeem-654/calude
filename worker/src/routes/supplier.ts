/**
 * Connecting a supplier, importing what they make, and sending them an order.
 *
 * ── The honest shape of dropshipping in this app ──
 *
 * Import brings across products the customer has already set up in Printful.
 * It does not browse Printful's catalogue and invent a shop for them: choosing
 * what to sell, and what to charge, is the business decision, and a screen that
 * made it for them would be picking a business at random.
 *
 * Submitting an order creates a *draft* at the supplier. Confirming it — the
 * call that charges their card and starts a garment being printed — is a
 * separate press, for the same reason buying a domain is.
 */
import { body, fail, json } from '../lib/http';
import { canAccess, installSecret, nowIso, userFromToken, type Env } from '../lib/db';
import { decryptSecret, encryptSecret } from '../lib/crypto';
import {
  addressProblems, confirmOrder, getProduct, listProducts, submitOrder, verify,
  type PfCreds, type PfItem, type PfRecipient,
} from '../lib/printful';

const SECRET_KEY = 'mailbox_key';
const PROVIDER = 'printful';

interface Req {
  token?: string;
  action?: string;
  accountId?: string;
  supplierToken?: string;
  storeId?: string;
  orderId?: string;
  confirm?: boolean;
}

interface Row {
  account_id: string;
  provider: string;
  credentials: string;
  verified_at: string | null;
  last_error: string;
}

const rid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

async function loadRow(env: Env, accountId: string): Promise<Row | null> {
  return env.DB.prepare('SELECT * FROM crm_suppliers WHERE account_id = ? AND provider = ?')
    .bind(accountId, PROVIDER).first<Row>();
}

async function loadCreds(env: Env, accountId: string): Promise<PfCreds | null> {
  const row = await loadRow(env, accountId);
  if (!row?.credentials) return null;
  try {
    const c = JSON.parse(await decryptSecret(await installSecret(env.DB, SECRET_KEY), row.credentials)) as PfCreds;
    return c.token ? { token: c.token, storeId: c.storeId ?? '' } : null;
  } catch {
    return null;
  }
}

/** Whether this workspace has a supplier that has tested clean. */
export async function supplierReady(env: Env, accountId: string): Promise<boolean> {
  const row = await loadRow(env, accountId);
  return !!row?.credentials && !!row.verified_at;
}

/**
 * What a Printful refusal means, and what to do about it.
 *
 * Same rule as everywhere else here: the person reading this pasted a token out
 * of a dashboard, and "Unauthorized" is not something they can act on.
 */
function remedy(msg: string): string[] {
  const m = msg.toLowerCase();
  if (m.includes('access token') || m.includes('unauthorized')) {
    return [
      'Sign in at printful.com and open Settings → Developers.',
      'Create a new private token, giving it access to your store.',
      'Copy it once — Printful shows it only at that moment — and paste it above.',
      'Press Test again.',
    ];
  }
  if (m.includes('store')) {
    return [
      'This token can see more than one store, so it has to be told which.',
      'In Printful, open the store you sell from; its numeric id is in the address bar.',
      'Put that id in the Store ID field above, or make a token scoped to a single store instead.',
    ];
  }
  if (m.includes('scope') || m.includes('permission')) {
    return [
      'The token exists but is not allowed to do this.',
      'In Printful → Settings → Developers, edit the token and enable the Orders and Sync Products scopes.',
      'Save, then press Test again.',
    ];
  }
  return [
    'Check the token was copied whole, with no spaces at either end.',
    'Confirm the Printful account it belongs to is active.',
    'If Printful is reporting an outage, wait and try again — nothing is saved as broken.',
  ];
}

/**
 * Send one paid order to the supplier as a draft.
 *
 * Exported so Autopilot can do it from the cron, where there is no request to
 * run a handler from. Everything that decides *whether* it is safe to send \u2014
 * paid, addressable, actually made by this supplier \u2014 lives here, so the
 * scheduled path cannot skip a check the manual one makes.
 *
 * Only ever creates a draft. Confirming is what charges their account and
 * starts a garment being printed, and nothing scheduled does that.
 */
export async function draftAtSupplier(
  env: Env, accountId: string, orderId: string,
): Promise<{ ok: boolean; ref: string; error: string; steps: string[]; notSupplied: string[] }> {
  const no = (error: string, steps: string[] = []) => ({ ok: false, ref: '', error, steps, notSupplied: [] as string[] });

  const creds = await loadCreds(env, accountId);
  if (!creds) return no('No Printful token is connected.');

  const o = await env.DB.prepare(
    `SELECT id, email, items, status, ship_name, ship_address1, ship_address2, ship_city,
            ship_state, ship_zip, ship_country, ship_phone, supplier_ref
     FROM crm_orders WHERE id = ? AND account_id = ?`,
  ).bind(orderId, accountId).first<Record<string, string>>();
  if (!o) return no('That order is not in this workspace.');
  if (o.status !== 'paid' && o.status !== 'fulfilled') {
    return no('Only a paid order can be sent to the supplier \u2014 nobody should be printing something that has not been paid for.');
  }
  if (o.supplier_ref) return no('That order is already with the supplier.');

  const recipient: PfRecipient = {
    name: o.ship_name ?? '', address1: o.ship_address1 ?? '', address2: o.ship_address2 ?? '',
    city: o.ship_city ?? '', state_code: o.ship_state ?? '',
    country_code: (o.ship_country ?? '').toUpperCase(), zip: o.ship_zip ?? '',
    phone: o.ship_phone ?? '', email: o.email ?? '',
  };
  const problems = addressProblems(recipient);
  if (problems.length) {
    return no('This order cannot be shipped as it stands.', [
      ...problems,
      'A payment link collects the address at checkout. An order recorded by hand does not have one \u2014 take it from the customer and record the order again through a payment link.',
    ]);
  }

  let lines: { productId?: string; qty?: number }[] = [];
  try { lines = JSON.parse(o.items ?? '[]') as typeof lines; } catch { lines = []; }

  const items: PfItem[] = [];
  const notSupplied: string[] = [];
  for (const l of lines) {
    const prod = await env.DB.prepare(
      'SELECT name, source, supplier_ref FROM crm_products WHERE id = ? AND account_id = ?',
    ).bind(String(l.productId ?? ''), accountId).first<{ name: string; source: string; supplier_ref: string }>();
    if (!prod || prod.source !== PROVIDER || !prod.supplier_ref) {
      notSupplied.push(prod?.name || String(l.productId ?? 'an item'));
      continue;
    }
    items.push({ sync_variant_id: Number(prod.supplier_ref), quantity: Math.max(1, Math.round(Number(l.qty) || 1)) });
  }
  if (!items.length) return no('Nothing on this order comes from Printful, so there is nothing for them to make.');

  const r = await submitOrder(creds, o.id, recipient, items);
  if (!r.ok) {
    await env.DB.prepare("UPDATE crm_orders SET supplier_status = 'failed', supplier_error = ?, supplier_provider = ?, updated_at = ? WHERE id = ? AND account_id = ?")
      .bind(r.error.slice(0, 500), PROVIDER, nowIso(), orderId, accountId).run();
    return { ...no(r.error, remedy(r.error)), notSupplied };
  }

  const ref = String(r.data?.id ?? '');
  await env.DB.prepare(
    "UPDATE crm_orders SET supplier_provider = ?, supplier_ref = ?, supplier_status = 'draft', supplier_error = '', updated_at = ? WHERE id = ? AND account_id = ?",
  ).bind(PROVIDER, ref, nowIso(), orderId, accountId).run();

  return { ok: true, ref, error: '', steps: [], notSupplied };
}

export async function handleSupplier(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });

  const accountId = String(d.accountId ?? '').trim();
  if (!/^[A-Za-z0-9_.\-]{1,64}$/.test(accountId)) return fail('A valid workspace is required.');
  if (!(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours.', 403);

  const act = d.action ?? 'get';

  /* The token is never in here, in any form. A connected supplier shows as
     connected and nothing more. */
  const state = async () => {
    const row = await loadRow(env, accountId);
    let storeId = '';
    if (row?.credentials) {
      const c = await loadCreds(env, accountId);
      storeId = c?.storeId ?? '';
    }
    return {
      provider: PROVIDER,
      connected: !!row?.credentials,
      storeId,
      verifiedAt: row?.verified_at ?? null,
      lastError: row?.last_error ?? '',
    };
  };

  if (act === 'get') return json({ success: true, supplier: await state() });

  if (act === 'save') {
    const key = await installSecret(env.DB, SECRET_KEY);
    const existing = await loadRow(env, accountId);
    const old = existing ? await loadCreds(env, accountId) : null;

    /* Blank keeps the stored token, as everywhere else — the form shows dots
       and cannot send back what it was never given. */
    const given = String(d.supplierToken ?? '').trim();
    const token = given || old?.token || '';
    if (!token) return fail('Paste the private token from Printful → Settings → Developers.');

    const storeId = d.storeId === undefined
      ? (old?.storeId ?? '')
      : String(d.storeId).trim().replace(/[^0-9]/g, '');

    const credentials = await encryptSecret(key, JSON.stringify({ token, storeId }));
    /* A changed token has not been tested, whatever the last test said. */
    const verified = given ? null : (existing?.verified_at ?? null);

    await env.DB.prepare(
      `INSERT INTO crm_suppliers (account_id, provider, credentials, verified_at, last_error, updated_at)
       VALUES (?,?,?,?,'',?)
       ON CONFLICT(account_id, provider) DO UPDATE SET
         credentials=excluded.credentials, verified_at=excluded.verified_at,
         last_error=excluded.last_error, updated_at=excluded.updated_at`,
    ).bind(accountId, PROVIDER, credentials, verified, nowIso()).run();

    return json({ success: true, supplier: await state() });
  }

  if (act === 'test') {
    const creds = await loadCreds(env, accountId);
    if (!creds) return fail('Connect a Printful token first.');
    const r = await verify(creds);
    if (!r.ok) {
      await env.DB.prepare('UPDATE crm_suppliers SET verified_at = NULL, last_error = ?, updated_at = ? WHERE account_id = ? AND provider = ?')
        .bind(r.error.slice(0, 500), nowIso(), accountId, PROVIDER).run();
      return json({
        success: false, error: r.error, message: r.error,
        diagnosis: { summary: r.error, steps: remedy(r.error) },
        supplier: await state(),
      });
    }
    await env.DB.prepare("UPDATE crm_suppliers SET verified_at = ?, last_error = '', updated_at = ? WHERE account_id = ? AND provider = ?")
      .bind(nowIso(), nowIso(), accountId, PROVIDER).run();
    return json({
      success: true,
      stores: (r.data ?? []).map(s => ({ id: s.id, name: s.name })),
      /* Said when it matters. A token that sees several stores and no store id
         will import from whichever Printful picks, which is not a thing to find
         out from a customer's parcel. */
      needsStoreId: (r.data ?? []).length > 1 && !creds.storeId,
      supplier: await state(),
    });
  }

  if (act === 'disconnect') {
    await env.DB.prepare('DELETE FROM crm_suppliers WHERE account_id = ? AND provider = ?')
      .bind(accountId, PROVIDER).run();
    return json({ success: true, supplier: await state() });
  }

  /* ── Bringing their Printful products in ── */
  if (act === 'import') {
    const creds = await loadCreds(env, accountId);
    if (!creds) return fail('Connect a Printful token first.');

    const list = await listProducts(creds);
    if (!list.ok) {
      return json({ success: false, error: list.error, message: list.error, diagnosis: { summary: list.error, steps: remedy(list.error) } });
    }
    const products = (list.data ?? []).filter(p => !p.is_ignored);
    if (!products.length) {
      return fail('That Printful store has no products in it yet. Add one in Printful, then import.');
    }

    const now = nowIso();
    let added = 0, updated = 0;
    const skipped: string[] = [];

    for (const p of products.slice(0, 100)) {
      /* One call per product, because the list gives a name and a count but no
         price — and a product imported with a price of zero is a product
         somebody sells for nothing. */
      const full = await getProduct(creds, p.id);
      const variants = full.data?.sync_variants ?? [];
      const first = variants[0];
      if (!first) { skipped.push(`${p.name} — no variants synced in Printful`); continue; }

      const price = Math.round(Number(first.retail_price ?? 0) * 100);
      if (price <= 0) { skipped.push(`${p.name} — no retail price set in Printful`); continue; }

      /* Keyed on the sync variant, which is what an order is actually placed
         against. Re-importing updates rather than duplicating. */
      const ref = String(first.id);
      const existing = await env.DB.prepare(
        "SELECT id FROM crm_products WHERE account_id = ? AND source = ? AND supplier_ref = ?",
      ).bind(accountId, PROVIDER, ref).first<{ id: string }>();

      if (existing) {
        await env.DB.prepare(
          'UPDATE crm_products SET name = ?, price_cents = ?, currency = ?, sku = ?, updated_at = ? WHERE id = ?',
        ).bind(p.name.slice(0, 200), price, (first.currency || 'USD').toUpperCase(), String(first.sku ?? '').slice(0, 80), now, existing.id).run();
        updated++;
      } else {
        await env.DB.prepare(
          `INSERT INTO crm_products
           (id, account_id, name, description, sku, price_cents, cost_cents, currency,
            source, supplier_ref, status, created_at, updated_at)
           VALUES (?,?,?,'',?,?,0,?,?,?,'draft',?,?)`,
        ).bind(
          rid('prod'), accountId, p.name.slice(0, 200), String(first.sku ?? '').slice(0, 80),
          price, (first.currency || 'USD').toUpperCase(), PROVIDER, ref, now, now,
        ).run();
        added++;
      }
    }

    return json({
      success: true, added, updated, skipped,
      /* Draft, not active. An imported product is Printful's opinion of what
         they sell; making it live is theirs. */
      note: added
        ? `${added} imported as drafts — set them active when you are happy with the price and the description.`
        : 'Nothing new to import; the ones already here were refreshed.',
    });
  }

  /* ── Sending an order to be made ── */
  if (act === 'fulfil') {
    const orderId = String(d.orderId ?? '').trim();

    /* Confirming is a different act from submitting, and it is the one that
       spends money. Sending the order again instead would print it twice. */
    if (d.confirm) {
      const creds = await loadCreds(env, accountId);
      if (!creds) return fail('Connect a Printful token first.');
      const o = await env.DB.prepare('SELECT supplier_ref FROM crm_orders WHERE id = ? AND account_id = ?')
        .bind(orderId, accountId).first<{ supplier_ref: string }>();
      if (!o) return fail('That order is not in this workspace.');
      if (!o.supplier_ref) return fail('That order has not reached Printful yet, so there is nothing to confirm.');

      const c = await confirmOrder(creds, Number(o.supplier_ref));
      if (!c.ok) {
        await env.DB.prepare('UPDATE crm_orders SET supplier_error = ?, updated_at = ? WHERE id = ? AND account_id = ?')
          .bind(c.error.slice(0, 500), nowIso(), orderId, accountId).run();
        return json({ success: false, error: c.error, message: c.error, diagnosis: { summary: c.error, steps: remedy(c.error) } });
      }
      await env.DB.prepare("UPDATE crm_orders SET supplier_status = 'submitted', supplier_error = '', updated_at = ? WHERE id = ? AND account_id = ?")
        .bind(nowIso(), orderId, accountId).run();
      return json({ success: true, supplierRef: o.supplier_ref, status: 'submitted', note: 'Confirmed. Printful is making it.' });
    }

    const r = await draftAtSupplier(env, accountId, orderId);
    if (!r.ok) {
      return json({
        success: false, error: r.error, message: r.error,
        ...(r.steps.length ? { diagnosis: { summary: r.error, steps: r.steps } } : {}),
      });
    }
    return json({
      success: true,
      supplierRef: r.ref,
      status: 'draft',
      /* Partial, and said so. Some lines reaching a supplier and others not is
         exactly the case where a plain "sent" leaves somebody short. */
      partial: r.notSupplied,
      note: r.notSupplied.length
        ? `Sent as a draft. ${r.notSupplied.length} line(s) are not Printful products and were left for you to handle: ${r.notSupplied.join(', ')}.`
        : 'Sent as a draft. Nothing is charged or printed until you confirm it.',
    });
  }

  return fail(`"${act}" is not something this endpoint does.`);
}
