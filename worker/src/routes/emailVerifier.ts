/**
 * /api/email-verifier.php — the owner's email finder & verifier key, which
 * gives every customer's AI Prospecting mailbox-level checks and, with Hunter,
 * a search of the web for addresses a business has published
 * (lib/emailVerify.ts).
 *
 * Install owner only, like the Geoapify and Google Maps keys beside it on
 * Platform services. The key is encrypted and never returned — the card is
 * told which provider, whether it last worked, what the provider says is left,
 * and what this month has spent.
 */
import { body, fail, json } from '../lib/http';
import { userFromToken, type Env, type SessionUser } from '../lib/db';
import {
  BUDGET, PROVIDERS, installVerifier, isProvider, markVerifier, monthTotals, removeVerifier, saveVerifier, testVerifier,
} from '../lib/emailVerify';

interface Req { token?: string; action?: string; provider?: string; apiKey?: string }

const isOwner = (u: SessionUser) => u.role === 'agency' && !u.accountId;

export async function verifierState(env: Env) {
  const v = await installVerifier(env);
  return {
    set: !!v,
    provider: v?.provider ?? '',
    finds: v ? PROVIDERS[v.provider].finds : false,
    status: v?.status ?? 'none',
    lastError: v?.lastError ?? '',
    updatedAt: v?.updatedAt ?? null,
    month: await monthTotals(env),
    budget: BUDGET,
    providers: Object.entries(PROVIDERS).map(([id, p]) => ({ id, name: p.name, finds: p.finds, where: p.where })),
  };
}

export async function handleEmailVerifier(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this needs a current session.', 401, { code: 'unauthorised' });
  if (!isOwner(user)) return fail('Only the owner of this installation connects the email verifier.', 403, { code: 'not_owner' });
  const act = String(d.action ?? 'status');

  if (act === 'status') return json({ success: true, ...(await verifierState(env)) });

  if (act === 'save') {
    const provider = String(d.provider ?? '');
    if (!isProvider(provider)) return fail('Choose which service the key is from.', 200, { field: 'verifier.provider' });
    const apiKey = String(d.apiKey ?? '').trim();
    if (!apiKey) return fail('Paste the API key first.', 200, { field: 'verifier.key' });
    if (!PROVIDERS[provider].keyRe.test(apiKey)) {
      return fail(`That does not look like a ${PROVIDERS[provider].name} API key — ${PROVIDERS[provider].where}.`, 200, { field: 'verifier.key' });
    }
    await saveVerifier(env, provider, apiKey);
    /* Proved at once, on the provider's free "credits left" call — the screen
       says "working" or why not, and nothing is spent finding out. */
    const t = await testVerifier(env, provider, apiKey);
    await markVerifier(env, t.ok, t.error);
    return json({ success: true, tested: t, ...(await verifierState(env)) });
  }

  if (act === 'test') {
    const v = await installVerifier(env);
    if (!v) return fail('No email verifier is connected yet.', 200, { field: 'verifier.key' });
    const t = await testVerifier(env, v.provider, v.key);
    await markVerifier(env, t.ok, t.error);
    return json({ success: true, tested: t, ...(await verifierState(env)) });
  }

  if (act === 'remove') {
    await removeVerifier(env);
    return json({ success: true, ...(await verifierState(env)) });
  }

  return fail(`"${act}" is not something this endpoint does.`);
}
