/**
 * Closing a workspace: everything it holds, gone, and its id retired.
 *
 * Used when an agency closes a client sub-account, and when somebody deletes
 * their own account. Both must leave nothing reachable behind — see below.
 */
import type { Env } from './db';

export async function closeWorkspace(env: Env, target: string): Promise<void> {
  /*
   * Everything belonging to it, not just the row that counts it.
   *
   * This used to name six tables. The workspace's live mailbox passwords,
   * its payout key, its calendar tokens, its published shop and its buyers'
   * orders were all left behind — and because the ownership row was deleted,
   * the id became unowned, so the next agency to name it claimed it through
   * `workspaceAccess` and inherited all of it.
   *
   * So: every table with an `account_id` is found, not listed, so a table
   * added next month is covered without anybody remembering this. What is
   * kept is the operator's own record of what was bought on its accounts
   * (domains, set-up orders) and the moderation history.
   */
  const KEEP = new Set(['crm_workspaces', 'crm_users', 'crm_managed_purchases', 'crm_owned_domains', 'crm_setup_orders', 'crm_account_standing', 'crm_content_reviews']);
  let tables: string[] = [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT m.name AS name FROM sqlite_master m, pragma_table_info(m.name) p
        WHERE m.type = 'table' AND m.name LIKE 'crm\_%' ESCAPE '\\' AND p.name = 'account_id'`,
    ).all<{ name: string }>();
    tables = (results ?? []).map(r => r.name).filter(n => /^crm_[a-z_]+$/.test(n) && !KEEP.has(n));
  } catch { /* the fixed list below still runs */ }
  if (!tables.length) {
    tables = ['crm_data', 'crm_mailboxes', 'crm_mailbox_accounts', 'crm_providers', 'crm_provisioned', 'crm_schedules',
      'crm_storefront', 'crm_sms_config', 'crm_calendar_connections', 'crm_publish_targets', 'crm_suppliers',
      'crm_shops', 'crm_orders', 'crm_products', 'crm_projects', 'crm_portfolios'];
  }
  const clients = await env.DB.prepare("SELECT email FROM crm_users WHERE account_id = ? AND role = 'client'")
    .bind(target).all<{ email: string }>();
  await env.DB.batch([
    ...tables.map(t => env.DB.prepare(`DELETE FROM ${t} WHERE account_id = ?`).bind(target)),
    /* The client logins that opened this workspace go with it. */
    ...(clients.results ?? []).map(c => env.DB.prepare('DELETE FROM crm_sessions WHERE email = ?').bind(c.email)),
    env.DB.prepare("DELETE FROM crm_users WHERE account_id = ? AND role = 'client'").bind(target),
    /* A tombstone, not a deletion. `~` cannot begin an email address, so no
       session ever matches it: the id stays owned by nobody, and cannot be
       claimed and refilled. It no longer counts against the allowance
       either, because that counts rows owned by the agency's own address. */
    env.DB.prepare("UPDATE crm_workspaces SET owner_email = '~closed~' || owner_email WHERE account_id = ?").bind(target),
  ]);
}
