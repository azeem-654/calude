/**
 * Digital Business Setup, from the browser's side.
 *
 * Every type in this file is what the *customer* is allowed to know. There is
 * no field for what anything cost us and no field naming who registers the
 * domain, because the endpoint does not send either — this file could not
 * display them if somebody wanted it to.
 *
 * The owner's own types live at the bottom, behind actions the server refuses
 * for anyone else. Keeping them in one file is deliberate: two files would
 * invite a customer screen to import the wrong one.
 *
 * (Named `digitalSetup` rather than `setup` because `services/setup.ts` is the
 * first-run checklist and has nothing to do with buying anything.)
 */
import { API_BASE } from './apiBase';
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';

export interface DomainOffer {
  domain: string;
  available: boolean;
  /** Our price. Null never reaches here — unpriceable names are filtered out. */
  priceCents: number | null;
  currency: string;
  premium: boolean;
}

export interface QuoteLine {
  kind: string;
  label: string;
  period: 'year' | 'month' | 'once';
  quantity: number;
  unitCents: number;
  totalCents: number;
}

export interface Quote {
  lines: QuoteLine[];
  dueTodayCents: number;
  monthlyCents: number;
  currency: string;
}

export interface ProvisionStep {
  seq: number;
  step: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  label: string;
  /** Our wording. The provider's is not sent to this screen. */
  detail: string;
  finishedAt: string | null;
}

export interface SetupOrder {
  id: string;
  domain: string;
  status: string;
  projectId: string;
  totalCents: number;
  monthlyCents: number;
  currency: string;
  companyName: string;
  lines: QuoteLine[];
  createdAt: string;
  paidAt: string | null;
  finishedAt: string | null;
}

export interface DnsRecord {
  name: string;
  type: string;
  value: string;
  ttl: number;
  prio?: number;
}

export interface MailboxRow {
  id: string;
  label: string;
  address: string;
  isPrimary: number;
  outVerifiedAt: string | null;
  inVerifiedAt: string | null;
  createdAt: string;
}

export interface OwnedDomain {
  domain: string;
  status: string;
  expiresAt: string | null;
}

interface Reply {
  success: boolean;
  error?: string;
  code?: string;
  [k: string]: unknown;
}

async function call(action: string, extra: Record<string, unknown> = {}): Promise<Reply> {
  const accountId = getActiveAccountId();
  try {
    const r = await fetch(`${API_BASE}/api/setup.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken(), accountId, action, ...extra }),
    });
    return await r.json() as Reply;
  } catch (e) {
    return { success: false, error: `Could not reach the server: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Suggestions for a company name, already priced. */
export async function searchDomains(company: string, domain = ''): Promise<{ results: DomainOffer[]; error: string; code: string }> {
  const r = await call('search', { company, domain });
  return {
    results: (r.results as DomainOffer[]) ?? [],
    error: r.success ? '' : (r.error ?? 'Could not search for domains.'),
    code: String(r.code ?? ''),
  };
}

export async function quoteSetup(input: {
  domain: string; mailboxes: number; hosting: boolean; crm: boolean;
}): Promise<{ quote: Quote | null; error: string }> {
  const r = await call('quote', input);
  return { quote: r.success ? (r.quote as Quote) : null, error: r.success ? '' : (r.error ?? 'Could not price that.') };
}

export async function startCheckout(input: {
  domain: string;
  mailboxes: string[];
  hosting: boolean;
  crm: boolean;
  projectId: string;
  companyName: string;
  contactEmail: string;
  owner?: Record<string, string>;
}): Promise<{ orderId: string; url: string; error: string }> {
  const r = await call('checkout', input);
  return {
    orderId: String(r.orderId ?? ''),
    url: String(r.url ?? ''),
    error: r.success ? '' : (r.error ?? 'Could not start the checkout.'),
  };
}

export async function setupStatus(orderId: string): Promise<{
  order: SetupOrder | null; steps: ProvisionStep[]; plan: Array<{ seq: number; step: string; label: string }>; error: string;
}> {
  const r = await call('status', { orderId });
  return {
    order: r.success ? (r.order as SetupOrder) : null,
    steps: (r.steps as ProvisionStep[]) ?? [],
    plan: (r.plan as Array<{ seq: number; step: string; label: string }>) ?? [],
    error: r.success ? '' : (r.error ?? 'Could not read that order.'),
  };
}

export async function listOwnedDomains(): Promise<OwnedDomain[]> {
  const r = await call('domains');
  return (r.domains as OwnedDomain[]) ?? [];
}

export async function listDns(domain: string): Promise<{ records: DnsRecord[]; error: string }> {
  const r = await call('dns_list', { domain });
  return { records: (r.records as DnsRecord[]) ?? [], error: r.success ? '' : (r.error ?? 'Could not read those records.') };
}

export async function saveDns(domain: string, records: DnsRecord[]): Promise<{ records: DnsRecord[]; error: string }> {
  const r = await call('dns_save', { domain, records });
  return { records: (r.records as DnsRecord[]) ?? [], error: r.success ? '' : (r.error ?? 'Could not save those records.') };
}

export async function listMailboxes(): Promise<MailboxRow[]> {
  const r = await call('mailbox_list');
  return (r.mailboxes as MailboxRow[]) ?? [];
}

export async function createMailbox(domain: string, localPart: string, displayName: string): Promise<{ address: string; error: string }> {
  const r = await call('mailbox_create', { domain, localPart, displayName });
  return { address: String(r.address ?? ''), error: r.success ? '' : (r.error ?? 'Could not create that mailbox.') };
}

/* ── The owner's own ─────────────────────────────────────────────────────── */

/** One thing that has to be true, and what to do when it is not. */
export interface ProviderCheck {
  id: string;
  label: string;
  state: 'ok' | 'failed' | 'warning' | 'skipped';
  detail: string;
  fix: string;
  blocking: boolean;
}

export interface ProviderState {
  provider: string;
  connected: boolean;
  username: string;
  sandbox: boolean;
  mailHost: string;
  hasPassword: boolean;
  status: string;
  lastError: string;
  updatedAt: string;
  choices: Array<{ id: string; label: string }>;
  /** Only populated by a Test. Empty on a plain read. */
  checks: ProviderCheck[];
}

export interface PriceRow {
  kind: string;
  code: string;
  retailCents: number;
  currency: string;
  markupPct: number;
  label: string;
}

export interface AdminOrder {
  id: string;
  accountId: string;
  projectId: string;
  domain: string;
  status: string;
  totalCents: number;
  monthlyCents: number;
  currency: string;
  companyName: string;
  contactEmail: string;
  /** The provider's own words. Owner-only, and the reason this type is separate. */
  lastError: string;
  createdAt: string;
  paidAt: string | null;
  finishedAt: string | null;
}

export interface AdminStep {
  id: string;
  orderId: string;
  seq: number;
  step: string;
  status: string;
  attempts: number;
  label: string;
  detail: string;
  lastError: string;
  finishedAt: string | null;
}

export interface AdminDomain {
  domain: string;
  accountId: string;
  status: string;
  /** What it cost us. Owner-only, and never on the customer's type. */
  costCents: number;
  retailCents: number;
  currency: string;
  expiresAt: string | null;
}

export async function providerState(): Promise<ProviderState | null> {
  const r = await call('provider_get');
  return r.success ? (r.setup as ProviderState) : null;
}

export async function saveProvider(input: {
  provider: string; username: string; password: string; resellerId: string; sandbox: boolean; mailHost: string;
}): Promise<{ state: ProviderState | null; error: string }> {
  const r = await call('provider_save', input);
  return { state: r.success ? (r.setup as ProviderState) : null, error: r.success ? '' : (r.error ?? 'Could not save that.') };
}

export async function testProvider(): Promise<{ state: ProviderState | null; error: string }> {
  const r = await call('provider_test');
  return { state: r.success ? (r.setup as ProviderState) : null, error: r.success ? '' : (r.error ?? 'The connection test failed.') };
}

export async function listPrices(): Promise<PriceRow[]> {
  const r = await call('prices');
  return (r.prices as PriceRow[]) ?? [];
}

export async function savePriceRow(input: {
  kind: string; code: string; retailCents: number; markupPct: number; label: string;
}): Promise<{ prices: PriceRow[]; error: string }> {
  const r = await call('save_price', input);
  return { prices: (r.prices as PriceRow[]) ?? [], error: r.success ? '' : (r.error ?? 'Could not save that price.') };
}

export async function adminJobs(): Promise<{ orders: AdminOrder[]; steps: AdminStep[]; domains: AdminDomain[] }> {
  const r = await call('admin_jobs');
  return {
    orders: (r.orders as AdminOrder[]) ?? [],
    steps: (r.steps as AdminStep[]) ?? [],
    domains: (r.domains as AdminDomain[]) ?? [],
  };
}

export async function retryJob(orderId: string): Promise<{ error: string }> {
  const r = await call('admin_retry', { orderId });
  return { error: r.success ? '' : (r.error ?? 'Could not retry that job.') };
}

/** Prices are integer cents everywhere; this is the only place they become text. */
export function money(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2 })
    .format(cents / 100);
}
