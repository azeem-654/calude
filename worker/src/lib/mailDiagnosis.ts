/**
 * Why a mailbox would not connect, and what to do about it.
 *
 * A failed connection test used to hand the customer the server's own sentence
 * and stop: "Auth failed: 535 5.7.8 Error: authentication failed". That is
 * accurate and it is useless — it names what happened and nothing about what to
 * change. The people setting up a mailbox are not mail administrators; they
 * have a control panel open in another tab and need to know which field is
 * wrong.
 *
 * So every failure is matched to a diagnosis: one sentence saying what the
 * server actually objected to, and numbered steps in the order worth trying.
 * The raw text is still returned alongside — a diagnosis that hides the
 * evidence is worse than no diagnosis, because nobody can tell when it has
 * guessed wrong.
 *
 * Matching is on the wire text, not on a status code alone. SMTP servers vary
 * in which code they attach to what, but the words are strikingly consistent,
 * and a 535 that says "application-specific password required" wants entirely
 * different advice from one that says "invalid credentials".
 *
 * Ordering matters: the list is walked top to bottom and the first match wins,
 * so the specific patterns come before the general ones.
 */

export type MailDirection = 'outgoing' | 'incoming';

export interface Diagnosis {
  /** What the server objected to, in one sentence, in plain words. */
  summary: string;
  /** What to do, in the order worth trying. */
  steps: string[];
  /** The server's own words, never hidden. */
  raw: string;
}

interface Rule {
  /** Which direction this applies to; omitted means both. */
  only?: MailDirection;
  match: RegExp;
  summary: string;
  steps: string[];
}

/*
 * The password is the single most common cause and it splits three ways: an
 * app password is required, the credentials are simply wrong, or the account is
 * locked. They read almost identically on the wire and want different actions,
 * which is why they are three rules rather than one.
 */
const RULES: Rule[] = [
  {
    match: /application[- ]specific password|app password|AppPasswordRequired|5\.7\.9/i,
    summary: 'The server accepted the connection but wants an app password, not the normal account password.',
    steps: [
      'Sign in to the mail account in a browser.',
      'Turn on two-factor authentication if it is not on already — most providers will not issue an app password without it.',
      'Generate an app password for "mail" or "IMAP/SMTP".',
      'Paste that generated password into the password field here. It replaces the account password; it does not go alongside it.',
      'Validate again.',
    ],
  },
  {
    match: /account.*(disabled|locked|suspended)|too many login|rate.?limit.*login/i,
    summary: 'The provider has locked or throttled this mailbox, so the password could not be checked.',
    steps: [
      'Sign in to the mail account in a browser — there is usually a security prompt waiting to be acknowledged.',
      'Look for a "suspicious sign-in blocked" or "verify it was you" notice and approve it.',
      'If the account is rate-limited, wait fifteen minutes before trying again.',
      'Validate again once the account signs in cleanly in the browser.',
    ],
  },
  {
    match: /auth.*(fail|denied|invalid|unsuccessful)|535|5\.7\.8|AUTHENTICATIONFAILED|rejected the login|not sign in/i,
    summary: 'The server was reached, but it rejected the username or password.',
    steps: [
      'Check the username. It is often the full email address, but not always — Resend uses the word "resend", SendGrid uses "apikey", and some hosts use a short login name.',
      'Re-enter the password rather than assuming it saved. A trailing space pasted from a control panel is the most common single cause.',
      'If the provider issues API keys, make sure the key is in the password field and has not been revoked.',
      'Confirm the mailbox exists on this exact host — a password that is right for one server is a failure on another.',
      'Validate again.',
    ],
  },

  /* Reachability. Distinguishing "wrong name" from "blocked port" matters,
     because the second one is not fixed by editing any field on this form. */
  {
    match: /ENOTFOUND|getaddrinfo|could not resolve|name or service not known|no such host/i,
    summary: 'That host name does not exist in DNS, so nothing could be connected to.',
    steps: [
      'Check the host for a typo — "smpt" for "smtp" is the usual one.',
      'Use the host your provider documents, not your own domain. It is normally something like mail.yourdomain.com, smtp.yourprovider.com or imap.yourprovider.com.',
      'Leave off any https:// prefix and any trailing slash — this is a host name, not a URL.',
      'Validate again.',
    ],
  },
  {
    match: /ECONNREFUSED|connection refused/i,
    summary: 'The host exists but refused a connection on that port — usually the wrong port for this server.',
    steps: [
      'For outgoing mail, try port 587 with STARTTLS, or 465 with SSL/TLS.',
      'For incoming mail, try port 993 with SSL/TLS, or 143 with STARTTLS.',
      'Make sure the encryption setting matches the port. 465 and 993 expect SSL/TLS; 587 and 143 expect STARTTLS.',
      'Check your provider documents this port for this host — some run submission on 2525.',
      'Validate again.',
    ],
  },
  {
    match: /ETIMEDOUT|timed? out|timeout|cannot reach/i,
    summary: 'The connection was opened and never answered, which usually means a firewall between us and the server.',
    steps: [
      'Confirm the host and port against your provider’s documentation.',
      'Try the alternative port — 587 instead of 465 for sending, 143 instead of 993 for receiving.',
      'If your provider restricts access by IP address, allow connections from Cloudflare Workers; the mailbox is contacted from our servers, not from your computer.',
      'Ask your host whether outbound mail ports are open on this account. Some shared hosts block 25 entirely and a few block 465.',
      'Validate again.',
    ],
  },

  /* TLS. The certificate case is worth its own rule: the fix is a different
     host name, which is not obvious from any error a TLS stack produces. */
  {
    match: /refused STARTTLS/i,
    summary: 'The server would not start an encrypted session, so nothing was sent to it.',
    steps: [
      'Switch the encryption setting to SSL/TLS and use port 465 for sending, or 993 for receiving.',
      'If the server genuinely has no encryption, set encryption to None — but only on a server inside your own network. Credentials sent unencrypted across the internet are readable in transit.',
      'Validate again.',
    ],
  },
  {
    match: /certificate|self.?signed|SSL|TLS|handshake|wrong version number/i,
    summary: 'The encrypted connection could not be established, usually a mismatch between the port and the encryption setting.',
    steps: [
      'Pair them correctly: 465 and 993 with SSL/TLS, 587 and 143 with STARTTLS. A mismatch here produces exactly this error.',
      'If your host issued the certificate for its own name rather than your domain, use the host name they document — the certificate has to match the name you connect to.',
      'Validate again.',
    ],
  },

  /* Direction-specific. A folder that does not exist is meaningless outgoing,
     and a rejected from-address is meaningless incoming. */
  {
    only: 'incoming',
    match: /could not open|\[NONEXISTENT\]|no such (mailbox|folder)|TRYCREATE/i,
    summary: 'The sign-in worked, but the folder asked for does not exist on this mailbox.',
    steps: [
      'Set the folder to INBOX, which every IMAP server has.',
      'If you meant a sub-folder, write it exactly as the server spells it, including capitals — some servers use a path like "INBOX.Sales" and others "INBOX/Sales".',
      'Validate again.',
    ],
  },
  {
    only: 'outgoing',
    match: /MAIL FROM|sender.*(reject|denied|not allowed)|5\.7\.1.*sender|not authori[sz]ed to send/i,
    summary: 'The sign-in worked, but the server will not let this account send as that from address.',
    steps: [
      'Make the from address match the mailbox you signed in as. Most servers refuse to send as anyone else.',
      'If you are sending through a provider such as Resend or SendGrid, verify the sending domain in their dashboard first — an unverified domain is refused at this exact point.',
      'If you need a different visible sender, set Reply-To instead of changing the from address.',
      'Validate again.',
    ],
  },
  {
    only: 'outgoing',
    match: /RCPT TO|recipient.*(reject|denied)|relay(ing)? (denied|not permitted)|5\.7\.[0-9]*.*relay/i,
    summary: 'The server accepted the sign-in but refused to relay to the test recipient.',
    steps: [
      'Confirm the account is permitted to send to outside addresses — some hosting mailboxes are internal-only until enabled.',
      'Check the from address belongs to a domain this server is configured to send for.',
      'If your provider requires a verified sender or a verified domain, complete that first.',
      'Validate again.',
    ],
  },

  {
    match: /quota|over.?limit|550 5\.7\.0|daily limit|sending limit/i,
    summary: 'The credentials are right; the account has hit a sending limit.',
    steps: [
      'Wait for the limit to reset — most providers use a rolling 24 hours.',
      'Check the plan’s daily send allowance against what you are trying to send.',
      'If this is a new account, look for a warm-up or trial cap that has to be lifted before bulk sending.',
      'Validate again once the limit has cleared.',
    ],
  },
];

/** The advice when nothing matched — honest that it is generic. */
function fallback(direction: MailDirection, raw: string): Diagnosis {
  const port = direction === 'outgoing' ? '587 with STARTTLS, or 465 with SSL/TLS' : '993 with SSL/TLS, or 143 with STARTTLS';
  return {
    summary: 'The server refused the connection, and its reply does not match a fault we recognise.',
    steps: [
      `Check the host, port and encryption together. For ${direction} mail that is normally ${port}.`,
      'Re-enter the password rather than assuming it saved.',
      'Check the username — it is not always the email address.',
      'Compare every field against the setup page your provider publishes.',
      'If it still fails, the server’s own words are below; your provider’s support can read them directly.',
    ],
    raw,
  };
}

/**
 * Diagnose one failure.
 *
 * `raw` is whatever the SMTP or IMAP layer reported, unedited. Returning it on
 * the diagnosis rather than replacing it is deliberate: when a rule matches the
 * wrong thing, the evidence to notice that is right there.
 */
export function diagnose(direction: MailDirection, raw: string): Diagnosis {
  const text = (raw || '').trim();
  if (!text) return fallback(direction, '');
  for (const rule of RULES) {
    if (rule.only && rule.only !== direction) continue;
    if (rule.match.test(text)) return { summary: rule.summary, steps: rule.steps, raw: text };
  }
  return fallback(direction, text);
}
