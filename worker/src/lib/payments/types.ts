/**
 * One shape for every payment processor this app can charge through.
 *
 * ── Why an interface rather than an `if (provider === 'stripe')` ──
 *
 * Two processors is where a branch looks cheapest and is already wrong: the
 * branches spread. Creating a checkout, verifying a key, checking a webhook
 * signature and reading an event are four places that would each need one, in
 * two files, and the fifth is the one somebody forgets. Behind this interface a
 * new processor is a file, and every caller keeps working by construction.
 *
 * ── What the interface deliberately does not hide ──
 *
 * Processors differ in ways a customer has to know about, and papering over
 * them produces a screen that lies. Creem is a merchant of record and sells in
 * EUR or USD only; Stripe is a gateway and sells in most currencies. So
 * `currencies` is part of the contract, and the caller refuses an order in a
 * currency the connected processor cannot take, by name, before anybody clicks
 * a dead link.
 */

/** Every processor's answer to "did that work", with steps when it did not. */
export interface Outcome {
  ok: boolean;
  error: string;
  /** What to do about it, in order. Empty when there is nothing useful to say. */
  steps: string[];
}

export interface Connected extends Outcome {
  /** What the processor calls this account, for the screen to show back. */
  name: string;
  /** 'live' or 'test'. Getting this wrong costs somebody a real charge. */
  mode: 'live' | 'test';
  /** False when the account exists but cannot yet take money. */
  chargesEnabled: boolean;
}

export interface CheckoutRequest {
  /** Our own order id. Comes back on the webhook, and is how it is matched. */
  reference: string;
  /** Minor units — pence, cents. Never a float. */
  amountCents: number;
  currency: string;
  /** What the buyer sees they are paying for. */
  description: string;
  email: string;
  successUrl: string;
  cancelUrl: string;
  /** True when the order contains something that has to be posted. */
  needsShipping: boolean;
}

export interface CheckoutResult extends Outcome {
  /** Where to send the buyer. */
  url: string;
  /** The processor's own id for the session, stored against the order. */
  sessionId: string;
  /** How long the link lasts, in the customer's words. Processors differ. */
  expiresNote: string;
}

/** What a webhook turned out to be, once its signature checked out. */
export interface PaymentEvent {
  /** 'paid' is the only one that moves money in this app's model. */
  kind: 'paid' | 'failed' | 'refunded' | 'other';
  /** Our order id, when the processor gave it back. */
  reference: string;
  /** The processor's session id, as a fallback way to find the order. */
  sessionId: string;
  /** The delivery address, when the processor collected one. */
  shipping?: {
    name: string; line1: string; line2: string; city: string;
    state: string; postcode: string; country: string; phone: string;
  };
}

export interface PaymentProvider {
  readonly id: string;
  /** What a customer calls it. */
  readonly label: string;
  /** ISO codes this processor will take, uppercase. Empty means "most". */
  readonly currencies: string[];
  /** Where the key is found, said once, for the screen and for errors. */
  readonly keyHint: string;
  /** Refuses an obviously wrong key before the network sees it. */
  validateKey(key: string): string;
  /** Live or sandbox, from the key alone — no network call, so a screen can
   *  say it every time it loads. A customer left in test mode takes no real
   *  money, and finds out from a bank statement that never arrives. */
  modeOf(key: string): 'live' | 'test';
  /** Reads the account. Must not create anything — pressing Test twice should
   *  leave no trace in the customer's dashboard. */
  verify(key: string): Promise<Connected>;
  /** A link a buyer can pay through. */
  checkout(key: string, req: CheckoutRequest, ctx: ProviderContext): Promise<CheckoutResult>;
  /** True only when the body genuinely came from this processor. */
  verifySignature(secret: string, rawBody: string, headers: Headers): Promise<boolean>;
  /** What the (already verified) body means. */
  readEvent(rawBody: string): PaymentEvent | null;
}

/**
 * Per-workspace state a processor may need to keep between calls.
 *
 * Creem needs one: a checkout must name a product that already exists, so the
 * workspace's reusable "order" product id is remembered rather than a new
 * product being created for every order — which would fill the customer's Creem
 * catalogue with one entry per sale. Stripe needs nothing and ignores it.
 */
export interface ProviderContext {
  /** Whatever the provider stored last time, or ''. */
  providerRef: string;
  /** Called when the provider has something new worth remembering. */
  remember(ref: string): Promise<void>;
  /** The trading name, for anything the processor shows a buyer. */
  companyName: string;
}
