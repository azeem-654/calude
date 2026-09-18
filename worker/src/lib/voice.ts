/**
 * AI voice, as an interface with no provider behind it yet.
 *
 * ── Why this file exists and does almost nothing ──
 *
 * There is no telephony in this installation. No carrier, no numbers, no media
 * handling, and nothing that could answer a call if one arrived. Building the
 * data model, the configuration screen and this interface is useful: it is the
 * shape the feature will take, and it lets the rest of the platform — contacts,
 * conversations, tickets, the timeline — be written once rather than retrofitted
 * when a provider is chosen.
 *
 * Pretending it works is not useful. A voice agent that appears configured and
 * silently answers nothing is worse than a screen that says a provider is
 * needed, because the customer finds out when a real caller hears nothing.
 *
 * So every function here reports, by name, that no provider is connected, and
 * the screen above it says the same thing. When a provider is chosen it is one
 * file implementing `VoiceProvider` plus a line in `PROVIDERS` — the product
 * does not have to be rearranged around it.
 *
 * ── What a provider will have to do ──
 *
 * Nothing about *this* interface is speculative: `startSession`, `endSession`
 * and `verifyWebhook` are the three things every hosted voice API in this shape
 * needs, and the session model already matches what they return — a reference,
 * a transcript, a duration and an outcome.
 */
import type { Env } from './db';

export interface VoiceSessionInput {
  accountId: string;
  voiceAgentId: string;
  toNumber?: string;
  fromNumber?: string;
  /** The AI agent whose knowledge and rules the voice agent speaks with. */
  agentId: string;
}

export interface VoiceResult {
  ok: boolean;
  /** The provider's own id for the call, stored so a webhook can be matched. */
  ref?: string;
  error?: string;
}

export interface VoiceProvider {
  readonly id: string;
  readonly label: string;
  /** What the owner has to supply before this can be switched on. */
  readonly needs: string[];
  startSession(env: Env, input: VoiceSessionInput): Promise<VoiceResult>;
  endSession(env: Env, ref: string): Promise<VoiceResult>;
  /** Providers sign their callbacks differently; each one knows its own. */
  verifyWebhook(env: Env, req: Request, raw: string): Promise<boolean>;
}

/**
 * No providers are implemented.
 *
 * This is a deliberate empty list, not a placeholder to be filled in quietly.
 * Adding one means adding a file beside this and a line here, and the screens
 * will start offering it because they read this list rather than hardcoding a
 * name.
 */
export const PROVIDERS: Record<string, VoiceProvider> = {};

export const voiceProviders = (): { id: string; label: string; needs: string[] }[] =>
  Object.values(PROVIDERS).map(p => ({ id: p.id, label: p.label, needs: p.needs }));

const NONE =
  'No voice provider is connected to this installation, so voice agents cannot take calls yet. '
  + 'Everything else about this agent is saved and will work the moment one is.';

export async function startVoiceSession(env: Env, input: VoiceSessionInput): Promise<VoiceResult> {
  const row = await env.DB.prepare('SELECT provider FROM crm_voice_agents WHERE id = ? AND account_id = ?')
    .bind(input.voiceAgentId, input.accountId).first<{ provider: string }>();
  const p = row?.provider ? PROVIDERS[row.provider] : undefined;
  if (!p) return { ok: false, error: NONE };
  return p.startSession(env, input);
}

export async function endVoiceSession(env: Env, accountId: string, voiceAgentId: string, ref: string): Promise<VoiceResult> {
  const row = await env.DB.prepare('SELECT provider FROM crm_voice_agents WHERE id = ? AND account_id = ?')
    .bind(voiceAgentId, accountId).first<{ provider: string }>();
  const p = row?.provider ? PROVIDERS[row.provider] : undefined;
  if (!p) return { ok: false, error: NONE };
  return p.endSession(env, ref);
}

/** What a screen should say about voice on this install. */
export const voiceStatus = () => ({
  available: Object.keys(PROVIDERS).length > 0,
  providers: voiceProviders(),
  message: Object.keys(PROVIDERS).length > 0 ? '' : NONE,
});
