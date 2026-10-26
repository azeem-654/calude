/**
 * The Privacy Policy and Terms of Service, as data.
 *
 * ── Why they exist now ──
 *
 * Google's OAuth verification asks for both, on the app's own domain, linked
 * from the home page — and the product asks strangers for their customer
 * lists, which it should never have done without saying plainly what happens
 * to them.
 *
 * ── What they may say ──
 *
 * Only what the software does. Every processing statement here matches
 * docs/SECURITY.md §7 and the Trust Center, and nothing in §8 appears: no
 * "end-to-end", no certifications, no "never used for training". Google user
 * data gets its own section, because the verification review reads for it
 * specifically, and it names the exact scopes in worker/src/lib/googleAuth.ts
 * and googleCalendar.ts. A new scope or a new sub-processor means an edit here
 * in the same commit.
 *
 * This is the operator's plain-language policy, written from the code. It is
 * not legal advice; docs/OWNER-CHECKLIST.md asks for a lawyer's review.
 */

export const LEGAL_UPDATED = '26 September 2026';
export const PRIVACY_CONTACT = 'privacy@protectedcentral.com';

export interface LegalSection { id: string; title: string; body: string[]; list?: string[] }

export const PRIVACY: LegalSection[] = [
  {
    id: 'who', title: 'Who we are',
    body: [
      'Protected Central ("we", "us") is a customer-relationship and marketing platform at protectedcentral.com and app.protectedcentral.com. This policy explains what personal information we handle, why, who else processes it, how long we keep it, and the choices you have.',
      `Questions about privacy: ${PRIVACY_CONTACT}.`,
    ],
  },
  {
    id: 'roles', title: 'Two kinds of information',
    body: [
      'Account information — about you, the person who signs up: your name, email address, a password stored only as a salted hash, sign-in records (time, a description of the device, and the network address), your settings and your subscription status. We are responsible for this information.',
      'Workspace information — what you put into the product: your contacts and their details, deals, messages, forms, bookings, orders, content and files. You decide what goes in and what it is used for; we process it on your behalf to provide the service. If you are one of our customer\'s contacts and want to exercise a right over your information, please contact that business first; we will help them respond.',
    ],
  },
  {
    id: 'use', title: 'What we use it for',
    body: ['We use personal information only to:'],
    list: [
      'Provide the service you signed up for: store your workspace, send the emails and texts you set up, run the automations you switch on, and show you reports.',
      'Keep accounts secure: limits on password guessing, optional 2-step sign-in, a record of sign-ins and account changes you can read in Settings → Security & Privacy.',
      'Screen outgoing messages and published content for abuse, as described in our Acceptable Use policy.',
      'Bill subscriptions, and answer your support requests.',
    ],
  },
  {
    id: 'google', title: 'Information from Google',
    body: [
      'If you choose to sign in with Google, we request only your basic profile: your name, email address and whether Google has verified it (the "openid", "email" and "profile" scopes). We use it to create or sign you into your account and for nothing else.',
      'If you choose to connect Google Calendar, we request access to calendar events only (the "calendar.events" scope). We use it to check when you are busy, so your booking page does not offer those times; to add a booking to your calendar with a Google Meet link when somebody books; and to update or remove that event if the booking changes. We do not read the contents of your other events beyond whether a time is taken, and we do not access your email, files or contacts in Google.',
      'The authorisation token Google gives us is encrypted before it is stored and is never sent to a browser. You can disconnect at any time in the app, or remove Protected Central\'s access at myaccount.google.com/permissions; either stops our access immediately.',
      'Protected Central\'s use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements. We do not sell Google user data, use it for advertising, allow humans to read it except with your permission, for security purposes or to comply with the law, or use it to train artificial-intelligence models.',
    ],
  },
  {
    id: 'ai', title: 'Artificial intelligence',
    body: [
      'Some features use Google\'s Gemini models, called from our servers. They receive what the task you asked for needs — for example your business profile and your request when writing a post, the files or web pages you give the new business workspace wizard, or the email being replied to — and not your whole workspace. Your contact list is not sent; messages are written with placeholders that we fill in ourselves.',
      'One exception: analysing a video in AI Shorts uploads that video to Google directly from your browser, using an AI key you saved yourself.',
      'Whether Google may use this information to improve its products depends on the plan of the AI key in use; Google\'s terms say prompts under paid plans are not used that way.',
    ],
  },
  {
    id: 'processors', title: 'Who else processes it',
    body: ['We use service providers to run the platform. Most are involved only when you use the feature concerned:'],
    list: [
      'Cloudflare — hosting, database and network (always).',
      'Google — AI features; Google sign-in and Google Calendar, if you use them.',
      'Stripe or Creem — payments. Card details are entered on their pages and never reach our servers.',
      'The email provider or mailbox you connect — to send and read your mail.',
      'Twilio — text messages, if you connect it.',
      'Openprovider — domain registration, if you buy a domain through the app.',
    ],
  },
  {
    id: 'sharing', title: 'What we do not do',
    body: [
      'We do not sell personal information, and we do not use your workspace information for advertising. We disclose information to others only as listed above, when you ask us to, or when the law requires it.',
    ],
  },
  {
    id: 'security', title: 'How it is protected',
    body: [
      'Every connection uses HTTPS. Workspace information is separated between workspaces and every request is checked on our servers against who is signed in. Credentials you connect — mailbox passwords, API keys, payment keys, calendar tokens — are encrypted before they are stored and are never returned to a browser. There is no staff login that can open your workspace as you. No system is perfectly secure; our Security page (protectedcentral.com/security) describes exactly what we do, and what we do not claim.',
    ],
  },
  {
    id: 'retention', title: 'How long we keep it',
    body: [
      'Your workspace information is kept until you delete it or close the workspace. Security activity records are deleted after 180 days, email delivery logs after 30 days, and automation step logs after 14 days. Database restore points are kept for the retention window of our hosting provider\'s point-in-time recovery. Billing records are kept as long as tax law requires.',
    ],
  },
  {
    id: 'rights', title: 'Your choices and rights',
    body: [
      'In Settings → Security & Privacy you can download your workspace information, see and sign out the devices signed in to your account, and delete your account together with every workspace you own. You can disconnect any connected service where you set it up.',
      `Depending on where you live, you may also have the right to ask what we hold about you, to correct it, to object to or restrict its use, or to complain to a data-protection authority. Email ${PRIVACY_CONTACT} and we will respond within one month.`,
    ],
  },
  {
    id: 'cookies', title: 'Cookies and browser storage',
    body: [
      'We use one essential cookie to keep you signed in, marked so that page scripts cannot read it, and the browser\'s local storage for your workspace preferences. After you sign in, that browser also remembers the name and email address of the account you used, so the sign-in screen can offer "Continue as" next time; choose "Not you? Use another account" there to remove it. We do not use advertising or third-party tracking cookies. Emails sent through the platform may include open and click tracking for the sender\'s reports.',
    ],
  },
  {
    id: 'children', title: 'Children',
    body: ['Protected Central is a business tool and is not intended for anyone under 16.'],
  },
  {
    id: 'changes', title: 'Changes to this policy',
    body: ['If we change this policy in a way that matters, we will say so in the app before the change takes effect. The date at the top shows when it was last updated.'],
  },
];

export const TERMS: LegalSection[] = [
  {
    id: 'agreement', title: 'The agreement',
    body: [
      'These terms govern your use of Protected Central at protectedcentral.com and app.protectedcentral.com ("the service"). By creating an account or using the service you agree to them, and to our Acceptable Use policy and Privacy Policy, which form part of them. If you use the service for a business, you agree on its behalf.',
    ],
  },
  {
    id: 'account', title: 'Your account',
    body: [
      'You must give accurate information, keep your sign-in details private, and tell us promptly at the address below if you believe your account has been used without permission. You are responsible for what happens in your account and in the workspaces you own, including by people you invite. We recommend turning on 2-step sign-in.',
    ],
  },
  {
    id: 'use', title: 'Using the service properly',
    body: [
      'You may use the service only for lawful purposes and in line with the Acceptable Use policy. In particular, you are responsible for having the right to contact the people you email or text, for honouring opt-outs, and for the accuracy of what you publish. We may review, hold or refuse content that appears to break these rules, and suspend accounts that do, as that policy describes.',
    ],
  },
  {
    id: 'content', title: 'Your content',
    body: [
      'You keep ownership of everything you put into the service. You give us permission to store, process and transmit it only as needed to provide the service to you — for example to send the campaigns you set up. You can export it at any time and delete it when you wish.',
      'Content produced with the AI features is provided to you to review and edit. It may be inaccurate; you are responsible for checking it before you send or publish it.',
    ],
  },
  {
    id: 'third-party', title: 'Services you connect',
    body: [
      'The service works with third-party services you choose to connect — mailboxes, payment processors, Google, domain registrars and others. Your use of them is governed by their own terms, and we are not responsible for their availability or conduct. Payments your own customers make to you go to the processor account you connect, not to us.',
    ],
  },
  {
    id: 'fees', title: 'Plans and payment',
    body: [
      'Paid plans are billed in advance through our payment processor at the price shown when you subscribe. You can cancel at any time; the plan stays active until the end of the period already paid for. Refunds are at our discretion unless the law requires otherwise. We will give notice in the app before changing the price of a plan you are on.',
    ],
  },
  {
    id: 'availability', title: 'Availability and changes',
    body: [
      'We work to keep the service available and secure, but we do not promise it will be uninterrupted or error-free. We may change or discontinue features; if we discontinue the service we will give reasonable notice so you can export your information.',
    ],
  },
  {
    id: 'ending', title: 'Ending the agreement',
    body: [
      'You may stop using the service and delete your account at any time in Settings → Security & Privacy. We may suspend or close an account that breaks these terms or the Acceptable Use policy, or that is unpaid, as that policy describes. After an account is closed its workspace information is deleted.',
    ],
  },
  {
    id: 'liability', title: 'Warranties and liability',
    body: [
      'The service is provided "as is". To the extent the law allows, we disclaim all warranties not stated in these terms, and we are not liable for indirect or consequential losses, lost profits or lost data. Our total liability arising from the service in any twelve months is limited to the amount you paid us in that period. Nothing in these terms limits liability that cannot be limited by law.',
    ],
  },
  {
    id: 'changes', title: 'Changes to these terms',
    body: [
      'We may update these terms. If a change matters, we will say so in the app before it takes effect; continuing to use the service afterwards means you accept the new terms.',
    ],
  },
  {
    id: 'contact', title: 'Contact',
    body: [`Questions about these terms: ${PRIVACY_CONTACT}.`],
  },
];

/*
 * The affiliate program's terms. Written from what the software does
 * (worker/src/lib/affiliate.ts): 40% of each subscription payment from a
 * referred account, for as long as it pays; held 30 days; paid by the owner
 * by hand. Like the other pages, not yet reviewed by a lawyer — see
 * docs/OWNER-CHECKLIST.md.
 */
export const AFFILIATE_TERMS: LegalSection[] = [
  {
    id: 'what', title: 'What you earn',
    body: [
      'You earn 40% of every subscription payment made to Protected Central by a customer who signed up through your referral link — the first payment and every renewal, for as long as that customer keeps paying for their own subscription.',
      'The commission is calculated on the amount the customer actually paid. Payments for anything other than a Protected Central subscription (for example domains, or anything a customer sells through their own shop) do not earn a commission.',
    ],
  },
  {
    id: 'referral', title: 'Who counts as your referral',
    body: [
      'A customer is yours when they open your link and then create an account within 60 days in the same browser. The first affiliate link a customer used is the one that counts. A customer can be attributed to a link for up to 14 days after creating their account, and never after that.',
      'You cannot refer yourself, your own additional accounts, or accounts you control.',
    ],
  },
  {
    id: 'paying', title: 'When and how you are paid',
    body: [
      'Each commission is held for 30 days after the customer pays, so that a refund can be honoured. After that it is payable. We pay payable commissions by the method you give us on the Affiliate program screen, normally once a month. A commission on a payment that is refunded, reversed or disputed is not paid, and may be deducted if it was already paid.',
      'You are responsible for any tax on what you earn.',
    ],
  },
  {
    id: 'conduct', title: 'How you may promote Protected Central',
    body: ['Promote honestly. In particular, you must not:'],
    list: [
      'send unsolicited email or messages (spam), or buy lists of addresses;',
      'bid on "Protected Central" or close variations in paid search ads;',
      'promise income, results or features that Protected Central does not provide;',
      'present yourself as Protected Central, or as its employee.',
    ],
  },
  {
    id: 'changes', title: 'Changes and ending',
    body: [
      'We may change these terms or end the program with 30 days\' notice. Commissions earned before a change or the end are paid under the terms they were earned under. We may end an individual affiliate\'s participation at once for a breach of these terms, and commissions earned through the breach are not paid.',
    ],
  },
];

/* ── Growth service terms ──────────────────────────────────────────────────
 *
 * The written terms of the HVAC/roofing growth service, published at
 * /growth-service-terms and attached to every customer agreement. Decided
 * 2026-10-26 when the owner asked for terms that keep the operator safe: each
 * clause closes a way the operator could lose money or be blamed for somebody
 * else's work, at the common middle of what such agreements use rather than
 * the harshest end — a term a contractor refuses to sign, or a court strikes,
 * protects nobody. Every number comes from TRADE_GROWTH_OFFER.rules, which
 * the fee engine (lib/leadRevenue.ts) also reads. Not legal advice:
 * docs/OWNER-CHECKLIST.md item 33 asks for a lawyer's review before selling.
 */
import { GROWTH_TERMS_PATH, TRADE_GROWTH_OFFER as G, dollars, percent } from '../../../worker/src/lib/offers';

export const GROWTH_TERMS_UPDATED = '26 October 2026';
export { GROWTH_TERMS_PATH };

const R = G.rules;

export const GROWTH_TERMS: LegalSection[] = [
  {
    id: 'scope', title: 'What these terms cover',
    body: [
      `These terms apply to the Protected Central growth service for HVAC and roofing businesses ("the service"). They form one agreement with the written order you sign ("your agreement"), which records your fees, your start date and any amounts excluded from the performance fee. Where your agreement states a number differently from these terms, your agreement wins.`,
      'Your use of the Protected Central software is also covered by our Terms of Service and Privacy Policy. A change to our public prices never changes an agreement you have signed.',
    ],
  },
  {
    id: 'fees', title: 'Fees',
    body: [
      `Unless your agreement says otherwise: a one-time setup fee of ${dollars(G.setupCents)}, due when you sign; a monthly fee of ${dollars(G.monthlyCents)}, due in advance each month from your start date; and a performance fee of ${percent(G.performanceBps)} of net eligible collections, worked out as described below.`,
      'The setup fee is not refundable once setup work has started. Your advertising budget is paid by you directly to the ad platform, and approved third-party services (for example an SMS provider or a call-tracking number) bill you directly. Neither is part of our fees, and we never mark them up.',
      'We do not charge a card or bank account automatically unless you separately authorise it in writing.',
    ],
  },
  {
    id: 'qualifying', title: 'Which jobs carry the performance fee',
    body: ['A job is a qualifying job when all of these are true:'],
    list: [
      'The lead was first recorded through the agreed service while your agreement was in force',
      'It came from the agreed service, not from your own sources, and the person was not your existing customer (see the next section)',
      `The job was won within ${R.attributionDays} days of the lead's first contact (the attribution window), unless your agreement states another window`,
      'You have confirmed the job complete',
    ],
  },
  {
    id: 'existing', title: 'Existing customers and your own leads',
    body: [
      `If a lead is somebody who was already your customer, or who was in contact with your business in the ${R.existingLookbackMonths} months before the lead was recorded, flag them in Jobs & revenue before the job is won, or within ${R.existingCustomerDays} days of the lead being recorded if that is later. Flagged leads carry no fee.`,
      'After that, a lead can only be taken out of the fee by the service team correcting it, on your record showing the earlier relationship. Corrections are made with a reason that both sides can read.',
    ],
  },
  {
    id: 'collections', title: 'What the fee is taken of',
    body: [
      'Eligible collections are the money you actually receive for qualifying jobs — whether it is paid by your customer, an insurer or a financing company, in one payment or in instalments — less sales tax and permit fees, less any other amounts your agreement excludes, and less refunds and chargebacks. Further work won from the same lead within the attribution window counts as part of it.',
      'The fee is never taken of quotes, accepted estimates, unpaid invoices, your other work or your business turnover. It is worked out once on each statement\'s total, rounded to the cent.',
    ],
  },
  {
    id: 'reporting', title: 'Recording jobs and payments',
    body: [
      `You agree to record in Jobs & revenue whether each qualifying lead's job was won or lost, when it is complete, and every payment received for it, within ${R.reportDays} days of it happening. Keep the invoices and payment records for qualifying jobs for ${R.recordYears} years.`,
      'Up to once a quarter we may ask for copies of the invoices and payment records for qualifying leads. Collections found unrecorded are added to the next statement. Re-booking a qualifying lead under another name, or taking payment for it some other way, does not stop the fee applying.',
      'No payment integration is connected: payments are entered by hand. A payment reported by the service team counts only once you confirm it.',
    ],
  },
  {
    id: 'statements', title: 'Statements, review and invoices',
    body: [
      `After each month ends we prepare a statement listing the jobs and payments behind the fee. You have ${R.queryDays} days from receiving it to query any line in the app. Lines you do not query in that time are accepted. A queried line is held until it is answered; the rest of the statement goes ahead.`,
      `We invoice the performance fee once the statement is approved. Invoices are payable within ${R.paymentDays} days. On an invoice more than ${R.paymentDays} days overdue we may, after telling you in writing, pause the service until it is paid and charge interest of ${percent(R.lateBpsMonthly)} a month, or the highest rate the law allows if that is lower.`,
      'An approved statement is not reopened. A correction found later goes on the next statement.',
    ],
  },
  {
    id: 'refunds', title: 'Refunds, chargebacks and disputes',
    body: [
      'A disputed payment is held, and not counted, until the dispute is resolved. A refund or chargeback on a qualifying job reduces the statement on which it is recorded.',
      'If refunds make a statement\'s total negative, the negative balance is carried forward against future performance fees. It is never paid out in cash, and any balance left when your agreement ends lapses.',
    ],
  },
  {
    id: 'service', title: 'What the monthly fee covers',
    body: ['Each month the service includes:'],
    list: [
      ...G.monthlyScope,
      'Anything beyond this — more hours, more campaigns, new pages, custom work — is quoted in writing and starts only once you approve the quote',
    ],
  },
  {
    id: 'results', title: 'No guaranteed results',
    body: [
      'We will do the agreed work carefully, but we do not promise any number of leads, appointments, jobs or amount of revenue. Advertising platforms set their own prices, rules and reach, and their decisions and outages are outside our control. The setup and monthly fees are for the work, whatever it produces.',
    ],
  },
  {
    id: 'calls', title: 'Calls and messages',
    body: [
      'Calls made for you are made by people — no automatic dialler and no prerecorded voice — only to numbers that pass the do-not-call, consent and calling-hour checks (8am to 9pm in the called person\'s time, or narrower where a state requires), and only on scripts you have approved. We may decline any call or message we believe would break the law or a platform\'s rules.',
      'You agree to give us only contact details you have the right to use, to tell us promptly of anybody who asks not to be contacted, and to keep the consent records you hold. You are responsible for the calls and messages your own business makes, and for claims arising from contact lists you supplied.',
    ],
  },
  {
    id: 'your-work', title: 'Your work and your customers',
    body: [
      'You are responsible for your licences, insurance and permits; for your quotes, prices and contracts with your customers; for the work itself, its warranties and its safety; and for collecting what you are owed. We are not a party to your contracts with your customers and are not responsible for your work.',
      'You agree to cover our reasonable losses and costs from any claim made against us arising from your work, from contact lists or content you supplied, or from your breaking these terms.',
    ],
  },
  {
    id: 'term', title: 'How long it runs, and ending it',
    body: [
      `Your agreement runs for a minimum of ${R.minimumMonths} months from its start date and then month to month. After the minimum term either of us may end it with ${R.noticeDays} days' written notice; monthly fees are payable to the end of the notice period.`,
      'We may end it straight away if an invoice is more than 30 days overdue or if either party seriously breaks these terms and does not put it right within 10 days of being told.',
      'When it ends, the performance fee still applies to qualifying jobs from leads recorded while it was in force whose payments are received within the attribution window after the end date, and your duty to record those jobs and payments continues for that time. You can export your data for 30 days after the end.',
    ],
  },
  {
    id: 'liability', title: 'Limit of liability',
    body: [
      `Our total liability under your agreement is limited to the fees you paid us in the ${R.liabilityMonths} months before the event giving rise to the claim. We are not liable for lost profits, lost business, advertising spend or indirect losses. Nothing in these terms limits liability that the law does not allow to be limited.`,
    ],
  },
  {
    id: 'data', title: 'Your data',
    body: [
      'Your customer and job records are yours. We use them only to deliver the service and as our Privacy Policy describes. We may use anonymised, combined figures that identify neither you nor your customers to improve the service.',
    ],
  },
  {
    id: 'general', title: 'Changes and general terms',
    body: [
      'A change to your agreement must be in writing and accepted by both of us. We may update these terms for agreements signed after the update; an agreement already signed keeps the terms it was signed on.',
      'Your agreement is governed by the law of the state it names. If any part of these terms cannot be enforced, the rest still applies. Notices are sent by email to the addresses in your agreement.',
    ],
  },
];
