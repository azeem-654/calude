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

export const LEGAL_UPDATED = '25 September 2026';
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
      'Some features use Google\'s Gemini models, called from our servers. They receive what the task you asked for needs — for example your business profile and your request when writing a post, the files or web pages you give the project wizard, or the email being replied to — and not your whole workspace. Your contact list is not sent; messages are written with placeholders that we fill in ourselves.',
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
      'We use one essential cookie to keep you signed in, marked so that page scripts cannot read it, and the browser\'s local storage for your workspace preferences. We do not use advertising or third-party tracking cookies. Emails sent through the platform may include open and click tracking for the sender\'s reports.',
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
