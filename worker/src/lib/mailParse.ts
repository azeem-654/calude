/**
 * Mail settings from whatever a customer pastes — pure, shared with the browser.
 *
 * People arrive with their settings in every shape but a form: the welcome
 * email their host sent, a spreadsheet of forty mailboxes, `email:password`
 * lines from a reseller, a help page copied whole. Asking them to retype each
 * one into six boxes per direction is where bulk onboarding died. This turns
 * the paste into one record per address, and says where each setting came
 * from, so the review table can show it before anything is saved.
 *
 * What it will not do is invent. A field it could not find stays empty (port
 * 0, host ''), and only `finalise()` fills the usual port/encryption pairing —
 * marked as such — after the lookups have had their chance. The known
 * providers table is the one place settings are asserted without a paste or
 * a lookup, and every entry is a provider's published setting.
 *
 * Imported by the React app (components/Settings/MailboxImport.tsx) and by the
 * Worker (routes/mailbox.ts, lib/mailLookup.ts): no DOM, no Workers globals.
 */

export type Security = 'ssl' | 'tls' | 'none';
export type Side = 'smtp' | 'imap';

export interface ServerSettings {
  host: string;
  /** 0 = not known yet. */
  port: number;
  security: Security | '';
  username: string;
  password: string;
  /** Where the host came from: 'pasted', 'screenshot', 'Gmail (known settings)', 'Mozilla ISPDB'… */
  source: string;
}

export interface MailRecord {
  email: string;
  name: string;
  /** Shared password, when one was given for both directions. */
  password: string;
  smtp: ServerSettings;
  imap: ServerSettings;
  /** The provider recognised, for display ('Gmail', 'Hostinger'); '' when none. */
  provider: string;
  /** Plain-words warnings: app passwords, POP-only, guessed pairings. */
  notes: string[];
}

/** One provider's published settings. `username` is how the login is formed. */
export interface KnownProvider {
  id: string;
  name: string;
  smtp: { host: string; port: number; security: Security };
  imap: { host: string; port: number; security: Security };
  username?: 'email' | 'local';
  /** Said to the customer, plainly, when this provider is matched. */
  note?: string;
  /** This provider refuses the account password for mail apps. */
  appPassword?: boolean;
  /** Cannot be connected from a cloud service at all. */
  unsupported?: boolean;
}

const APP_PW = (who: string, where: string) =>
  `${who} refuses your normal password here: turn on 2-step verification and create an app password (${where}), then paste that instead.`;

/**
 * The providers' own published settings. Hosts and ports are what each
 * provider documents for IMAP and SMTP; nothing here is a guess. Adding one:
 * its domains go in DOMAINS below, its MX pattern in MX_PATTERNS.
 */
export const KNOWN_PROVIDERS: Record<string, KnownProvider> = {
  gmail: {
    id: 'gmail', name: 'Gmail',
    smtp: { host: 'smtp.gmail.com', port: 465, security: 'ssl' },
    imap: { host: 'imap.gmail.com', port: 993, security: 'ssl' },
    appPassword: true,
    note: APP_PW('Google', 'myaccount.google.com/apppasswords'),
  },
  google: {
    id: 'google', name: 'Google Workspace',
    smtp: { host: 'smtp.gmail.com', port: 465, security: 'ssl' },
    imap: { host: 'imap.gmail.com', port: 993, security: 'ssl' },
    appPassword: true,
    note: APP_PW('Google', 'myaccount.google.com/apppasswords — your admin may have to allow it'),
  },
  outlook: {
    id: 'outlook', name: 'Outlook.com',
    smtp: { host: 'smtp-mail.outlook.com', port: 587, security: 'tls' },
    imap: { host: 'outlook.office365.com', port: 993, security: 'ssl' },
    appPassword: true,
    note: 'Microsoft is switching off password sign-in for mail apps. If a correct password is refused, turn on two-step verification and create an app password at account.microsoft.com/security.',
  },
  microsoft365: {
    id: 'microsoft365', name: 'Microsoft 365',
    smtp: { host: 'smtp.office365.com', port: 587, security: 'tls' },
    imap: { host: 'outlook.office365.com', port: 993, security: 'ssl' },
    appPassword: true,
    note: 'Microsoft 365 often has password sign-in for mail apps switched off. If a correct password is refused, your admin must allow "Authenticated SMTP" and IMAP for this mailbox, or you need an app password.',
  },
  yahoo: {
    id: 'yahoo', name: 'Yahoo Mail',
    smtp: { host: 'smtp.mail.yahoo.com', port: 465, security: 'ssl' },
    imap: { host: 'imap.mail.yahoo.com', port: 993, security: 'ssl' },
    appPassword: true,
    note: APP_PW('Yahoo', 'Account security → Generate app password'),
  },
  aol: {
    id: 'aol', name: 'AOL Mail',
    smtp: { host: 'smtp.aol.com', port: 465, security: 'ssl' },
    imap: { host: 'imap.aol.com', port: 993, security: 'ssl' },
    appPassword: true,
    note: APP_PW('AOL', 'Account security → Generate app password'),
  },
  icloud: {
    id: 'icloud', name: 'iCloud Mail',
    smtp: { host: 'smtp.mail.me.com', port: 587, security: 'tls' },
    imap: { host: 'imap.mail.me.com', port: 993, security: 'ssl' },
    appPassword: true,
    note: APP_PW('Apple', 'account.apple.com → Sign-In and Security → App-Specific Passwords'),
  },
  zoho: {
    id: 'zoho', name: 'Zoho Mail',
    smtp: { host: 'smtp.zoho.com', port: 465, security: 'ssl' },
    imap: { host: 'imap.zoho.com', port: 993, security: 'ssl' },
    note: 'Zoho: IMAP access must be switched on (Settings → Mail Accounts → IMAP). With two-factor sign-in on, use an app-specific password.',
  },
  zohopro: {
    id: 'zohopro', name: 'Zoho Mail (business)',
    smtp: { host: 'smtppro.zoho.com', port: 465, security: 'ssl' },
    imap: { host: 'imappro.zoho.com', port: 993, security: 'ssl' },
    note: 'Zoho: IMAP access must be switched on (Settings → Mail Accounts → IMAP). With two-factor sign-in on, use an app-specific password.',
  },
  godaddy: {
    id: 'godaddy', name: 'GoDaddy Workspace Email',
    smtp: { host: 'smtpout.secureserver.net', port: 465, security: 'ssl' },
    imap: { host: 'imap.secureserver.net', port: 993, security: 'ssl' },
  },
  hostinger: {
    id: 'hostinger', name: 'Hostinger',
    smtp: { host: 'smtp.hostinger.com', port: 465, security: 'ssl' },
    imap: { host: 'imap.hostinger.com', port: 993, security: 'ssl' },
  },
  privateemail: {
    id: 'privateemail', name: 'Namecheap Private Email',
    smtp: { host: 'mail.privateemail.com', port: 465, security: 'ssl' },
    imap: { host: 'mail.privateemail.com', port: 993, security: 'ssl' },
  },
  titan: {
    id: 'titan', name: 'Titan Email',
    smtp: { host: 'smtp.titan.email', port: 465, security: 'ssl' },
    imap: { host: 'imap.titan.email', port: 993, security: 'ssl' },
  },
  yandex: {
    id: 'yandex', name: 'Yandex Mail',
    smtp: { host: 'smtp.yandex.com', port: 465, security: 'ssl' },
    imap: { host: 'imap.yandex.com', port: 993, security: 'ssl' },
    appPassword: true,
    note: APP_PW('Yandex', 'Yandex ID → Security → App passwords'),
  },
  fastmail: {
    id: 'fastmail', name: 'Fastmail',
    smtp: { host: 'smtp.fastmail.com', port: 465, security: 'ssl' },
    imap: { host: 'imap.fastmail.com', port: 993, security: 'ssl' },
    appPassword: true,
    note: APP_PW('Fastmail', 'Settings → Privacy & Security → App passwords'),
  },
  gmx: {
    id: 'gmx', name: 'GMX',
    smtp: { host: 'mail.gmx.com', port: 587, security: 'tls' },
    imap: { host: 'imap.gmx.com', port: 993, security: 'ssl' },
    note: 'GMX: allow access by mail apps first (Settings → POP3 & IMAP).',
  },
  mailcom: {
    id: 'mailcom', name: 'mail.com',
    smtp: { host: 'smtp.mail.com', port: 587, security: 'tls' },
    imap: { host: 'imap.mail.com', port: 993, security: 'ssl' },
    note: 'mail.com: allow access by mail apps first (Settings → POP3 & IMAP).',
  },
  ionos: {
    id: 'ionos', name: 'IONOS',
    smtp: { host: 'smtp.ionos.com', port: 465, security: 'ssl' },
    imap: { host: 'imap.ionos.com', port: 993, security: 'ssl' },
  },
  rackspace: {
    id: 'rackspace', name: 'Rackspace Email',
    smtp: { host: 'secure.emailsrvr.com', port: 465, security: 'ssl' },
    imap: { host: 'secure.emailsrvr.com', port: 993, security: 'ssl' },
  },
  proton: {
    id: 'proton', name: 'Proton Mail',
    smtp: { host: '127.0.0.1', port: 1025, security: 'tls' },
    imap: { host: '127.0.0.1', port: 1143, security: 'tls' },
    unsupported: true,
    note: 'Proton Mail only connects through Proton Mail Bridge running on your own computer, which a cloud service cannot reach. Use a different mailbox, or a sending provider.',
  },
};

/** Address domains that belong to one provider outright. */
const DOMAINS: [RegExp, string][] = [
  [/^(gmail|googlemail)\.com$/, 'gmail'],
  [/^(outlook|hotmail|live|msn|passport)\.[a-z.]+$/, 'outlook'],
  [/^(yahoo|ymail|rocketmail)\.[a-z.]+$/, 'yahoo'],
  [/^(aol|aim)\.com$/, 'aol'],
  [/^(icloud|me|mac)\.com$/, 'icloud'],
  [/^(zoho|zohomail)\.com$/, 'zoho'],
  [/^(yandex)\.[a-z.]+$|^ya\.ru$/, 'yandex'],
  [/^fastmail\.(com|fm)$/, 'fastmail'],
  [/^gmx\.(com|us)$/, 'gmx'],
  [/^mail\.com$/, 'mailcom'],
  [/^(proton|protonmail)\.(me|com|ch)$|^pm\.me$/, 'proton'],
];

/** What a custom domain's MX records say about who hosts its mail. */
const MX_PATTERNS: [RegExp, string][] = [
  [/(^|\.)(google|googlemail)\.com\.?$/, 'google'],
  [/\.mail\.protection\.outlook\.com\.?$|(^|\.)outlook\.com\.?$/, 'microsoft365'],
  [/(^|\.)zoho\.(com|eu|in|com\.au|jp)\.?$|(^|\.)zohomail\.com\.?$/, 'zohopro'],
  [/(^|\.)secureserver\.net\.?$/, 'godaddy'],
  [/(^|\.)hostinger\.(com|[a-z.]+)\.?$/, 'hostinger'],
  [/(^|\.)privateemail\.com\.?$/, 'privateemail'],
  [/(^|\.)titan\.email\.?$/, 'titan'],
  [/(^|\.)yandex\.(net|ru)\.?$/, 'yandex'],
  [/(^|\.)messagingengine\.com\.?$/, 'fastmail'],
  [/(^|\.)mail\.icloud\.com\.?$/, 'icloud'],
  [/(^|\.)(ionos|1and1|perfora)\.[a-z.]+\.?$|(^|\.)kundenserver\.de\.?$/, 'ionos'],
  [/(^|\.)emailsrvr\.com\.?$/, 'rackspace'],
  [/(^|\.)protonmail\.ch\.?$/, 'proton'],
  [/(^|\.)yahoodns\.net\.?$/, 'yahoo'],
];

export const domainOf = (email: string): string => (email.split('@')[1] ?? '').toLowerCase().trim();

export function providerForDomain(domain: string): KnownProvider | null {
  const d = domain.toLowerCase().trim();
  for (const [re, id] of DOMAINS) if (re.test(d)) return KNOWN_PROVIDERS[id];
  return null;
}

/** Zoho's and IONOS's hosts follow the region the MX names (zoho.eu → smtppro.zoho.eu). */
export function providerForMx(mxHosts: string[]): KnownProvider | null {
  for (const raw of mxHosts) {
    const mx = raw.toLowerCase().trim().replace(/\.$/, '');
    for (const [re, id] of MX_PATTERNS) {
      if (!re.test(mx)) continue;
      const p = KNOWN_PROVIDERS[id];
      const zoho = id === 'zohopro' && mx.match(/zoho\.(eu|in|com\.au|jp)$/);
      if (zoho) {
        const t = zoho[1];
        return { ...p, smtp: { ...p.smtp, host: `smtppro.zoho.${t}` }, imap: { ...p.imap, host: `imappro.zoho.${t}` } };
      }
      const ionos = id === 'ionos' && mx.match(/ionos\.(co\.uk|de|es|fr|it|ca|mx)$/);
      if (ionos) {
        const t = ionos[1];
        return { ...p, smtp: { ...p.smtp, host: `smtp.ionos.${t}` }, imap: { ...p.imap, host: `imap.ionos.${t}` } };
      }
      return p;
    }
  }
  return null;
}

/* ── Small readers ─────────────────────────────────────────────────────── */

const EMAIL_RE = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
const EMAIL_ONLY = new RegExp(`^${EMAIL_RE.source}$`);
const HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}\.?$/i;
const IP_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;
/** Hosts whose first label says "mail server" — so `pass.word` is a password, `mail.x.com` a host. */
const MAILISH = /^(smtp|smtps|imap|imaps|mail|pop|pop3|mx|smtpout|outgoing|incoming|out|in|send|secure|email|exchange|outlook|webmail|smtp-mail|imap-mail|mailout|relay|smtp-relay)\d*([.-]|$)/i;
const SMTP_PORTS = new Set([25, 465, 587, 2525, 2587, 26]);
const IMAP_PORTS = new Set([143, 993]);
const POP_PORTS = new Set([110, 995]);

export const isEmail = (s: string): boolean => EMAIL_ONLY.test(s.trim());
export const isHost = (s: string): boolean => {
  const t = s.trim().replace(/\.$/, '');
  return (HOST_RE.test(t) && !EMAIL_ONLY.test(t)) || IP_RE.test(t);
};

/** The pairing nobody should have to know: 465/993 are SSL from the first byte, 587/143 upgrade. */
export function securityForPort(side: Side, port: number): Security | '' {
  if (side === 'smtp') return port === 465 ? 'ssl' : port === 587 || port === 2525 || port === 25 || port === 2587 ? 'tls' : '';
  return port === 993 ? 'ssl' : port === 143 ? 'tls' : '';
}
export function portForSecurity(side: Side, sec: Security | ''): number {
  if (side === 'smtp') return sec === 'ssl' ? 465 : sec === 'tls' ? 587 : sec === 'none' ? 587 : 0;
  return sec === 'ssl' ? 993 : sec === 'tls' || sec === 'none' ? 143 : 0;
}

/** "SSL/TLS", "STARTTLS", "Yes" under an SSL label… → one of three. */
export function readSecurity(text: string, labelHint = ''): Security | '' {
  const t = text.toLowerCase();
  const l = labelHint.toLowerCase();
  if (/starttls|start tls|start-tls/.test(t)) return 'tls';
  if (/ssl\s*\/\s*tls|tls\s*\/\s*ssl|implicit|ssl/.test(t)) return 'ssl';
  if (/\btls\b/.test(t)) return 'tls';
  if (/^\s*(none|no|off|plain|unencrypted|false|0)\b/.test(t)) return 'none';
  if (/^\s*(yes|on|true|required|1|enabled?)\b/.test(t)) {
    if (/starttls/.test(l)) return 'tls';
    if (/ssl/.test(l)) return 'ssl';
    if (/tls/.test(l)) return 'tls';
  }
  return '';
}

const emptySide = (): ServerSettings => ({ host: '', port: 0, security: '', username: '', password: '', source: '' });
export const emptyRecord = (email = ''): MailRecord => ({
  email, name: '', password: '', smtp: emptySide(), imap: emptySide(), provider: '', notes: [],
});

/** Placeholder text in "Password: (your email password)" — not a password. */
const PLACEHOLDER_PW = /^(\(|<|\[|\*{3,}|•{3,}|x{4,}$)|^(your|the|same|use|as |enter|n\/a|none$|-$)|password (you|for)|account password|email password/i;

/** Lines a pasted email carries that are not settings — never a mailbox. */
const HEADER_LINE = /^\s*(from|to|cc|bcc|reply-to|sender|subject|date|sent|received|return-path|message-id|delivered-to)\s*:/i;
/** Addresses in prose that are the provider's, not the customer's. */
const ROLE_LOCAL = /^(no-?reply|do-?not-?reply|support|help|billing|sales|abuse|postmaster|mailer-daemon|notifications?|noreply-[\w-]+)$/i;

/* ── Labels ────────────────────────────────────────────────────────────── */

type Field = 'host' | 'port' | 'security' | 'username' | 'password' | 'email' | 'name' | 'side' | 'ignore';
interface Label { field: Field; side: Side | 'pop' | '' }

/** What a label like "Outgoing Mail (SMTP) Server" means, or null when it is not a settings label. */
export function readLabel(raw: string): Label | null {
  const l = ` ${raw.toLowerCase().replace(/[^a-z0-9/]+/g, ' ').trim()} `;
  if (!l.trim() || l.trim().length > 48) return null;
  const side: Side | 'pop' | '' =
    /\b(pop|pop3)\b/.test(l) ? 'pop'
      : /\b(imap|imaps|incoming|inbound|receiving|receive)\b/.test(l) ? 'imap'
        : /\b(smtp|smtps|outgoing|outbound|sending|send)\b/.test(l) ? 'smtp' : '';
  if (/\b(authentication|auth method|requires authentication|spa)\b/.test(l)) return { field: 'ignore', side };
  if (/\b(from name|display name|sender name|your name|full name)\b/.test(l) || /^ name $/.test(l)) return { field: 'name', side };
  if (/\b(password|passwd|pass|pwd|passcode|app password)\b/.test(l)) return { field: 'password', side };
  if (/\bport\b/.test(l)) return { field: 'port', side };
  if (/\b(ssl|tls|starttls|security|encryption|secure connection|connection security|secure|socket)\b/.test(l)) {
    /* "Server (SSL)" is still a server. */
    if (/\b(server|host|hostname)\b/.test(l)) return { field: 'host', side };
    return { field: 'security', side };
  }
  if (/\b(user ?name|username|user|login|user id|account name)\b/.test(l)) return { field: 'username', side };
  if (/\b(server|host|hostname|server name|host name|mail server)\b/.test(l)) return { field: 'host', side };
  if (/\b(e ?mail|email address|address|account|mailbox|e mail address)\b/.test(l)) return { field: 'email', side };
  /* A bare "SMTP:" / "IMAP:" is a host: "SMTP: smtp.x.com:587". */
  if (side && l.trim().split(' ').length <= 3) return { field: 'side', side };
  return null;
}

const LABEL_START = /^\(?(outgoing|incoming|inbound|outbound|smtps?|imaps?|pop3?|mail|e-?mail|server|host|hostname|port|ssl|tls|starttls|security|encryption|secure|connection|user|username|login|password|passwd|pass|pwd|passcode|app|requires?|account|full|display|from|sender|your|name|sending|receiving|authentication|use|socket|address|mailbox)\b/i;

/** "Label: value  Label: value" on one line → pairs; a lone label with nothing after → value ''. */
function labelPairs(line: string): { label: string; lab: Label; value: string }[] | null {
  /* Tab-separated "Label<TAB>value", the way help pages paste. */
  const tabs = line.split('\t').map(s => s.trim()).filter(Boolean);
  if (tabs.length === 2 && !/[:=]\s/.test(tabs[0])) {
    const lab = readLabel(tabs[0]);
    if (lab && !isEmail(tabs[0]) && !isHost(tabs[0])) return [{ label: tabs[0], lab, value: tabs[1] }];
  }
  const re = /([A-Za-z][A-Za-z0-9 ()/_&'-]*?)\s*(?:[:=]|\s-\s|\s–\s)/g;
  const hits: { at: number; end: number; label: string; lab: Label }[] = [];
  for (let m = re.exec(line); m; m = re.exec(line)) {
    const cand = m[1];
    /* The candidate may have swallowed the end of the previous value ("com  Port"):
       the longest run of trailing words that is a label is the label. */
    const starts: number[] = [];
    for (const w of cand.matchAll(/\S+/g)) starts.push(w.index ?? 0);
    let found = false;
    for (const st of starts) {
      const tail = cand.slice(st).trim();
      /* "com  Port" (the end of a host, then a label) must not read as one label. */
      if (!LABEL_START.test(tail)) continue;
      const lab = readLabel(tail);
      if (lab) { hits.push({ at: m.index + st, end: m.index + m[0].length, label: tail, lab }); found = true; break; }
    }
    /* Nothing after a password is another label — a password may contain "word: ". */
    if (found && hits[hits.length - 1].lab.field === 'password') break;
  }
  if (!hits.length) return null;
  /* The text before the first label must be nothing (or a bullet) — otherwise this is prose. */
  if (line.slice(0, hits[0].at).replace(/[\s\-*•·>#\d.)]+/g, '') !== '') return null;
  return hits.map((h, i) => ({
    label: h.label, lab: h.lab,
    value: line.slice(h.end, i + 1 < hits.length ? hits[i + 1].at : undefined).trim().replace(/^[:=\s]+/, '').replace(/[,;|\s]+$/, ''),
  }));
}

/* ── Values ────────────────────────────────────────────────────────────── */

interface Partial3 { host?: string; port?: number; security?: Security | '' }

/** "smtp.x.com:587", "smtp.x.com (port 465, SSL)", "465 (SSL)" → the parts. */
function readServerValue(value: string, labelText: string): Partial3 {
  const out: Partial3 = {};
  const hostPort = value.match(/([A-Za-z0-9.-]+\.[A-Za-z]{2,}|\d{1,3}(?:\.\d{1,3}){3}):(\d{2,5})\b/);
  if (hostPort && isHost(hostPort[1])) { out.host = hostPort[1].toLowerCase().replace(/\.$/, ''); out.port = Number(hostPort[2]); }
  if (!out.host) {
    for (const tok of value.split(/[\s,;()|[\]<>"']+/)) {
      const t = tok.replace(/[.:]+$/, '');
      if (t && isHost(t) && !isEmail(t)) { out.host = t.toLowerCase(); break; }
    }
  }
  if (!out.port) {
    const p = value.match(/port\s*[:#]?\s*(\d{2,5})/i) ?? value.match(/(?:^|[\s(,])(\d{2,5})(?=$|[\s),;])/);
    if (p) { const n = Number(p[1]); if (n > 0 && n < 65536) out.port = n; }
  }
  const sec = readSecurity(value.replace(out.host ?? '\u0000', ''), labelText);
  if (sec) out.security = sec;
  return out;
}

/* ── Rows of a table ───────────────────────────────────────────────────── */

/** Split one CSV/TSV row, honouring double quotes. */
export function splitRow(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"' && cur.trim() === '') { q = true; cur = ''; }
    else if (c === delim) { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

type Col = { field: Field; side: Side | 'pop' | '' } | null;

function headerColumns(cells: string[]): Col[] | null {
  /* A header is short words: no address, host, "label: value" or port number in it. */
  if (cells.length < 2 || cells.some(c => isEmail(c) || isHost(c) || /[:=@]|\d{2,}/.test(c) || c.length > 40 || c.split(/\s+/).length > 4)) return null;
  const cols = cells.map(c => {
    const lab = readLabel(c);
    if (!lab) return null;
    if (lab.field === 'side') return { field: 'host' as Field, side: lab.side };
    return lab;
  });
  const known = cols.filter(Boolean) as Label[];
  /* "Full Name<TAB>Your name" is a label and its value, not a header: a header names
     different things, and at least one that identifies a mailbox or its server. */
  const fields = new Set(known.map(c => c.field));
  const identifies = known.filter(c => ['email', 'username', 'host', 'password', 'side'].includes(c.field)).length >= 2;
  return known.length >= 2 && fields.size >= 2 && identifies && known.length >= Math.ceil(cells.length / 2) ? cols : null;
}

/* ── Free-form lines: "email password host port" ──────────────────────── */

const SEC_WORD = /^(ssl|tls|starttls|ssl\/tls|none)$/i;

/**
 * A line that starts with an address. Everything after it is split on the
 * line's own delimiter; hosts, ports and encryption words are recognised and
 * what is left, in order, is the password — so a password may itself contain
 * the delimiter, as long as no piece of it looks like a mail host.
 */
function readLooseLine(line: string): MailRecord | null {
  const m = line.match(/^\s*(?:[-*•>\d.)]+\s+)?["'<]?([A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})["'>]?/);
  if (!m) return null;
  const rec = emptyRecord(m[1].toLowerCase());
  let rest = line.slice(m[0].length);
  const delim = rest.includes('\t') ? '\t' : rest.includes('|') ? '|' : rest.includes(';') ? ';'
    : /,/.test(rest) && !/\s/.test(rest.replace(/,\s/g, ',').trim()) ? ',' : /\S\s+\S/.test(rest.trim()) ? ' ' : rest.includes(',') ? ',' : ':';
  rest = rest.replace(new RegExp(`^\\s*[${delim === ' ' ? ':,;|\\s' : `${delim === '|' ? '\\|' : delim}:\\s`}]`), '');
  if (!rest.trim()) return rec;
  const toks = delim === ' ' ? rest.trim().split(/\s+/) : rest.split(delim).map(s => s.trim());

  type Tok = { kind: 'host' | 'port' | 'sec' | 'email' | 'other'; v: string };
  const kinds: Tok[] = toks.map((t, i) => {
    const bare = t.replace(/^["']|["']$/g, '');
    /* The first piece is never a port: "email 123456 smtp.x.com" has a numeric password. */
    if (/^\d{2,5}$/.test(bare) && i > 0) return { kind: 'port', v: bare };
    if (SEC_WORD.test(bare)) return { kind: 'sec', v: bare };
    if (isEmail(bare)) return { kind: 'email', v: bare };
    if (/^[A-Za-z0-9.-]+:\d{2,5}$/.test(bare) && isHost(bare.split(':')[0])) return { kind: 'host', v: bare };
    /* The first piece is the password unless it is plainly a mail server. */
    if (isHost(bare) && (i > 0 || MAILISH.test(bare) || bare.toLowerCase() === domainOf(rec.email))) return { kind: 'host', v: bare };
    return { kind: 'other', v: t };
  });

  /* Join only the first run of "other" pieces — a later stray word is not part of it. */
  const firstOther = kinds.findIndex(k => k.kind === 'other');
  if (firstOther >= 0) {
    let j = firstOther;
    const run: string[] = [];
    while (j < kinds.length && kinds[j].kind === 'other') run.push(kinds[j++].v);
    rec.password = run.join(delim === ' ' ? ' ' : delim);
  }

  /* Hosts, and the ports and encryption words that follow each. */
  const hosts: { host: string; port: number; sec: Security | '' }[] = [];
  const loosePorts: number[] = [];
  let looseSec: Security | '' = '';
  for (const k of kinds) {
    if (k.kind === 'host') {
      const [h, p] = k.v.split(':');
      hosts.push({ host: h.toLowerCase().replace(/\.$/, ''), port: Number(p) || 0, sec: '' });
    } else if (k.kind === 'port') {
      const n = Number(k.v);
      const last = hosts[hosts.length - 1];
      if (last && !last.port) last.port = n; else loosePorts.push(n);
    } else if (k.kind === 'sec') {
      const s = readSecurity(k.v);
      const last = hosts[hosts.length - 1];
      if (last && !last.sec) last.sec = s; else looseSec = s;
    }
  }
  const sideOf = (h: { host: string; port: number }, i: number, n: number): Side | 'both' => {
    if (/(^|[.-])(imap|imaps|incoming|pop|pop3|in)\d*[.-]/.test(h.host)) return 'imap';
    if (/(^|[.-])(smtp|smtps|outgoing|smtpout|send|out|relay)\d*[.-]/.test(h.host)) return 'smtp';
    /* One host named for neither (mail.acme.com) serves both; its port goes to the side it fits. */
    if (n === 1) return 'both';
    if (IMAP_PORTS.has(h.port)) return 'imap';
    if (SMTP_PORTS.has(h.port)) return 'smtp';
    return i === 0 ? 'smtp' : 'imap';
  };
  hosts.forEach((h, i) => {
    const side = sideOf(h, i, hosts.length);
    const apply = (s: Side) => {
      const t = rec[s];
      if (t.host) return;
      t.host = h.host;
      if (side !== 'both' || (s === 'smtp' ? SMTP_PORTS.has(h.port) : IMAP_PORTS.has(h.port))) {
        t.port = h.port;
        t.security = h.sec;
      }
      t.source = 'pasted';
    };
    if (side === 'both') { apply('smtp'); apply('imap'); } else apply(side);
  });
  for (const p of loosePorts) {
    const s: Side | null = SMTP_PORTS.has(p) ? 'smtp' : IMAP_PORTS.has(p) ? 'imap' : null;
    if (s && !rec[s].port) rec[s].port = p;
  }
  if (looseSec) for (const s of ['smtp', 'imap'] as Side[]) if (!rec[s].security && rec[s].host) rec[s].security = looseSec;
  const extraEmail = kinds.find(k => k.kind === 'email');
  if (extraEmail) rec.smtp.username = rec.imap.username = extraEmail.v;
  return rec;
}

/* ── Putting a block together ──────────────────────────────────────────── */

interface Seg { rec: MailRecord; hasEmail: boolean; touched: boolean }

function setField(rec: MailRecord, field: Field, side: Side | 'both', value: string, labelText: string, source: string): void {
  const sides: Side[] = side === 'both' ? ['smtp', 'imap'] : [side];
  if (field === 'password') {
    const v = value.trim();
    if (!v || PLACEHOLDER_PW.test(v)) return;
    if (side === 'both') { if (!rec.password) rec.password = v; }
    else if (!rec[side].password) rec[side].password = v;
    return;
  }
  if (field === 'name') { if (!rec.name && value.trim()) rec.name = value.trim().slice(0, 120); return; }
  if (field === 'username') {
    const v = value.trim().split(/\s+/)[0] ?? '';
    if (!v || /^(your|the|same|full)$/i.test(v)) return;
    for (const s of sides) if (!rec[s].username) rec[s].username = v;
    return;
  }
  if (field === 'port') {
    const r = readServerValue(value, labelText);
    const n = r.port ?? 0;
    if (!n) return;
    let targets = sides;
    if (side === 'both') {
      targets = SMTP_PORTS.has(n) ? ['smtp'] : IMAP_PORTS.has(n) ? ['imap'] : POP_PORTS.has(n) ? [] : [];
    }
    const sec = r.security || readSecurity(labelText) || '';
    for (const s of targets) {
      if (!rec[s].port) { rec[s].port = n; if (sec && !rec[s].security) rec[s].security = sec; }
    }
    return;
  }
  if (field === 'security') {
    const sec = readSecurity(value, labelText);
    if (!sec) return;
    for (const s of sides) if (!rec[s].security) rec[s].security = sec;
    return;
  }
  if (field === 'host' || field === 'side') {
    const r = readServerValue(value, labelText);
    if (!r.host) return;
    for (const s of sides) {
      const t = rec[s];
      if (t.host) continue;
      t.host = r.host; t.source = source;
      if (r.port && !t.port) t.port = r.port;
      if (r.security && !t.security) t.security = r.security;
      else if (!t.security) { const ls = readSecurity('', labelText); if (ls) t.security = ls; }
    }
  }
}

/** Fill `into` from `from` wherever `into` is empty. */
function fillFrom(into: MailRecord, from: MailRecord): void {
  if (!into.password && from.password) into.password = from.password;
  if (!into.name && from.name) into.name = from.name;
  for (const s of ['smtp', 'imap'] as Side[]) {
    const a = into[s], b = from[s];
    if (!a.host && b.host) { a.host = b.host; a.source = b.source; if (!a.port) a.port = b.port; if (!a.security) a.security = b.security; }
    else if (a.host && a.host === b.host) { if (!a.port) a.port = b.port; if (!a.security) a.security = b.security; }
    else if (!a.host) { if (!a.port) a.port = b.port; if (!a.security) a.security = b.security; }
    if (!a.username && b.username) a.username = b.username;
    if (!a.password && b.password) a.password = b.password;
  }
  for (const n of from.notes) if (!into.notes.includes(n)) into.notes.push(n);
}

const hasSettings = (r: MailRecord): boolean =>
  !!(r.smtp.host || r.imap.host || r.smtp.port || r.imap.port || r.password || r.smtp.password || r.imap.password || r.smtp.username || r.imap.username || r.smtp.security || r.imap.security);

/** Does host `h` belong to the address's own domain (mail.acme.com for bob@acme.com)? */
const sameDomain = (h: string, email: string): boolean => {
  const d = domainOf(email);
  return !!d && !!h && (h === d || h.endsWith(`.${d}`));
};

/**
 * Turn any pasted text into one record per mailbox.
 *
 * `source` names where the text came from ('pasted', or 'screenshot' when the
 * AI transcribed a picture), and is what the review table shows for settings
 * found in it.
 */
export function parseMailSettings(text: string, source = 'pasted'): MailRecord[] {
  const byEmail = new Map<string, MailRecord>();
  const order: string[] = [];
  const add = (r: MailRecord): MailRecord => {
    const k = r.email.toLowerCase();
    const have = byEmail.get(k);
    if (have) { fillFrom(have, r); return have; }
    byEmail.set(k, r); order.push(k);
    return r;
  };
  const floating: MailRecord[] = [];
  const proseEmails: string[] = [];
  let sawPop = false;

  const clean = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<\/t[dh]>/gi, '\t').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[​ ]/g, ' ')
    .slice(0, 200_000);

  const blocks = clean.split(/\n[ \t]*\n+/);
  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l.trim());
    if (!lines.length) continue;
    const segs: Seg[] = [{ rec: emptyRecord(), hasEmail: false, touched: false }];
    const loose: MailRecord[] = [];
    let side: Side | 'pop' | '' = '';
    let header: Col[] | null = null;
    let headerText: string[] = [];
    let headerDelim = '';

    for (const line of lines) {
      if (HEADER_LINE.test(line)) continue;

      /* A table: a header row, then rows in the same shape. */
      const delim = line.includes('\t') ? '\t' : line.includes(';') ? ';' : line.includes('|') ? '|' : line.includes(',') ? ',' : '';
      if (delim) {
        const cells = splitRow(line, delim);
        const cols = headerColumns(cells);
        if (cols) { header = cols; headerText = cells; headerDelim = delim; continue; }
        if (header && delim === headerDelim && cells.length >= 2) {
          const rec = emptyRecord();
          cells.forEach((cell, i) => {
            const col = header![i];
            if (!col || !cell) return;
            const cs: Side | 'both' = col.side === 'smtp' || col.side === 'imap' ? col.side : 'both';
            if (col.side === 'pop') return;
            if (col.field === 'email') { if (isEmail(cell)) rec.email = cell.toLowerCase(); return; }
            if (col.field === 'username' && isEmail(cell) && !rec.email) rec.email = cell.toLowerCase();
            setField(rec, col.field === 'side' ? 'host' : col.field, cs, cell, headerText[i] ?? '', source);
          });
          if (rec.email) loose.push(rec);
          else if (hasSettings(rec)) floating.push(rec);
          continue;
        }
      }

      /* Labelled settings: "SMTP server: smtp.x.com  Port: 587". */
      const pairs = labelPairs(line);
      if (pairs) {
        for (const p of pairs) {
          const lab = p.lab;
          if (lab.field === 'ignore') { if (lab.side) side = lab.side; continue; }
          if (lab.side) side = lab.side;
          const eff: Side | 'pop' | '' = lab.side || side;
          if (eff === 'pop') { sawPop = true; continue; }
          const cur = segs[segs.length - 1];
          if (lab.field === 'email' || (lab.field === 'username' && isEmail(p.value.split(/\s+/)[0] ?? ''))) {
            const e = (p.value.match(EMAIL_RE)?.[0] ?? '').toLowerCase();
            if (e) {
              if (cur.hasEmail && cur.rec.email !== e) segs.push({ rec: emptyRecord(e), hasEmail: true, touched: true });
              else { cur.rec.email = e; cur.hasEmail = true; cur.touched = true; }
              if (lab.field === 'username') setField(segs[segs.length - 1].rec, 'username', eff || 'both', e, p.label, source);
              continue;
            }
            if (lab.field === 'email') continue;
          }
          if (!p.value) continue;   // a section heading like "Outgoing server:" on its own line
          const target = segs[segs.length - 1];
          target.touched = true;
          setField(target.rec, lab.field, (eff || 'both') as Side | 'both', p.value, p.label, source);
        }
        continue;
      }

      /* "email password host port", "email:password", "email,password,…". */
      const r = readLooseLine(line);
      if (r) { loose.push(r); continue; }

      /* A heading that names a direction: "Incoming mail (IMAP)", "SMTP settings". */
      const lab = readLabel(line.replace(/[:\-–]+\s*$/, ''));
      if (lab && (lab.field === 'side' || lab.field === 'host' || lab.field === 'ignore') && lab.side) { side = lab.side; if (lab.side === 'pop') sawPop = true; continue; }

      /* Prose — keep any customer-looking address in case nothing else names one. */
      for (const e of line.match(new RegExp(EMAIL_RE.source, 'g')) ?? []) {
        const local = e.split('@')[0];
        if (!ROLE_LOCAL.test(local)) proseEmails.push(e.toLowerCase());
      }
    }

    /* What the block's labelled settings apply to. */
    const named = segs.filter(s => s.hasEmail).map(s => s.rec);
    const common = segs.filter(s => !s.hasEmail && s.touched).map(s => s.rec);
    const members = [...named, ...loose];
    for (const rec of named) {
      for (const c of common) fillFrom(rec, c);
    }
    for (const rec of loose) for (const c of common) fillFrom(rec, c);
    if (!members.length) for (const c of common) if (hasSettings(c)) floating.push(c);
    for (const m of members) add(m);
  }

  /* Nothing named a mailbox outright — fall back to the addresses mentioned in passing. */
  if (!order.length && floating.length) {
    for (const e of proseEmails) { if (!byEmail.has(e)) add(emptyRecord(e)); }
  }

  /* Settings blocks that named no address: to the addresses on their domain, else to everyone missing them. */
  const records = order.map(k => byEmail.get(k)!);
  for (const f of floating) {
    const host = f.smtp.host || f.imap.host;
    const mine = records.filter(r => host && sameDomain(host, r.email));
    const targets = mine.length ? mine : records;
    for (const r of targets) fillFrom(r, f);
  }

  /* Settings with no address anywhere: one record the customer completes. */
  if (!records.length && floating.length) {
    const r = emptyRecord();
    for (const f of floating) fillFrom(r, f);
    const u = r.smtp.username || r.imap.username;
    if (isEmail(u)) r.email = u.toLowerCase();
    records.push(r);
  }

  for (const r of records) {
    /* One password given once is the password for both directions. */
    if (!r.password && r.smtp.password && !r.imap.password) r.password = r.smtp.password;
    if (!r.password && r.imap.password && !r.smtp.password) r.password = r.imap.password;
    for (const s of ['smtp', 'imap'] as Side[]) if (r[s].host && !r[s].source) r[s].source = source;
    if (sawPop && !r.imap.host) r.notes.push('The settings mention POP3, which this app does not read. Ask your provider for the IMAP server instead.');
  }
  return records;
}

/* ── Filling in ────────────────────────────────────────────────────────── */

/**
 * One looked-up or known set of settings, ready to fill a record's gaps.
 * `username: 'local'` means the login is the part before the @.
 */
export interface FoundSettings {
  provider: string;
  smtp?: { host: string; port: number; security: Security; username?: 'email' | 'local' };
  imap?: { host: string; port: number; security: Security; username?: 'email' | 'local' };
  source: string;
  note?: string;
  appPassword?: boolean;
  unsupported?: boolean;
}

export function knownAsFound(p: KnownProvider, how: string): FoundSettings {
  return {
    provider: p.name, source: `${p.name} (${how})`, note: p.note, appPassword: p.appPassword, unsupported: p.unsupported,
    smtp: { ...p.smtp, username: p.username }, imap: { ...p.imap, username: p.username },
  };
}

/** Fill only what is missing. A side whose host was given keeps it; its port is filled only if the host matches. */
export function applyFound(rec: MailRecord, f: FoundSettings): MailRecord {
  const out: MailRecord = { ...rec, smtp: { ...rec.smtp }, imap: { ...rec.imap }, notes: [...rec.notes] };
  for (const s of ['smtp', 'imap'] as Side[]) {
    const have = out[s];
    const got = f[s];
    if (!got) continue;
    if (!have.host) {
      have.host = got.host; have.source = f.source;
      if (!have.port) have.port = got.port;
      if (!have.security) have.security = got.security;
    } else if (have.host.toLowerCase() === got.host.toLowerCase()) {
      if (!have.port) have.port = got.port;
      if (!have.security && have.port === got.port) have.security = got.security;
    }
    if (!have.username && got.username === 'local') have.username = rec.email.split('@')[0];
  }
  if (!out.provider) out.provider = f.provider;
  if (f.note && !out.notes.includes(f.note)) out.notes.push(f.note);
  return out;
}

/** The known-providers step, which needs no network. */
export function applyKnown(rec: MailRecord): MailRecord {
  const p = providerForDomain(domainOf(rec.email));
  if (p) return applyFound(rec, knownAsFound(p, 'known settings'));
  /* A host the customer pasted can name the provider too (smtp.hostinger.com). */
  const host = rec.smtp.host || rec.imap.host;
  if (host) {
    const byHost = providerForMx([host]) ?? Object.values(KNOWN_PROVIDERS).find(k => k.smtp.host === host || k.imap.host === host) ?? null;
    if (byHost && !byHost.unsupported) return applyFound(rec, knownAsFound(byHost, 'known settings'));
  }
  return rec;
}

/** Does this record still need a lookup for either direction? */
export const needsLookup = (r: MailRecord): boolean => !!r.email && (!r.smtp.host || !r.imap.host);

/**
 * The last step: usual pairings for what is still blank, logins defaulted to
 * the address, and the shared password into each side. Every assumption made
 * here is named in `notes` so the review table can say it.
 */
export function finalise(rec: MailRecord): MailRecord {
  const out: MailRecord = { ...rec, smtp: { ...rec.smtp }, imap: { ...rec.imap }, notes: [...rec.notes] };
  for (const s of ['smtp', 'imap'] as Side[]) {
    const t = out[s];
    if (!t.username && out.email) t.username = out.email;
    if (!t.password && out.password) t.password = out.password;
    if (!t.host) continue;
    if (t.port && !t.security) t.security = securityForPort(s, t.port) || (s === 'smtp' ? 'tls' : 'ssl');
    else if (!t.port && t.security) t.port = portForSecurity(s, t.security);
    else if (!t.port && !t.security) {
      t.port = s === 'smtp' ? 587 : 993;
      t.security = s === 'smtp' ? 'tls' : 'ssl';
      const n = `${s === 'smtp' ? 'Outgoing' : 'Incoming'}: no port was given, so the usual ${t.port} with ${t.security === 'ssl' ? 'SSL/TLS' : 'STARTTLS'} is filled in.`;
      if (!out.notes.includes(n)) out.notes.push(n);
    }
    /* The pairing most often written wrong: "SSL" beside 587, "TLS" beside 465. */
    const natural = securityForPort(s, t.port);
    if (natural && t.security && t.security !== 'none' && t.security !== natural) {
      const n = `${s === 'smtp' ? 'Outgoing' : 'Incoming'}: port ${t.port} uses ${natural === 'ssl' ? 'SSL/TLS' : 'STARTTLS'}, so that is what will be used.`;
      t.security = natural;
      if (!out.notes.includes(n)) out.notes.push(n);
    }
  }
  return out;
}

/* ── Autoconfig XML (Thunderbird's format) ─────────────────────────────── */

/**
 * Read a Thunderbird autoconfig document — what the ISPDB and a domain's own
 * `autoconfig.` host serve. Regex rather than a DOM parser because the Worker
 * has none; the format is small and flat.
 */
export function parseAutoconfig(xml: string, email: string): FoundSettings | null {
  const local = email.split('@')[0] ?? '';
  const domain = domainOf(email);
  const sub = (s: string) => s.replace(/%EMAILADDRESS%/g, email).replace(/%EMAILLOCALPART%/g, local).replace(/%EMAILDOMAIN%/g, domain).trim();
  const tag = (block: string, t: string) => sub(block.match(new RegExp(`<${t}>([^<]*)</${t}>`, 'i'))?.[1] ?? '');
  const servers = (kind: 'incomingServer' | 'outgoingServer', type: string) => {
    const re = new RegExp(`<${kind}[^>]*type=["']${type}["'][^>]*>([\\s\\S]*?)</${kind}>`, 'gi');
    const out: { host: string; port: number; security: Security; username?: 'email' | 'local' }[] = [];
    for (let m = re.exec(xml); m; m = re.exec(xml)) {
      const b = m[1];
      const host = tag(b, 'hostname').toLowerCase();
      const port = Number(tag(b, 'port'));
      const st = tag(b, 'socketType').toUpperCase();
      const security: Security = st === 'SSL' ? 'ssl' : st === 'STARTTLS' ? 'tls' : 'none';
      const rawUser = (b.match(/<username>([^<]*)<\/username>/i)?.[1] ?? '').trim();
      if (!host || !isHost(host) || !port) continue;
      out.push({ host, port, security, username: rawUser === '%EMAILLOCALPART%' ? 'local' : 'email' });
    }
    /* Encrypted first: an autoconfig that lists a plain port beside SSL is offering both. */
    return out.sort((a, b) => (a.security === 'none' ? 1 : 0) - (b.security === 'none' ? 1 : 0))[0];
  };
  const imap = servers('incomingServer', 'imap');
  const smtp = servers('outgoingServer', 'smtp');
  if (!imap && !smtp) return null;
  const name = (xml.match(/<displayShortName>([^<]*)<\/displayShortName>/i)?.[1] ?? xml.match(/<displayName>([^<]*)<\/displayName>/i)?.[1] ?? '').trim();
  return { provider: name, imap, smtp, source: '' };
}

/* ── The AI's reading of a screenshot ──────────────────────────────────── */

/** What the screenshot reader is asked to return; anything else is ignored. */
export interface AiMailboxes {
  text?: string;
  mailboxes?: {
    email?: string; name?: string; password?: string;
    smtp?: { host?: string; port?: number | string; security?: string; username?: string; password?: string };
    imap?: { host?: string; port?: number | string; security?: string; username?: string; password?: string };
  }[];
}

/** The model's JSON → records, through the same checks a paste gets; its transcript is parsed too. */
export function recordsFromAi(ai: AiMailboxes, source = 'screenshot'): MailRecord[] {
  const out: MailRecord[] = [];
  for (const m of Array.isArray(ai.mailboxes) ? ai.mailboxes.slice(0, 200) : []) {
    const rec = emptyRecord(isEmail(String(m.email ?? '')) ? String(m.email).toLowerCase().trim() : '');
    rec.name = String(m.name ?? '').slice(0, 120);
    if (m.password && !PLACEHOLDER_PW.test(String(m.password))) rec.password = String(m.password);
    for (const s of ['smtp', 'imap'] as Side[]) {
      const x = m[s];
      if (!x) continue;
      const host = String(x.host ?? '').trim().toLowerCase();
      if (host && isHost(host)) { rec[s].host = host; rec[s].source = source; }
      const port = Number(x.port);
      if (port > 0 && port < 65536) rec[s].port = port;
      rec[s].security = readSecurity(String(x.security ?? ''));
      if (x.username) rec[s].username = String(x.username).trim();
      if (x.password && !PLACEHOLDER_PW.test(String(x.password))) rec[s].password = String(x.password);
    }
    if (!rec.email) { const u = rec.smtp.username || rec.imap.username; if (isEmail(u)) rec.email = u.toLowerCase(); }
    if (rec.email || hasSettings(rec)) out.push(rec);
  }
  if (typeof ai.text === 'string' && ai.text.trim()) {
    for (const r of parseMailSettings(ai.text, source)) {
      /* A transcript naming no address belongs to the one mailbox the picture showed. */
      const same = out.find(o => o.email && o.email === r.email) ?? (!r.email && out.length === 1 ? out[0] : !r.email ? out.find(o => !o.email) : undefined);
      if (same) fillFrom(same, r); else out.push(r);
    }
  }
  return out;
}

/** The instruction the screenshot reader is given. Kept here so the test can see it names every field. */
export const SCREENSHOT_PROMPT = [
  'This picture shows email account settings (a mail app, a hosting control panel, a provider\'s settings page or a spreadsheet).',
  'Read it exactly. Do not invent anything that is not visible. Return JSON only, in this shape:',
  '{"text": "every line of mail-settings text you can read, one per line, as Label: value",',
  ' "mailboxes": [{"email": "", "name": "", "password": "", "smtp": {"host": "", "port": 0, "security": "ssl|starttls|none", "username": ""}, "imap": {"host": "", "port": 0, "security": "ssl|starttls|none", "username": ""}}]}',
  'One entry per email address shown. Leave a field empty when it is not visible. If a password is hidden by dots, leave it empty.',
  'POP3 settings are not IMAP: do not put them under imap.',
].join('\n');
