/**
 * What Protron already knows about the customer before they say a word — and
 * what it must not assume.
 *
 * ── Where the facts come from ──
 *
 * The session (name and email given at sign-up), the workspace (business name
 * and industry, when somebody set them — "My Business" and the like are
 * placeholders, not facts), Settings → Profile's company, the old onboarding
 * profile, and Protron's own business profile (Prefs.business, which holds
 * only what the customer told Protron or agreed to). The owner's brief:
 * never ask for something already given.
 *
 * ── The email domain is a clue, not a fact ──
 *
 * john@abcmotors.com suggests a business at abcmotors.com. The server looks
 * once (protron.php `site`, the session's own domain only) and reports what
 * answered there — a page title and description, or nothing. Even a page that
 * answers is not proof it is *their* business, so it is offered as a question
 * ("Is that you?") and lands in the profile only when the customer agrees. A
 * Gmail or Outlook address says nothing about whether somebody has a business,
 * so it is never read as "no business".
 *
 * Pure: the panel passes in what it read, so `npm run test:protron` checks it.
 */
import type { Business, SiteCheck } from './memory';

/** Consumer mail providers. A domain here says nothing about the person's business. */
const PERSONAL = new Set([
  'gmail.com', 'googlemail.com', 'ymail.com', 'rocketmail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'passport.com', 'aol.com', 'aim.com', 'icloud.com', 'me.com', 'mac.com', 'proton.me', 'protonmail.com', 'pm.me',
  'gmx.com', 'gmx.net', 'gmx.de', 'mail.com', 'email.com', 'zohomail.com', 'yandex.com', 'yandex.ru', 'mail.ru',
  'fastmail.com', 'hey.com', 'tutanota.com', 'tuta.io', 'btinternet.com', 'sky.com', 'virginmedia.com',
  'talktalk.net', 'web.de', 't-online.de', 'orange.fr', 'free.fr', 'laposte.net', 'libero.it', 'qq.com', '163.com',
  '126.com', 'rediffmail.com', 'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net', 'bellsouth.net', 'cox.net',
  'charter.net', 'earthlink.net', 'shaw.ca', 'rogers.com', 'bigpond.com', 'optusnet.com.au', 'naver.com',
]);
/* Country variants of the big ones: yahoo.co.uk, hotmail.fr, outlook.de, live.co.uk… */
const PERSONAL_FAMILY = /^(yahoo|hotmail|outlook|live|windowslive|gmx|yandex|aol)\.[a-z.]{2,7}$/;

/** Workspace names a new account is created with — placeholders, not the customer's business. */
const PLACEHOLDER_NAMES = /^(my business|my workspace|main workspace|my company|business|workspace|test|demo)$/i;

export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at < 0 ? '' : email.slice(at + 1).trim().toLowerCase().replace(/\.$/, '');
}

export function isPersonalDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  return PERSONAL.has(d) || PERSONAL_FAMILY.test(d);
}

export interface FactSources {
  name?: string;
  email?: string;
  accountBusiness?: string;
  accountIndustry?: string;
  profileCompany?: string;
  onboardingCompany?: string;
  onboardingWebsite?: string;
  onboardingIndustry?: string;
  business?: Business;
  siteCheck?: SiteCheck | null;
}

export interface KnownFacts {
  firstName: string;
  fullName: string;
  email: string;
  domain: string;
  /** A consumer mail address: the domain is not a business clue. */
  personal: boolean;
  /** The business name, from where it came. Empty when nobody has given one. */
  businessName: string;
  businessFrom: '' | 'protron' | 'workspace' | 'profile' | 'onboarding';
  industry: string;
  website: string;
  kind: Business['kind'];
  about: string;
  audience: string;
  places: string;
  goal: string;
  /** What answered at their email domain, unconfirmed. */
  site: SiteCheck | null;
}

const clean = (s: unknown, max = 160): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const real = (s: unknown): string => { const v = clean(s, 80); return v && !PLACEHOLDER_NAMES.test(v) ? v : ''; };

export function gatherFacts(src: FactSources): KnownFacts {
  const fullName = clean(src.name, 80);
  const email = clean(src.email, 160).toLowerCase();
  const domain = emailDomain(email);
  const b = src.business ?? { name: '', about: '' };
  const named: [string, KnownFacts['businessFrom']][] = [
    [real(b.name), 'protron'], [real(src.accountBusiness), 'workspace'], [real(src.profileCompany), 'profile'], [real(src.onboardingCompany), 'onboarding'],
  ];
  const [businessName, businessFrom] = named.find(([n]) => n) ?? ['', ''];
  return {
    firstName: fullName.split(' ')[0] ?? '',
    fullName,
    email,
    domain,
    personal: !domain || isPersonalDomain(domain),
    businessName,
    businessFrom,
    industry: clean(src.accountIndustry, 60) || clean(src.onboardingIndustry, 60),
    website: clean(b.website, 120) || clean(src.onboardingWebsite, 120),
    kind: b.kind ?? '',
    about: clean(b.about, 200),
    audience: clean(b.audience, 160),
    places: clean(b.places, 120),
    goal: clean(b.goal, 200),
    site: src.siteCheck ?? null,
  };
}

/** Whether the server should be asked to look at the email domain. Once is enough. */
export function needsSiteCheck(f: KnownFacts): boolean {
  return !f.personal && !!f.domain && (!f.site || f.site.domain !== f.domain);
}

export type Missing = 'kind' | 'name' | 'website' | 'about';

/**
 * What is still worth asking, in the order it is worth asking. The sign-up
 * form stays three boxes (name, email, password): these are asked by
 * Protron, one at a time, only when nothing already answers them.
 */
export function missingFacts(f: KnownFacts): Missing[] {
  const out: Missing[] = [];
  if (!f.kind && !f.businessName) out.push('kind');
  if (!f.businessName) out.push('name');
  if (!f.about && !f.industry) out.push('about');
  if (!f.website && !(f.site?.status === 'found')) out.push('website');
  return out;
}

/** The facts as the model reads them: what is known, from where, and what is only a clue. */
export function describeFacts(f: KnownFacts): string {
  const lines: string[] = [];
  if (f.fullName) lines.push(`Name: ${f.fullName} (from sign-up). Call them ${f.firstName}.`);
  if (f.domain) {
    lines.push(f.personal
      ? `Email: a personal mail address (${f.domain}). This says nothing about whether they run a business — never assume they do not.`
      : `Email domain: ${f.domain} (a business-style domain — a clue, not confirmed as theirs).`);
  }
  if (f.site?.domain === f.domain && !f.personal) {
    lines.push(f.site.status === 'found'
      ? `A page answered at ${f.domain}: "${clean(f.site.title, 90)}"${f.site.about ? ` — ${clean(f.site.about, 160)}` : ''}. Not confirmed as their business: ask before treating it as theirs.`
      : `Nothing answered at ${f.domain} when it was checked. Do not say they have no website; ask if it matters.`);
  }
  if (f.businessName) lines.push(`Business name: ${f.businessName}${f.businessFrom === 'protron' ? ' (they told you)' : ` (from their ${f.businessFrom})`}.`);
  if (f.kind) lines.push(`They are ${f.kind === 'own' ? 'running their own business' : f.kind === 'agency' ? 'an agency serving clients' : 'working independently'}.`);
  if (f.industry) lines.push(`Industry on their workspace: ${f.industry}.`);
  if (f.about) lines.push(`What they do: ${f.about}.`);
  if (f.audience) lines.push(`Their customers: ${f.audience}.`);
  if (f.places) lines.push(`Where they work: ${f.places}.`);
  if (f.website) lines.push(`Website: ${f.website}.`);
  if (f.goal) lines.push(`What they want most: ${f.goal}.`);
  const missing = missingFacts(f);
  lines.push(missing.length
    ? `Still unknown (ask at most one, only when it matters to what they asked): ${missing.join(', ')}.`
    : 'You know the basics. Do not ask for any of the above again.');
  return lines.join('\n');
}

export interface Opening { text: string; suggestions: string[] }

/**
 * Protron's first words to somebody, written from what is known — no AI
 * call, so it is instant and costs nothing. One question at most, and only
 * the one that matters most.
 */
export function openingFor(f: KnownFacts): Opening {
  const hi = f.firstName ? `Hi ${f.firstName}! ` : 'Hi! ';
  const me = 'I\'m Protron, your AI business manager at Protected Central.';
  if (f.businessName && (f.about || f.industry)) {
    const what = f.about || f.industry;
    return {
      text: `${hi}${me} I've got you down as ${f.businessName} — ${what}${f.places ? ` in ${f.places}` : ''}. I can find you new customers, set up your follow-ups and email workflows, and build it here while you watch. What would help most right now?`,
      suggestions: ['Find new customers', 'Build an email follow-up workflow', 'Continue my business workspace'],
    };
  }
  if (f.businessName) {
    return {
      text: `${hi}${me} I see you're with ${f.businessName}. So I can set things up properly — what do you sell or do, and who are your typical customers?`,
      suggestions: ['Find new customers', 'Build an email follow-up workflow', 'Organise my contacts'],
    };
  }
  if (!f.personal && f.site?.status === 'found' && f.site.domain === f.domain) {
    const title = clean(f.site.title, 70) || f.domain;
    return {
      text: `${hi}${me} You signed up with an address at ${f.domain}, and the site there is "${title}". Is that your business?`,
      suggestions: ['Yes, that\'s my business', 'No, it\'s something else', 'I work for an agency'],
    };
  }
  if (!f.personal && f.domain) {
    return {
      text: `${hi}${me} You signed up with an address at ${f.domain} — is that your business? If so, what do you sell or do, and who are your customers?`,
      suggestions: ['Yes, that\'s my business', 'I run an agency', 'I work independently'],
    };
  }
  return {
    text: `${hi}${me} To set things up properly, tell me a little about you: are you running your own business, managing an agency, or working independently?`,
    suggestions: ['I run my own business', 'I manage an agency', 'I work independently'],
  };
}
