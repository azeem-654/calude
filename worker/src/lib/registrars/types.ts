/**
 * What a provider has to be able to do, said once.
 *
 * ── Why an interface rather than a file full of Openprovider calls ──
 *
 * Openprovider is a reseller relationship, and reseller relationships end. The
 * question that decides whether that is a weekend or a rewrite is whether the
 * rest of the app ever learned the provider's name. Here it does not: the
 * setup engine asks for `domains.check` and gets back a shape defined in this
 * file, in our words, in our units. Swapping provider means adding a file
 * beside `openprovider.ts` and a line in `index.ts`.
 *
 * Two rules this interface enforces by its shape:
 *
 * 1. **Money is always integer cents plus a currency.** Every provider quotes
 *    floats in their own currency and at least one of them quotes a string.
 *    Converting at the edge means nothing downstream ever has to wonder.
 *
 * 2. **Errors are values, not exceptions.** A provisioning step that throws
 *    inside a loop over every pending order takes the rest of them down with
 *    it. Every call returns whether it worked and, when it did not, something
 *    the owner can read — which is *not* the same string the customer sees.
 */

export interface ProviderCreds {
  username: string;
  password: string;
  /** Openprovider's reseller id. Informational; the token carries the identity. */
  resellerId?: string;
  /** Point at the sandbox without a code change. */
  sandbox?: boolean;
  /**
   * The mail host customers' clients connect to. Openprovider's business email
   * runs on mailcow and the hostname is per-reseller, so it cannot be guessed —
   * it is configured once with the credentials and used for every mailbox.
   */
  mailHost?: string;
}

/** A price, as it left the provider. Cents, never floats. */
export interface Money {
  cents: number;
  currency: string;
}

export interface CheckResult {
  domain: string;
  available: boolean;
  /** Why not, in the provider's words. For the owner's log, never a customer. */
  reason: string;
  premium: boolean;
  /** What it would cost *us*. Never leaves the Worker. */
  cost: Money | null;
}

export interface RegisterInput {
  domain: string;
  years: number;
  /** The registrant. A domain has to belong to somebody, and it is the customer. */
  owner: {
    firstName: string;
    lastName: string;
    companyName: string;
    email: string;
    phoneCountry: string;
    phoneArea: string;
    phoneNumber: string;
    street: string;
    houseNumber: string;
    city: string;
    state: string;
    zip: string;
    /** ISO-3166 alpha-2. */
    country: string;
  };
  /** Where the domain should point. Ours, unless the customer says otherwise. */
  nameServers: string[];
}

export interface RegisterResult {
  ok: boolean;
  /** The provider's id for the domain, needed for every later call about it. */
  providerId: string;
  /** The contact handle it was registered under, reusable for later purchases. */
  ownerHandle: string;
  expiresAt: string;
  cost: Money | null;
  /** For the owner. Verbatim, provider wording and all. */
  error: string;
}

export interface DnsRecord {
  /** Relative to the zone: '' is the apex, 'www' is www.example.com. */
  name: string;
  type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SRV' | 'CAA';
  value: string;
  ttl: number;
  /** MX and SRV only. */
  prio?: number;
}

export interface Mailbox {
  address: string;
  /** Shown once by the provider and never again, so it is saved immediately. */
  password: string;
  /** The provider's order id for this mailbox. */
  providerId: string;
}

export interface Outcome {
  ok: boolean;
  error: string;
}

/**
 * What is actually wrong with the operator's provider account.
 *
 * One `ok: false` from a connection test tells somebody there is a problem and
 * nothing about which of four unrelated things it is — a password, a switch
 * that is off by default, an IP restriction, or an empty balance. Each has a
 * different fix in a different corner of somebody else's control panel, and
 * guessing between them is where an evening goes.
 *
 * So a test returns a list of checks, each with the instruction for its own
 * failure. `blocking` separates "this will not work at all" from "this will
 * work until the moment somebody pays you".
 */
export interface Check {
  id: string;
  label: string;
  state: 'ok' | 'failed' | 'warning' | 'skipped';
  /** What it found, in plain words. */
  detail: string;
  /** What to do about it. Empty when there is nothing to do. */
  fix: string;
  /** True when nothing works until this is fixed. */
  blocking: boolean;
}

export interface Provider {
  readonly id: string;
  /** For the owner's own screens. Never rendered to a customer. */
  readonly label: string;

  /** Does it exist, and what would it cost us? */
  check(creds: ProviderCreds, domains: string[]): Promise<{ ok: boolean; results: CheckResult[]; error: string }>;

  /** Names like the one asked for, for the wizard's suggestions. */
  suggest(creds: ProviderCreds, name: string, tlds: string[], limit: number): Promise<{ ok: boolean; domains: string[]; error: string }>;

  register(creds: ProviderCreds, input: RegisterInput): Promise<RegisterResult>;

  /** Create the zone. Idempotent: a zone that already exists is a success. */
  createZone(creds: ProviderCreds, domain: string, records: DnsRecord[]): Promise<Outcome>;

  listRecords(creds: ProviderCreds, domain: string): Promise<{ ok: boolean; records: DnsRecord[]; error: string }>;

  /**
   * Replace the whole record set.
   *
   * Whole-set rather than per-record because the only way to be sure what a
   * zone contains after an edit is to state it — a provider that silently keeps
   * a record you meant to delete is how a stale MX outlives a migration.
   */
  replaceRecords(creds: ProviderCreds, domain: string, records: DnsRecord[]): Promise<Outcome>;

  /** Make the domain able to hold mailboxes at all. Idempotent. */
  enableEmail(creds: ProviderCreds, domain: string, ownerHandle: string): Promise<Outcome>;

  createMailbox(creds: ProviderCreds, domain: string, localPart: string, displayName: string): Promise<{ ok: boolean; mailbox: Mailbox | null; error: string }>;

  /** SMTP and IMAP settings for a mailbox this provider made. */
  mailSettings(creds: ProviderCreds): { smtpHost: string; smtpPort: number; imapHost: string; imapPort: number };

  /**
   * Everything that has to be true before a customer can buy anything, checked
   * in one go and reported as separate answers.
   *
   * Buys nothing and changes nothing — pressing it twice must leave no trace in
   * the operator's account.
   */
  diagnose(creds: ProviderCreds): Promise<Check[]>;
}
