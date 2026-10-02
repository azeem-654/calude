/**
 * /api/geoapify.php — the owner's Geoapify key, which makes prospect search's
 * free directory fast and keepable for every customer (lib/geoapify.ts).
 *
 * Install owner only, like the Google Maps key beside it on Platform
 * services. The key is encrypted and never returned — the card is told
 * whether one is set, whether Geoapify last accepted it, and how many of
 * today's free credits are spent.
 */
import { body, fail, json } from '../lib/http';
import { userFromToken, type Env, type SessionUser } from '../lib/db';
import { DAILY_CREDIT_CAP, creditsToday, installGeoKey, markGeoKey, saveGeoKey, testGeoKey } from '../lib/geoapify';

interface Req { token?: string; action?: string; apiKey?: string }

const isOwner = (u: SessionUser) => u.role === 'agency' && !u.accountId;

export async function geoState(env: Env) {
  const k = await installGeoKey(env);
  return {
    set: !!k,
    status: k?.status ?? 'none',
    lastError: k?.lastError ?? '',
    updatedAt: k?.updatedAt ?? null,
    creditsToday: await creditsToday(env),
    cap: DAILY_CREDIT_CAP,
  };
}

export async function handleGeoapify(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this needs a current session.', 401, { code: 'unauthorised' });
  if (!isOwner(user)) return fail('Only the owner of this installation sets the Geoapify key.', 403, { code: 'not_owner' });
  const act = String(d.action ?? 'status');

  if (act === 'status') return json({ success: true, ...(await geoState(env)) });

  if (act === 'save') {
    const apiKey = String(d.apiKey ?? '').trim();
    if (!apiKey) return fail('Paste the Geoapify API key first.', 200, { field: 'geoapify.key' });
    if (!/^[A-Za-z0-9]{20,64}$/.test(apiKey)) {
      return fail('That does not look like a Geoapify API key — copy it from myprojects.geoapify.com → your project → API keys.', 200, { field: 'geoapify.key' });
    }
    await saveGeoKey(env, apiKey);
    /* Proved at once: the screen should say "working" or why not, not leave
       the owner to find a second button. One credit. */
    const t = await testGeoKey(env, apiKey);
    await markGeoKey(env, t.ok, t.error);
    return json({ success: true, tested: t, ...(await geoState(env)) });
  }

  if (act === 'test') {
    const k = await installGeoKey(env);
    if (!k) return fail('No Geoapify key is set yet.', 200, { field: 'geoapify.key' });
    const t = await testGeoKey(env, k.key);
    await markGeoKey(env, t.ok, t.error);
    return json({ success: true, tested: t, ...(await geoState(env)) });
  }

  return fail(`"${act}" is not something this endpoint does.`);
}
