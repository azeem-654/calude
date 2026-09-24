/**
 * The security audit trail: sign-ins, failed ones, password and member
 * changes, connected services.
 *
 * ── What goes in, and what never does ──
 *
 * Who, what, which workspace, from which network and browser, and a short
 * sentence. Never a password, a token, a key, a code or a message body: a log
 * that holds secrets is one more place to steal them from, and nobody reading
 * "who signed in yesterday" needs any of that. `detail` is cut to 200
 * characters so a careless caller cannot turn it into a data store.
 *
 * ── It never fails the action ──
 *
 * Recording is best-effort. A sign-in that works must not be refused because
 * the log could not be written — the person would be locked out by the thing
 * meant to protect them. A missing table (a Worker newer than its database,
 * which the deploy order prevents) is swallowed the same way.
 */
import { nowIso, type Env } from './db';

export type AuditKind =
  | 'login' | 'login_failed' | 'logout' | 'session_revoked' | 'sessions_revoked'
  | 'password_changed' | 'password_reset_by_admin'
  | 'mfa_enabled' | 'mfa_disabled' | 'mfa_failed'
  | 'user_created' | 'user_removed'
  | 'integration_connected' | 'integration_removed'
  | 'data_exported' | 'account_deleted' | 'workspace_closed';

export interface AuditEvent {
  email: string;
  kind: AuditKind;
  accountId?: string | null;
  detail?: string;
  ip?: string;
  ua?: string;
}

export async function recordAuthEvent(env: Env, e: AuditEvent): Promise<void> {
  try {
    await env.DB.prepare(
      'INSERT INTO crm_audit_events (at, actor_email, account_id, kind, detail, ip, ua) VALUES (?,?,?,?,?,?,?)',
    ).bind(
      nowIso(), e.email.slice(0, 200), e.accountId ?? null, e.kind,
      (e.detail ?? '').slice(0, 200), (e.ip ?? '').slice(0, 64), (e.ua ?? '').slice(0, 300),
    ).run();
  } catch { /* best-effort — see the header */ }
}

/** Where a request came from, for the log. */
export function origin(req: Request): { ip: string; ua: string } {
  return { ip: req.headers.get('CF-Connecting-IP') ?? '', ua: req.headers.get('User-Agent') ?? '' };
}
