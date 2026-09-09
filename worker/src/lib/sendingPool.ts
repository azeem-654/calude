/**
 * A sending pool, and what it would take to build one.
 *
 * Cold outreach at any volume is not one mailbox sending harder. It is several
 * domains, a few mailboxes on each, every one warmed up slowly, so that no
 * single address carries enough volume to be filtered and no single domain
 * carries enough reputation risk to take the others down with it. That shape is
 * why this exists rather than "buy a domain" being a button.
 *
 * This file decides *what is missing*. It buys nothing and sends nothing — the
 * two things that spend money or touch a customer's reputation both live behind
 * an explicit confirmation elsewhere.
 */

export type PurchaseMode = 'byo' | 'managed';

export interface PoolTarget {
  domains: number;
  mailboxesPerDomain: number;
}

export interface PoolState {
  /** Domains this workspace already has DNS control of. */
  domains: string[];
  /** Mailboxes already connected, by the domain they sit on. */
  mailboxesByDomain: Record<string, number>;
  /** Domains whose SPF/DKIM/DMARC have been written. */
  authenticated: string[];
}

export type PoolStep =
  | { type: 'register_domain'; count: number; because: string }
  | { type: 'authenticate'; domains: string[]; because: string }
  | { type: 'create_mailboxes'; domain: string; count: number; because: string }
  | { type: 'warm_up'; addresses: number; because: string };

/**
 * Sensible for a small business, and deliberately modest.
 *
 * Two domains rather than ten: a plumber is not running cold outreach at scale,
 * and a pool larger than the sending actually justifies is money spent on
 * renewals for nothing. The number is a target a customer can raise, not a
 * recommendation dressed as a default.
 */
export const DEFAULT_TARGET: PoolTarget = { domains: 2, mailboxesPerDomain: 3 };

export function normaliseTarget(t: Partial<PoolTarget> | null | undefined): PoolTarget {
  const domains = Math.min(Math.max(Math.round(Number(t?.domains) || DEFAULT_TARGET.domains), 1), 20);
  const per = Math.min(Math.max(Math.round(Number(t?.mailboxesPerDomain) || DEFAULT_TARGET.mailboxesPerDomain), 1), 10);
  return { domains, mailboxesPerDomain: per };
}

/**
 * What is missing between where this workspace is and where it wants to be.
 *
 * Ordered by dependency, not by importance: a mailbox cannot exist before its
 * domain, and warming up an address that fails SPF teaches the receiving server
 * that the domain sends unauthenticated mail — which is worse than not warming
 * it at all.
 */
export function planPool(state: PoolState, target: PoolTarget): PoolStep[] {
  const steps: PoolStep[] = [];
  const have = state.domains.length;

  if (have < target.domains) {
    const need = target.domains - have;
    steps.push({
      type: 'register_domain',
      count: need,
      because: have === 0
        ? `sending needs a domain of its own, and this workspace has none set up`
        : `the target is ${target.domains} sending domains and ${have} ${have === 1 ? 'is' : 'are'} set up`,
    });
  }

  const unauthenticated = state.domains.filter(dm => !state.authenticated.includes(dm));
  if (unauthenticated.length) {
    steps.push({
      type: 'authenticate',
      domains: unauthenticated,
      because: `${unauthenticated.length} domain${unauthenticated.length === 1 ? '' : 's'} ${unauthenticated.length === 1 ? 'has' : 'have'} no SPF, DKIM or DMARC, so mail from ${unauthenticated.length === 1 ? 'it' : 'them'} is likely to be filtered`,
    });
  }

  /* Mailboxes only on domains that are actually authenticated. Creating them on
     a domain that fails SPF produces addresses that look ready and are not. */
  for (const dm of state.authenticated) {
    const has = state.mailboxesByDomain[dm] ?? 0;
    if (has < target.mailboxesPerDomain) {
      steps.push({
        type: 'create_mailboxes',
        domain: dm,
        count: target.mailboxesPerDomain - has,
        because: `${dm} has ${has} mailbox${has === 1 ? '' : 'es'} and the target is ${target.mailboxesPerDomain}, so volume would concentrate on too few addresses`,
      });
    }
  }

  const ready = state.authenticated.reduce((n, dm) => n + (state.mailboxesByDomain[dm] ?? 0), 0);
  if (ready > 0) {
    steps.push({
      type: 'warm_up',
      addresses: ready,
      because: `${ready} address${ready === 1 ? '' : 'es'} ${ready === 1 ? 'is' : 'are'} ready, and a new address that starts at full volume gets filtered rather than delivered`,
    });
  }

  return steps;
}

/** Plain-language names for the activity log. */
export function describeStep(s: PoolStep): string {
  switch (s.type) {
    case 'register_domain':
      return `Register ${s.count} sending domain${s.count === 1 ? '' : 's'}`;
    case 'authenticate':
      return `Set up SPF, DKIM and DMARC on ${s.domains.length} domain${s.domains.length === 1 ? '' : 's'}`;
    case 'create_mailboxes':
      return `Create ${s.count} mailbox${s.count === 1 ? '' : 'es'} on ${s.domain}`;
    case 'warm_up':
      return `Start warming up ${s.addresses} address${s.addresses === 1 ? '' : 'es'}`;
  }
}

/**
 * Whether a step spends money.
 *
 * Every one of these must be confirmed by a person the first time, whichever
 * purchasing mode is on. In bring-your-own it is the customer's registrar
 * account; in managed it is the operator's, billed on. Neither is something to
 * do because a plan said so.
 */
export function costsMoney(s: PoolStep): boolean {
  return s.type === 'register_domain' || s.type === 'create_mailboxes';
}
