/**
 * AI keeps going when the keys run out.
 *
 * When every AI key is resting (a rate limit: two minutes; a daily quota: an
 * hour — worker/src/lib/aiPool.ts), the server answers its busy sentence and
 * marks the answer with `X-AI-Busy: <seconds until the soonest key is back>`
 * (worker/src/lib/http.ts `json`). Before this, every screen showed that
 * sentence as an error, and the customer lost what they had asked for: the
 * plan, the draft, the analysis. Most of those rests are over in two minutes.
 *
 * So the page waits instead. Every `/api/*.php` call goes through here (one
 * patch of `fetch`, the way services/fieldGuard.ts watches refusals), and a
 * busy answer is not handed to the screen: the same request is made again
 * when a key should be back. The screen's own spinner keeps spinning, its
 * work stays where it is, and the bar (shared/AiPatienceBar.tsx) says what is
 * happening and counts down.
 *
 *  - A short rest: asked again for up to about three and a half minutes,
 *    which covers the two-minute rest after a rate limit.
 *  - A long one (a daily quota): "Paused — we'll pick this up automatically",
 *    checked every five minutes for up to three hours while the page is
 *    open, and leaving the page asks first, because the work is in it.
 *    Work the cron does (Autopilot, replies, campaigns) never needed this:
 *    it retries on its own tick with nobody signed in.
 *  - "Stop waiting" hands the screen the busy answer, exactly as before.
 *
 * Only requests that can be made again are: a string body (every JSON call
 * here) or none. A `Request` object or a stream is passed through untouched.
 * Asking again is safe because a busy refusal is answered before a route
 * writes anything — the AI call comes first, then the save (routes/aiwrite.ts,
 * intake.ts, …) — and its AI unit is given back (lib/ai.ts `aiRefund`).
 *
 * A caller's own `signal` still ends the wait: a chat that asks its own
 * fallback question after a few seconds (protron/intake.ts) keeps doing so.
 * A caller that wants a time limit per attempt rather than overall passes
 * `attemptTimeoutMs` instead (lib/gemini.ts `aiFetch`).
 */

export interface PatienceInit extends RequestInit {
  /** A time limit for each attempt, not for the whole wait. */
  attemptTimeoutMs?: number;
}

export interface Waiting {
  id: number;
  /** The API path, for the bar's list (never shown raw). */
  api: string;
  /** When the current wait began and when it ends with the next attempt (ms). */
  waitFrom: number;
  nextAt: number;
  /** When this request first heard "busy" (ms). */
  since: number;
  /** A daily-quota pause rather than a short rest. */
  paused: boolean;
  attempts: number;
  /** Stops waiting and hands the screen the busy answer. */
  stop: () => void;
}

/** Up to this long for a short rest — two minutes of rate limit and a margin. */
const SHORT_WAIT_MS = 210_000;
/** A rest longer than this is a quota, not a rate limit. */
const LONG_REST_MS = 5 * 60_000;
/** While paused, the next check is at most this far off. */
const PAUSED_CHECK_MS = 5 * 60_000;
/** And the page gives up after this long — the work is lost only then. */
const PAUSED_MAX_MS = 3 * 3_600_000;

let nextId = 1;
const waiting = new Map<number, Waiting>();
const listeners = new Set<() => void>();
let snapshot: Waiting[] = [];

function changed(): void {
  snapshot = [...waiting.values()];
  for (const l of listeners) l();
}

/** For the bar (useSyncExternalStore). */
export function subscribePatience(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
export const patienceSnapshot = (): Waiting[] => snapshot;

/** Stop every wait (the bar's button). */
export function stopAllWaiting(): void {
  for (const w of [...waiting.values()]) w.stop();
}

/** The seconds a busy answer says, or null when the answer is not busy. */
function busySeconds(res: Response): number | null {
  const h = res.headers.get('X-AI-Busy');
  if (h === null) return null;
  const n = Number(h);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** When to ask again, from what the server said and how long this has gone on. */
function plan(backInSec: number, since: number, attempts: number): { delay: number; paused: boolean } | null {
  const elapsed = Date.now() - since;
  const backIn = backInSec * 1000;
  if (backIn > LONG_REST_MS || elapsed > SHORT_WAIT_MS) {
    if (elapsed > PAUSED_MAX_MS) return null;
    return { delay: Math.min(Math.max(backIn, 60_000), PAUSED_CHECK_MS), paused: true };
  }
  /* A short rest: just after the soonest key is back. Not known (0): a few
     tries closer together first — the failure was most likely a slow walk
     through the keys, not a rest. */
  const delay = backIn > 0 ? backIn + 3_000 : Math.min(10_000 * 2 ** Math.min(attempts, 3), 45_000);
  if (elapsed + delay > SHORT_WAIT_MS) return { delay: Math.min(Math.max(backIn, 60_000), PAUSED_CHECK_MS), paused: true };
  return { delay, paused: false };
}

function sleep(ms: number, signal: AbortSignal | null | undefined, onStop: (stop: () => void) => void): Promise<'go' | 'stopped'> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (v: 'go' | 'stopped') => { if (done) return; done = true; clearTimeout(t); signal?.removeEventListener('abort', aborted); resolve(v); };
    const aborted = () => { if (done) return; done = true; clearTimeout(t); reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')); };
    const t = setTimeout(() => finish('go'), ms);
    if (signal?.aborted) { aborted(); return; }
    signal?.addEventListener('abort', aborted);
    onStop(() => finish('stopped'));
  });
}

let installed = false;

/** Before services/fieldGuard.ts, so that guard sees the answer the screen gets, not each try. */
export function installAiPatience(): void {
  if (installed || typeof window === 'undefined' || !window.fetch) return;
  installed = true;
  const original = window.fetch.bind(window);

  const attempt = (input: RequestInfo | URL, init: PatienceInit | undefined) => {
    if (!init?.attemptTimeoutMs) return original(input, init);
    const { attemptTimeoutMs, ...rest } = init;
    const own = AbortSignal.timeout(attemptTimeoutMs);
    const signal = rest.signal && 'any' in AbortSignal ? AbortSignal.any([rest.signal, own]) : own;
    return original(input, { ...rest, signal });
  };

  window.fetch = async (input: RequestInfo | URL, init?: PatienceInit) => {
    const first = await attempt(input, init);
    let backIn = busySeconds(first);
    if (backIn === null) return first;
    /* Only what can be sent again, and only the API. */
    if (input instanceof Request || (init?.body != null && typeof init.body !== 'string')) return first;
    let api = '';
    try { api = new URL(typeof input === 'string' ? input : input.href, location.href).pathname; } catch { return first; }
    if (!/^\/api\/[\w-]+\.php$/.test(api)) return first;

    const since = Date.now();
    let last = first;
    const w: Waiting = { id: nextId++, api, waitFrom: 0, nextAt: 0, since, paused: false, attempts: 0, stop: () => undefined };
    try {
      for (;;) {
        const p = plan(backIn ?? 0, since, w.attempts);
        if (!p) return last;
        w.waitFrom = Date.now();
        w.nextAt = w.waitFrom + p.delay;
        w.paused = p.paused;
        waiting.set(w.id, w);
        changed();
        const went = await sleep(p.delay, init?.signal, stop => { w.stop = stop; });
        if (went === 'stopped') return last;
        w.attempts++;
        changed();
        const res = await attempt(input, init);
        backIn = busySeconds(res);
        if (backIn === null) return res;
        last = res;
      }
    } finally {
      waiting.delete(w.id);
      changed();
    }
  };

  /* Leaving the page while work is held would lose it; the browser asks first. */
  window.addEventListener('beforeunload', e => {
    if (!waiting.size) return;
    e.preventDefault();
    e.returnValue = '';
  });
}
