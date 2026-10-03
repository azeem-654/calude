/**
 * /api/platform.php — what the install owner provides to every customer, and
 * whether each piece of it works right now.
 *
 * ── Why one screen ──
 *
 * The owner's keys grew up one feature at a time and each landed beside the
 * feature that needed it: the AI key in AI Engine, the Google Maps key in
 * Integrations, the Google client in Security, payments in Billing, the
 * registrar in Domains & Email. Each was right where it was and none of them
 * answered "is everything my customers rely on actually connected?". This
 * does, in one read, and points at the one panel that sets each — it sets
 * nothing itself, so there is still exactly one implementation of each.
 *
 * ── What it never says ──
 *
 * A secret. Not a value, not a masked tail, not a length. "Set", "checked
 * when", "what Google or the processor last said" — the same rule as every
 * other endpoint (CLAUDE.md → Secrets). For the ones that live as Cloudflare
 * secrets it says only whether the Worker can see one.
 *
 * Owner only, on the server. A customer forcing the tab open gets a 403.
 */
import { geoState } from './geoapify';
import { verifierState } from './emailVerifier';
import { registerState } from './companiesHouse';
import { body, fail, json } from '../lib/http';
import { userFromToken, type Env, type SessionUser } from '../lib/db';
import { googleCreds } from '../lib/googleAuth';
import { installPlacesKey, placesUsage } from '../lib/googlePlaces';
import { PROVIDERS as VOICE_PROVIDERS } from '../lib/voice';
import { systemMailStatus } from './systemMail';

interface Req { token?: string; action?: string }

const isOwner = (u: SessionUser) => u.role === 'agency' && !u.accountId;

/** ok: working and proved · unchecked: set, not yet proved · error: last check refused · off: not set. */
type State = 'ok' | 'unchecked' | 'error' | 'off';

export interface Service {
  id: string;
  name: string;
  /** What a customer loses when it is not working — the reason to care. */
  powers: string;
  state: State;
  /** One sentence about the current state, in words the owner acts on. */
  detail: string;
  /** When it was last proved working, when that is known. */
  checkedAt: string | null;
  lastError: string;
  /** Where it is set: a Settings tab, a screen, or the checklist when only the owner's hands can do it. */
  where: { label: string; tab?: string; path?: string };
  /** Only the Google Maps key has these. */
  usage?: Awaited<ReturnType<typeof placesUsage>>;
  ownKeys?: number;
  /** Nice to have, not something customers are missing today: not counted as needing attention. */
  optional?: boolean;
}

interface ProviderRow { kind: string; provider: string; status: string; lastError: string; updatedAt: string; connected: number }

const stateOf = (r: ProviderRow | undefined): State =>
  !r?.connected ? 'off' : r.status === 'ok' ? 'ok' : (r.status === 'error' || r.status === 'failed') ? 'error' : 'unchecked';

export async function platformStatus(env: Env): Promise<{ services: Service[] }> {
  const { results } = await env.DB.prepare(
    "SELECT kind, provider, status, last_error AS lastError, updated_at AS updatedAt, (credentials != '') AS connected FROM crm_install_providers",
  ).all<ProviderRow>();
  const rows = new Map((results ?? []).map(r => [r.kind, r]));
  const row = (k: string) => rows.get(k);
  const services: Service[] = [];

  /* ── AI (Gemini) — the same order loadAiKey reads it in ── */
  {
    const explicit = row('ai');
    const owned = await env.DB.prepare(
      `SELECT c.verified_at AS verifiedAt, c.last_error AS lastError
       FROM crm_ai_config c
       JOIN crm_workspaces w ON w.account_id = c.account_id
       JOIN crm_users u ON u.email = w.owner_email
       WHERE u.account_id IS NULL AND u.role = 'agency' AND c.api_key != ''
       ORDER BY (c.last_error = '') DESC, (c.verified_at IS NOT NULL) DESC
       LIMIT 1`,
    ).first<{ verifiedAt: string | null; lastError: string }>().catch(() => null);
    const env_ = !!(env.AI_API_KEY ?? '').trim();
    let s: Pick<Service, 'state' | 'detail' | 'checkedAt' | 'lastError'>;
    if (explicit?.connected) {
      s = { state: stateOf(explicit), detail: 'An installation AI key is stored and used first.', checkedAt: explicit.status === 'ok' ? explicit.updatedAt : null, lastError: explicit.lastError };
    } else if (owned) {
      s = owned.lastError
        ? { state: 'error', detail: 'The main AI key is the one everybody uses, and Google last refused it.', checkedAt: null, lastError: owned.lastError }
        : owned.verifiedAt
          ? { state: 'ok', detail: 'The main AI key is the one every customer\'s writing uses.', checkedAt: owned.verifiedAt, lastError: '' }
          : { state: 'unchecked', detail: 'The main AI key is stored but has not been checked with Google — press "Check now" on it below.', checkedAt: null, lastError: '' };
    } else if (env_) {
      s = { state: 'unchecked', detail: 'Only the AI_API_KEY Cloudflare secret is set. It works, but it cannot be checked from here.', checkedAt: null, lastError: '' };
    } else {
      s = { state: 'off', detail: 'No AI key at all: customers without their own cannot have anything written, and the wizard matches words instead of reading them.', checkedAt: null, lastError: '' };
    }
    /* Backup keys take over when the main one fails (lib/aiPool.ts); with
       none, the install has no AI only if there are no backups either. */
    const backups = (await env.DB.prepare('SELECT COUNT(*) AS n FROM crm_ai_keys').first<{ n: number }>().catch(() => null))?.n ?? 0;
    if (backups) {
      s = s.state === 'off'
        ? { state: 'unchecked', detail: `No main key, but ${backups} backup key${backups === 1 ? '' : 's'} below carr${backups === 1 ? 'ies' : 'y'} every AI call.`, checkedAt: null, lastError: '' }
        : { ...s, detail: `${s.detail} ${backups} backup key${backups === 1 ? '' : 's'} take${backups === 1 ? 's' : ''} over if it fails.` };
    }
    services.push({
      id: 'ai', name: 'AI (Google Gemini)',
      powers: 'Autopilot writing, replies, the New Project wizard, the microphone, review reply drafts',
      ...s,
      where: { label: 'Below, on this tab — Main AI key' },
    });
  }

  /* ── Google Maps (Places API (New)) ── */
  {
    const inst = await installPlacesKey(env);
    const own = await env.DB.prepare("SELECT COUNT(*) AS n FROM crm_review_sources WHERE places_key != ''").first<{ n: number }>().catch(() => null);
    const state: State = !inst ? 'off' : inst.status === 'ok' ? 'ok' : inst.status === 'error' ? 'error' : 'unchecked';
    services.push({
      id: 'google_places', name: 'Google Maps (Places API)',
      powers: 'Prospect search (Contacts → Find businesses, and the AI Sales Agent) and Google reviews',
      state,
      detail: state === 'off'
        ? 'Not set. Prospect search tells customers the Google Maps key is missing, and reviews cannot be read for anybody without their own key.'
        : state === 'ok' ? 'Google accepted it. Every customer without their own key uses it, within their budget.'
          : state === 'error' ? 'Google refused it the last time it was used — see the reason below.'
            : 'Saved, not yet proved. Press "Test connection" below.',
      checkedAt: inst && inst.status !== 'unknown' ? inst.updatedAt : null,
      lastError: inst?.lastError ?? '',
      where: { label: 'Below, on this tab' },
      usage: await placesUsage(env),
      ownKeys: own?.n ?? 0,
    });
  }

  /* ── Geoapify — the free directory for prospect search ── */
  {
    const g = await geoState(env);
    const state: State = !g.set ? 'off' : g.status === 'ok' ? 'ok' : g.status === 'error' ? 'error' : 'unchecked';
    services.push({
      id: 'geoapify', name: 'Geoapify (free business directory)',
      powers: 'Prospect search at no cost: Contacts → Find businesses and the AI Sales Agent search here first',
      state,
      detail: state === 'off'
        ? 'Not set. The free directory still works on OpenStreetMap\'s own servers, which are slower and ask commercial apps not to rely on them.'
        : state === 'ok' ? `Working. ${g.creditsToday} of today's ${g.cap} free credits used (20 businesses a credit; searches are kept a fortnight and not paid for twice).`
          : state === 'error' ? 'Geoapify refused it the last time it was used — see the reason below. Searches fall back to OpenStreetMap meanwhile.'
            : 'Saved, not yet proved. Press "Test connection" below.',
      checkedAt: g.set && g.status !== 'unknown' ? g.updatedAt : null,
      lastError: g.lastError,
      where: { label: 'Below, on this tab' },
      optional: true,
    });
  }

  /* ── Companies House — "Verified business directories" in AI Prospecting ── */
  {
    const g = await registerState(env);
    const state: State = !g.set ? 'off' : g.status === 'ok' ? 'ok' : g.status === 'error' ? 'error' : 'unchecked';
    services.push({
      id: 'companies_house', name: 'Company register (Companies House)',
      powers: 'AI Prospecting → Verified business directories: active UK companies by trade and town, with their directors',
      state,
      detail: state === 'off'
        ? 'Not set. The Verified business directories tab tells customers it is not switched on; business directories and Google Maps are unaffected.'
        : state === 'ok' ? 'Working. Searches and director lists are kept a fortnight, so a repeated search costs nothing.'
          : state === 'error' ? 'Companies House refused it the last time it was used — see the reason below.'
            : 'Saved, not yet proved. Press "Test connection" below.',
      checkedAt: g.set && g.status !== 'unknown' ? g.updatedAt : null,
      lastError: g.lastError,
      where: { label: 'Below, on this tab' },
      optional: true,
    });
  }

  /* ── Email finder & verifier — mailbox checks in AI Prospecting ── */
  {
    const v = await verifierState(env);
    const name = v.providers.find(p => p.id === v.provider)?.name ?? v.provider;
    const state: State = !v.set ? 'off' : v.status === 'ok' ? 'ok' : v.status === 'error' ? 'error' : 'unchecked';
    services.push({
      id: 'email_verifier', name: v.set ? `Email finder & verifier (${name})` : 'Email finder & verifier',
      powers: 'AI Prospecting: checking a mailbox exists before anybody sends to it, and (Hunter) finding addresses published on the web',
      state,
      detail: state === 'off'
        ? 'Not set. AI Prospecting still runs the free checks (format, domain, mail server, throwaway inboxes) and says the mailbox itself was not checked.'
        : state === 'ok' ? `Working. This month: ${v.month.verify} mailbox check${v.month.verify === 1 ? '' : 's'}${v.finds ? ` and ${v.month.find} web search${v.month.find === 1 ? '' : 'es'}` : ''} across every workspace.`
          : state === 'error' ? `${name} refused it the last time it was used — see the reason below. Customers fall back to the free checks meanwhile.`
            : 'Saved, not yet proved. Press "Test connection" below.',
      checkedAt: v.set && v.status !== 'unknown' ? v.updatedAt : null,
      lastError: v.lastError,
      where: { label: 'Below, on this tab' },
      optional: true,
    });
  }

  /* ── Google sign-in (OAuth client) ── */
  {
    const r = row('google_oauth');
    const set = !!(await googleCreds(env));
    services.push({
      id: 'google_oauth', name: 'Google sign-in (OAuth client)',
      powers: 'Continue with Google, Google Calendar and Meet links, Business Profile replies',
      state: set ? (r?.status === 'ok' ? 'ok' : r?.status === 'error' ? 'error' : 'unchecked') : 'off',
      detail: set ? 'The client ID and secret are stored. A real sign-in is the test.' : 'Not set: the Google buttons are hidden and Calendar cannot be connected.',
      checkedAt: r?.status === 'ok' ? r.updatedAt : null,
      lastError: r?.lastError ?? '',
      where: { label: 'Below, on this tab (also under Security & Privacy)' },
    });
  }

  /* ── The operator's payments ── */
  {
    const r = row('payments');
    const legacy = !r?.connected && !!(env.STRIPE_SECRET_KEY ?? '').trim();
    services.push({
      id: 'payments', name: 'Payments for this app',
      powers: 'Customers paying you for their plan (Plan & billing), and therefore trials converting',
      state: r?.connected ? stateOf(r) : legacy ? 'unchecked' : 'off',
      detail: r?.connected
        ? `${r.provider === 'creem' ? 'Creem' : r.provider === 'stripe' ? 'Stripe' : r.provider} is connected.`
        : legacy ? 'Only the old STRIPE_SECRET_KEY Cloudflare secret is set. Connect the processor in Billing so it can be checked.'
          : 'No processor: nobody can pay when their trial ends.',
      checkedAt: r?.status === 'ok' ? r.updatedAt : null,
      lastError: r?.lastError ?? '',
      where: { label: 'Settings → Billing', tab: 'billing' },
    });
  }

  /* ── System email ── */
  {
    const m = await systemMailStatus(env).catch(() => null);
    services.push({
      id: 'system_mail', name: 'System email',
      powers: 'Sign-in and sign-up codes, trial emails on days 1, 3 and 5, your digest, messages from Sign-ups & trials',
      state: m?.inUse ? 'ok' : m?.candidates.length ? 'error' : 'off',
      detail: m?.inUse ? `Sending from ${m.inUse.fromEmail}. ${m.why}` : (m?.why ?? 'Could not be read.'),
      checkedAt: null,
      lastError: '',
      where: { label: 'Settings → Email & SMS → System email', tab: 'email-sms' },
    });
  }

  /* ── Domains and mailboxes bought for customers ── */
  {
    const r = row('digital_setup');
    services.push({
      id: 'digital_setup', name: 'Domain registrar (Openprovider)',
      powers: 'Digital Business Setup: buying a domain and mailboxes for a customer at checkout',
      state: stateOf(r),
      detail: r?.connected ? `Connected (${r.provider}). The balance is yours to keep funded.` : 'Not connected: domain checkout refuses orders.',
      checkedAt: r?.status === 'ok' ? r.updatedAt : null,
      lastError: r?.lastError ?? '',
      where: { label: 'Settings → Domains & Email → Owner only', tab: 'digital-setup' },
    });
    const managed = ['registrar', 'dns', 'mailbox'].map(k => row(k)).filter((x): x is ProviderRow => !!x?.connected);
    services.push({
      id: 'managed', name: 'Managed buying for Autopilot (Porkbun, Migadu)', optional: true,
      powers: 'Autopilot buying sending domains and mailboxes for a customer and adding them to their bill',
      state: managed.length === 0 ? 'off' : managed.some(m => stateOf(m) === 'error') ? 'error' : managed.every(m => stateOf(m) === 'ok') ? 'ok' : 'unchecked',
      detail: managed.length
        ? `Connected: ${managed.map(m => `${m.kind} (${m.provider})`).join(', ')}.`
        : 'Not connected: customers buy domains on their own registrar account, which the app says.',
      checkedAt: null,
      lastError: managed.map(m => m.lastError).filter(Boolean).join(' · '),
      where: { label: 'docs/OWNER-CHECKLIST.md, section 9' },
    });
    const saas = row('cloudflare_saas');
    services.push({
      id: 'cloudflare_saas', name: 'White-label addresses (Cloudflare for SaaS)', optional: true,
      powers: 'Resellers using their own web address for the app',
      state: stateOf(saas),
      detail: saas?.connected ? 'Connected.' : 'Not connected: resellers can use the free address only.',
      checkedAt: saas?.status === 'ok' ? saas.updatedAt : null,
      lastError: saas?.lastError ?? '',
      where: { label: 'Settings → Branding → Your own address', tab: 'branding' },
    });
  }

  /* ── Set as Cloudflare secrets: presence only ── */
  {
    const turn = !!(env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN);
    services.push({
      id: 'turn', name: 'Screen-sharing relay (Cloudflare TURN)', optional: true,
      powers: 'Live help through strict office firewalls',
      state: turn ? 'unchecked' : 'off',
      detail: turn ? 'TURN_KEY_ID and TURN_KEY_API_TOKEN are set on this Worker.' : 'Optional. Without it a few customers behind strict firewalls cannot share their screen; Google Meet is the fallback.',
      checkedAt: null, lastError: '',
      where: { label: 'Cloudflare → Workers & Pages → Settings → Variables and Secrets (OWNER-CHECKLIST section 25)' },
    });
    const voices = Object.keys(VOICE_PROVIDERS).length;
    services.push({
      id: 'voice', name: 'AI voice', optional: true,
      powers: 'Voice agents answering calls',
      state: voices ? 'unchecked' : 'off',
      detail: voices ? `${voices} provider${voices === 1 ? '' : 's'} built in.` : 'No voice provider is built into this app yet; voice agents say so. Nothing to set.',
      checkedAt: null, lastError: '',
      where: { label: 'docs/OWNER-CHECKLIST.md, section 18' },
    });
    const wrap = !!(env.CREDENTIAL_WRAP_KEY ?? '').trim();
    services.push({
      id: 'wrap', name: 'Credential wrap key',
      powers: 'Keeping every stored key above unreadable in a database export',
      state: wrap ? 'ok' : 'off',
      detail: wrap ? 'CREDENTIAL_WRAP_KEY is set on this Worker.' : 'Not set: a database export contains both the stored keys and the key that decrypts them.',
      checkedAt: null, lastError: '',
      where: { label: 'Cloudflare → Workers & Pages → Settings → Variables and Secrets (OWNER-CHECKLIST section 23)' },
    });
  }

  return { services };
}

export async function handlePlatform(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this needs a current session.', 401, { code: 'unauthorised' });
  if (!isOwner(user)) return fail('Only the owner of this installation can see the services it provides.', 403, { code: 'not_owner' });
  const act = String(d.action ?? 'status');
  if (act === 'status') return json({ success: true, ...(await platformStatus(env)) });
  return fail(`"${act}" is not something this endpoint does.`);
}
