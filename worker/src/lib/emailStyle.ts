/**
 * How a project's emails are written — and the researched style, where each
 * prospect's email opens with something true about *their* business.
 *
 * Pure, and imported by the browser too (src/services/projectSolutions.ts via
 * the wizard), so the wizard's own emails and the planner's sequences carry
 * the same two lines in the same place. `npm run test:emailstyle`.
 *
 * ── The two lines ──
 *
 * `{{personalOpener}}` — one or two sentences about something specific the
 * prospect's own website says: a service they launched, a second location, an
 * award they list, a recent post. `{{theirChallenge}}` — a problem businesses
 * like theirs commonly have that the sender's offer answers. Both are written
 * at the moment of sending (lib/prospectResearch.ts), from that business's
 * site, and cached. When nothing true and specific was found, both are empty
 * and personalise() drops their lines — the email then reads as the template
 * did, rather than opening with an invented compliment.
 *
 * Social media is not read: the platforms' terms forbid scraping, and an
 * opener citing a post nobody can check is exactly the kind of plausible
 * invention the product refuses.
 */

export const EMAIL_STYLES = ['researched', 'template', 'value'] as const;
export type EmailStyle = typeof EMAIL_STYLES[number];

export const OPENER_FIELD = '{{personalOpener}}';
export const CHALLENGE_FIELD = '{{theirChallenge}}';

/** Whether a project's approved brief asked for researched emails. */
export function briefWantsResearch(brief: unknown): boolean {
  if (!brief || typeof brief !== 'object') return false;
  return (brief as { emailStyle?: unknown }).emailStyle === 'researched';
}

/** Whether a body carries either research line. */
export const hasResearch = (body: string): boolean => /\{\{\s*(personalOpener|theirChallenge)\s*\}\}/.test(body);

/**
 * A body with the two research lines as its opening — after the greeting
 * when it starts with one ("Hi {{firstName}},"), at the very top otherwise.
 * Never twice.
 */
export function withResearch(body: string): string {
  if (hasResearch(body)) return body;
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const first = (lines[0] ?? '').trim();
  const greeting = /^(hi|hello|hey|dear|good (morning|afternoon))\b[^.!?]{0,40}[,!]?$/i.test(first);
  const research = `${OPENER_FIELD}\n\n${CHALLENGE_FIELD}`;
  if (greeting) {
    const rest = lines.slice(1).join('\n').replace(/^\n+/, '');
    return `${lines[0]}\n\n${research}\n\n${rest}`.trimEnd();
  }
  return `${research}\n\n${body.replace(/^\n+/, '')}`.trimEnd();
}

/**
 * The website to research for a contact: theirs if the record has one, else
 * the domain of their address — unless that is a webmail domain, which says
 * nothing about their business.
 */
const WEBMAIL = /^(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|aol|icloud|me|mac|proton|protonmail|gmx|mail|zoho|yandex|btinternet|sky|virginmedia|comcast|verizon|att)\./i;
export function researchSiteOf(c: { website?: unknown; email?: unknown; customFields?: unknown }): string {
  const custom = c.customFields && typeof c.customFields === 'object' ? c.customFields as Record<string, unknown> : {};
  const site = String(c.website ?? custom.website ?? '').trim();
  if (/^https?:\/\/[^/\s]+\.[^/\s]+/i.test(site)) return site;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(site)) return `https://${site}`;
  const domain = String(c.email ?? '').split('@')[1]?.trim().toLowerCase() ?? '';
  if (!domain || !domain.includes('.') || WEBMAIL.test(domain)) return '';
  return `https://${domain}`;
}

/**
 * What the model returned, made safe to send: short, plain, no merge fields,
 * no links, no claims of having met. Empty when it is not usable.
 */
export function cleanResearch(raw: { opener?: unknown; challenge?: unknown }): { opener: string; challenge: string } {
  const tidy = (v: unknown, max: number) => {
    const s = String(v ?? '').replace(/\{\{[^}]*\}\}/g, '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
    if (!s || s.length < 20) return '';
    /* Pretending to a relationship is the one thing a cold email must not do. */
    if (/\b(as we discussed|great (to|speaking)|following (up on )?our (call|chat|conversation)|when we met)\b/i.test(s)) return '';
    return s.length > max ? `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : s;
  };
  return { opener: tidy(raw.opener, 280), challenge: tidy(raw.challenge, 320) };
}
