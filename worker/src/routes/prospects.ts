/**
 * /api/prospects.php — finding businesses, and reading their published contacts.
 *
 * ── Why the fetching happens here ──
 *
 * Because a browser cannot do it. Overpass and most business websites send no
 * CORS headers, so a page cannot read either of them; and if it could, every
 * customer's browser would be a separate unthrottled caller against a service
 * that asks for restraint. One server, one cache, one well-behaved client.
 *
 * ── What this endpoint will not do ──
 *
 * Guess an address. It would be easy to turn a name and a domain into
 * `firstname@company.com` and it is what the paid tools do — and it is how a
 * sending domain earns a bounce rate that gets its mail filed as spam
 * everywhere. Only addresses a business chose to publish come back from here.
 */
import { body, fail, json } from '../lib/http';
import { userFromToken, workspaceAccess, type Env } from '../lib/db';
import { findContacts, searchProspects } from '../lib/prospects';

interface Req {
  token?: string;
  accountId?: string;
  action?: string;
  trade?: string;
  place?: string;
  websites?: string[];
}

export async function handleProspects(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });

  const accountId = String(d.accountId ?? '').trim();
  if (!accountId) return fail('A valid workspace is required.');
  const access = await workspaceAccess(env.DB, user, accountId);
  if (!access.ok) return fail(access.message ?? 'That workspace is not yours.', 403, { code: access.code });

  const act = String(d.action ?? '').trim();

  if (act === 'search') {
    const r = await searchProspects(env, String(d.trade ?? ''), String(d.place ?? ''));
    if (r.error) return fail(r.error);
    return json({
      success: true,
      prospects: r.prospects,
      cached: r.cached,
      /* Required by the licence, and returned rather than hardcoded in the
         bundle so it travels with the data it belongs to. */
      attribution: '© OpenStreetMap contributors',
    });
  }

  /*
   * Contact details for a handful at a time.
   *
   * Capped at eight because each one is up to three page fetches plus a DNS
   * lookup, and a Worker has a subrequest budget and a wall clock. The screen
   * asks for the rows somebody actually selected rather than the whole result
   * set, which is both faster and a smaller imposition on the sites being read.
   */
  if (act === 'contacts') {
    const sites = (Array.isArray(d.websites) ? d.websites : []).slice(0, 8).map(String);
    if (!sites.length) return fail('Nothing to look up.');
    const found: Record<string, { emails: string[]; mx: boolean | null }> = {};
    for (const site of sites) {
      found[site] = await findContacts(env, site);
    }
    return json({ success: true, contacts: found });
  }

  return fail(`"${act}" is not something this endpoint does.`);
}
