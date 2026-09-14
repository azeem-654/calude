/**
 * Cloudflare for SaaS — holding a certificate for somebody else's hostname.
 *
 * ── Why this is separate, and gated ──
 *
 * Serving `app.theiragency.com` over HTTPS means having a certificate for it.
 * There is no way around that and no way to fake it: a browser will refuse the
 * connection, not degrade. Cloudflare for SaaS issues those certificates, one
 * per custom hostname, through the API below.
 *
 * It is a paid product and it needs a zone of the operator's own. So every
 * function here reports "not configured" rather than throwing, and the screens
 * above say the custom-domain tier is unavailable instead of accepting a
 * hostname that will never resolve. A reseller who has been told their white
 * label is live and finds out from their own client that it is not is worse off
 * than one who was told to wait.
 *
 * ── What is deliberately not here ──
 *
 * The fallback origin, the wildcard route and the zone itself are set up once,
 * by hand, in the operator's Cloudflare account. They are account
 * configuration rather than per-customer work, doing them from here would need
 * far broader API permissions than issuing a certificate, and getting them
 * wrong takes the whole deployment down rather than one hostname.
 */
import { decryptSecret, encryptSecret } from './crypto';
import { installSecret, nowIso, type Env } from './db';

const API = 'https://api.cloudflare.com/client/v4';
const KIND = 'cloudflare_saas';
const SECRET_KEY = 'mailbox_key';

export interface SaasCreds {
  /** The zone custom hostnames are attached to. */
  zoneId: string;
  /** A token with Zone → SSL and Certificates → Edit on that zone. */
  apiToken: string;
  /**
   * What a customer CNAMEs to. Cloudflare's own docs call this the CNAME
   * target; it is normally the fallback origin's hostname.
   */
  cnameTarget: string;
}

export interface HostnameState {
  ok: boolean;
  /** Cloudflare's id for the custom hostname. */
  id: string;
  /** pending | active | failed — ours, not theirs. */
  status: 'pending' | 'active' | 'failed';
  /** What the customer still has to do, in Cloudflare's words. Owner-facing. */
  detail: string;
  /** The ownership-verification TXT record, when one is required. */
  txtName: string;
  txtValue: string;
  error: string;
}

/** The operator's Cloudflare credentials, or null when none are set. */
export async function saasCreds(env: Env): Promise<SaasCreds | null> {
  const row = await env.DB.prepare('SELECT credentials FROM crm_install_providers WHERE kind = ?')
    .bind(KIND).first<{ credentials: string }>();
  if (!row?.credentials) return null;
  try {
    const key = await installSecret(env.DB, SECRET_KEY);
    const c = JSON.parse(await decryptSecret(key, row.credentials)) as SaasCreds;
    return c.zoneId && c.apiToken ? c : null;
  } catch {
    return null;
  }
}

export async function saveSaasCreds(
  env: Env, patch: Partial<SaasCreds>,
): Promise<{ ok: boolean; error: string }> {
  const existing = await saasCreds(env);
  const merged: SaasCreds = {
    zoneId: (patch.zoneId ?? '').trim() || existing?.zoneId || '',
    /* Blank keeps the stored one, as everywhere else. */
    apiToken: (patch.apiToken ?? '').trim() || existing?.apiToken || '',
    cnameTarget: (patch.cnameTarget ?? '').trim() || existing?.cnameTarget || '',
  };
  if (!merged.zoneId || !merged.apiToken) {
    return { ok: false, error: 'Both the zone id and an API token are needed.' };
  }
  const key = await installSecret(env.DB, SECRET_KEY);
  const blob = await encryptSecret(key, JSON.stringify(merged));
  await env.DB.prepare(
    `INSERT INTO crm_install_providers (kind, provider, credentials, status, last_error, updated_at)
     VALUES (?, 'cloudflare', ?, 'unknown', '', ?)
     ON CONFLICT(kind) DO UPDATE SET
       credentials = excluded.credentials, status = 'unknown', last_error = '',
       updated_at = excluded.updated_at`,
  ).bind(KIND, blob, nowIso()).run();
  return { ok: true, error: '' };
}

interface CfEnvelope<T> {
  success?: boolean;
  result?: T;
  errors?: Array<{ message?: string }>;
}

async function call<T>(
  creds: SaasCreds, method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown,
): Promise<{ ok: boolean; data: T | null; error: string }> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${creds.apiToken}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (e) {
    return { ok: false, data: null, error: `Could not reach Cloudflare: ${e instanceof Error ? e.message : String(e)}` };
  }
  const env2 = await res.json<CfEnvelope<T>>().catch(() => ({}) as CfEnvelope<T>);
  if (!res.ok || env2.success === false) {
    const msg = (env2.errors ?? []).map(e => e.message).filter(Boolean).join('; ');
    return { ok: false, data: env2.result ?? null, error: msg || `Cloudflare returned HTTP ${res.status}.` };
  }
  return { ok: true, data: env2.result ?? null, error: '' };
}

/** Cloudflare's shape for a custom hostname, as much of it as we read. */
interface CfHostname {
  id?: string;
  hostname?: string;
  status?: string;
  ssl?: {
    status?: string;
    validation_errors?: Array<{ message?: string }>;
    txt_name?: string;
    txt_value?: string;
  };
  ownership_verification?: { name?: string; value?: string; type?: string };
  verification_errors?: string[];
}

function readState(h: CfHostname | null, fallbackId = ''): HostnameState {
  const sslStatus = h?.ssl?.status ?? '';
  const hostStatus = h?.status ?? '';
  /*
   * Active means *both* halves are done.
   *
   * Cloudflare reports the hostname and its certificate separately, and the
   * hostname flips to active before the certificate does. Reporting on the
   * hostname alone would show a green tick on an address that still refuses
   * every browser that visits it.
   */
  const active = hostStatus === 'active' && sslStatus === 'active';
  const failed = /failed|timed_out|deleted/i.test(hostStatus) || /failed|timed_out/i.test(sslStatus);

  const errs = [
    ...(h?.ssl?.validation_errors ?? []).map(e => e.message).filter(Boolean),
    ...(h?.verification_errors ?? []),
  ].filter(Boolean) as string[];

  return {
    ok: true,
    id: h?.id ?? fallbackId,
    status: active ? 'active' : failed ? 'failed' : 'pending',
    detail: active
      ? 'Live — the certificate is issued and the address is serving.'
      : errs.length
        ? errs.join('; ')
        : `Waiting for DNS and the certificate (hostname: ${hostStatus || 'unknown'}, certificate: ${sslStatus || 'unknown'}).`,
    txtName: h?.ownership_verification?.name ?? h?.ssl?.txt_name ?? '',
    txtValue: h?.ownership_verification?.value ?? h?.ssl?.txt_value ?? '',
    error: '',
  };
}

const notConfigured: HostnameState = {
  ok: false, id: '', status: 'pending', detail: '',
  txtName: '', txtValue: '',
  error: 'Custom domains are not switched on for this installation.',
};

/**
 * Ask Cloudflare to start holding a certificate for this hostname.
 *
 * Idempotent as far as it can be: a hostname Cloudflare already knows about is
 * read back rather than created a second time, because creating twice is how a
 * zone ends up with two entries for one name and neither of them the one being
 * polled.
 */
export async function createCustomHostname(env: Env, hostname: string): Promise<HostnameState> {
  const creds = await saasCreds(env);
  if (!creds) return notConfigured;

  const existing = await call<CfHostname[]>(
    creds, 'GET', `/zones/${creds.zoneId}/custom_hostnames?hostname=${encodeURIComponent(hostname)}`,
  );
  if (existing.ok && Array.isArray(existing.data) && existing.data.length > 0) {
    return readState(existing.data[0]);
  }

  const made = await call<CfHostname>(creds, 'POST', `/zones/${creds.zoneId}/custom_hostnames`, {
    hostname,
    /* HTTP validation needs the hostname already pointing here, which it does
       not on the first call. TXT is checked from DNS and therefore works before
       any traffic reaches us — it is the only method that can go first. */
    ssl: { method: 'txt', type: 'dv', settings: { min_tls_version: '1.2' } },
  });
  if (!made.ok) {
    return { ...notConfigured, ok: false, status: 'failed', error: made.error };
  }
  return readState(made.data);
}

/** Where has it got to? Read-only; changes nothing at Cloudflare. */
export async function checkCustomHostname(env: Env, id: string): Promise<HostnameState> {
  const creds = await saasCreds(env);
  if (!creds) return notConfigured;
  if (!id) return { ...notConfigured, error: 'That hostname was never registered with the certificate provider.' };

  const r = await call<CfHostname>(creds, 'GET', `/zones/${creds.zoneId}/custom_hostnames/${encodeURIComponent(id)}`);
  if (!r.ok) return { ...notConfigured, ok: false, status: 'failed', error: r.error };
  return readState(r.data, id);
}

/** Stop holding a certificate for it. Absent is success — the end state is the same. */
export async function deleteCustomHostname(env: Env, id: string): Promise<{ ok: boolean; error: string }> {
  const creds = await saasCreds(env);
  if (!creds || !id) return { ok: true, error: '' };
  const r = await call<unknown>(creds, 'DELETE', `/zones/${creds.zoneId}/custom_hostnames/${encodeURIComponent(id)}`);
  if (!r.ok && !/not found|does not exist/i.test(r.error)) return { ok: false, error: r.error };
  return { ok: true, error: '' };
}

/** What a customer CNAMEs to, for the instructions screen. */
export async function cnameTarget(env: Env): Promise<string> {
  const creds = await saasCreds(env);
  return creds?.cnameTarget ?? '';
}
