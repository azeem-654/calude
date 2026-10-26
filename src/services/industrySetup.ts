/**
 * Carrying the industry a customer signed up from into their new workspace.
 *
 * The HVAC and roofing sites send "Start the software free" to
 * `/signup?industry=hvac` (Site/IndustryPage.tsx). The slug is kept in this
 * browser (`pc_industry`, not `crm_` — like the referral code it must be
 * readable before there is a workspace) and, once somebody is signed in, it is
 * handed to the server, which decides whether it applies: only to a new
 * account's own workspace, once (routes/snapshots.ts `claim`). That covers
 * every way of signing up — a password, a code, Google — without threading
 * the slug through each.
 *
 * Called by SyncGate *before* the first pull, so the industry's pipeline is in
 * the workspace before the app would seed its generic one.
 */
import { sessionToken } from './auth';
import { API_BASE } from './apiBase';

const KEY = 'pc_industry';
const DAYS = 30;
const SLUGS = new Set(['hvac', 'roofing', 'medical-billing']);

interface Stored { slug: string; at: number }

function read(): Stored | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Stored | null;
    return v && SLUGS.has(v.slug) && Date.now() - v.at < DAYS * 86_400_000 ? v : null;
  } catch { return null; }
}

/** On load: remember `?industry=` from the address. The latest link wins — it is a preference, not a commission. */
export function captureIndustry(): void {
  let slug = '';
  try { slug = (new URLSearchParams(location.search).get('industry') ?? '').trim().toLowerCase(); } catch { return; }
  if (!SLUGS.has(slug)) return;
  try { localStorage.setItem(KEY, JSON.stringify({ slug, at: Date.now() })); } catch { /* storage off: nothing to carry */ }
}

/**
 * After sign-in: ask the server to set the workspace up for that industry.
 * Forgotten on any definite answer (yes, or a reason it does not apply); kept
 * on a dropped connection so the next sign-in tries again.
 */
export async function claimIndustryIfPending(): Promise<void> {
  const v = read();
  if (!v) return;
  try {
    const r = await fetch(`${API_BASE}/api/snapshots.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken(), action: 'claim', industry: v.slug }),
    });
    if (r.status >= 500) return;
    const d = await r.json() as { success?: boolean };
    if (typeof d.success === 'boolean') localStorage.removeItem(KEY);
  } catch { /* offline: try again on the next sign-in */ }
}
