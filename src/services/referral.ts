/**
 * Carrying an affiliate's referral code from their link to a new account.
 *
 * A link looks like https://protectedcentral.com/?ref=sam-k3f9. The code is
 * kept in this browser (`pc_ref`, not `crm_` — it must be readable before
 * there is a workspace, and the tenant patch would file a `crm_` key under
 * one) for 60 days, rides along on the links from the site to the app's
 * sign-up (hosts.ts `appHref`), and once somebody is signed in it is handed
 * to the server, which decides whether it counts (routes/affiliate.ts
 * `attribute`). The first link stays: a second affiliate's link does not take
 * a referral away from the person who sent them first.
 */
import { sessionToken } from './auth';

const KEY = 'pc_ref';
const DAYS = 60;
const CODE = /^[a-z0-9][a-z0-9-]{2,40}$/;

interface Stored { code: string; at: number }

function read(): Stored | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Stored | null;
    return v && CODE.test(v.code) && Date.now() - v.at < DAYS * 86_400_000 ? v : null;
  } catch { return null; }
}

/** The code this browser arrived with, if it is still fresh. */
export const pendingRef = (): string => read()?.code ?? '';

/** On load: remember `?ref=` from the address, and count the visit once. */
export function captureRef(): void {
  let code = '';
  try { code = (new URLSearchParams(location.search).get('ref') ?? '').trim().toLowerCase(); } catch { return; }
  if (!CODE.test(code) || read()) return;
  try { localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() })); } catch { /* storage off: the link still works this visit */ }
  void fetch('/api/affiliate.php', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'click', ref: code }),
  }).catch(() => { /* a count, never a reason for the page to fail */ });
}

/**
 * After sign-in: tell the server which link this account came through. Kept
 * until the server gives a definite answer, so a dropped connection is tried
 * again next time rather than losing somebody's referral.
 */
export async function attributeIfPending(): Promise<void> {
  const code = pendingRef();
  if (!code) return;
  try {
    const r = await fetch('/api/affiliate.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken(), action: 'attribute', ref: code }),
    });
    if (r.status >= 500) return;
    const d = await r.json() as { success?: boolean; reason?: string };
    if (d.success !== undefined) localStorage.removeItem(KEY);
  } catch { /* offline: try again on the next sign-in */ }
}
