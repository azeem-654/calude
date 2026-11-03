/**
 * Cloudflare usage this month against what the Workers Paid plan includes —
 * for the owner's dashboard (Platform services → AI & cloud usage).
 *
 * Read from Cloudflare's GraphQL Analytics API with a read-only token the
 * owner adds as Worker secrets (`CF_ANALYTICS_TOKEN`, Account Analytics:
 * Read; `CF_ACCOUNT_ID`). Each product is its own query, so one Cloudflare
 * renames or this token cannot read is reported on its own line ("could not
 * be read: …") and the rest still show. Nothing here is estimated: a figure
 * is Cloudflare's, or it is absent and says why.
 *
 * The included amounts are Cloudflare's published Workers Paid allowances;
 * usage above them is billed per unit, not refused.
 */
import type { Env } from './db';

export interface CloudLine {
  key: string; label: string; used: number | null; included: number | null; unit: string;
  period: 'month' | 'day' | 'now'; note?: string; error?: string;
}

/** Workers Paid ($5/month) — Cloudflare's published included usage. */
export const PAID_INCLUDED = {
  workerRequests: 10_000_000,
  workerCpuMs: 30_000_000,
  d1RowsRead: 25_000_000_000,
  d1RowsWritten: 50_000_000,
  d1StorageBytes: 5 * 1024 ** 3,
  r2StorageBytes: 10 * 1024 ** 3,
  r2ClassA: 1_000_000,
  r2ClassB: 10_000_000,
  aiNeuronsDay: 10_000,
};

/* R2's operation classes (Cloudflare's pricing page): writes and lists are A, reads are B. */
const CLASS_A = /^(ListBuckets|PutBucket|ListObjects|PutObject|CopyObject|CompleteMultipartUpload|CreateMultipartUpload|LifecycleStorageTierTransition|ListMultipartUploads|UploadPart|UploadPartCopy|ListParts|PutBucketEncryption|PutBucketCors|PutBucketLifecycleConfiguration)$/;
const CLASS_B = /^(HeadBucket|HeadObject|GetObject|UsageSummary|GetBucketEncryption|GetBucketLocation|GetBucketCors|GetBucketLifecycleConfiguration)$/;

async function gql<T>(env: Env, query: string, variables: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(12_000),
    });
    const j = await r.json<{ data?: T; errors?: { message?: string }[] }>().catch(() => ({} as { data?: T; errors?: { message?: string }[] }));
    if (!r.ok || j.errors?.length) return { ok: false, error: (j.errors?.[0]?.message ?? `HTTP ${r.status}`).slice(0, 200) };
    if (!j.data) return { ok: false, error: 'no data in the answer' };
    return { ok: true, data: j.data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

type Acc<T> = { viewer?: { accounts?: T[] } };
const first = <T>(d: Acc<T>) => d.viewer?.accounts?.[0];
const sum = (xs: (number | null | undefined)[]) => xs.reduce<number>((a, b) => a + (Number(b) || 0), 0);

export async function cloudUsage(env: Env): Promise<{ configured: boolean; why?: string; lines: CloudLine[]; since: string }> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const since = start.toISOString().slice(0, 10);
  if (!env.CF_ANALYTICS_TOKEN || !env.CF_ACCOUNT_ID) {
    return { configured: false, since, lines: [], why: 'Add a Cloudflare API token with "Account Analytics: Read" as the Worker secret CF_ANALYTICS_TOKEN, and your account ID as CF_ACCOUNT_ID (docs/OWNER-CHECKLIST.md) — then this shows Cloudflare\'s own figures.' };
  }
  const acc = env.CF_ACCOUNT_ID;
  const v = { acc, start: start.toISOString(), end: now.toISOString(), startDate: since, endDate: now.toISOString().slice(0, 10), today: now.toISOString().slice(0, 10) };
  const lines: CloudLine[] = [];

  /* Workers: requests and CPU time this month, every script on the account. */
  type W = { workers?: { sum?: { requests?: number; cpuTimeUs?: number } }[] };
  let w = await gql<Acc<W>>(env, `query($acc: string!, $start: Time!, $end: Time!) { viewer { accounts(filter: {accountTag: $acc}) {
    workers: workersInvocationsAdaptive(limit: 10000, filter: {datetime_geq: $start, datetime_leq: $end}) { sum { requests cpuTimeUs } } } } }`, v);
  let cpuReadable = true;
  if (!w.ok && /cpuTimeUs/i.test(w.error)) {
    cpuReadable = false;
    w = await gql<Acc<W>>(env, `query($acc: string!, $start: Time!, $end: Time!) { viewer { accounts(filter: {accountTag: $acc}) {
      workers: workersInvocationsAdaptive(limit: 10000, filter: {datetime_geq: $start, datetime_leq: $end}) { sum { requests } } } } }`, v);
  }
  if (w.ok) {
    const rows = first(w.data)?.workers ?? [];
    lines.push({ key: 'workers', label: 'Worker requests', used: sum(rows.map(r => r.sum?.requests)), included: PAID_INCLUDED.workerRequests, unit: 'requests', period: 'month' });
    lines.push(cpuReadable
      ? { key: 'cpu', label: 'Worker CPU time', used: Math.round(sum(rows.map(r => r.sum?.cpuTimeUs)) / 1000), included: PAID_INCLUDED.workerCpuMs, unit: 'ms', period: 'month' }
      : { key: 'cpu', label: 'Worker CPU time', used: null, included: PAID_INCLUDED.workerCpuMs, unit: 'ms', period: 'month', error: 'Cloudflare did not offer CPU time to this token' });
  } else lines.push({ key: 'workers', label: 'Worker requests', used: null, included: PAID_INCLUDED.workerRequests, unit: 'requests', period: 'month', error: w.error });

  /* D1: rows read and written this month, and the largest size today. */
  type D = { d1?: { sum?: { rowsRead?: number; rowsWritten?: number } }[]; size?: { max?: { databaseSizeBytes?: number }; dimensions?: { databaseId?: string } }[] };
  const d = await gql<Acc<D>>(env, `query($acc: string!, $startDate: Date!, $endDate: Date!) { viewer { accounts(filter: {accountTag: $acc}) {
    d1: d1AnalyticsAdaptiveGroups(limit: 10000, filter: {date_geq: $startDate, date_leq: $endDate}) { sum { rowsRead rowsWritten } }
    size: d1StorageAdaptiveGroups(limit: 10000, filter: {date_geq: $startDate, date_leq: $endDate}) { max { databaseSizeBytes } dimensions { databaseId } } } } }`, v);
  if (d.ok) {
    const a = first(d.data);
    lines.push({ key: 'd1read', label: 'D1 rows read', used: sum((a?.d1 ?? []).map(r => r.sum?.rowsRead)), included: PAID_INCLUDED.d1RowsRead, unit: 'rows', period: 'month' });
    lines.push({ key: 'd1write', label: 'D1 rows written', used: sum((a?.d1 ?? []).map(r => r.sum?.rowsWritten)), included: PAID_INCLUDED.d1RowsWritten, unit: 'rows', period: 'month' });
    const byDb = new Map<string, number>();
    for (const r of a?.size ?? []) byDb.set(r.dimensions?.databaseId ?? '', Math.max(byDb.get(r.dimensions?.databaseId ?? '') ?? 0, r.max?.databaseSizeBytes ?? 0));
    lines.push({ key: 'd1size', label: 'D1 storage (all databases)', used: sum([...byDb.values()]), included: PAID_INCLUDED.d1StorageBytes, unit: 'bytes', period: 'now' });
  } else lines.push({ key: 'd1read', label: 'D1 database', used: null, included: null, unit: 'rows', period: 'month', error: d.error });

  /* R2: operations by class this month, and what is stored. */
  type R = { ops?: { sum?: { requests?: number }; dimensions?: { actionType?: string } }[]; store?: { max?: { payloadSize?: number; metadataSize?: number }; dimensions?: { bucketName?: string } }[] };
  const r = await gql<Acc<R>>(env, `query($acc: string!, $start: Time!, $end: Time!) { viewer { accounts(filter: {accountTag: $acc}) {
    ops: r2OperationsAdaptiveGroups(limit: 10000, filter: {datetime_geq: $start, datetime_leq: $end}) { sum { requests } dimensions { actionType } }
    store: r2StorageAdaptiveGroups(limit: 10000, filter: {datetime_geq: $start, datetime_leq: $end}) { max { payloadSize metadataSize } dimensions { bucketName } } } } }`, v);
  if (r.ok) {
    const a = first(r.data);
    const ops = a?.ops ?? [];
    lines.push({ key: 'r2a', label: 'R2 writes & lists (Class A)', used: sum(ops.filter(o => CLASS_A.test(o.dimensions?.actionType ?? '')).map(o => o.sum?.requests)), included: PAID_INCLUDED.r2ClassA, unit: 'operations', period: 'month' });
    lines.push({ key: 'r2b', label: 'R2 reads (Class B)', used: sum(ops.filter(o => CLASS_B.test(o.dimensions?.actionType ?? '')).map(o => o.sum?.requests)), included: PAID_INCLUDED.r2ClassB, unit: 'operations', period: 'month' });
    const byBucket = new Map<string, number>();
    for (const s of a?.store ?? []) byBucket.set(s.dimensions?.bucketName ?? '', Math.max(byBucket.get(s.dimensions?.bucketName ?? '') ?? 0, (s.max?.payloadSize ?? 0) + (s.max?.metadataSize ?? 0)));
    lines.push({ key: 'r2size', label: 'R2 storage (videos, files)', used: sum([...byBucket.values()]), included: PAID_INCLUDED.r2StorageBytes, unit: 'bytes', period: 'now' });
  } else lines.push({ key: 'r2a', label: 'R2 storage', used: null, included: null, unit: 'operations', period: 'month', error: r.error });

  /* Workers AI (the Video Studio's transcription): neurons today, against the daily free allowance. */
  type A = { ai?: { sum?: { totalNeurons?: number } }[] };
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const ai = await gql<Acc<A>>(env, `query($acc: string!, $start: Time!, $end: Time!) { viewer { accounts(filter: {accountTag: $acc}) {
    ai: aiInferenceAdaptiveGroups(limit: 10000, filter: {datetime_geq: $start, datetime_leq: $end}) { sum { totalNeurons } } } } }`, { ...v, start: dayStart });
  lines.push(ai.ok
    ? { key: 'neurons', label: 'Workers AI (transcription)', used: sum((first(ai.data)?.ai ?? []).map(x => x.sum?.totalNeurons)), included: PAID_INCLUDED.aiNeuronsDay, unit: 'neurons', period: 'day' }
    : { key: 'neurons', label: 'Workers AI (transcription)', used: null, included: PAID_INCLUDED.aiNeuronsDay, unit: 'neurons', period: 'day', error: ai.error });

  return { configured: true, since, lines };
}
