/**
 * Openprovider, kept entirely behind the curtain.
 *
 * Built against the published OpenAPI description of their REST API rather
 * than from memory — every path, field name and response shape below came out
 * of that document. Two things it settles that are easy to get wrong:
 *
 * - **The version is `/v1`, not `/v1beta`.** Their own portal says /v1beta is
 *   switched off at the end of 2026 and that no new integration should be
 *   built on it. Everything here is /v1.
 *
 * - **Business email is the `mailcow` family of endpoints**, and it is two
 *   separate acts: buying seats (`/v1/mailcow/orders`) and turning a seat into
 *   an actual address (`/v1/mailcow/orders/assign`). Doing only the first
 *   produces an order with no mailbox on it, which looks like success and
 *   delivers no mail.
 *
 * ── What never crosses this boundary ──
 *
 * The reseller price. `data.price.reseller` is what an order costs *us*; it is
 * returned from `check` as `cost` and consumed by the pricing layer, which
 * turns it into a retail figure. Nothing that reaches a browser is derived from
 * it, and the `product` price Openprovider also returns — their suggested
 * retail — is deliberately ignored, because the operator sets prices here.
 *
 * Their error text is returned too, and it names them. That is why `error` on
 * every result is documented as owner-only: it goes in the admin view and the
 * step's `last_error`, never into anything the customer reads.
 */
import type { Check, CheckResult, DnsRecord, Provider, ProviderCreds } from './types';

const LIVE = 'https://api.openprovider.eu';
const SANDBOX = 'https://api.sandbox.openprovider.nl';

/**
 * Openprovider addresses DNS records by their full hostname, not relative to
 * the zone — the apex of example.com is the record named `example.com`, and www
 * is `www.example.com`. Everything above this layer uses relative names,
 * because that is what a DNS screen shows and what every other provider wants,
 * so the conversion happens here and only here.
 */
const toFqdn = (name: string, domain: string): string => {
  const n = name.trim().replace(/\.$/, '');
  if (!n || n === '@') return domain;
  return n.endsWith(domain) ? n : `${n}.${domain}`;
};
const toRelative = (name: string, domain: string): string => {
  const n = (name || '').trim().replace(/\.$/, '');
  if (!n || n === domain) return '';
  return n.endsWith(`.${domain}`) ? n.slice(0, -(domain.length + 1)) : n;
};

/** `example.co.uk` → {name: 'example', extension: 'co.uk'}. */
export function splitDomain(domain: string): { name: string; extension: string } {
  const d = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
  const dot = d.indexOf('.');
  return dot === -1 ? { name: d, extension: '' } : { name: d.slice(0, dot), extension: d.slice(dot + 1) };
}

interface Envelope<T> {
  code?: number;
  desc?: string;
  data?: T;
}

/**
 * One token per set of credentials, for as long as it lasts.
 *
 * Logging in on every call would be three round trips to register one domain
 * and would trip their rate limiting during a provisioning run. The cache is
 * module-scoped, which in a Worker means per isolate — short-lived and never
 * shared across accounts, since the key includes the username.
 *
 * Openprovider's tokens are long-lived but not for ever; rather than track an
 * expiry they do not return, a 401 clears the entry and the call is made once
 * more with a fresh token. One retry, not a loop: a permanently wrong password
 * must fail rather than spin.
 */
const tokens = new Map<string, string>();
const tokenKey = (c: ProviderCreds) => `${c.sandbox ? 's' : 'l'}:${c.username}`;

async function login(creds: ProviderCreds): Promise<{ ok: boolean; token: string; error: string }> {
  const base = creds.sandbox ? SANDBOX : LIVE;
  let res: Response;
  try {
    res = await fetch(`${base}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: creds.username, password: creds.password }),
    });
  } catch (e) {
    return { ok: false, token: '', error: `Could not reach the registrar: ${e instanceof Error ? e.message : String(e)}` };
  }
  const body = await res.json<Envelope<{ token?: string }>>().catch(() => ({}) as Envelope<{ token?: string }>);
  const token = body.data?.token ?? '';
  if (!res.ok || !token) {
    /* Their 200s can still carry a failure in `code`, so the description is
       read whichever way it arrived. */
    return { ok: false, token: '', error: body.desc || `Sign-in to the registrar failed (HTTP ${res.status}).` };
  }
  tokens.set(tokenKey(creds), token);
  return { ok: true, token, error: '' };
}

async function call<T>(
  creds: ProviderCreds, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string,
  body?: unknown, retried = false,
): Promise<{ ok: boolean; data: T | null; error: string }> {
  const base = creds.sandbox ? SANDBOX : LIVE;
  let token = tokens.get(tokenKey(creds)) ?? '';
  if (!token) {
    const l = await login(creds);
    if (!l.ok) return { ok: false, data: null, error: l.error };
    token = l.token;
  }

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (e) {
    return { ok: false, data: null, error: `Could not reach the registrar: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (res.status === 401 && !retried) {
    tokens.delete(tokenKey(creds));
    return call<T>(creds, method, path, body, true);
  }

  const env = await res.json<Envelope<T>>().catch(() => ({}) as Envelope<T>);
  /* Code 0 is their success. A non-zero code with HTTP 200 is a real failure
     and treating the HTTP status as the answer would report it as working. */
  const failed = !res.ok || (typeof env.code === 'number' && env.code !== 0);
  if (failed) {
    return { ok: false, data: env.data ?? null, error: env.desc || `Registrar returned HTTP ${res.status}.` };
  }
  return { ok: true, data: env.data ?? null, error: '' };
}

/** Their prices are decimal numbers in a named currency. Ours are integers. */
function money(raw: { price?: unknown; currency?: unknown } | undefined): { cents: number; currency: string } | null {
  const n = Number(raw?.price);
  if (!Number.isFinite(n)) return null;
  return { cents: Math.round(n * 100), currency: String(raw?.currency ?? 'USD').toUpperCase() || 'USD' };
}

export const openprovider: Provider = {
  id: 'openprovider',
  label: 'Openprovider',

  async check(creds, domains) {
    const wanted = domains.map(splitDomain).filter(d => d.name && d.extension);
    if (!wanted.length) return { ok: true, results: [], error: '' };

    const r = await call<{ results?: Array<Record<string, unknown>> }>(creds, 'POST', '/v1/domains/check', {
      domains: wanted,
      with_price: true,
    });
    if (!r.ok) return { ok: false, results: [], error: r.error };

    const results: CheckResult[] = (r.data?.results ?? []).map(row => {
      const price = row.price as { reseller?: { price?: unknown; currency?: unknown } } | undefined;
      return {
        domain: String(row.domain ?? ''),
        /* 'free' is their word for "nobody owns this". Anything else — active,
           in transfer, quarantined — is unavailable, and the distinction only
           matters to the log. */
        available: String(row.status ?? '') === 'free',
        reason: String(row.reason ?? row.status ?? ''),
        premium: !!row.is_premium,
        cost: money(price?.reseller),
      };
    });
    return { ok: true, results, error: '' };
  },

  async suggest(creds, name, tlds, limit) {
    const r = await call<{ results?: Array<{ domain?: string }> }>(creds, 'POST', '/v1/domains/suggest-name', {
      name,
      tlds,
      limit: Math.min(Math.max(limit, 1), 20),
      /* Their filter for names a supplier flags as obscene. On by default here:
         a suggestion list is shown to a customer unreviewed. */
      sensitive: true,
    });
    if (!r.ok) return { ok: false, domains: [], error: r.error };
    return { ok: true, domains: (r.data?.results ?? []).map(x => String(x.domain ?? '')).filter(Boolean), error: '' };
  },

  async register(creds, input) {
    const o = input.owner;

    /*
     * A registrant first.
     *
     * Every TLD requires a real contact, and Openprovider models that as a
     * customer record with a handle. It is the customer's own details, not the
     * operator's: putting the operator on the record would make the operator
     * the legal registrant of somebody else's domain, which is the sort of
     * thing that only becomes visible during a dispute.
     */
    const cust = await call<{ handle?: string }>(creds, 'POST', '/v1/customers', {
      company_name: o.companyName || undefined,
      email: o.email,
      name: { first_name: o.firstName, last_name: o.lastName },
      address: {
        street: o.street,
        number: o.houseNumber || '1',
        zipcode: o.zip,
        city: o.city,
        state: o.state,
        country: o.country,
      },
      phone: {
        country_code: o.phoneCountry,
        area_code: o.phoneArea,
        subscriber_number: o.phoneNumber,
      },
    });
    if (!cust.ok || !cust.data?.handle) {
      return { ok: false, providerId: '', ownerHandle: '', expiresAt: '', cost: null, error: cust.error || 'The registrar would not accept the contact details.' };
    }
    const handle = String(cust.data.handle);

    const { name, extension } = splitDomain(input.domain);
    const reg = await call<{ id?: unknown; expiration_date?: unknown; price?: { reseller?: { price?: unknown; currency?: unknown } } }>(
      creds, 'POST', '/v1/domains', {
        domain: { name, extension },
        period: Math.min(Math.max(Math.round(input.years) || 1, 1), 10),
        owner_handle: handle,
        admin_handle: handle,
        tech_handle: handle,
        billing_handle: handle,
        /* Off deliberately. A renewal is a charge, and a charge nobody chose is
           the fastest way to a chargeback; renewals are the operator's decision
           to make from their own screen. */
        autorenew: 'off',
        name_servers: input.nameServers.map((ns, i) => ({ name: ns, seq_nr: i })),
        /* Free with most TLDs and the default everywhere sensible: the
           registrant here is a small business owner whose home address would
           otherwise be in a public database. */
        is_private_whois_enabled: true,
      });

    if (!reg.ok) {
      return { ok: false, providerId: '', ownerHandle: handle, expiresAt: '', cost: null, error: reg.error };
    }
    return {
      ok: true,
      providerId: String(reg.data?.id ?? ''),
      ownerHandle: handle,
      expiresAt: String(reg.data?.expiration_date ?? ''),
      cost: money(reg.data?.price?.reseller),
      error: '',
    };
  },

  async createZone(creds, domain, records) {
    const { name, extension } = splitDomain(domain);
    const r = await call<unknown>(creds, 'POST', '/v1/dns/zones', {
      domain: { name, extension },
      type: 'master',
      records: records.map(rec => ({
        name: toFqdn(rec.name, domain),
        type: rec.type,
        value: rec.value,
        ttl: rec.ttl,
        ...(rec.prio === undefined ? {} : { prio: rec.prio }),
      })),
    });
    if (r.ok) return { ok: true, error: '' };

    /* A zone that is already there is the state we wanted. Retrying a
       provisioning step must not fail on the evidence of its own success. */
    if (/exist|duplicate|already/i.test(r.error)) return { ok: true, error: '' };
    return { ok: false, error: r.error };
  },

  async listRecords(creds, domain) {
    const r = await call<{ results?: Array<Record<string, unknown>> }>(
      creds, 'GET', `/v1/dns/zones/${encodeURIComponent(domain)}/records?limit=500`,
    );
    if (!r.ok) return { ok: false, records: [], error: r.error };
    const records: DnsRecord[] = (r.data?.results ?? []).map(row => ({
      name: toRelative(String(row.name ?? ''), domain),
      type: String(row.type ?? 'A').toUpperCase() as DnsRecord['type'],
      value: String(row.value ?? ''),
      ttl: Number(row.ttl) || 3600,
      ...(row.prio === undefined || row.prio === null ? {} : { prio: Number(row.prio) || 0 }),
    }));
    return { ok: true, records, error: '' };
  },

  async replaceRecords(creds, domain, records) {
    /*
     * Stated as a whole set rather than a diff.
     *
     * Their update takes add/remove/update lists, and computing those from two
     * snapshots means deciding when two records are "the same one edited"
     * versus "one deleted and another added" — a judgement with no right answer
     * for a zone containing three identical-value TXT records. Reading what is
     * there and removing exactly that is unambiguous.
     */
    const current = await this.listRecords(creds, domain);
    if (!current.ok) return { ok: false, error: current.error };

    const out = (rec: DnsRecord) => ({
      name: toFqdn(rec.name, domain),
      type: rec.type,
      value: rec.value,
      ttl: rec.ttl,
      ...(rec.prio === undefined ? {} : { prio: rec.prio }),
    });

    const r = await call<unknown>(creds, 'PUT', `/v1/dns/zones/${encodeURIComponent(domain)}`, {
      name: domain,
      type: 'master',
      records: {
        remove: current.records.map(out),
        add: records.map(out),
      },
    });
    return r.ok ? { ok: true, error: '' } : { ok: false, error: r.error };
  },

  async enableEmail(creds, domain, ownerHandle) {
    const { name, extension } = splitDomain(domain);
    const r = await call<unknown>(creds, 'POST', '/v1/mailcow/domains', {
      domain: { name, extension },
      description: 'Protected Central business email',
      ...(ownerHandle ? { owner_handle: ownerHandle } : {}),
    });
    if (r.ok) return { ok: true, error: '' };
    if (/exist|already/i.test(r.error)) return { ok: true, error: '' };
    return { ok: false, error: r.error };
  },

  async createMailbox(creds, domain, localPart, displayName) {
    const { name, extension } = splitDomain(domain);
    const lp = localPart.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (!lp) return { ok: false, mailbox: null, error: 'A mailbox needs a name.' };

    /*
     * Generated here, and long.
     *
     * Nobody types this — the app stores it and uses it over SMTP and IMAP on
     * the customer's behalf — so the only thing a memorable password would buy
     * is a weaker one. The alphabet leaves out characters that are ambiguous
     * when somebody does eventually read it off a screen to a mail client.
     */
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const password = [...bytes].map(b => alphabet[b % alphabet.length]).join('');

    /*
     * Seats are bought before they can be filled.
     *
     * `orders` buys capacity; `orders/assign` turns a free seat into a real
     * address. Buying unconditionally would spend money on a second seat every
     * time a retry ran, so the buy is attempted and its failure tolerated —
     * assign is the call that actually has to succeed, and it fails loudly when
     * there is no seat to use.
     */
    await call<unknown>(creds, 'POST', '/v1/mailcow/orders', { quantity: '1', period: '1' });

    const r = await call<{ id?: unknown; mailbox?: unknown }>(creds, 'POST', '/v1/mailcow/orders/assign', {
      domain: { name, extension },
      mailbox: lp,
      name: displayName || lp,
      password,
      subscription_period: '1',
    });
    if (!r.ok) return { ok: false, mailbox: null, error: r.error };

    return {
      ok: true,
      mailbox: {
        address: `${lp}@${domain}`,
        password,
        providerId: String(r.data?.id ?? ''),
      },
      error: '',
    };
  },

  /**
   * The four things that have to be true, asked one at a time.
   *
   * Openprovider answers a wrong password and a disabled API switch with the
   * same code 196 — their own documentation calls it "Authentication/
   * Authorization Failed" for both. There is no way to tell them apart from
   * outside, so this does not pretend to: it names both, in the order they are
   * most often the cause, with where each one lives. That is more useful than
   * picking one and being wrong half the time.
   *
   * The balance check is the one that matters most and is the easiest to miss.
   * A zero balance passes every other test — credentials work, searches work,
   * prices come back — and then fails at the exact moment a customer has paid.
   */
  async diagnose(creds) {
    const checks: Check[] = [];

    /* 1. Can we sign in at all? */
    tokens.delete(tokenKey(creds));
    const auth = await login(creds);
    if (!auth.ok) {
      const refused = /196|authentication|authorization/i.test(auth.error);
      checks.push({
        id: 'auth',
        label: 'Signing in to your provider account',
        state: 'failed',
        detail: auth.error,
        /*
         * Sandbox first, when sandbox is on.
         *
         * The test environment is a *separate account* — signing up for the
         * live one creates no login there, and the provider refuses it with the
         * same code as a wrong password. Somebody who has just ticked the box on
         * working live credentials will otherwise spend the afternoon retyping a
         * password that was right all along.
         */
        fix: !refused
          ? 'The provider could not be reached at all. If this keeps happening it is on their side, not yours.'
          : creds.sandbox
            ? 'Most likely: the sandbox is a completely separate account from your live one, with its own username and password. Your live details will never work against it. Either untick "Use the sandbox" and test with your real account, or sign up for a sandbox account and put those details here instead. If you are sure these are sandbox details: check API access is switched on in the sandbox control panel, under Account → Account Overview.'
            : 'Two things give this same answer. First: in your provider control panel open Account → Account Overview and check that API access shows a green dot — it is off by default and has to be switched on. Second: the password here must be your control-panel password, retyped (a saved one is never shown back, so an empty box keeps the old one).',
        blocking: true,
      });
      /* Nothing below can be answered without a session, and reporting them as
         failures too would be four alarms for one fault. */
      for (const [id, label] of [['ip', 'IP restrictions'], ['balance', 'Account balance'], ['search', 'Searching for domains']] as const) {
        checks.push({ id, label, state: 'skipped', detail: 'Not checked — sign-in failed first.', fix: '', blocking: false });
      }
      return checks;
    }
    checks.push({ id: 'auth', label: 'Signing in to your provider account', state: 'ok', detail: 'Accepted.', fix: '', blocking: false });

    /*
     * 2. An IP restriction cannot be read, only inferred.
     *
     * The allow-list lives on the contact record and applies to the caller, so
     * a call made from a blocked address never gets far enough to read it. What
     * we can say is that this call arrived — which means whatever list exists
     * does not exclude this Worker *today*. Cloudflare's addresses are not
     * fixed, so a list that happens to contain today's is not a list that will
     * contain tomorrow's, and saying so is the whole point of the check.
     */
    checks.push({
      id: 'ip',
      label: 'IP restrictions',
      state: 'warning',
      detail: 'This call was accepted, so no restriction is blocking it right now.',
      fix: 'Worth confirming once: in your provider control panel, on your contact details page, the API access IP whitelist and blacklist should both be completely empty. This app runs on Cloudflare Workers, which have no fixed outbound address — a list that allows today\'s will refuse next week\'s.',
      blocking: false,
    });

    /* 3. The balance. */
    const acct = await call<{ balance?: unknown; reserved_balance?: unknown; status?: unknown; company_name?: unknown }>(
      creds, 'GET', '/v1/resellers',
    );
    if (!acct.ok) {
      checks.push({
        id: 'balance', label: 'Account balance', state: 'warning',
        detail: `Could not read it: ${acct.error}`,
        fix: 'Check the balance in your provider control panel by hand before taking a live order.',
        blocking: false,
      });
    } else {
      const balance = Number(acct.data?.balance) || 0;
      const enough = balance > 0;
      checks.push({
        id: 'balance',
        label: 'Account balance',
        state: enough ? 'ok' : 'failed',
        detail: enough
          ? `${balance.toFixed(2)} available.`
          : 'Zero. Domain registration is charged to this the moment it happens.',
        fix: enough
          ? ''
          : 'Top the balance up in your provider control panel before going live. Everything else will keep working until a customer pays you — and then the registration will fail with their money already taken. Sandbox mode needs no balance, so you can test the whole flow today.',
        /* Blocking for live, not for testing — which is why the fix says so
           rather than the flag pretending sandbox is broken too. */
        blocking: !enough && !creds.sandbox,
      });
    }

    /* 4. The thing customers actually do. */
    const probe = await this.check(creds, ['protectedcentral-connection-test.com']);
    checks.push({
      id: 'search',
      label: 'Searching for domains',
      state: probe.ok ? 'ok' : 'failed',
      detail: probe.ok
        ? `Working${creds.sandbox ? ' — in sandbox mode, so results are simulated and nothing can be bought for real.' : '.'}`
        : probe.error,
      fix: probe.ok ? '' : 'Sign-in worked but searching did not, which usually means the account is not finished — the provider may need you to complete reseller onboarding before the domain API answers.',
      blocking: !probe.ok,
    });

    return checks;
  },

  mailSettings(creds) {
    /*
     * The host is configured, not guessed.
     *
     * Openprovider's business email is mailcow behind a per-reseller hostname,
     * so there is no single correct value to hardcode — and a mailbox pointed
     * at the wrong host authenticates against nothing and reports itself as
     * broken at the moment somebody tries to send. The fallback is their
     * documented default so an install that has not set one still works; the
     * field exists so an install that needs a different one does too.
     */
    const host = (creds.mailHost || '').trim() || 'mail.openprovider.eu';
    return { smtpHost: host, smtpPort: 587, imapHost: host, imapPort: 993 };
  },
};
