/**
 * What a domain search actually looks up.
 *
 * ── Why this is its own module, and pure ──
 *
 * Because it is the part that went wrong, and it went wrong in a way no
 * typecheck could see. It lived inside the route, which imports the registrar
 * client, the payment providers and the SMTP socket code — so it could only be
 * exercised by deploying and clicking, and it was not exercised at all.
 *
 * Out here it needs no registrar, no database and no network, so every rule in
 * it can be argued with in a test. `npm run test:domains`.
 */

/**
 * The extensions offered first, and why these.
 *
 * A small business wants the .com and will take the .co or .net when it has
 * gone. Offering forty extensions turns a two-second decision into a research
 * project, and the long tail is still reachable by typing a name in full.
 */
export const DEFAULT_TLDS = ['com', 'net', 'org', 'co', 'biz', 'online'];

/**
 * What somebody typed, reduced to the label part of a hostname.
 *
 * Gentler than `slugify` on purpose. That one drops company suffixes — `ltd`,
 * `co`, `inc` — which is right for a business name and wrong for a word
 * somebody chose: if they type `mycoshop` they mean that, not `myshop`.
 * Hyphens survive because they are legal in a domain and people use them.
 */
function stemOf(input: string): string {
  const label = input.trim().toLowerCase().split('.')[0] ?? '';
  return label.replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '').slice(0, 48);
}

/**
 * Names around a stem, for when the obvious ones are gone.
 *
 * Deliberately small and deliberately boring. The job is to give somebody whose
 * first choice is taken a second choice they would actually buy, and these are
 * the shapes real businesses use. Generating forty inventive names would mean
 * forty availability lookups against a paid API for a list nobody reads past
 * the fifth row.
 */
function variantsOf(base: string): string[] {
  if (base.length < 3 || base.length > 24) return [];
  return [
    `get${base}`, `try${base}`, `${base}hq`, `${base}app`, `${base}group`,
  ];
}

/**
 * "ABC Roofing & Sons Ltd." → "abcroofingandsons".
 *
 * The comment here used to claim "abcroofing", which it has never produced —
 * `&` becomes `and` and only the company-type words are dropped. Worth
 * correcting rather than leaving: it is the sort of stale claim somebody reads
 * instead of running the code, and it is why `shortFormOf` below exists.
 */
function slugify(company: string): string {
  return company.toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\b(ltd|limited|llc|inc|incorporated|plc|gmbh|pty|co)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 48);
}

/**
 * A shorter name for a business with a long one.
 *
 * "Northgate Roofing & Sons Limited" slugs to `northgateroofingandsons`, which
 * is a real domain nobody wants to say down a phone. The first two meaningful
 * words are usually the name people actually use, so it is offered alongside.
 *
 * Only worth doing when it genuinely shortens things — returning something
 * barely different would spend a billed lookup to offer the same name twice.
 */
function shortFormOf(company: string): string {
  const words = company.toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(ltd|limited|llc|inc|incorporated|plc|gmbh|pty|co|and|the|of)\b/g, ' ')
    .split(/[^a-z0-9]+/).filter(w => w.length > 1);
  if (words.length < 2) return '';
  const short = words.slice(0, 2).join('').slice(0, 24);
  const full = slugify(company);
  return short.length >= 4 && short.length < full.length - 2 ? short : '';
}

/** How many names one search may ask the registrar about. Each one is billed. */
export const CANDIDATE_ROOM = 18;

export interface DomainPlan {
  /** The word everything is built from. Empty when there is nothing to go on. */
  base: string;
  /** The exact name they asked for, when they gave an extension. */
  exact: string;
  /** In the order they should be offered. */
  candidates: string[];
}

/**
 * Decide what to look up, from a business name and whatever is in the box.
 *
 * ── Why this is pure, and out here ──
 *
 * Because it is the part that was wrong, and it was wrong in a way no
 * typecheck could see: it built every candidate from the *company* name and
 * used the typed text for one entry, only if it contained a dot. Somebody who
 * typed `asdfggg.com` into a project called "Your first project" got
 * `asdfggg.com` followed by six `yourfirstproject.*`; somebody who typed
 * `bobsplumbing` with no extension got nothing of theirs at all, and the search
 * box looked broken because it was.
 *
 * Out here it can be argued with in a test without a registrar, a database or
 * a network — which is the only reason the above is a past tense.
 *
 * ── The rule ──
 *
 * The company name is the fallback for the automatic search that runs when the
 * step first opens and the box is still empty. The moment there is anything in
 * it, it wins outright. Nobody types a word in order to be shown their project
 * name.
 */
export function domainCandidates(company: string, typed: string): DomainPlan {
  const clean = typed.trim().toLowerCase();
  const base = stemOf(clean) || slugify(company);
  if (!base) return { base: '', exact: '', candidates: [] };

  const out: string[] = [];
  const add = (name: string) => {
    if (out.length >= CANDIDATE_ROOM || out.includes(name)) return;
    out.push(name);
  };

  /* Exactly what they asked for, first — so the ordering can keep it first
     rather than burying it under something a dollar cheaper. The extension is
     re-cleaned rather than trusted: `bobs.co.uk ` and `bobs.COM` both arrive
     here, and neither is a hostname yet. */
  const dot = clean.indexOf('.');
  const ext = dot === -1 ? '' : clean.slice(dot + 1).replace(/[^a-z.]/g, '').replace(/\.+$/, '');
  const exact = ext && /^[a-z]{2,24}(\.[a-z]{2,24})?$/.test(ext) ? `${base}.${ext}` : '';
  if (exact) add(exact);

  for (const tld of DEFAULT_TLDS) add(`${base}.${tld}`);

  /* The short form of a long business name — but only when the box was empty
     and this is a fallback search. If they typed something, shortening their
     company name is the same "here is your project name instead" this whole
     function was rewritten to stop doing. */
  if (!stemOf(clean)) {
    const short = shortFormOf(company);
    if (short) { add(`${short}.com`); add(`${short}.co`); }
  }

  /* Second choices for when the obvious ones are gone. `.com` only — the point
     is a name somebody would actually buy, and `get<name>.biz` is not one. */
  for (const v of variantsOf(base)) add(`${v}.com`);

  return { base, exact, candidates: out };
}
