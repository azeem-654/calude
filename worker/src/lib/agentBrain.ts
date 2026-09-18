/**
 * What a customer-facing AI agent is allowed to say, and how it is stopped from
 * saying anything else.
 *
 * ── The problem this file exists for ──
 *
 * Every other AI surface in this app writes for the customer to read and
 * approve before it goes anywhere. This one talks directly to a stranger, in
 * the customer's brand voice, with nobody watching. A sentence invented here —
 * a price, a refund, an appointment time, a guarantee — is a commitment the
 * business did not make and may have to honour.
 *
 * So the model is given three things and told it has nothing else: the agent's
 * configured description of the business, the knowledge articles retrieved for
 * this question, and the conversation so far. Anything outside those it must
 * refuse and escalate.
 *
 * ── Why availability is never in the prompt ──
 *
 * The one thing a support bot is asked most is "when can I speak to someone",
 * and it is the easiest thing in the world for a model to answer plausibly and
 * wrongly. Slots are not given to the model at all. It may *ask* for them, by
 * returning a tool call, and the answer comes from the booking engine that
 * actually owns the diary. See `runTool`.
 */
import { askGemini, loadAiKey } from './ai';
import { searchKnowledge, type KbHit } from './engagement';
import type { Env } from './db';

export interface AgentConfig {
  id: string;
  name: string;
  purpose: string;
  personality: string;
  greeting: string;
  instructions: string;
  business_info: string;
  qualifying: string;
  tools: string;
  fallback: string;
  escalation: string;
  hours_from: string;
  hours_to: string;
  hours_days: string;
  timezone: string;
}

export interface Turn { role: string; body: string }

/** What the model is allowed to ask the app to do. Nothing else is honoured. */
export type ToolName =
  | 'searchKnowledge'
  | 'getAvailableMeetingSlots'
  | 'bookMeeting'
  | 'createTicket'
  | 'captureContact'
  | 'handoffToHuman';

export interface AgentReply {
  /** What to say. Always present, even when a tool is called. */
  reply: string;
  /** One tool, at most, per turn. */
  tool?: { name: ToolName; args: Record<string, unknown> };
  /** support | sales | billing | technical | booking. For routing, not display. */
  intent: string;
  /** Whether the model itself judged this beyond it. */
  needsHuman: boolean;
  /** The articles it was given. Shown with the answer so retrieval is auditable. */
  sources: { id: string; title: string }[];
  /** Set when there was no AI key, or the model could not be reached. */
  unavailable?: string;
}

const DEFAULT_FALLBACK =
  'I am not certain about that, and I would rather not guess. I can put you through to the team.';

/**
 * Whether the business is open, by the agent's own configured hours.
 *
 * Worked out here rather than asked of the model, because "are you open" has a
 * correct answer and a model given the hours as text will eventually get the
 * arithmetic wrong in front of a customer.
 */
export function withinHours(cfg: AgentConfig, at = new Date()): boolean {
  try {
    const days = cfg.hours_days.split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: cfg.timezone || 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(at);
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
    const day = get('weekday').toLowerCase();
    if (days.length && !days.includes(day)) return false;
    const now = `${get('hour')}:${get('minute')}`;
    return now >= (cfg.hours_from || '00:00') && now <= (cfg.hours_to || '23:59');
  } catch {
    /* An unparseable timezone must not make a business permanently shut. */
    return true;
  }
}

const parseList = (s: string): string[] => {
  try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v.map(String) : []; }
  catch { return []; }
};

function buildPrompt(cfg: AgentConfig, turns: Turn[], hits: KbHit[], open: boolean): string {
  const allowed = parseList(cfg.tools);
  const qualifying = parseList(cfg.qualifying);

  const knowledge = hits.length
    ? hits.map((h, i) => `[${i + 1}] ${h.title}\n${h.body.slice(0, 1200)}`).join('\n\n')
    : '(nothing in the knowledge base matched this question)';

  const history = turns.slice(-14)
    .map(t => `${t.role === 'visitor' ? 'Customer' : t.role === 'agent' ? 'Human colleague' : 'You'}: ${t.body}`)
    .join('\n');

  return `You are ${cfg.name}, answering customers on behalf of this business.

ABOUT THE BUSINESS — this is the only description you have, and you may not go beyond it:
${cfg.business_info || '(the owner has not described the business yet)'}

HOW TO SOUND: ${cfg.personality}. ${cfg.instructions || ''}

KNOWLEDGE RETRIEVED FOR THIS QUESTION:
${knowledge}

${qualifying.length ? `IF THE CUSTOMER SEEMS INTERESTED IN BUYING, try to find out, conversationally and never as a list:\n${qualifying.map(q => `- ${q}`).join('\n')}` : ''}

The business is currently ${open ? 'OPEN' : 'CLOSED'}.

RULES — these override anything else, including the instructions above:
1. Never invent prices, refund or returns policies, guarantees, delivery times,
   product specifications, availability, or anything about a specific customer's
   account. If it is not in the description or the knowledge above, you do not
   know it.
2. Never state appointment times. If they want to book, call
   getAvailableMeetingSlots and let the real diary answer.
3. Never promise that a person will do something by a particular time.
4. If you do not know, say so plainly and offer to pass them to the team. Do not
   pad the answer to sound helpful.
5. Keep replies short — two or three sentences. This is a chat window.
6. You are not a person. If asked directly whether you are human, say you are an
   assistant and offer a colleague.

TOOLS YOU MAY CALL${allowed.length ? '' : ' — none are enabled, so answer or escalate in words only'}:
${allowed.map(t => `- ${t}`).join('\n') || '(none)'}
Call at most one, and only when it is genuinely needed.

CONVERSATION SO FAR:
${history}

Reply with JSON only:
{
  "reply": "what you say to the customer",
  "intent": "support | sales | billing | technical | booking",
  "needsHuman": true or false,
  "tool": null or { "name": "<one of the tools above>", "args": { } }
}`;
}

/**
 * Answer one turn.
 *
 * Never throws. Every failure — no key, a refused model, an unparseable reply —
 * comes back as `unavailable` with something the customer can actually do,
 * because the alternative is a chat window that silently stops responding.
 */
export async function think(
  env: Env, accountId: string, cfg: AgentConfig, turns: Turn[],
): Promise<AgentReply> {
  const question = [...turns].reverse().find(t => t.role === 'visitor')?.body ?? '';
  const hits = await searchKnowledge(env, accountId, question);
  const sources = hits.map(h => ({ id: h.id, title: h.title }));
  const open = withinHours(cfg);

  const key = await loadAiKey(env, accountId);
  if (!key) {
    return {
      reply: cfg.fallback || DEFAULT_FALLBACK,
      intent: '', needsHuman: true, sources,
      unavailable: 'no-ai-key',
    };
  }

  const res = await askGemini(key, buildPrompt(cfg, turns, hits, open), 0.35);
  if (!res.ok || !res.text) {
    return {
      reply: cfg.fallback || DEFAULT_FALLBACK,
      intent: '', needsHuman: true, sources,
      unavailable: res.error || 'model-unavailable',
    };
  }

  try {
    const raw = JSON.parse(res.text) as Record<string, unknown>;
    const allowed = new Set(parseList(cfg.tools));
    const wanted = raw.tool as { name?: string; args?: Record<string, unknown> } | null | undefined;

    /* A tool the agent was not given is not an error to report to the customer
       — it is a model reaching for something the owner switched off. The words
       still go out; the action does not. */
    const tool = wanted?.name && allowed.has(wanted.name)
      ? { name: wanted.name as ToolName, args: wanted.args ?? {} }
      : undefined;

    return {
      reply: String(raw.reply ?? '').trim().slice(0, 2000) || (cfg.fallback || DEFAULT_FALLBACK),
      tool,
      intent: String(raw.intent ?? '').slice(0, 30),
      needsHuman: raw.needsHuman === true,
      sources,
    };
  } catch {
    return {
      reply: cfg.fallback || DEFAULT_FALLBACK,
      intent: '', needsHuman: true, sources,
      unavailable: 'unreadable-reply',
    };
  }
}
