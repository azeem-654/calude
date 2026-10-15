/**
 * /api/allowances.php — what each plan allows, what a workspace has used, and
 * the Custom plan's enquiries.
 *
 *   plans       no session. The packages as the server holds them (with the
 *               owner's changes), for the public site's pricing and Plan &
 *               billing — so a card can only show a number that is enforced.
 *   enquire     no session. The Custom tier's form: stored for the install
 *               owner, emailed to them when the install mailbox can send.
 *               Rate-limited per address and per day; a filled honeypot is
 *               answered as though it worked and stores nothing.
 *   status      session + workspaceAccess. Every meter: used, allowed, when it
 *               starts again. The Usage card and the board's meter strip.
 *   check       session + workspaceAccess. "May I make `need` more of this?"
 *               before a screen starts something long (the wizard's build).
 *               Answers the same refusal the making would.
 *   set_limits  install owner. Changes one plan's numbers.
 *   grant_plan  install owner. Gives a customer a plan by hand — how Custom is
 *               given — or takes a hand-given one away.
 *   grants      install owner. Who has a plan given by hand.
 *   enquiries   install owner. The Custom enquiries; `enquiry_done` marks one.
 *
 * The rules are lib/allowances.ts; the reads lib/allowanceStore.ts.
 */
import { addr, body, fail, json } from '../lib/http';
import { nowIso, userFromToken, workspaceAccess, type Env, type SessionUser } from '../lib/db';
import {
  INCLUDED, PLAN_KEYS, TRIAL_LIMITS, TRIAL_NAME, cleanLimit, effectivePlans, limitsFor, meterOf, applyOverrides, planDef, type MeterId,
} from '../lib/allowances';
import { check, loadOverrides, readAll, refusalBody } from '../lib/allowanceStore';
import { rateLimit } from '../lib/rateLimit';

interface Req {
  token?: string;
  action?: string;
  accountId?: string;
  meter?: string;
  need?: number;
  projectId?: string;
  planId?: string;
  limits?: Record<string, unknown>;
  /* grant_plan */
  email?: string;
  /* enquire */
  name?: string;
  company?: string;
  needs?: unknown;
  message?: string;
  url?: string;
  /* enquiry_done */
  id?: string;
}

const isOwner = (u: SessionUser) => u.accountId === null && u.role === 'agency';
const NEEDS = new Set(['limits', 'setup', 'integrations', 'invoice', 'other']);
const NEED_WORDS: Record<string, string> = {
  limits: 'Higher allowances', setup: 'Done-for-you setup', integrations: 'A custom integration', invoice: 'Invoiced billing', other: 'Something else',
};
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

async function table(env: Env) {
  const over = await loadOverrides(env);
  return {
    plans: effectivePlans(over),
    trial: { name: TRIAL_NAME, limits: applyOverrides(TRIAL_LIMITS, over.trial) },
    included: INCLUDED,
    changed: Object.keys(over),
  };
}

export async function handleAllowances(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const act = String(d.action ?? '');

  if (act === 'plans') return json({ success: true, ...(await table(env)) });

  if (act === 'enquire') {
    const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
    /* A field no person sees. Filled, it is a script; it is told "thanks". */
    if (String(d.url ?? '').trim()) return json({ success: true });
    const name = String(d.name ?? '').trim().slice(0, 120);
    const email = addr(String(d.email ?? '').trim().toLowerCase());
    const company = String(d.company ?? '').trim().slice(0, 160);
    const message = String(d.message ?? '').trim().slice(0, 3000);
    const needs = Array.isArray(d.needs) ? [...new Set(d.needs.map(String).filter(n => NEEDS.has(n)))] : [];
    if (!name) return fail('Your name, so we know who to reply to.', 200, { field: 'enquiry.name' });
    if (!email) return fail('An email address we can reply to.', 200, { field: 'enquiry.email' });
    if (message.length < 10) return fail('A sentence or two about what you need.', 200, { field: 'enquiry.message' });
    for (const [what, who, max, windowSeconds] of [['enquiry', ip, 3, 3600], ['enquiry-day', 'all', 100, 86_400]] as const) {
      const v = await rateLimit(env, { what, who, max, windowSeconds });
      if (!v.allowed) return fail('That is a lot of enquiries — try again a little later.', 429, { code: 'rate_limited' });
    }
    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO crm_enquiries (id, name, email, company, needs, message, created_at) VALUES (?,?,?,?,?,?,?)')
      .bind(id, name, email, company, JSON.stringify(needs), message, nowIso()).run();
    /* The owner hears about it by email when the install mailbox can send;
       either way it is on their Sign-ups & trials screen. */
    let emailed: 'sent' | 'failed' | 'skipped' = 'skipped';
    try {
      /* Loaded here: the mail sender brings a socket module that exists only
         on Workers, and the pure tests import this file under Node. */
      const { installMailbox } = await import('./auth');
      const { deliver, fromAddressOf } = await import('../lib/deliver');
      const owner = await env.DB.prepare("SELECT email FROM crm_users WHERE account_id IS NULL AND role = 'agency' LIMIT 1").first<{ email: string }>();
      const mb = owner ? await installMailbox(env) : null;
      if (owner && mb) {
        const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#17191c">
          <h2 style="font-size:19px">Custom plan enquiry from ${esc(name)}</h2>
          <p style="font-size:14px;line-height:1.6"><b>Email:</b> ${esc(email)}${company ? `<br><b>Company:</b> ${esc(company)}` : ''}${needs.length ? `<br><b>Wants:</b> ${needs.map(n => esc(NEED_WORDS[n])).join(', ')}` : ''}</p>
          <p style="font-size:14px;line-height:1.6;white-space:pre-wrap">${esc(message)}</p>
          <p style="font-size:13px;color:#6b7280">Reply to this address directly. It is also listed under Sign-ups &amp; trials → Plans &amp; allowances.</p></div>`;
        const sent = await deliver(mb, {
          fromName: mb.from.name || 'Protected Central', fromEmail: fromAddressOf(mb), to: owner.email,
          subject: `Custom plan enquiry — ${name}${company ? `, ${company}` : ''}`, html,
        });
        emailed = sent.ok ? 'sent' : 'failed';
      }
    } catch { emailed = 'failed'; }
    await env.DB.prepare('UPDATE crm_enquiries SET emailed = ? WHERE id = ?').bind(emailed, id).run().catch(() => null);
    return json({ success: true });
  }

  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this needs a current session.', 401, { code: 'unauthorised' });

  /* ── The install owner's ── */
  if (['set_limits', 'grant_plan', 'grants', 'enquiries', 'enquiry_done'].includes(act)) {
    if (!isOwner(user)) return fail('Only the owner of this installation can do that.', 403, { code: 'not_owner' });

    if (act === 'set_limits') {
      const planId = String(d.planId ?? '');
      if (!(PLAN_KEYS as string[]).includes(planId) && planId !== 'trial') return fail('Choose one of the plans.', 200, { field: 'plans.plan' });
      const stmts: D1PreparedStatement[] = [];
      for (const [k, raw] of Object.entries(d.limits ?? {})) {
        if (!meterOf(k)) return fail(`"${k}" is not something a plan counts.`);
        /* Blank puts the plan's own number back. */
        if (raw === '' || raw === null) {
          stmts.push(env.DB.prepare('DELETE FROM crm_plan_limits WHERE plan_id = ? AND meter = ?').bind(planId, k));
          continue;
        }
        const v = cleanLimit(raw);
        if (v === null) return fail(`${meterOf(k)!.label}: a whole number, or −1 for unlimited.`, 200, { field: `plans.${k}` });
        stmts.push(env.DB.prepare(
          `INSERT INTO crm_plan_limits (plan_id, meter, value, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(plan_id, meter) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        ).bind(planId, k as MeterId, v, nowIso(), user.email));
      }
      if (stmts.length) await env.DB.batch(stmts);
      return json({ success: true, ...(await table(env)) });
    }

    if (act === 'grant_plan') {
      const email = String(d.email ?? '').trim().toLowerCase();
      const planId = String(d.planId ?? '');
      const who = await env.DB.prepare("SELECT email FROM crm_users WHERE email = ? AND role = 'agency' AND account_id IS NOT NULL")
        .bind(email).first<{ email: string }>();
      if (!who) return fail('That address is not a customer here.', 200, { field: 'grant.email' });
      if (!planId) {
        /* Only a plan given by hand is taken back here; a paid one is the processor's. */
        await env.DB.prepare("DELETE FROM crm_plans WHERE owner_email = ? AND source = 'manual'").bind(email).run();
        return json({ success: true });
      }
      if (!planDef(planId)) return fail('Choose one of the plans.', 200, { field: 'grant.plan' });
      /* The sub-accounts it allows, stored on the row like a paid plan's. */
      const sub = limitsFor('plan', planId, await loadOverrides(env)).sub_accounts;
      await env.DB.prepare(
        `INSERT INTO crm_plans (owner_email, plan_id, resell_limit, source, updated_at) VALUES (?, ?, ?, 'manual', ?)
         ON CONFLICT(owner_email) DO UPDATE SET plan_id = excluded.plan_id, resell_limit = excluded.resell_limit,
           source = 'manual', updated_at = excluded.updated_at`,
      ).bind(email, planId, sub, nowIso()).run();
      return json({ success: true });
    }

    if (act === 'grants') {
      const { results } = await env.DB.prepare("SELECT owner_email AS email, plan_id AS planId, updated_at AS at FROM crm_plans WHERE source = 'manual' ORDER BY updated_at DESC LIMIT 200")
        .all<{ email: string; planId: string; at: string }>();
      return json({ success: true, grants: results ?? [] });
    }

    if (act === 'enquiries') {
      const { results } = await env.DB.prepare('SELECT id, name, email, company, needs, message, emailed, handled_at AS handledAt, created_at AS createdAt FROM crm_enquiries ORDER BY created_at DESC LIMIT 100')
        .all<Record<string, string>>().catch(() => ({ results: [] as Record<string, string>[] }));
      return json({ success: true, enquiries: (results ?? []).map(r => ({ ...r, needs: (() => { try { return JSON.parse(r.needs) as string[]; } catch { return []; } })() })) });
    }

    if (act === 'enquiry_done') {
      await env.DB.prepare('UPDATE crm_enquiries SET handled_at = ? WHERE id = ?').bind(nowIso(), String(d.id ?? '').slice(0, 80)).run();
      return json({ success: true });
    }
  }

  const accountId = String(d.accountId ?? '').trim();
  if (!/^[A-Za-z0-9_.\-]{1,64}$/.test(accountId)) return fail('A valid workspace is required.', 400, { code: 'no_workspace' });
  const access = await workspaceAccess(env.DB, user, accountId);
  if (!access.ok) return fail(access.message ?? 'That workspace is not yours.', 403, { code: access.code });

  if (act === 'status') return json({ success: true, allowances: await readAll(env, accountId) });

  if (act === 'check') {
    const meter = meterOf(String(d.meter ?? ''));
    if (!meter) return fail('Which allowance?');
    const need = Math.max(1, Math.min(10_000, Math.round(Number(d.need) || 1)));
    const projectId = String(d.projectId ?? '').slice(0, 80);
    if (projectId) {
      const own = await env.DB.prepare('SELECT 1 AS x FROM crm_projects WHERE id = ? AND account_id = ?').bind(projectId, accountId).first();
      if (!own) return fail('That project is not in this workspace.', 404, { code: 'not_found' });
    }
    const r = await check(env, accountId, meter.id, need, { projectId });
    if (r.ok) return json({ success: true, ok: true, left: r.left });
    /* Answered, not failed: the question was asked properly, and "no" is the answer. */
    return json({ success: true, ok: false, error: r.message, message: r.message, ...refusalBody(r) });
  }

  return fail(`"${act}" is not something this endpoint does.`);
}
