/**
 * Browser crashes reach the operator (OPS-3).
 *
 * A screen that threw went blank or half-drawn for the customer and silent
 * for everyone else: nothing left the browser, so the first the owner heard
 * was a refund request. Uncaught errors and unhandled promise rejections are
 * now sent to /api/uireport.php (`crash`), folded per error and screen there,
 * and shown in Settings → Screen checks.
 *
 * Kept small on purpose: signed-in sessions only, five reports per page load,
 * each error once, nothing from browser extensions or other origins, and a
 * report that fails is dropped rather than retried — a reporter that can
 * itself throw or flood is a second fault.
 */
import { sessionToken } from './auth';

const MAX_PER_LOAD = 5;
const seen = new Set<string>();
let sent = 0;
let installed = false;

/* Noise every app sees and none can fix. */
const IGNORE = /ResizeObserver loop|Script error\.?$|Non-Error promise rejection captured|AbortError|Load failed$|Failed to fetch$|NetworkError when attempting/i;

function send(name: string, message: string, stack: string) {
  if (sent >= MAX_PER_LOAD || !message || IGNORE.test(message)) return;
  const key = `${name}:${message}`.slice(0, 300);
  if (seen.has(key)) return;
  seen.add(key);
  const token = sessionToken();
  if (!token) return;
  sent++;
  /* The top frames only: enough to find the line, not a dump of the bundle. */
  const frames = stack.split('\n').map(l => l.trim()).filter(l => /at |@/.test(l)).slice(0, 3).join('\n');
  void fetch('/api/uireport.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, action: 'crash', field: name, path: location.pathname, message: `${message}${frames ? `\n${frames}` : ''}`.slice(0, 400) }),
    keepalive: true,
  }).catch(() => { /* never a second fault */ });
}

export function installCrashReport(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', e => {
    /* An error from another origin's script (an extension, an embed) is not ours. */
    if (e.filename && !e.filename.startsWith(location.origin)) return;
    const err = e.error as Error | undefined;
    send(err?.name || 'Error', String(err?.message ?? e.message ?? ''), String(err?.stack ?? ''));
  });
  window.addEventListener('unhandledrejection', e => {
    const r = e.reason as Error | string | undefined;
    if (r instanceof Error) send(r.name || 'Error', r.message, String(r.stack ?? ''));
    else if (typeof r === 'string') send('UnhandledRejection', r, '');
  });
}
