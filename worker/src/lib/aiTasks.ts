/**
 * Which AI model does which job — one table for the whole product.
 *
 * ── Why per module, and why by family rather than by id ──
 *
 * Until 2026-11 every AI call in the product, from a one-line support reply to
 * reading a thumbnail the customer likes, was asked of the newest Gemini Flash
 * Lite first. Lite is right for a waiting visitor and wrong for a picture or a
 * plan: it misread the owner's example thumbnails and its plans were thin.
 * So each module names a *task*, and each task names the model *families* that
 * do it best — on Gemini (lite / flash / pro, newest of each that the key can
 * use, from ListModels) and on OpenRouter's free list (family patterns,
 * because those ids change weekly). CLAUDE.md: never hard-code a model id.
 *
 * ── The free tiers decide the order as much as quality does ──
 *
 * Google's free tier gives each model its own daily allowance, and Pro's is
 * small. So Pro leads only where the answer is read by the customer as
 * judgement (a picture's design, a plan, a strategy); everything else leads
 * with Flash or Lite, and every chain ends in the others — a model at its
 * free limit for today is moved to the back (lib/aiUsage.ts `pastFreeLimit`),
 * and a 429 on one falls to the next model on the same key before the key
 * itself is rested.
 */

export type AiTask = 'chat' | 'converse' | 'write' | 'reason' | 'vision' | 'extract' | 'code' | 'research';
/*
 * `gemma`: Google's open Gemma models on the same key (gemma-4-26b-…-it,
 * gemma-4-31b-it). On the free tier each has 14,400 requests a day against
 * Flash's 20 and Flash-Lite's 500 (AI Studio's rate-limit table, 2026-11-11),
 * so they are every text task's last resort before OpenRouter. No JSON mode,
 * no system instruction and no Google Search on them (lib/ai.ts `forGemma`).
 */
export type GeminiTier = 'lite' | 'flash' | 'pro' | 'gemma';

export interface TaskProfile {
  label: string;
  /** Gemini tiers in the order tried (newest model of each). */
  gemini: GeminiTier[];
  /** OpenRouter free-model families, best first; anything else free after them. */
  openrouter: RegExp[];
  /** Allows code-specialised models (they are otherwise kept out of writing). */
  code?: boolean;
  why: string;
}

export const TASKS: Record<AiTask, TaskProfile> = {
  chat: {
    label: 'Quick replies',
    gemini: ['lite', 'flash', 'gemma'],
    openrouter: [/gemma-4/i, /llama-4/i, /mistral-small/i, /qwen3/i],
    why: 'A person is waiting: the fastest model that writes a good sentence. Lite has the largest free daily allowance.',
  },
  converse: {
    label: 'Advice in conversation',
    gemini: ['pro', 'flash', 'lite', 'gemma'],
    openrouter: [/llama-4-maverick|llama-3\.3-70b/i, /deepseek-(v3|chat)/i, /qwen3.*(235|max)/i, /gemma-4-31b|gemma-4/i, /mistral-(medium|large)/i],
    why: 'Somebody deciding whether to trust the business, in their own words: the model that understands and advises best. Pro first, then Flash; the chat already paces its replies like a person, so the extra second is not felt.',
  },
  write: {
    label: 'Marketing writing',
    gemini: ['flash', 'lite', 'gemma'],
    openrouter: [/gemma-4-31b|gemma-4/i, /llama-4-maverick|llama-3\.3-70b|llama-4/i, /mistral-(medium|large)/i, /deepseek-(v3|chat)/i, /qwen3/i],
    why: 'Copy a customer publishes: Flash writes noticeably better than Lite and still has a generous free allowance.',
  },
  reason: {
    label: 'Planning & judgement',
    gemini: ['pro', 'flash', 'lite', 'gemma'],
    openrouter: [/deepseek-r1|deepseek.*reason/i, /qwen3.*(235|thinking|max)/i, /nemotron.*(ultra|super)/i, /kimi/i, /gpt-oss/i, /llama-4-maverick/i],
    why: 'Plans, strategy and scoring are judgement: Pro first while its small free allowance lasts, then Flash.',
  },
  vision: {
    label: 'Reading pictures',
    gemini: ['pro', 'flash', 'lite', 'gemma'],
    openrouter: [/gemma-4/i, /llama-4/i, /qwen.*vl/i, /mistral-small-3/i, /nemotron.*vl/i],
    why: 'Design and layout in a picture: Pro reads composition far better; Flash after its free allowance.',
  },
  extract: {
    label: 'Sorting & extracting',
    gemini: ['lite', 'flash', 'gemma'],
    openrouter: [/mistral-small/i, /gemma-4/i, /llama-4-scout/i, /qwen3/i],
    why: 'Short structured answers (moderation, fields from text): the cheapest fast model is as accurate here.',
  },
  code: {
    label: 'Pages & code',
    gemini: ['flash', 'pro', 'lite', 'gemma'],
    openrouter: [/qwen3-coder|qwen.*coder/i, /deepseek/i, /kimi/i, /gpt-oss/i],
    code: true,
    why: 'Website and email HTML: Flash is accurate with markup; coder models on OpenRouter.',
  },
  research: {
    label: 'Web research',
    gemini: ['flash', 'lite'],
    openrouter: [],
    why: 'Grounded in Google Search, which only Gemini offers; Flash summarises sources faithfully.',
  },
};

/**
 * The product's modules and the task each is. Server routes and the browser
 * (`module` on /api/ai.php) name a module; usage is counted per module so the
 * owner sees where the AI goes (Platform services → AI & cloud usage).
 */
export const MODULES: Record<string, { label: string; task: AiTask }> = {
  'support-chat': { label: 'Support chat assistant', task: 'chat' },
  /* The owner's own help button (houseKnowledge.ts): few conversations, each a
     possible customer, so it gets the stronger tier a customer's widget does not. */
  'house-support': { label: 'Help button — Protected Central’s own support', task: 'converse' },
  'forms': { label: 'Form follow-ups', task: 'chat' },
  'booking': { label: 'Booking page', task: 'chat' },
  'inbox-replies': { label: 'Inbox & email replies', task: 'write' },
  'email-marketing': { label: 'Email marketing', task: 'write' },
  'social': { label: 'Social posts & calendar', task: 'write' },
  'graphics': { label: 'Graphics Designer copy', task: 'write' },
  'blog': { label: 'Blog writing', task: 'write' },
  'seo': { label: 'SEO profile', task: 'write' },
  'writing': { label: 'Improve my text', task: 'write' },
  'reputation': { label: 'Review replies', task: 'write' },
  'commerce': { label: 'Shop product ideas', task: 'write' },
  'video': { label: 'Video Studio words', task: 'write' },
  'video-analysis': { label: 'Video Studio — finding Shorts', task: 'reason' },
  'thumbnails': { label: 'Thumbnail example reading', task: 'vision' },
  'mailbox-reading': { label: 'Mail settings from a screenshot', task: 'vision' },
  'autopilot': { label: 'AI Autopilot writing', task: 'write' },
  'autopilot-plan': { label: 'AI Autopilot planning', task: 'reason' },
  'autopilot-research': { label: 'AI Autopilot research', task: 'research' },
  'business-wizard': { label: 'Business workspace wizard', task: 'reason' },
  /* Protron, the in-app assistant (src/services/protron): somebody is waiting
     on every turn, and the answer is a short sentence plus an action from a
     fixed list — Flash is fast and follows the JSON shape reliably. The
     onboarding's written instruction is a plan the customer approves, so it
     gets the planning tier. */
  'protron': { label: 'Protron — AI business manager', task: 'write' },
  /* `write`, not `reason` (2026-11-12): on the free keys Pro refuses and the
     reasoning chain's walk outlasted the page's 120 s wait, so the customer got
     the offline draft of a live conversation. Flash writes this well. */
  'protron-plan': { label: 'Protron — business workspace instruction', task: 'write' },
  'protron-voice': { label: 'Protron — spoken replies', task: 'chat' },
  'strategy': { label: 'Marketing strategy & plans', task: 'reason' },
  'workflows': { label: 'Workflow builder', task: 'reason' },
  'pipeline': { label: 'Sales pipeline AI', task: 'reason' },
  'prospecting': { label: 'AI Prospecting research', task: 'reason' },
  'moderation': { label: 'Content checks', task: 'extract' },
  'projects': { label: 'Project details', task: 'extract' },
  'website-builder': { label: 'Website builder', task: 'code' },
  'general': { label: 'Other', task: 'write' },
};

export const moduleOf = (m: unknown): string => (typeof m === 'string' && Object.prototype.hasOwnProperty.call(MODULES, m) ? m : 'general');
export const taskOf = (m: unknown): AiTask => MODULES[moduleOf(m)].task;

/** One Gemini id's family, from its name: version, tier, preview — or null for anything else (embeddings, image, tts…). */
export function geminiFamily(name: string): { version: number; tier: GeminiTier; preview: boolean; pinned: boolean } | null {
  const bare = name.replace(/^models\//, '');
  /* Gemma: gemma-4-26b-a4b-it, gemma-4-31b-it — the larger model first within a version. */
  const g = /^gemma-(\d+(?:\.\d+)?)-(\d+)b(?:-a\d+b)?-it$/.exec(bare);
  if (g) return { version: parseFloat(g[1]) + Number(g[2]) / 10_000, tier: 'gemma', pinned: false, preview: false };
  const m = /^gemini-(\d+(?:\.\d+)?)-(flash-lite|flash|pro)(-\d{3})?(-preview(?:-[\w-]+)?)?$/.exec(bare);
  if (!m) return null;
  return { version: parseFloat(m[1]), tier: m[2] === 'flash-lite' ? 'lite' : (m[2] as GeminiTier), pinned: !!m[3], preview: !!m[4] };
}

/** Which tier a model id is, `-latest` aliases included. */
export function tierOf(model: string): GeminiTier {
  if (/^gemma-/i.test(model)) return 'gemma';
  if (/flash-lite/i.test(model)) return 'lite';
  if (/pro/i.test(model)) return 'pro';
  return 'flash';
}

/**
 * The key's models for a task: the newest stable model of each tier in the
 * task's order (a preview only when a tier has no stable one), then the
 * `-latest` aliases as a last resort. From the key's own list — so a model
 * Google retires drops out and a new one is taken without a release.
 */
export function chainFor(names: string[], task: AiTask): string[] {
  const parsed = names.map(n => n.replace(/^models\//, '')).map(n => ({ n, f: geminiFamily(n) }))
    .filter((x): x is { n: string; f: NonNullable<ReturnType<typeof geminiFamily>> } => !!x.f && !x.f.pinned);
  const out: string[] = [];
  const older: string[] = [];
  const gemma: string[] = [];
  for (const tier of TASKS[task].gemini) {
    const ofTier = parsed.filter(x => x.f.tier === tier);
    const stable = ofTier.filter(x => !x.f.preview);
    const pool = (stable.length ? stable : ofTier).sort((a, b) => b.f.version - a.f.version);
    if (tier === 'gemma') { gemma.push(...pool.slice(0, 2).map(x => x.n)); continue; }
    if (pool[0]) out.push(pool[0].n);
    /* Two older versions of the tier after every tier's newest: on the free
       tier every model has its own daily allowance (Flash-Lite 3.5 and 3.1
       have 500 each), so an older version is more capacity — tried after the
       newest of each tier, never before. lib/aiUsage.ts freeFirst then orders
       by what the key actually answers. */
    older.push(...pool.slice(1, 3).map(x => x.n));
  }
  out.push(...older);
  /* Gemma last of the key's own models: the largest free allowance, the reserve. */
  out.push(...gemma);
  const alias: Partial<Record<GeminiTier, string>> = { lite: 'gemini-flash-lite-latest', flash: 'gemini-flash-latest' };
  /* The aliases before Gemma: a Flash alias is a better writer, and Gemma's
     large allowance is the reserve, not the first choice. */
  const firstGemma = out.findIndex(n => /^gemma-/.test(n));
  const aliases = TASKS[task].gemini.map(t => alias[t]).filter((a): a is string => !!a && !out.includes(a));
  if (firstGemma < 0) out.push(...aliases); else out.splice(firstGemma, 0, ...aliases);
  return out;
}

/** OpenRouter free models ranked for a task: its families first, in order. */
export function orRank(task: AiTask, id: string): number {
  const fam = TASKS[task].openrouter;
  const i = fam.findIndex(r => r.test(id));
  return i < 0 ? fam.length : i;
}

/** What an AI part list is, when the caller did not say: a picture is vision. */
export function guessTask(parts: unknown[]): AiTask {
  return parts.some(p => !!p && typeof p === 'object' && 'inlineData' in (p as object) && /^image\//.test(String((p as { inlineData?: { mimeType?: string } }).inlineData?.mimeType ?? ''))) ? 'vision' : 'write';
}
