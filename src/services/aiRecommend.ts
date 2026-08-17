/**
 * What to do next, and the numbers it rests on.
 *
 * Every recommendation here carries its own evidence, because "increase this
 * segment from 100 to 200 a week" is worth nothing without the figures behind
 * it — and because a reader who can see the figures can disagree, which is the
 * only way advice from software is ever worth taking.
 *
 * The rule that shapes the whole file is a minimum sample. Two opens out of
 * three sends is not a 67% open rate, it is three sends; advising on it would
 * be inventing a pattern out of noise and dressing it as insight. Below the
 * threshold the answer is "too early to tell", stated as such, with how many
 * more sends it would take to know.
 *
 * Nothing here reads a channel that has not run. There are no SMS
 * recommendations while there is no SMS campaign, because there is no SMS
 * performance to compare anything against.
 */
import type { AICampaign } from '../types/aiSalesAgent';
import type { Rollup } from './aiRollup';
import type { LeadStats } from './aiDiscovery';

/**
 * Below this many sends, a rate is noise. Twenty is not statistically
 * rigorous — it is the point at which one unusual recipient stops moving the
 * number by more than ten points.
 */
export const MIN_SENDS = 20;

export type Urgency = 'blocking' | 'worth-doing' | 'observation';

export interface Recommendation {
  id: string;
  urgency: Urgency;
  /** One line, in the imperative — what to do. */
  title: string;
  /** Why, in a sentence. */
  detail: string;
  /** The figures it rests on, shown on screen so it can be argued with. */
  evidence: string;
  /** Where to go and do it. */
  action?: { label: string; tab?: string; route?: string };
}

export interface RecommendInput {
  campaign: AICampaign;
  rollup: Rollup;
  leads: LeadStats;
}

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

export function recommend({ campaign, rollup, leads }: RecommendInput): Recommendation[] {
  const out: Recommendation[] = [];
  const strategy = campaign.strategy;

  const sent = rollup.sequences.reduce((n, s) => n + s.sent, 0);
  const opened = rollup.sequences.reduce((n, s) => n + s.opened, 0);
  const replied = rollup.sequences.reduce((n, s) => n + s.replied, 0);
  const bounced = rollup.sequences.reduce((n, s) => n + s.bounced, 0);
  const enrolled = rollup.sequences.reduce((n, s) => n + s.enrolled, 0);

  /* ── Things that stop it working at all ── */

  if (!strategy) {
    out.push({
      id: 'no-plan', urgency: 'blocking',
      title: 'Work out a plan',
      detail: 'The campaign has an objective but no approach, so there is nothing for it to act on.',
      evidence: 'No strategy has been approved.',
      action: { label: 'Open Strategy', tab: 'strategy' },
    });
    return out;
  }

  if (!leads.total) {
    out.push({
      id: 'no-leads', urgency: 'blocking',
      title: 'Search for prospects',
      detail: 'Nothing has been found to contact yet.',
      evidence: `The plan targets ${strategy.targetCount.toLocaleString()}; none have been found.`,
      action: { label: 'Open Leads', tab: 'leads' },
    });
    return out;
  }

  /* The consequence of a directory source, stated as a decision to take. */
  if (strategy.channels.includes('email') && leads.withEmail === 0 && leads.withPhone > 0) {
    out.push({
      id: 'no-emails', urgency: 'blocking',
      title: 'Lead with phone or SMS instead of email',
      detail: 'The plan opens on email but not one prospect has an email address, so nothing will send. '
        + 'Either change the opening channel, or find the addresses before building.',
      evidence: `${leads.withEmail} of ${leads.total} have an email address; ${leads.withPhone} have a phone number.`,
      action: { label: 'Open Strategy', tab: 'strategy' },
    });
  }

  if (rollup.sequences.length && !enrolled) {
    out.push({
      id: 'nobody-enrolled', urgency: 'blocking',
      title: 'Enrol the qualified prospects',
      detail: 'A sequence exists with nobody in it, so it will never send.',
      evidence: `${leads.qualified} prospects match the plan; ${enrolled} are enrolled.`,
      action: { label: 'Open Overview', tab: 'overview' },
    });
  }

  if (campaign.guardrails.sendEmail !== 'on' && leads.withEmail > 0) {
    out.push({
      id: 'sending-off', urgency: 'blocking',
      title: 'Allow sending when you are ready',
      detail: 'Sending is set to “ask me first”, so nobody is being enrolled. That is a sensible default — '
        + 'this is only worth changing once you have read the messages.',
      evidence: `${leads.withEmail} prospects could be emailed today.`,
      action: { label: 'Open Settings', tab: 'settings' },
    });
  }

  /* ── Performance, but only once there is enough of it ── */

  if (sent > 0 && sent < MIN_SENDS) {
    out.push({
      id: 'too-early', urgency: 'observation',
      title: 'Too early to judge the messages',
      detail: 'There have not been enough sends for the open and reply rates to mean anything yet. '
        + 'One unusual recipient still moves them by more than ten points.',
      evidence: `${sent} sent. Rates start being worth reading at about ${MIN_SENDS}.`,
    });
  }

  if (sent >= MIN_SENDS) {
    const openRate = pct(opened, sent);
    const replyRate = pct(replied, sent);
    const bounceRate = pct(bounced, sent);

    if (bounceRate >= 5) {
      out.push({
        id: 'bounces', urgency: 'blocking',
        title: 'Check the list before sending more',
        detail: 'A bounce rate this high damages the sending domain, and mailbox providers act on it long '
          + 'before a person notices.',
        evidence: `${bounced} of ${sent} bounced (${bounceRate}%). Anything above about 5% is a problem.`,
        action: { label: 'Open Leads', tab: 'leads' },
      });
    }

    if (openRate < 20) {
      out.push({
        id: 'low-opens', urgency: 'worth-doing',
        title: 'Rewrite the subject lines',
        detail: 'Few people are opening, which is a subject-line and sender-reputation problem rather than '
          + 'a message problem — they have not read the message yet.',
        evidence: `${opened} of ${sent} opened (${openRate}%).`,
        action: { label: 'Rewrite the funnel', tab: 'email' },
      });
    } else if (replyRate < 2) {
      out.push({
        id: 'low-replies', urgency: 'worth-doing',
        title: 'Rewrite the ask, not the subject',
        detail: 'People are opening and not replying, so the subject is working and the message is not. '
          + 'A shorter, more specific first line usually helps more than a longer pitch.',
        evidence: `${openRate}% opened but only ${replied} of ${sent} replied (${replyRate}%).`,
        action: { label: 'Rewrite the funnel', tab: 'email' },
      });
    } else if (replyRate >= 5) {
      /* The only case where scaling up is honest advice. */
      out.push({
        id: 'scale', urgency: 'worth-doing',
        title: 'Find more prospects like these',
        detail: 'This is working better than a cold sequence usually does. The cheapest next move is more of '
          + 'the same audience rather than a new message.',
        evidence: `${replied} of ${sent} replied (${replyRate}%), against ${openRate}% opened.`,
        action: { label: 'Open Leads', tab: 'leads' },
      });
    }
  }

  /* ── Coverage against the plan ── */

  if (leads.total < strategy.targetCount && leads.total > 0) {
    const short = strategy.targetCount - leads.total;
    out.push({
      id: 'short-of-target', urgency: 'observation',
      title: 'Keep searching to reach the target',
      detail: 'The plan asked for more prospects than have been found so far.',
      evidence: `${leads.total.toLocaleString()} found of ${strategy.targetCount.toLocaleString()} — ${short.toLocaleString()} short.`,
      action: { label: 'Open Leads', tab: 'leads' },
    });
  }

  if (leads.total && leads.rejected / leads.total > 0.5) {
    out.push({
      id: 'mostly-rejected', urgency: 'worth-doing',
      title: 'Loosen the audience or change the search',
      detail: 'More than half of what the search returns does not match the plan, which usually means the '
        + 'search terms and the ICP are describing different things.',
      evidence: `${leads.rejected} of ${leads.total} were ruled out.`,
      action: { label: 'Open Strategy', tab: 'strategy' },
    });
  }

  /* SMS is deliberately absent: there is no SMS campaign to measure, so there
     is nothing to recommend about it that would not be a guess. */

  const order: Record<Urgency, number> = { blocking: 0, 'worth-doing': 1, observation: 2 };
  return out.sort((a, b) => order[a.urgency] - order[b.urgency]);
}

/** Shown when there is nothing to advise, so the panel never sits empty. */
export function nothingToAdvise(rollup: Rollup): string {
  const sent = rollup.sequences.reduce((n, s) => n + s.sent, 0);
  return sent >= MIN_SENDS
    ? 'Nothing worth changing. The figures are in the range a working cold sequence normally sits in.'
    : 'Nothing to suggest yet — there is not enough activity to draw anything from.';
}
