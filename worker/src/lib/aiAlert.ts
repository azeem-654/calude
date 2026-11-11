/**
 * The owner's mail when no AI key answered (lib/aiPool.ts `notePoolDown`,
 * at most every six hours).
 *
 * Its own file because it reaches the system mailbox through routes/auth.ts,
 * which imports half the Worker; aiPool loads it only when it is needed, so
 * the pool stays importable on its own (and by the tests that use it).
 */
import { canSend, deliver, fromAddressOf } from './deliver';
import type { Env } from './db';

export async function alertOwnerAiDown(env: Env, why: string): Promise<void> {
  const owner = await env.DB.prepare("SELECT email FROM crm_users WHERE role = 'agency' AND account_id IS NULL LIMIT 1")
    .first<{ email: string }>().catch(() => null);
  if (!owner?.email) return;
  const { installMailbox } = await import('../routes/auth');
  const mb = await installMailbox(env).catch(() => null);
  if (!mb || !canSend(mb)) return;
  const origin = (env.APP_ORIGIN ?? '').replace(/\/$/, '');
  const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
  await deliver(mb, {
    fromName: mb.from.name || 'Protected Central', fromEmail: fromAddressOf(mb), to: owner.email,
    subject: 'Action needed: none of your AI keys answered',
    html: `<p>Every AI key on your installation refused or failed just now, so customers' AI requests could not be answered.</p>
<p><b>Google's reason (first key):</b> ${esc(why)}</p>
<p>Customers were told it is on our side and will retry. To fix it: open <a href="${origin}/settings?tab=platform">Settings → Platform services → AI keys</a>, press <b>Test</b> on each key, and add a backup key from a different Google Cloud project, or an OpenRouter key with credit. A key on a project with billing switched on does not run out of a daily free allowance.</p>
<p>You will not get this mail again for six hours.</p>`,
  }).catch(() => undefined);
}
