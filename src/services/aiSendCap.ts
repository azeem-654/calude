/**
 * Making the daily email cap mean something.
 *
 * The campaign controls let a person set "50 emails a day". Until this existed,
 * that number was written to storage, rendered back on the settings screen, and
 * enforced by nothing at all — which is worse than not offering the setting,
 * because someone reads it and believes the account is protected.
 *
 * It is applied as a veto on each send rather than a filter on the queue, so a
 * held message keeps its place: the enrolment does not advance, and the person
 * gets that message on the next run instead of losing it.
 *
 * A contact belongs to a campaign through the stamp the orchestrator put on it,
 * which is the same relationship the badge and the roll-up read. Anything with
 * no campaign — an ordinary sequence somebody built by hand in Marketing — is
 * not capped here, because no cap was ever set for it.
 */
import { loadCampaigns } from './aiCampaigns';
import { loadEmails } from './contactEmail';
import type { SendGate } from './contactEmail';
import type { AIGuardrails } from '../types/aiSalesAgent';

/** How many outbound emails each campaign has already sent today. */
export function sentTodayByCampaign(
  contacts: { id: string; customFields?: Record<string, string> }[],
  now = new Date(),
): Record<string, number> {
  const campaignOf = new Map<string, string>();
  for (const c of contacts) {
    const id = c.customFields?.aiCampaignId;
    if (id) campaignOf.set(c.id, id);
  }

  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const out: Record<string, number> = {};

  for (const em of loadEmails()) {
    if (em.direction !== 'outbound') continue;
    /* Counted on what actually left, not on what was queued — a scheduled row
       that has not gone has not used up anyone's allowance. */
    if (em.status === 'scheduled' || em.status === 'failed') continue;
    const at = new Date(em.sentAt || em.createdAt).getTime();
    if (!Number.isFinite(at) || at < midnight) continue;
    const campaign = campaignOf.get(em.contactId);
    if (!campaign) continue;
    out[campaign] = (out[campaign] ?? 0) + 1;
  }
  return out;
}

const capOf = (g: AIGuardrails | undefined): number =>
  Math.max(0, Math.round(Number(g?.maxEmailsPerDay ?? 0) || 0));

/**
 * Build the veto for one run.
 *
 * The tally is taken once at the start and incremented as sends are allowed, so
 * a single pass cannot blow through the cap by reading a count that only
 * updates after the loop.
 */
export function campaignSendGate(
  contacts: { id: string; customFields?: Record<string, string> }[],
  now = new Date(),
): SendGate {
  const caps = new Map<string, number>();
  for (const c of loadCampaigns()) caps.set(c.id, capOf(c.guardrails));
  const used = sentTodayByCampaign(contacts, now);

  return (contact) => {
    const campaign = contact.customFields?.aiCampaignId;
    /* Not an agent campaign: nobody set a cap, so nobody is enforcing one. */
    if (!campaign || !caps.has(campaign)) return true;
    const cap = caps.get(campaign)!;
    /* Zero means stop, not "unlimited". A person who types 0 into a daily send
       limit is asking for nothing to go out. */
    const already = used[campaign] ?? 0;
    if (already >= cap) return false;
    used[campaign] = already + 1;
    return true;
  };
}
