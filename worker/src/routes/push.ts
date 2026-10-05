/**
 * /api/push.php — a phone app says where to send its alerts.
 *
 *   register   { token, platform, app, accountId } — this phone, for this workspace
 *   unregister { token } — signing out on the phone
 *   status     { accountId } — is push on for this install, and how many phones
 *
 * The token comes from the phone's own push service (lib/push.ts) and is only
 * ever used to send to that phone. A token re-registered by somebody else
 * moves to them: the phone belongs to whoever is signed in on it now. Every
 * workspace named is checked with workspaceAccess, like every other route.
 */
import { body, fail, json } from '../lib/http';
import { userFromToken, workspaceAccess, type Env } from '../lib/db';
import { rateLimit } from '../lib/rateLimit';
import { apnsConfigured, serviceAccount, touchDevice } from '../lib/push';

interface Req { action?: string; token?: string; accountId?: string; deviceToken?: string; platform?: string; app?: string }

const s = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);

export async function handlePush(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });
  const act = s(d.action, 20);
  const deviceToken = s(d.deviceToken, 400);

  if (act === 'unregister') {
    if (deviceToken) await env.DB.prepare('DELETE FROM crm_push_devices WHERE token = ? AND user_email = ?').bind(deviceToken, user.email).run();
    return json({ success: true });
  }

  const accountId = s(d.accountId, 80);
  if (!accountId) return fail('A valid workspace is required.');
  const access = await workspaceAccess(env.DB, user, accountId);
  if (!access.ok) return fail(access.message ?? 'That workspace is not yours.', 403, { code: access.code });

  if (act === 'status') {
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM crm_push_devices WHERE account_id = ?').bind(accountId).first<{ n: number }>();
    return json({ success: true, android: !!serviceAccount(env), ios: apnsConfigured(env), devices: n?.n ?? 0 });
  }

  if (act === 'register') {
    /* An FCM token (base64url-ish) or an APNs token (hex); anything else is not one. */
    if (!/^[\w:.-]{20,400}$/.test(deviceToken)) return fail('That is not a device token.');
    const platform = d.platform === 'ios' ? 'ios' : d.platform === 'android' ? 'android' : '';
    if (!platform) return fail('Unknown platform.');
    const app = d.app === 'support' ? 'support' : 'customer';
    const v = await rateLimit(env, { what: 'push-register', who: user.email, max: 60, windowSeconds: 3600 });
    if (!v.allowed) return fail('Too many registrations — try again later.', 429);
    await touchDevice(env, { token: deviceToken, email: user.email, accountId, platform, app });
    return json({ success: true, enabled: platform === 'ios' ? apnsConfigured(env) : !!serviceAccount(env) });
  }

  return fail(`"${act}" is not something this endpoint does.`);
}
