/**
 * The processors a workspace can be paid through.
 *
 * Adding one is adding a file and a line here. Everything that charges,
 * verifies or listens goes through `providerFor`, so nothing else has to grow
 * a branch — see types.ts for why that mattered enough to build.
 */
import type { PaymentProvider } from './types';
import { stripe } from './stripe';
import { creem } from './creem';

export * from './types';

export const PROVIDERS: PaymentProvider[] = [stripe, creem];

export const DEFAULT_PROVIDER = 'stripe';

/** The named provider, or undefined — never a silent fallback to another one,
 *  because charging on the wrong processor is worse than refusing. */
export function providerFor(id: string): PaymentProvider | undefined {
  return PROVIDERS.find(p => p.id === id);
}

/** What the connect screen offers, without any secrets in it. */
export function providerChoices() {
  return PROVIDERS.map(p => ({
    id: p.id,
    label: p.label,
    currencies: p.currencies,
    keyHint: p.keyHint,
  }));
}
