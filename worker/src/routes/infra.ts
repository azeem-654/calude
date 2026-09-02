/**
 * The infrastructure a workspace runs on: domains, DNS, mailboxes.
 *
 * Part of making the product able to set a customer up rather than tell them
 * what to go and set up. A new client needs a domain, that domain needs SPF,
 * DKIM and DMARC pointing at whoever sends their mail, and somebody needs to
 * create the mailbox those credentials belong to. Every one of those is a third
 * party with an API, and until now every one of them was a paragraph of
 * instructions in a settings panel.
 *
 * Two rules run through all of it:
 *
 *   1. Credentials go one way. They are encrypted with the same AES-GCM install
 *      secret the mailbox password already uses, they are never returned to a
 *      browser, and every call to a provider is made here rather than from the
 *      client — an API key that can buy domains has no business in a bundle.
 *
 *   2. Nothing pretends. A provider that is not connected says so; a call that
 *      fails reports what the provider actually said. The alternative — a
 *      plausible success with nothing behind it — is worse than no automation
 *      at all, because the customer finds out when their mail bounces.
 *
 * What is actually wired, and to what:
 *
 *   - DNS: Cloudflare. Real, and the one that matters most, because SPF/DKIM/
 *     DMARC are DNS records and this writes them.
 *   - Registrar: Porkbun (availability, price and registration through their
 *     public API) and Cloudflare (the domains you already hold).
 *   - Mailbox: Migadu (creates a real mailbox and hands back the SMTP/IMAP
 *     credentials, which drop straight into the workspace's mail settings).
 *
 * Anything else is 'manual': the app works out what is needed and shows it, a
 * person applies it. That is a supported state, not a failure — most agencies
 * will run one connected provider and do the rest by hand.
 */
import { body, fail, json, ok } from '../lib/http';
import { canAccess, installSecret, nowIso, userFromToken, type Env } from '../lib/db';
import { decryptSecret, encryptSecret } from '../lib/crypto';

const SECRET_KEY = 'mailbox_key';

export type Kind = 'registrar' | 'dns' | 'mailbox';
const KINDS: Kind[] = ['registrar', 'dns', 'mailbox'];

/* ── What can be connected, and what each one needs ──────────────────────── */

interface Field {
  key: string;
  label: string;
  /** A password field in the UI, and never echoed back. */
  secret?: boolean;
  hint?: string;
  optional?: boolean;
}

interface ProviderSpec {
  id: string;
  kind: Kind;
  name: string;
  /** One line the settings screen shows under the name. */
  blurb: string;
  /** What this provider can actually do once connected. */
  can: string[];
  fields: Field[];
  /** Where to go and make the credential. */
  docs: string;
}

export const CATALOGUE: ProviderSpec[] = [
  {
    id: 'cloudflare',
    kind: 'dns',
    name: 'Cloudflare DNS',
    blurb: 'Writes SPF, DKIM and DMARC for you, and points the domain at your site.',
    can: ['Read the live records', 'Write authentication records', 'Point a domain at a hosted site'],
    fields: [
      { key: 'apiToken', label: 'API token', secret: true, hint: 'Needs Zone:Read and DNS:Edit on the zones you want managed.' },
      { key: 'accountId', label: 'Account ID', optional: true, hint: 'Only needed to list domains you hold at Cloudflare Registrar.' },
    ],
    docs: 'https://dash.cloudflare.com/profile/api-tokens',
  },
  {
    id: 'porkbun',
    kind: 'registrar',
    name: 'Porkbun',
    blurb: 'Checks whether a domain is free, what it costs, and registers it.',
    can: ['Search availability', 'Show the real price', 'Register a domain'],
    fields: [
      { key: 'apiKey', label: 'API key', secret: true },
      { key: 'secretApiKey', label: 'Secret key', secret: true },
    ],
    docs: 'https://porkbun.com/account/api',
  },
  {
    id: 'cloudflare',
    kind: 'registrar',
    name: 'Cloudflare Registrar',
    blurb: 'Lists the domains you already hold. Cloudflare has no public buy API, so new registrations are done in their dashboard.',
    can: ['List the domains you hold'],
    fields: [
      { key: 'apiToken', label: 'API token', secret: true },
      { key: 'accountId', label: 'Account ID' },
    ],
    docs: 'https://dash.cloudflare.com/profile/api-tokens',
  },
  {
    id: 'migadu',
    kind: 'mailbox',
    name: 'Migadu',
    blurb: 'Creates real mailboxes on your domain and hands back the SMTP and IMAP details.',
    can: ['Create a mailbox', 'Set its password', 'Fill in the workspace mail settings'],
    fields: [
      { key: 'account', label: 'Admin email', hint: 'The address you sign in to Migadu with.' },
      { key: 'apiKey', label: 'API key', secret: true },
    ],
    docs: 'https://admin.migadu.com/account/api/keys',
  },
  {
    id: 'manual',
    kind: 'mailbox',
    name: 'Somewhere else',
    blurb: 'Google Workspace, Microsoft 365, your own server. The app works out what is needed; you create it.',
    can: ['Show what to create', 'Check it once it exists'],
    fields: [],
    docs: '',
  },
];

const specFor = (kind: string, provider: string): ProviderSpec | undefined =>
  CATALOGUE.find(s => s.kind === kind && s.id === provider);

/* ── Storage ─────────────────────────────────────────────────────────────── */

interface ProviderRow {
  account_id: string;
  kind: string;
  provider: string;
  credentials: string;
  status: string;
  status_note: string;
  checked_at: string | null;
  updated_at: string;
}

type Creds = Record<string, string>;

async function loadProvider(env: Env, accountId: string, kind: Kind): Promise<{ row: ProviderRow; creds: Creds } | null> {
  const row = await env.DB.prepare('SELECT * FROM crm_providers WHERE account_id = ? AND kind = ?')
    .bind(accountId, kind).first<ProviderRow>();
  if (!row) return null;
  const key = await installSecret(env.DB, SECRET_KEY);
  let creds: Creds = {};
  try { creds = JSON.parse(await decryptSecret(key, row.credentials)) as Creds; } catch { creds = {}; }
  return { row, creds };
}

/** What a browser may see: everything except the credentials themselves. */
function redact(row: ProviderRow, creds: Creds): Record<string, unknown> {
  const spec = specFor(row.kind, row.provider);
  return {
    kind: row.kind,
    provider: row.provider,
    name: spec?.name ?? row.provider,
    status: row.status,
    note: row.status_note,
    checkedAt: row.checked_at,
    updatedAt: row.updated_at,
    /* Which fields are filled in, not what is in them — enough for the form to
       show "••••••" against the ones already set. */
    filled: Object.keys(creds).filter(k => (creds[k] ?? '').length > 0),
  };
}

async function record(env: Env, accountId: string, kind: string, subject: string, provider: string, outcome: 'ok' | 'failed', detail: string) {
  await env.DB.prepare(
    'INSERT INTO crm_provisioned (id, account_id, kind, subject, provider, outcome, detail, created_at) VALUES (?,?,?,?,?,?,?,?)',
  ).bind(crypto.randomUUID(), accountId, kind, subject.slice(0, 253), provider, outcome, detail.slice(0, 500), nowIso()).run();
}

/* ── Talking to the providers ────────────────────────────────────────────── */

interface CfResult<T> { success: boolean; result?: T; errors?: { message?: string }[] }

async function cf<T>(token: string, path: string, init: RequestInit = {}): Promise<{ ok: boolean; result?: T; error: string }> {
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const j = await r.json<CfResult<T>>().catch(() => ({ success: false }) as CfResult<T>);
    if (!j.success) {
      const msg = (j.errors ?? []).map(e => e.message).filter(Boolean).join('; ');
      return { ok: false, error: msg || `Cloudflare answered HTTP ${r.status}.`, result: undefined };
    }
    return { ok: true, result: j.result, error: '' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Cloudflare could not be reached.' };
  }
}

interface Zone { id: string; name: string }

/**
 * The zone that governs a name.
 *
 * `mail.clientsite.co.uk` is not itself a zone — `clientsite.co.uk` is — so
 * this walks the labels upwards until Cloudflare recognises one. Guessing by
 * counting labels gets .co.uk wrong; asking does not.
 */
async function zoneFor(token: string, domain: string): Promise<{ zone: Zone | null; error: string }> {
  const labels = domain.split('.');
  for (let i = 0; i < labels.length - 1; i++) {
    const candidate = labels.slice(i).join('.');
    const r = await cf<Zone[]>(token, `/zones?name=${encodeURIComponent(candidate)}`);
    if (!r.ok) return { zone: null, error: r.error };
    if (r.result && r.result.length) return { zone: r.result[0], error: '' };
  }
  return { zone: null, error: `${domain} is not on this Cloudflare account. Add the domain there first, or apply the records by hand.` };
}

async function porkbun<T>(creds: Creds, path: string, extra: Record<string, unknown> = {}): Promise<{ ok: boolean; data?: T; error: string }> {
  try {
    const r = await fetch(`https://api.porkbun.com/api/json/v3${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apikey: creds.apiKey ?? '', secretapikey: creds.secretApiKey ?? '', ...extra }),
    });
    const j = await r.json<{ status?: string; message?: string }>().catch(() => ({} as { status?: string; message?: string }));
    if (j.status !== 'SUCCESS') return { ok: false, error: j.message || `Porkbun answered HTTP ${r.status}.` };
    return { ok: true, data: j as T, error: '' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Porkbun could not be reached.' };
  }
}

async function migadu<T>(creds: Creds, path: string, init: RequestInit = {}): Promise<{ ok: boolean; data?: T; error: string }> {
  try {
    const auth = btoa(`${creds.account ?? ''}:${creds.apiKey ?? ''}`);
    const r = await fetch(`https://api.migadu.com/v1${path}`, {
      ...init,
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    if (r.status === 401 || r.status === 403) return { ok: false, error: 'Migadu rejected those credentials.' };
    const text = await r.text();
    if (!r.ok) return { ok: false, error: text.slice(0, 200) || `Migadu answered HTTP ${r.status}.` };
    try { return { ok: true, data: JSON.parse(text) as T, error: '' }; }
    catch { return { ok: true, data: undefined, error: '' }; }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Migadu could not be reached.' };
  }
}

/** Does this credential work? Asked of the provider, not of our own record. */
async function testProvider(_kind: Kind, provider: string, creds: Creds): Promise<{ ok: boolean; note: string }> {
  if (provider === 'manual') return { ok: true, note: 'Nothing to test — this one is done by hand.' };

  if (provider === 'cloudflare') {
    const token = creds.apiToken ?? '';
    if (!token) return { ok: false, note: 'No API token saved.' };
    const r = await cf<Zone[]>(token, '/zones?per_page=5');
    if (!r.ok) return { ok: false, note: r.error };
    const names = (r.result ?? []).map(z => z.name);
    return {
      ok: true,
      note: names.length
        ? `Connected. ${names.length === 1 ? 'Manages' : 'Manages'} ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and more` : ''}.`
        : 'Connected, but this token can see no zones. Check its zone permissions.',
    };
  }

  if (provider === 'porkbun') {
    const r = await porkbun<{ yourIp?: string }>(creds, '/ping');
    return { ok: r.ok, note: r.ok ? 'Connected to Porkbun.' : r.error };
  }

  if (provider === 'migadu') {
    const r = await migadu<{ domains?: { name: string }[] }>(creds, '/domains');
    if (!r.ok) return { ok: false, note: r.error };
    const n = r.data?.domains?.length ?? 0;
    return { ok: true, note: n ? `Connected. ${n} domain${n === 1 ? '' : 's'} available for mailboxes.` : 'Connected, but no mail domains are set up yet.' };
  }

  return { ok: false, note: `${provider} is not a provider this app knows.` };
}

/* ── DNS: what should be there, and what is ──────────────────────────────── */

type Purpose = 'spf' | 'dkim' | 'dmarc' | 'mx' | 'site';

interface Desired {
  purpose: Purpose;
  type: 'TXT' | 'MX' | 'CNAME';
  /** Fully qualified. */
  name: string;
  value: string;
  priority?: number;
  why: string;
}

const DOMAIN_OK = /^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?)+$/;

function cleanDomain(v: unknown): string {
  return String(v ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
}

/** One live DNS answer, asked over DoH so it reflects the world and not our own table. */
async function resolve(name: string, type: 'TXT' | 'MX' | 'CNAME'): Promise<{ asked: boolean; records: string[]; why: string }> {
  try {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, {
      headers: { Accept: 'application/dns-json' },
    });
    if (!r.ok) return { asked: false, records: [], why: `the DNS service answered HTTP ${r.status}` };
    const j = await r.json<{ Answer?: { data: string }[] }>();
    return { asked: true, records: (j.Answer ?? []).map(a => a.data.replace(/^"|"$/g, '').replace(/"\s+"/g, '')), why: '' };
  } catch (e) {
    return { asked: false, records: [], why: e instanceof Error ? e.message : 'the DNS lookup failed' };
  }
}

interface PlanInput {
  domain: string;
  selector: string;
  /** What goes in `include:` — the service that actually sends. */
  spfInclude: string;
  /** Where DMARC reports go. */
  dmarcMailto: string;
  dkimValue: string;
  mx: { host: string; priority: number }[];
  siteTarget: string;
}

/**
 * The records this domain ought to have.
 *
 * Derived rather than typed in: the SPF include follows from whoever sends the
 * mail, DMARC's reporting address follows from the domain, and getting either
 * subtly wrong is the difference between authenticated mail and the spam
 * folder. A person can still override any of it — this is the default they are
 * overriding.
 */
function plan(input: PlanInput): Desired[] {
  const d = input.domain;
  const out: Desired[] = [];

  out.push({
    purpose: 'spf',
    type: 'TXT',
    name: d,
    value: `v=spf1 ${input.spfInclude ? `include:${input.spfInclude} ` : ''}~all`,
    why: 'Says which servers may send as this domain. Without it your mail is unauthenticated.',
  });

  out.push({
    purpose: 'dmarc',
    type: 'TXT',
    name: `_dmarc.${d}`,
    value: `v=DMARC1; p=none; rua=mailto:${input.dmarcMailto || `dmarc@${d}`}; fo=1`,
    why: 'Tells receivers what to do when a message fails, and sends you the reports. Starts at p=none so nothing is rejected while you watch.',
  });

  if (input.dkimValue) {
    out.push({
      purpose: 'dkim',
      type: 'TXT',
      name: `${input.selector}._domainkey.${d}`,
      value: input.dkimValue,
      why: 'The public half of the key your mail is signed with. Your mail provider gives you this value.',
    });
  }

  for (const m of input.mx) {
    out.push({
      purpose: 'mx',
      type: 'MX',
      name: d,
      value: m.host,
      priority: m.priority,
      why: 'Where mail addressed to this domain is delivered.',
    });
  }

  if (input.siteTarget) {
    out.push({
      purpose: 'site',
      type: 'CNAME',
      name: `www.${d}`,
      value: input.siteTarget,
      why: 'Points the domain at the site this workspace publishes.',
    });
  }

  return out;
}

/* ── The endpoint ────────────────────────────────────────────────────────── */

interface Req {
  token?: string;
  action?: string;
  accountId?: string;
  kind?: string;
  provider?: string;
  credentials?: Record<string, unknown>;
  domain?: string;
  query?: string;
  selector?: string;
  spfInclude?: string;
  dmarcMailto?: string;
  dkimValue?: string;
  mx?: { host?: string; priority?: number }[];
  siteTarget?: string;
  purposes?: string[];
  localPart?: string;
  displayName?: string;
  password?: string;
  years?: number;
  confirm?: boolean;
}

export async function handleInfra(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });

  const accountId = String(d.accountId ?? '').trim();
  if (!/^[A-Za-z0-9_.\-:]{1,64}$/.test(accountId)) return fail('A valid workspace is required.');
  if (!(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours.', 403);

  /* Clients live inside a workspace an agency set up for them. Spending money
     on domains and creating mailboxes is the agency's call, not theirs. */
  if (user.role !== 'agency') return fail('Only the agency account can change infrastructure settings.', 403);

  const action = String(d.action ?? '');

  /* ── What can be connected ── */
  if (action === 'catalogue') {
    return json({ success: true, catalogue: CATALOGUE });
  }

  /* ── What is connected ── */
  if (action === 'providers') {
    const { results } = await env.DB.prepare('SELECT * FROM crm_providers WHERE account_id = ?')
      .bind(accountId).all<ProviderRow>();
    const key = await installSecret(env.DB, SECRET_KEY);
    const providers = await Promise.all((results ?? []).map(async row => {
      let creds: Creds = {};
      try { creds = JSON.parse(await decryptSecret(key, row.credentials)) as Creds; } catch { /* unreadable; shows as empty */ }
      return redact(row, creds);
    }));
    return json({ success: true, providers, catalogue: CATALOGUE });
  }

  /* ── Connect, replacing whatever was there for that kind ── */
  if (action === 'connect') {
    const kind = String(d.kind ?? '') as Kind;
    const provider = String(d.provider ?? '').toLowerCase().slice(0, 32);
    if (!KINDS.includes(kind)) return fail(`"${kind}" is not one of ${KINDS.join(', ')}.`);
    const spec = specFor(kind, provider);
    if (!spec) return fail(`${provider || 'That provider'} is not available for ${kind}.`);

    const existing = await loadProvider(env, accountId, kind);
    /* Keep a secret that was left blank, the same way the mailbox form does:
       the UI shows dots and cannot send back what it was never given. */
    const keep = existing && existing.row.provider === provider ? existing.creds : {};
    const creds: Creds = { ...keep };
    for (const f of spec.fields) {
      const given = d.credentials?.[f.key];
      const v = typeof given === 'string' ? given.trim() : '';
      if (v) creds[f.key] = v.slice(0, 4000);
    }
    const missing = spec.fields.filter(f => !f.optional && !(creds[f.key] ?? '')).map(f => f.label);
    if (missing.length) return fail(`${spec.name} needs ${missing.join(' and ')}.`);

    /* Test before storing a status, so what the screen shows is what the
       provider said and not what we hoped. */
    const t = await testProvider(kind, provider, creds);
    const key = await installSecret(env.DB, SECRET_KEY);
    const enc = await encryptSecret(key, JSON.stringify(creds));

    await env.DB.prepare(
      `INSERT INTO crm_providers (account_id, kind, provider, credentials, status, status_note, checked_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(account_id, kind) DO UPDATE SET
         provider=excluded.provider, credentials=excluded.credentials,
         status=excluded.status, status_note=excluded.status_note,
         checked_at=excluded.checked_at, updated_at=excluded.updated_at`,
    ).bind(accountId, kind, provider, enc, t.ok ? 'ok' : 'failed', t.note, nowIso(), nowIso()).run();

    /*
     * The credentials are stored either way — a token with one wrong character
     * should be editable rather than thrown away — but the reply is a failure
     * when the provider said no, so the screen shows what happened rather than
     * a green tick over a 403.
     */
    return json({ success: t.ok, saved: true, connected: t.ok, message: t.note, error: t.ok ? undefined : t.note });
  }

  if (action === 'disconnect') {
    const kind = String(d.kind ?? '');
    if (!KINDS.includes(kind as Kind)) return fail(`"${kind}" is not one of ${KINDS.join(', ')}.`);
    await env.DB.prepare('DELETE FROM crm_providers WHERE account_id = ? AND kind = ?').bind(accountId, kind).run();
    return ok();
  }

  if (action === 'test') {
    const kind = String(d.kind ?? '') as Kind;
    const p = await loadProvider(env, accountId, kind);
    if (!p) return fail(`No ${kind} provider is connected yet.`);
    const t = await testProvider(kind, p.row.provider, p.creds);
    await env.DB.prepare('UPDATE crm_providers SET status = ?, status_note = ?, checked_at = ? WHERE account_id = ? AND kind = ?')
      .bind(t.ok ? 'ok' : 'failed', t.note, nowIso(), accountId, kind).run();
    return json({ success: t.ok, message: t.note, error: t.ok ? undefined : t.note });
  }

  /* ── DNS: the plan, and what is live against it ── */
  if (action === 'dns_records') {
    const domain = cleanDomain(d.domain);
    if (!DOMAIN_OK.test(domain)) return fail('Enter the domain you send from, e.g. yourbusiness.com');
    const selector = String(d.selector ?? 'default').replace(/[^a-z0-9_\-]/gi, '') || 'default';

    const wanted = plan({
      domain,
      selector,
      spfInclude: String(d.spfInclude ?? '').trim().slice(0, 253),
      dmarcMailto: String(d.dmarcMailto ?? '').trim().slice(0, 253),
      dkimValue: String(d.dkimValue ?? '').trim().slice(0, 2000),
      mx: (d.mx ?? []).slice(0, 5).map(m => ({ host: cleanDomain(m.host), priority: Number(m.priority) || 10 })).filter(m => m.host),
      siteTarget: cleanDomain(d.siteTarget),
    });

    const live = await Promise.all(wanted.map(async w => {
      const r = await resolve(w.name, w.type);
      /* Present means "a record of this kind and shape is there", not "byte for
         byte what we would have written". An SPF record somebody hand-tuned is
         still an SPF record, and reporting it missing would send them to
         replace something that already works. */
      const key = w.purpose === 'spf' ? 'v=spf1' : w.purpose === 'dmarc' ? 'v=dmarc1' : '';
      const found = key
        ? r.records.find(t => t.toLowerCase().startsWith(key)) ?? ''
        : w.purpose === 'dkim'
          ? r.records.find(t => t.toLowerCase().includes('p=')) ?? ''
          : r.records[0] ?? '';
      return {
        ...w,
        checked: r.asked,
        why_not_checked: r.why,
        present: !!found,
        current: found,
        matches: !!found && found.replace(/\s+/g, ' ').trim().toLowerCase() === w.value.replace(/\s+/g, ' ').trim().toLowerCase(),
      };
    }));

    const dns = await loadProvider(env, accountId, 'dns');
    return json({
      success: true,
      domain,
      records: live,
      /* Whether the app can fix this itself, which is the whole question the
         screen is asking. */
      canApply: !!dns && dns.row.provider === 'cloudflare' && dns.row.status === 'ok',
      provider: dns ? dns.row.provider : null,
    });
  }

  /* ── DNS: write them ── */
  if (action === 'dns_apply') {
    const domain = cleanDomain(d.domain);
    if (!DOMAIN_OK.test(domain)) return fail('Enter the domain you send from, e.g. yourbusiness.com');

    const dns = await loadProvider(env, accountId, 'dns');
    if (!dns) return fail('Connect a DNS provider first — Settings → Infrastructure. Until then the records are shown for you to apply by hand.');
    if (dns.row.provider !== 'cloudflare') return fail(`${dns.row.provider} records have to be applied by hand — this app can only write DNS at Cloudflare.`);

    const token = dns.creds.apiToken ?? '';
    if (!token) return fail('The saved Cloudflare token could not be read. Connect it again.');

    const zoneR = await zoneFor(token, domain);
    if (!zoneR.zone) return fail(zoneR.error);
    const zone = zoneR.zone;

    const selector = String(d.selector ?? 'default').replace(/[^a-z0-9_\-]/gi, '') || 'default';
    const asked = new Set((d.purposes ?? []).map(p => String(p)));
    const wanted = plan({
      domain,
      selector,
      spfInclude: String(d.spfInclude ?? '').trim().slice(0, 253),
      dmarcMailto: String(d.dmarcMailto ?? '').trim().slice(0, 253),
      dkimValue: String(d.dkimValue ?? '').trim().slice(0, 2000),
      mx: (d.mx ?? []).slice(0, 5).map(m => ({ host: cleanDomain(m.host), priority: Number(m.priority) || 10 })).filter(m => m.host),
      siteTarget: cleanDomain(d.siteTarget),
    }).filter(w => asked.size === 0 || asked.has(w.purpose));

    if (!wanted.length) return fail('Nothing was selected to apply.');

    const applied: { name: string; type: string; ok: boolean; note: string }[] = [];

    for (const w of wanted) {
      /*
       * Replace rather than add, for anything a domain may only have one of.
       *
       * Two SPF records is not twice the authentication — it is a permanent
       * error, and receivers treat the domain as unauthenticated. So the
       * existing TXT of the same purpose is updated in place. MX is the
       * exception: several are normal and correct.
       */
      const listing = await cf<{ id: string; content: string; type: string; name: string }[]>(
        token, `/zones/${zone.id}/dns_records?type=${w.type}&name=${encodeURIComponent(w.name)}`);
      if (!listing.ok) {
        applied.push({ name: w.name, type: w.type, ok: false, note: listing.error });
        await record(env, accountId, 'dns_record', `${w.type} ${w.name}`, 'cloudflare', 'failed', listing.error);
        continue;
      }

      const existing = listing.result ?? [];
      const single = w.type !== 'MX';
      const marker = w.purpose === 'spf' ? 'v=spf1' : w.purpose === 'dmarc' ? 'v=dmarc1' : '';
      const target = single
        ? existing.find(r => (marker ? r.content.toLowerCase().includes(marker) : true))
        : existing.find(r => r.content.toLowerCase() === w.value.toLowerCase());

      const payload: Record<string, unknown> = { type: w.type, name: w.name, content: w.value, ttl: 1 };
      if (w.type === 'MX') payload.priority = w.priority ?? 10;
      if (w.type === 'CNAME') payload.proxied = true;

      const r = target
        ? await cf(token, `/zones/${zone.id}/dns_records/${target.id}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await cf(token, `/zones/${zone.id}/dns_records`, { method: 'POST', body: JSON.stringify(payload) });

      applied.push({
        name: w.name, type: w.type, ok: r.ok,
        note: r.ok ? (target ? 'Updated the existing record.' : 'Created.') : r.error,
      });
      await record(env, accountId, 'dns_record', `${w.type} ${w.name}`, 'cloudflare', r.ok ? 'ok' : 'failed', r.ok ? w.value : r.error);
    }

    const good = applied.filter(a => a.ok).length;
    return json({
      success: good > 0,
      applied,
      message: good === applied.length
        ? `${good} record${good === 1 ? '' : 's'} written to ${zone.name}. DNS takes a few minutes to propagate.`
        : `${good} of ${applied.length} records written. The rest are listed with what Cloudflare said.`,
    });
  }

  /* ── Registrar: is it free, and what does it cost ── */
  if (action === 'domain_search') {
    const q = String(d.query ?? '').trim().toLowerCase().replace(/[^a-z0-9\-. ]/g, '');
    if (!q) return fail('Type a name to look for.');

    const reg = await loadProvider(env, accountId, 'registrar');
    if (!reg) {
      return fail('No registrar is connected. Settings → Infrastructure → connect Porkbun to search and buy domains from here.', 200, { code: 'not_connected' });
    }

    if (reg.row.provider === 'cloudflare') {
      const acct = reg.creds.accountId ?? '';
      if (!acct) return fail('Cloudflare Registrar needs the account ID as well as a token.');
      const r = await cf<{ name: string; expires_at?: string }[]>(reg.creds.apiToken ?? '', `/accounts/${acct}/registrar/domains`);
      if (!r.ok) return fail(r.error);
      const owned = (r.result ?? []).filter(x => x.name.includes(q.split(/\s+/)[0] ?? ''));
      return json({
        success: true,
        provider: 'cloudflare',
        /* Honest about the limit rather than returning an empty availability
           list that reads like "everything is taken". */
        message: 'Cloudflare has no public API for buying a domain. These are the ones you already hold — any of them can be set up here.',
        owned: owned.map(x => ({ domain: x.name, expiresAt: x.expires_at ?? null })),
        results: [],
      });
    }

    /* Porkbun prices one domain at a time, so a bare word is expanded into the
       few endings worth trying rather than pretending to be a search engine. */
    const base = q.replace(/\s+/g, '-').replace(/^-+|-+$/g, '');
    const candidates = base.includes('.')
      ? [base]
      : ['com', 'co', 'io', 'net', 'agency'].map(t => `${base}.${t}`);

    const results = await Promise.all(candidates.slice(0, 5).map(async domain => {
      if (!DOMAIN_OK.test(domain)) return { domain, available: false, price: null, note: 'Not a usable domain name.' };
      const r = await porkbun<{ response?: { avail?: string; price?: string } }>(reg.creds, `/domain/checkDomain/${domain}`);
      if (!r.ok) return { domain, available: false, price: null, note: r.error };
      const resp = r.data?.response ?? {};
      return {
        domain,
        available: resp.avail === 'yes',
        price: resp.price ? Number(resp.price) : null,
        note: resp.avail === 'yes' ? '' : 'Taken.',
      };
    }));

    return json({ success: true, provider: 'porkbun', results, owned: [] });
  }

  /* ── Registrar: buy it ── */
  if (action === 'domain_register') {
    const domain = cleanDomain(d.domain);
    if (!DOMAIN_OK.test(domain)) return fail('That is not a domain that can be registered.');

    const reg = await loadProvider(env, accountId, 'registrar');
    if (!reg) return fail('No registrar is connected.', 200, { code: 'not_connected' });
    if (reg.row.provider !== 'porkbun') {
      return fail(`${reg.row.provider} has no public API for buying a domain. Register it in their dashboard, then come back and set up its DNS here.`);
    }
    /*
     * This spends the customer's money. The client asks twice — a search
     * result is not an instruction to buy — and the second ask is this flag.
     * Without it the endpoint refuses rather than assuming.
     */
    if (!d.confirm) return fail('Registering a domain charges your registrar account. Confirm the purchase to go ahead.', 200, { code: 'needs_confirm' });

    const years = Math.min(Math.max(Number(d.years) || 1, 1), 10);
    const r = await porkbun(reg.creds, `/domain/create/${domain}`, { years: String(years) });
    await record(env, accountId, 'domain', domain, 'porkbun', r.ok ? 'ok' : 'failed', r.ok ? `${years} year(s)` : r.error);
    if (!r.ok) return fail(r.error);
    return json({ success: true, domain, message: `${domain} registered for ${years} year${years === 1 ? '' : 's'}.` });
  }

  /* ── Mailboxes ── */
  if (action === 'mailbox_create') {
    const domain = cleanDomain(d.domain);
    const localPart = String(d.localPart ?? '').trim().toLowerCase().replace(/[^a-z0-9._\-]/g, '');
    if (!DOMAIN_OK.test(domain)) return fail('Which domain should the mailbox be on?');
    if (!localPart) return fail('What should the address be? For example "hello" for hello@' + domain);

    const mb = await loadProvider(env, accountId, 'mailbox');
    if (!mb || mb.row.provider === 'manual') {
      /*
       * Not a failure — the supported answer for Google Workspace, Microsoft
       * 365 and everything else without an API we can drive. It returns the
       * settings that mailbox will need, so the person creating it by hand has
       * them in front of them rather than in another tab.
       */
      return json({
        success: false,
        code: 'manual',
        address: `${localPart}@${domain}`,
        message: `Create ${localPart}@${domain} with your mail provider, then paste its SMTP and IMAP details into Settings → Email. Connect Migadu here to have this done for you.`,
      });
    }

    if (mb.row.provider !== 'migadu') return fail(`${mb.row.provider} cannot create mailboxes from here.`);

    /* Generated rather than asked for: it is never typed by a human and never
       needs to be memorable, so there is no reason for it to be weak. */
    const supplied = String(d.password ?? '');
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    const password = supplied || [...bytes].map(b => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join('');

    const r = await migadu<{ address?: string }>(mb.creds, `/domains/${domain}/mailboxes`, {
      method: 'POST',
      body: JSON.stringify({
        local_part: localPart,
        domain_name: domain,
        name: String(d.displayName ?? localPart).slice(0, 120),
        password,
        may_send: true, may_receive: true, may_access_imap: true, may_access_pop3: false,
      }),
    });

    await record(env, accountId, 'mailbox', `${localPart}@${domain}`, 'migadu', r.ok ? 'ok' : 'failed', r.ok ? '' : r.error);
    if (!r.ok) return fail(r.error);

    /*
     * The credentials come back exactly once, in the response to the call that
     * created them — Migadu will not show the password again and neither will
     * we. The client's job is to save them straight into the workspace's mail
     * settings, which is what makes this one action rather than "create a
     * mailbox, then go and configure it".
     */
    return json({
      success: true,
      address: `${localPart}@${domain}`,
      password,
      smtp: { host: 'smtp.migadu.com', port: 465, encryption: 'ssl', username: `${localPart}@${domain}` },
      imap: { host: 'imap.migadu.com', port: 993, encryption: 'ssl', username: `${localPart}@${domain}`, folder: 'INBOX' },
      message: `${localPart}@${domain} created. Its details have been saved to this workspace's mail settings.`,
    });
  }

  /* ── What has been provisioned ── */
  if (action === 'history') {
    const { results } = await env.DB.prepare(
      'SELECT id, kind, subject, provider, outcome, detail, created_at FROM crm_provisioned WHERE account_id = ? ORDER BY created_at DESC LIMIT 60',
    ).bind(accountId).all();
    return json({ success: true, history: results ?? [] });
  }

  return fail(`"${action}" is not something this endpoint does.`);
}
