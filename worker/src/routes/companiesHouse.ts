/**
 * /api/companies-house.php — the owner's Companies House key, which switches
 * on "Verified business directories" in AI Prospecting for every customer
 * (lib/companiesHouse.ts).
 *
 * Install owner only, like the Geoapify key beside it. The key is encrypted
 * and never returned; the card is told whether one is set and whether the
 * register last accepted it.
 */
import { body, fail, json } from '../lib/http';
import { userFromToken, type Env, type SessionUser } from '../lib/db';
import { installRegisterKey, markRegisterKey, saveRegisterKey, testRegisterKey } from '../lib/companiesHouse';

interface Req { token?: string; action?: string; apiKey?: string }

const isOwner = (u: SessionUser) => u.role === 'agency' && !u.accountId;

export async function registerState(env: Env) {
  const k = await installRegisterKey(env);
  return { set: !!k, status: k?.status ?? 'none', lastError: k?.lastError ?? '', updatedAt: k?.updatedAt ?? null };
}

export async function handleCompaniesHouse(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this needs a current session.', 401, { code: 'unauthorised' });
  if (!isOwner(user)) return fail('Only the owner of this installation connects the company register.', 403, { code: 'not_owner' });
  const act = String(d.action ?? 'status');

  if (act === 'status') return json({ success: true, ...(await registerState(env)) });

  if (act === 'save') {
    const apiKey = String(d.apiKey ?? '').trim();
    if (!apiKey) return fail('Paste the Companies House API key first.', 200, { field: 'register.key' });
    /* Their keys are UUIDs; anything else is a pasted password or app id. */
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(apiKey)) {
      return fail('That does not look like a Companies House API key — it is a long code with dashes, under your application at developer.company-information.service.gov.uk.', 200, { field: 'register.key' });
    }
    await saveRegisterKey(env, apiKey);
    const t = await testRegisterKey(env, apiKey);
    await markRegisterKey(env, t.ok, t.error);
    return json({ success: true, tested: t, ...(await registerState(env)) });
  }

  if (act === 'test') {
    const k = await installRegisterKey(env);
    if (!k) return fail('No Companies House key is set yet.', 200, { field: 'register.key' });
    const t = await testRegisterKey(env, k.key);
    await markRegisterKey(env, t.ok, t.error);
    return json({ success: true, tested: t, ...(await registerState(env)) });
  }

  return fail(`"${act}" is not something this endpoint does.`);
}
