/**
 * Finding a domain's mail servers, from the Worker — the network half of
 * lib/mailParse.ts.
 *
 * In the order a mail app would ask, and stopping at the first answer:
 *
 *   1. the known providers table (no network — gmail.com, yahoo.co.uk…);
 *   2. Mozilla's ISPDB, which Thunderbird uses (autoconfig.thunderbird.net);
 *   3. the domain's own autoconfig host (autoconfig.<domain>), which cPanel,
 *      Plesk and many hosts publish;
 *   4. the domain's MX records over DNS-over-HTTPS — a custom domain whose MX
 *      is Google, Microsoft, GoDaddy, Zoho… is that provider — and then the
 *      ISPDB again for the MX's own domain.
 *
 * Every step reports what happened to it: found, nothing there, or could not
 * run (and why). A lookup that could not run is never folded into "found
 * nothing" — the customer would then type in a guess, or give up on a domain
 * whose settings were one retry away.
 */
import type { Env } from './db';
import { knownAsFound, parseAutoconfig, providerForDomain, providerForMx, type FoundSettings } from './mailParse';

export interface LookupStep {
  source: string;
  outcome: 'found' | 'none' | 'failed';
  detail: string;
}

export interface DomainLookup {
  domain: string;
  found: FoundSettings | null;
  steps: LookupStep[];
}

const DOMAIN_OK = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const lookupDomainOk = (d: string): boolean => DOMAIN_OK.test(d);

const ispdbBase = (env: Env) => (env.AUTOCONFIG_BASE ?? '').trim().replace(/\/$/, '') || 'https://autoconfig.thunderbird.net/v1.1';
const dohBase = (env: Env) => (env.DOH_BASE ?? '').trim() || 'https://cloudflare-dns.com/dns-query';

type Fetched = { ok: true; status: number; text: string } | { ok: false; error: string };

async function get(url: string, accept: string): Promise<Fetched> {
  try {
    const r = await fetch(url, { headers: { accept }, redirect: 'follow', signal: AbortSignal.timeout(7000) });
    const text = r.ok ? (await r.text()).slice(0, 100_000) : '';
    return { ok: true, status: r.status, text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: /timeout|abort/i.test(msg) ? 'it did not answer in time' : msg.slice(0, 160) };
  }
}

async function fromAutoconfig(url: string, source: string, email: string, steps: LookupStep[]): Promise<FoundSettings | null> {
  const r = await get(url, 'application/xml, text/xml');
  if (!r.ok) { steps.push({ source, outcome: 'failed', detail: `could not be reached: ${r.error}` }); return null; }
  if (r.status === 404 || r.status === 410) { steps.push({ source, outcome: 'none', detail: 'has no entry for this domain' }); return null; }
  if (r.status !== 200) { steps.push({ source, outcome: 'failed', detail: `answered ${r.status}` }); return null; }
  const f = parseAutoconfig(r.text, email);
  if (!f) { steps.push({ source, outcome: 'none', detail: 'answered, but with no IMAP or SMTP settings' }); return null; }
  steps.push({ source, outcome: 'found', detail: [f.smtp && `${f.smtp.host}:${f.smtp.port}`, f.imap && `${f.imap.host}:${f.imap.port}`].filter(Boolean).join(', ') });
  return { ...f, source, provider: f.provider || '' };
}

interface DohAnswer { Status?: number; Answer?: { type: number; data?: string }[] }

/** MX hosts by preference, or why they could not be read. */
async function mxHosts(env: Env, domain: string): Promise<{ hosts: string[] } | { error: string } | { none: string }> {
  const r = await get(`${dohBase(env)}?name=${encodeURIComponent(domain)}&type=MX`, 'application/dns-json');
  if (!r.ok) return { error: `the DNS lookup could not run: ${r.error}` };
  if (r.status !== 200) return { error: `the DNS lookup answered ${r.status}` };
  let d: DohAnswer;
  try { d = JSON.parse(r.text) as DohAnswer; } catch { return { error: 'the DNS lookup answered with something unreadable' }; }
  if (d.Status === 3) return { none: 'this domain does not exist in DNS' };
  if (d.Status !== 0) return { error: `the DNS lookup failed (status ${d.Status})` };
  const recs = (d.Answer ?? []).filter(a => a.type === 15).map(a => String(a.data ?? '').trim().split(/\s+/))
    .filter(p => p.length === 2).sort((a, b) => Number(a[0]) - Number(b[0])).map(p => p[1].toLowerCase().replace(/\.$/, ''));
  return recs.length ? { hosts: recs } : { none: 'this domain has no MX records' };
}

/** The registrable part of a host, near enough for the ISPDB (mx1.mail.example.co.uk → example.co.uk). */
function baseDomain(host: string): string {
  const parts = host.split('.');
  const two = parts.slice(-2).join('.');
  return /^(co|com|org|net|gov|ac|edu)\.[a-z]{2}$/.test(two) ? parts.slice(-3).join('.') : two;
}

/**
 * One domain's settings. `email` is any address on it — some autoconfig hosts
 * answer per address, and the ISPDB's `%EMAILLOCALPART%` needs one.
 */
export async function lookupDomain(env: Env, domain: string, email: string): Promise<DomainLookup> {
  const steps: LookupStep[] = [];
  const d = domain.toLowerCase().trim();
  if (!lookupDomainOk(d)) return { domain: d, found: null, steps: [{ source: 'Lookup', outcome: 'failed', detail: `"${d}" is not a domain name` }] };

  const known = providerForDomain(d);
  if (known) {
    steps.push({ source: 'Known providers', outcome: 'found', detail: known.name });
    return { domain: d, found: knownAsFound(known, 'known settings'), steps };
  }
  steps.push({ source: 'Known providers', outcome: 'none', detail: 'not a public mail provider\'s domain' });

  const ispdb = await fromAutoconfig(`${ispdbBase(env)}/${encodeURIComponent(d)}`, 'Mozilla ISPDB', email, steps);
  if (ispdb) return { domain: d, found: ispdb, steps };

  const own = await fromAutoconfig(
    `https://autoconfig.${d}/mail/config-v1.1.xml?emailaddress=${encodeURIComponent(email)}`, `autoconfig.${d}`, email, steps,
  );
  if (own) return { domain: d, found: own, steps };

  const mx = await mxHosts(env, d);
  if ('error' in mx) { steps.push({ source: 'MX records', outcome: 'failed', detail: mx.error }); return { domain: d, found: null, steps }; }
  if ('none' in mx) { steps.push({ source: 'MX records', outcome: 'none', detail: mx.none }); return { domain: d, found: null, steps }; }
  const byMx = providerForMx(mx.hosts);
  if (byMx) {
    steps.push({ source: 'MX records', outcome: 'found', detail: `${mx.hosts[0]} → ${byMx.name}` });
    return { domain: d, found: knownAsFound(byMx, `from ${d}'s MX records`), steps };
  }
  steps.push({ source: 'MX records', outcome: 'none', detail: `${mx.hosts[0]} is not a provider we know` });

  /* Thunderbird's last resort, and a good one: the ISPDB entry for whoever runs the MX. */
  const mxBase = baseDomain(mx.hosts[0]);
  if (mxBase && mxBase !== d && lookupDomainOk(mxBase)) {
    const viaMx = await fromAutoconfig(`${ispdbBase(env)}/${encodeURIComponent(mxBase)}`, `Mozilla ISPDB (for ${mxBase}, which runs the MX)`, email, steps);
    if (viaMx) return { domain: d, found: viaMx, steps };
  }
  return { domain: d, found: null, steps };
}

/** A lookup summarised for the review table: where it came from, or why nothing did. */
export function lookupSummary(l: DomainLookup): string {
  if (l.found) return l.found.source;
  const failed = l.steps.filter(s => s.outcome === 'failed');
  if (failed.length) return `Not found — ${failed.map(s => `${s.source} ${s.detail}`).join('; ')}`;
  return 'Not found — no provider, ISPDB entry, autoconfig or recognised MX for this domain. Ask your provider for the IMAP and SMTP server names.';
}
