/**
 * Writing marketing copy, from the server, on the workspace's own key.
 *
 * ── Why this route exists ──
 *
 * The Email campaigns module said "Your AI-generated campaign flow" and
 * "AI-generated · Review before launch" over copy assembled from string
 * templates. There was no AI call anywhere in it. The result read exactly like
 * what it was — `<li>✅ <strong>Benefit 1</strong> — [describe key value]</li>`
 * — and a customer reasonably concluded the AI was useless, when in fact it had
 * never been asked.
 *
 * The automation builder did make a call, which was worse: to Anthropic's API,
 * from the browser, with a key read from a localStorage entry nothing in the
 * app ever writes. Always empty, so always the same canned fallback — and a
 * third-party call from the bundle, which this codebase does not do, because a
 * key that reaches the browser is a key that has left your control.
 *
 * So: one place, on the server, using the same Gemini key Settings → AI Engine
 * already stores encrypted, with the same prompt discipline Autopilot's writers
 * use — no invented facts, no placeholder brackets, no "just circling back".
 *
 * ── What it refuses to do ──
 *
 * With no key it says so and returns nothing. It does not quietly hand back a
 * template and let the screen call it AI; the screen offers the template as a
 * template, under its own name, and the customer chooses it knowingly.
 */
import { body, fail, json } from '../lib/http';
import { canAccess, dataGet, userFromToken, type Env } from '../lib/db';
import { askGemini, loadAiKey } from '../lib/ai';
import {
  writeCampaign, writeSequence, writeAutomation,
  AUTOMATION_NODE_TYPES, type Brand,
} from '../lib/autopilotWrite';

interface Req {
  token?: string;
  accountId?: string;
  action?: string;
  /** Which portfolio's voice to write in. Falls back to the workspace's own. */
  portfolioId?: string;
  goal?: string;
  concept?: string;
  cta?: string;
  tone?: string;
  channel?: string;
  steps?: number;
  prompt?: string;
  bookingUrl?: string;
  /** For 'rewrite': the one email being worked on. */
  subject?: string;
  html?: string;
  instruction?: string;
}

const ONBOARDING_KEY = 'crm_onboarding';

function parse<T>(raw: string, fallback: T): T {
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

/**
 * Whose voice to write in.
 *
 * A portfolio when one is named — an agency writing for a client must sound
 * like the client, not like the agency — and the workspace's own onboarding
 * answers otherwise. Same resolution order as the Autopilot tick, deliberately:
 * copy written from the board and copy written from the wizard should not read
 * as two different companies.
 */
async function brandFor(env: Env, accountId: string, portfolioId: string, objective: string): Promise<Brand> {
  let ob: Record<string, string> = {};
  if (portfolioId) {
    const row = await env.DB.prepare('SELECT profile FROM crm_portfolios WHERE id = ? AND account_id = ?')
      .bind(portfolioId, accountId).first<{ profile: string }>();
    ob = parse<Record<string, string>>(row?.profile ?? '', {});
  }
  if (!ob.companyName) {
    ob = { ...parse<Record<string, string>>((await dataGet(env.DB, accountId, ONBOARDING_KEY)) ?? "", {}), ...ob };
  }
  return {
    companyName: ob.companyName ?? ob.businessName ?? '',
    industry: ob.industry ?? '',
    description: ob.description ?? ob.whatYouDo ?? '',
    products: ob.products ?? ob.services ?? '',
    audience: ob.audience ?? ob.idealCustomer ?? '',
    tone: ob.brandVoice ?? ob.tone ?? '',
    website: ob.website ?? '',
    objective,
  };
}

/**
 * Is there enough here to write from?
 *
 * A model given a company name and nothing else writes generic marketing copy
 * that could be about anybody, which is the thing the customer complained
 * about. Saying so before spending a call is more use than returning six
 * paragraphs of nothing.
 */
function thinBrand(b: Brand): string {
  const known = [b.description, b.products, b.audience, b.industry].filter(s => s.trim()).length;
  if (b.companyName.trim() && known >= 1) return '';
  return 'There is almost nothing on file about this business, so anything written from it would be generic. Fill in what you do and who buys it — under Settings, or on the client’s portfolio in AI Autopilot — and it will write from that.';
}

/**
 * A booking link we are willing to put in somebody's outgoing mail.
 *
 * The caller names it, and the caller is a browser — so this refuses anything
 * that is not a /book/ address on this deployment. Passing a URL straight
 * through would let a crafted request have the app write somebody else's
 * domain into a real customer's campaign, under the customer's own from
 * address. Empty means "no link", which the prompt handles explicitly.
 */
function safeBookingUrl(req: Request, raw: string): string {
  const given = raw.trim();
  if (!given) return '';
  try {
    const u = new URL(given);
    const here = new URL(req.url);
    if (u.origin !== here.origin) return '';
    if (!/^\/[A-Za-z0-9/_-]*\/?book\//.test(u.pathname) && !u.pathname.startsWith('/book/')) return '';
    return u.toString();
  } catch { return ''; }
}

export async function handleAiWrite(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });

  const accountId = String(d.accountId ?? '').trim();
  if (!/^[A-Za-z0-9_.\-]{1,64}$/.test(accountId)) return fail('A valid workspace is required.');
  if (!(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours.', 403);

  const key = await loadAiKey(env, accountId);
  if (!key) {
    return fail(
      'No AI key is connected to this workspace, so nothing can be written. Add one under Settings → AI Engine.',
      200, { needsKey: true },
    );
  }

  const act = d.action ?? 'campaign';
  const brand = await brandFor(env, accountId, String(d.portfolioId ?? ''), String(d.concept ?? ''));

  if (act === 'campaign' || act === 'sequence') {
    const thin = thinBrand(brand);
    /* Refused for a sequence, which has nothing but the brand to go on.
       A campaign carries the customer's own brief, which is usually the more
       specific half anyway — so a thin brand is a warning there, not a stop. */
    if (thin && act === 'sequence') return fail(thin, 200, { needsProfile: true });

    if (act === 'sequence') {
      const r = await writeSequence(key, brand);
      if (!r.ok || !r.value) return fail(r.error || 'The AI could not write that.');
      return json({
        success: true,
        name: r.value.name,
        steps: r.value.steps.map(s => ({ ...s, preheader: '', purpose: '' })),
      });
    }

    const channel = d.channel === 'sms' ? 'sms' : 'email';
    const r = await writeCampaign(key, brand, {
      goal: String(d.goal ?? 'custom'),
      concept: String(d.concept ?? '').slice(0, 4000),
      cta: String(d.cta ?? '').slice(0, 200),
      tone: String(d.tone ?? '').slice(0, 80),
      channel,
      steps: Number(d.steps) || 3,
      /* Only an address on this deployment. A booking link is put in a real
         customer's email, and a caller-supplied URL would be an open redirect
         with our reputation on it. */
      bookingUrl: safeBookingUrl(req, String(d.bookingUrl ?? '')),
    });
    if (!r.ok || !r.value) return fail(r.error || 'The AI could not write that.');

    const steps = (r.value.steps ?? []).map(s => ({
      day: Number.isFinite(Number(s.day)) ? Number(s.day) : 0,
      subject: String(s.subject ?? '').slice(0, 200),
      preheader: String(s.preheader ?? '').slice(0, 200),
      body: String(s.body ?? ''),
      purpose: String(s.purpose ?? '').slice(0, 200),
    })).filter(s => s.body.trim());
    if (!steps.length) return fail('The AI answered with no usable emails. Try again, or add more detail to the brief.');

    /* Said, not hidden. Copy written from a near-empty profile is generic, and
       the customer should know that is why rather than blaming the model. */
    return json({ success: true, steps, thin });
  }

  if (act === 'automation') {
    const prompt = String(d.prompt ?? '').trim();
    if (prompt.length < 8) return fail('Say what the automation should do — a sentence is enough.');

    const r = await writeAutomation(key, brand, prompt.slice(0, 2000));
    if (!r.ok || !r.value) return fail(r.error || 'The AI could not build that.');

    const allowed = new Set<string>(AUTOMATION_NODE_TYPES);
    const nodes = (r.value.nodes ?? [])
      /* A type the canvas cannot render is a node that silently does nothing
         when the automation runs, which is worse than a shorter automation. */
      .filter(n => allowed.has(String(n.type)))
      .map(n => ({
        type: String(n.type),
        label: String(n.label ?? '').slice(0, 120),
        config: Object.fromEntries(
          Object.entries(n.config ?? {}).slice(0, 12).map(([k, v]) => [String(k).slice(0, 40), String(v).slice(0, 500)]),
        ) as Record<string, string>,
      }));
    if (nodes.length < 2) return fail('The AI answered with nothing runnable. Try describing it differently.');

    return json({ success: true, name: String(r.value.name ?? '').slice(0, 120), nodes });
  }

  /* ── Rewriting one email that already exists ── */
  if (act === 'rewrite') {
    const html = String(d.html ?? '').trim();
    if (!html) return fail('There is nothing written yet to rewrite.');
    const instruction = String(d.instruction ?? '').trim() || 'Make it shorter and more direct.';

    const r = await askGemini(key, `Rewrite one marketing email for this business.

=== THE BUSINESS ===
Company: ${brand.companyName || '(unnamed)'}
What they do: ${brand.description || '(unstated)'}
Who buys it: ${brand.audience || '(unstated)'}
Tone of voice: ${brand.tone || 'plain, warm, no jargon'}

=== WHAT TO CHANGE ===
${instruction}

=== THE EMAIL AS IT STANDS ===
Subject: ${String(d.subject ?? '')}
${html.slice(0, 8000)}

Rules:
- Change what was asked and leave the rest alone. This is an edit, not a fresh draft.
- Do NOT invent facts about the business — no awards, no years in business, no statistics, no prices, no client names — unless they are already in the email above.
- Never write a placeholder in brackets. If a specific is missing, write around it.
- Plain HTML only: <p>, <strong>, <em>, <ul>, <li>, <a>. No <style>, no tables, no inline CSS.
- {{firstName}} is the only merge tag.

Return ONLY valid JSON, no fences:
{"subject":"","body":""}`, 0.6);

    if (!r.ok) return fail(r.error);
    const out = parse<{ subject?: string; body?: string }>(r.text, {});
    if (!out.body) return fail('The AI answered with something unusable. Try again.');
    return json({
      success: true,
      subject: String(out.subject ?? d.subject ?? '').slice(0, 200),
      body: String(out.body),
    });
  }

  return fail(`"${act}" is not something this endpoint writes.`);
}
