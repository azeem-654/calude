/**
 * The screen asked for something it does not show.
 *
 * ── What happened ──
 *
 * The mailbox form hid its SMTP host box when "Brevo" was picked — correctly —
 * and the server's validate step, which only knew SMTP, answered "Add your
 * outgoing mail server (SMTP) host first." A customer cannot type into a box
 * that is not there; to them the product is simply broken, and that is a
 * refund. Nothing in the typecheck, and nothing in a test that only walked
 * the SMTP path, could see it.
 *
 * ── How this catches the next one ──
 *
 * A refusal that is about a particular box says which: the server answers
 * `{ success: false, field: 'smtp.host' }` with the header
 * `X-Refused-Field: smtp.host`, and the form marks that input
 * `data-field="smtp.host"`. After any refused `/api/*.php` call, this checks
 * the named box is actually on screen. If it is not, that is a dead end:
 * it is logged to the console, kept on `window.__deadEnds` for the browser
 * tests (test/formContract.e2e.mjs), and reported once per session to
 * `/api/uireport.php`, where the install owner sees it in Settings.
 *
 * ── Cost ──
 *
 * Answers are not read: the server marks a refusal about one box with an
 * `X-Refused-Field` header, and only those are looked at — one DOM lookup,
 * and at most one small request per (endpoint, field) per page load. It needs
 * no server time until something is actually wrong.
 */
import { sessionToken } from './auth';

export interface DeadEnd { field: string; message: string; path: string; api: string; at: string }

declare global { interface Window { __deadEnds?: DeadEnd[] } }

const reported = new Set<string>();
let installed = false;

const visible = (el: Element | null): boolean => {
  if (!el) return false;
  const h = el as HTMLElement;
  if (h.closest('[hidden], [aria-hidden="true"]')) return false;
  return h.getClientRects().length > 0 && getComputedStyle(h).visibility !== 'hidden';
};

function check(field: string, message: string, api: string) {
  /* A moment for the screen to render the answer — a form may reveal the box
     it is being told about. */
  setTimeout(() => {
    let el: Element | null = null;
    try { el = document.querySelector(`[data-field="${CSS.escape(field)}"]`); } catch { /* odd name */ }
    if (visible(el)) return;

    const rec: DeadEnd = { field, message: message.slice(0, 300), path: location.pathname, api, at: new Date().toISOString() };
    window.__deadEnds = [...(window.__deadEnds ?? []), rec];
    console.error(`[field guard] ${api} asked for "${field}", which is not on this screen: ${rec.message}`);

    const key = `${api}|${field}`;
    if (reported.has(key)) return;
    reported.add(key);
    const token = sessionToken();
    if (!token) return;
    void fetch('/api/uireport.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action: 'report', kind: 'dead_end', ...rec }),
      keepalive: true,
    }).catch(() => { /* a report that fails must never become a second fault */ });
  }, 450);
}

export function installFieldGuard(): void {
  if (installed || typeof window === 'undefined' || !window.fetch) return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await original(input, init);
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const api = new URL(url, location.href).pathname;
      if (!/^\/api\/[\w-]+\.php$/.test(api) || api === '/api/uireport.php') return res;
      /* The server marks a refusal about one box with a header
         (worker/src/lib/http.ts `fail`), so nothing else is ever read. */
      const field = res.headers.get('X-Refused-Field');
      if (!field) return res;
      void res.clone().json()
        .then((d: { error?: unknown; message?: unknown }) => check(field, String(d?.error ?? d?.message ?? ''), api))
        .catch(() => check(field, '', api));
    } catch { /* the guard must never break the call it is watching */ }
    return res;
  };
}
