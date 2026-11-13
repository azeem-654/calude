/**
 * Every tool that spends an AI or AI-adjacent key, and every file that calls
 * one — the list the owner's AI health monitor reads (lib/aiHealth.ts) and
 * the list `npm run test:ai-keys` holds the code to.
 *
 * ── Why a list, and why it is checked against the code ──
 *
 * The AppSumo reviewer was told "Protected Central AI, included" and then
 * "Searching the web needs a Google AI key". Web research needed a different
 * key from writing, nobody had written that down, and nothing told the owner
 * which tool was about to fail for want of what. Audit F-3 found the other
 * half: eight paths spending the operator's key without asking `aiBudget()`.
 * Both are the same gap — a new caller nobody listed — so the scan in
 * test/aiTools.test.mts fails when a file in worker/src calls an AI provider
 * without an entry in `AI_CALLERS`, or without the gate the entry names.
 *
 * Pure: no imports, so the browser, the test and the cron can all read it.
 * Nothing here is a key; `key` names *which* key a tool needs, and the
 * monitor answers only whether one is configured.
 *
 * There is no image-generation tool: social pictures are composed, not
 * generated (lib/projectAgents.ts designFromPost), and none is claimed.
 */

/** Which key a tool needs. The monitor checks each of these, by kind. */
export type KeyNeed =
  /** The operator's AI pool: any Google AI key or OpenRouter key (lib/aiPool.ts). */
  | 'pool'
  /** A Google AI key specifically — OpenRouter cannot do this kind of work. */
  | 'google'
  /** Web research: Google's search grounding, or OpenRouter's web plugin with credit. */
  | 'search'
  /** The install's Google Maps (Places API) key (lib/googlePlaces.ts). */
  | 'places'
  /** The Worker's Workers AI binding (`env.AI`, wrangler.jsonc). */
  | 'workers_ai';

export interface AiTool {
  id: string;
  name: string;
  /** Who is called, in the owner's words. */
  provider: string;
  key: KeyNeed;
  /** Where the owner sets that key. */
  keyWhere: string;
  /** What a customer loses when it is not working. */
  powers: string;
  /**
   * `crm_ai_usage.module` values counted under this tool (lib/aiUsage.ts).
   * The text tool takes every module no other tool names (`toolForModule`).
   */
  modules: string[];
  /** Customers have a stated fallback, so a missing key is shown but not mailed. */
  optional?: boolean;
}

export const AI_TOOLS: AiTool[] = [
  {
    id: 'text', name: 'AI writing and chat',
    provider: 'Google Gemini or OpenRouter — the operator\'s AI pool',
    key: 'pool', keyWhere: 'Settings → Platform services → AI keys',
    powers: 'AI Autopilot writing and planning, inbox replies, the chat widget, the wizard, review replies, Protron, everything typed in the browser',
    modules: [],
  },
  {
    id: 'search', name: 'Web research (search grounding)',
    provider: 'Google Gemini with Google Search grounding, or OpenRouter\'s web plugin (billed per search, needs credit)',
    key: 'search', keyWhere: 'Settings → Platform services → AI keys (a Google AI key, or an OpenRouter key with credit)',
    powers: 'AI Autopilot steps that write from this week\'s web results (the weekly SEO blog). Without it they write from the business profile and say so',
    modules: ['autopilot-research'],
  },
  {
    id: 'vision', name: 'Reading pictures and PDFs',
    provider: 'Google Gemini, or OpenRouter\'s free vision models',
    key: 'pool', keyWhere: 'Settings → Platform services → AI keys',
    powers: 'Mail settings from a screenshot, thumbnail examples, documents in the wizard',
    modules: ['thumbnails', 'mailbox-reading'],
  },
  {
    id: 'video_watch', name: 'Watching recordings',
    provider: 'Google Gemini (Files API) — OpenRouter cannot take a video',
    key: 'google', keyWhere: 'Settings → Platform services → AI keys (a Google AI key)',
    powers: 'Quick Shorts and AI Video Studio finding moments in an upload',
    modules: [],
  },
  {
    id: 'live_voice', name: 'Live voice conversation',
    provider: 'Google Gemini Live (speech to speech)',
    key: 'google', keyWhere: 'Settings → Platform services → AI keys (a Google AI key)',
    powers: 'Talking to the wizard and Protron out loud. Without it customers type their answers',
    modules: ['protron-live'], optional: true,
  },
  {
    id: 'speech', name: 'Spoken replies',
    provider: 'Google Gemini text-to-speech models',
    key: 'google', keyWhere: 'Settings → Platform services → AI keys (a Google AI key)',
    powers: 'Protron\'s own voice. Without it Protron uses the browser\'s voice',
    modules: ['protron-voice'], optional: true,
  },
  {
    id: 'transcription', name: 'Transcribing recordings',
    provider: 'Cloudflare Workers AI (Whisper)',
    key: 'workers_ai', keyWhere: 'wrangler.jsonc → the "ai" binding (no key; Cloudflare bills Workers AI neurons)',
    powers: 'AI Video Studio captions, cuts and Shorts — every recording is transcribed first',
    modules: [],
  },
  {
    id: 'places', name: 'Google Maps (Places API)',
    provider: 'Google Maps Platform — Places API (New)',
    key: 'places', keyWhere: 'Settings → Platform services → Google Maps',
    powers: 'Prospect search and Google reviews for every customer without their own key',
    modules: [],
  },
];

export const toolById = (id: string): AiTool | undefined => AI_TOOLS.find(t => t.id === id);

/** The tool a usage row's module is counted under; anything unnamed is writing. */
export function toolForModule(module: string): string {
  return AI_TOOLS.find(t => t.modules.includes(module))?.id ?? 'text';
}

/**
 * How a file that calls an AI provider is kept inside the customer's budget.
 *
 * - `aiBudget`: it calls `aiBudget(env, …)` before the key is spent (and
 *   holds and reports when refused) — the rule for every server path.
 * - `inline`: it applies the same three gates itself (the owner's caps,
 *   an ended trial, the plan's monthly AI requests), because it streams or
 *   counts only on an answer (routes/ai.ts, routes/protron.ts).
 * - `caller`: it is handed a key by the files in `from`, which do the gate.
 * - `provider`: it *is* the client (lib/ai.ts, lib/openrouter.ts).
 * - `exempt`: it spends nothing of a customer's allowance, for the reason in
 *   `why` — the owner testing their own keys, a public page rate-limited by
 *   connection, the operator's own moderation, a separate meter.
 */
export type Gate = 'aiBudget' | 'inline' | 'caller' | 'provider' | 'exempt';

export interface AiCaller { tools: string[]; gate: Gate; why?: string; from?: string[] }

/** Paths relative to worker/src. */
export const AI_CALLERS: Record<string, AiCaller> = {
  'lib/ai.ts': { tools: ['text', 'search', 'vision', 'video_watch'], gate: 'provider' },
  'lib/openrouter.ts': { tools: ['text', 'search', 'vision'], gate: 'provider' },

  'autopilotTick.ts': { tools: ['text'], gate: 'aiBudget' },
  'engageDispatch.ts': { tools: ['text'], gate: 'aiBudget' },
  'replyTick.ts': { tools: ['text'], gate: 'aiBudget' },
  'lib/agentBrain.ts': { tools: ['text'], gate: 'aiBudget' },
  'lib/projectAgents.ts': { tools: ['text', 'search'], gate: 'aiBudget' },
  'lib/projectPipeline.ts': { tools: ['text'], gate: 'aiBudget' },
  'lib/prospectResearch.ts': { tools: ['text'], gate: 'aiBudget' },
  'lib/reputation.ts': { tools: ['text'], gate: 'aiBudget' },
  'lib/video/pipeline.ts': { tools: ['text'], gate: 'aiBudget' },
  'lib/video/thumbStyle.ts': { tools: ['vision'], gate: 'aiBudget' },
  'routes/aiwrite.ts': { tools: ['text'], gate: 'aiBudget' },
  'routes/autopilot.ts': { tools: ['text'], gate: 'aiBudget' },
  'routes/booking.ts': { tools: ['text', 'vision'], gate: 'aiBudget' },
  'routes/commerce.ts': { tools: ['text'], gate: 'aiBudget' },
  'routes/intake.ts': { tools: ['text', 'vision'], gate: 'aiBudget' },
  'routes/live.ts': { tools: ['live_voice'], gate: 'aiBudget' },
  'routes/mailbox.ts': { tools: ['vision'], gate: 'aiBudget' },
  'routes/projects.ts': { tools: ['text'], gate: 'aiBudget' },
  'routes/video.ts': { tools: ['text', 'video_watch'], gate: 'aiBudget' },

  'routes/ai.ts': { tools: ['text', 'vision'], gate: 'inline' },
  'routes/protron.ts': { tools: ['speech'], gate: 'inline' },

  'lib/autopilotWrite.ts': {
    tools: ['text'], gate: 'caller', from: ['autopilotTick.ts', 'lib/projectAgents.ts', 'routes/autopilot.ts'],
    why: 'The writers take the key their caller loaded after aiBudget(); they never load one themselves.',
  },
  'lib/moderation.ts': {
    tools: ['text'], gate: 'caller', from: ['lib/contentGate.ts'],
    why: 'aiReview is handed the key by the content gate, which decides whether the check runs at all.',
  },

  'lib/contentGate.ts': {
    tools: ['text'], gate: 'exempt',
    why: 'The operator\'s moderation of copy a customer is sending: under the owner\'s per-workspace caps (capRefusal), never the customer\'s allowance; capped or keyless, the copy stays held for a person.',
  },
  'routes/sitePlan.ts': {
    tools: ['text'], gate: 'exempt',
    why: 'The public site\'s planner has no workspace to budget: it is rate-limited per connection and for the whole site per day before the key is loaded.',
  },
  'routes/aikeys.ts': {
    tools: ['text'], gate: 'exempt',
    why: 'The install owner testing their own keys on Platform services: a model listing and a one-word probe, owner only.',
  },
  'routes/replies.ts': {
    tools: ['text'], gate: 'exempt',
    why: 'verifyAiKey lists models to say whether a key works; it generates nothing and spends no quota.',
  },
  'routes/validateKey.ts': {
    tools: [], gate: 'exempt',
    why: 'Checks a key the customer pasted for their own account by listing models; nothing of the operator\'s is spent.',
  },
  'lib/googlePlaces.ts': {
    tools: ['places'], gate: 'exempt',
    why: 'Maps searches are budgeted per workspace by placesBudget and metered in crm_places_usage, not counted as AI requests.',
  },
  'lib/video/transcribe.ts': {
    tools: ['transcription'], gate: 'exempt',
    why: 'Transcription is metered as the plan\'s video minutes (lib/video/usage.ts), checked before a recording is processed.',
  },
};

/**
 * What the scan looks for: a call into an AI client or a provider's host.
 * Exported so the test and any future linter agree on one definition.
 */
export const AI_CALL_PATTERNS: RegExp[] = [
  /\bloadAiKey\s*\(/, /\binstallAiKey\s*\(/, /\baskGemini(?:Parts|AboutFile)?\s*\(/, /\bresearchWeb\s*\(/,
  /\baskOpenRouter\s*\(/, /\bprobeAiKey\s*\(/, /\bverifyAiKey\s*\(/, /\baiBase\s*\(\s*\)/,
  /generativelanguage\.googleapis\.com/, /openrouter\.ai\//, /places\.googleapis\.com/,
  /api\.openai\.com/, /api\.anthropic\.com/, /\benv\.AI\.run\s*\(/,
];
