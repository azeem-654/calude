/**
 * The acceptable use policy: what it says it is, and who has agreed to it.
 *
 * ── The version is a date, and it is duplicated on purpose ──
 *
 * The Worker holds the same constant. They could be served from one place, but
 * the client would then have to ask the server what it was agreeing to before
 * it could draw the sentence saying so — a round trip on the sign-up form, for
 * a string that changes when somebody edits a document by hand anyway.
 *
 * What matters is that the *recorded* version is always the server's, never the
 * browser's. The client says "I agree"; the server writes down to what.
 */
export const POLICY_VERSION = '2026-09-16';

/** Clause numbers, so a suspension can point at something rather than an opinion. */
export interface Clause {
  id: string;
  title: string;
  body: string[];
}

export const POLICY: Clause[] = [
  {
    id: '1',
    title: 'Who this is for',
    body: [
      'This is a marketing and customer-management platform for businesses. You may use it to promote your own business, or a client’s business if you are acting for them with their agreement.',
      'One account belongs to one person or company. You are responsible for everything done under it, including by anyone you give access to.',
      'You must be old enough to enter a contract where you live.',
    ],
  },
  {
    id: '2',
    title: 'What you may not publish or send',
    body: [
      '2.1 — Sexual or adult material. Pornography, sexual services, and content whose purpose is sexual arousal. This includes promoting an adult business through this platform, not only putting explicit words in a campaign.',
      '2.2 — Graphic violence. Material that depicts or glorifies serious injury, or instructs anyone in causing it.',
      '2.3 — Political campaigning. Asking people to vote, supporting or opposing a party, a candidate or a referendum, and raising money for any of those. Ordinary commentary on how a law or a tax change affects your customers is not political campaigning and is fine.',
      '2.4 — Hateful material. Content attacking people for who they are, or asserting the superiority of one group over another.',
      '2.5 — Anything sexualising a child. This is refused outright, is never held for review, and is reported where the law requires it. There is no version of this that can be approved.',
      '2.6 — Anything unlawful where you or your recipients are, including fraud, counterfeit goods, and regulated products you are not licensed to sell.',
    ],
  },
  {
    id: '3',
    title: 'Email and text messages',
    body: [
      '3.1 — Only contact people who have a reason to hear from you: they asked, they bought from you, or they are a business whose published address is relevant to what you are offering.',
      '3.2 — Do not upload lists you bought. They damage the sending reputation of every domain on this platform, not only yours.',
      '3.3 — Every message must say honestly who it is from, and every marketing message must let people stop receiving them in one step.',
      '3.4 — When somebody unsubscribes or replies asking you to stop, that is the end of it, on every channel.',
      '3.5 — Text messages have their own rules where you are, and they are usually stricter than email. Meeting them is your responsibility.',
    ],
  },
  {
    id: '4',
    title: 'The data you put in',
    body: [
      '4.1 — The contacts, orders and messages in your workspace are yours. We do not sell them and we do not use them to market to your customers.',
      '4.2 — You are responsible for having a lawful reason to hold them, and for answering your own customers when they ask what you hold.',
      '4.3 — You can export everything at any time, including while an account is suspended.',
    ],
  },
  {
    id: '5',
    title: 'How content is checked',
    body: [
      '5.1 — Content is screened automatically as it leaves: when an email or a text is sent, when a post or a product is published, and when a client profile is created.',
      '5.2 — Something the check is unsure about is held. It is not sent, and it is not quietly dropped either — you are told it is waiting, and it goes out once it is approved.',
      '5.3 — A person reads what is held. Automatic checks are blunt and clear far more than they stop.',
      '5.4 — Approving a piece of writing approves that wording from then on, so the same campaign is not queued twice.',
    ],
  },
  {
    id: '6',
    title: 'Warnings, suspension and closing an account',
    body: [
      '6.1 — A first problem usually means a warning, which says what it was about.',
      '6.2 — A suspended account can still sign in, read everything and export. What it cannot do is send or publish. We do not hold your customer list hostage while a disagreement is sorted out.',
      '6.3 — Repeated or deliberate breaches close the account.',
      '6.4 — Clause 2.5 is the exception to all of the above and is acted on immediately.',
      '6.5 — If you think a decision is wrong, reply to it. Say which clause and why.',
    ],
  },
  {
    id: '7',
    title: 'Money',
    body: [
      '7.1 — What you pay for this platform, and what your own buyers pay you, are separate. Your sales go to your own payment account, not ours.',
      '7.2 — Domains, mailboxes and anything else bought on your behalf are charged as quoted at the time of purchase. A price list changing later does not change a price already agreed.',
      '7.3 — Refunds for third-party purchases follow whatever that supplier allows. A registered domain generally cannot be refunded.',
    ],
  },
  {
    id: '8',
    title: 'Changes',
    body: [
      '8.1 — When this policy changes materially you will be asked to read and accept it again before carrying on.',
      '8.2 — The version you accepted, and when, is recorded against your account.',
    ],
  },
];
