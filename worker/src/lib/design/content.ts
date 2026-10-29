/**
 * Filling a template with a business's own words — and refusing to invent.
 *
 * ── What may be written for the customer, and what may not ──
 *
 * The words that frame a post — a headline, a supporting line, a button, a
 * checklist of what the business already says it does — can be written from
 * the business's profile, by the AI or by the rules below. Facts cannot: an
 * offer, a price, a date, a rating, a customer's review, a number of years
 * or jobs, a certification. Those come only from what the customer typed.
 * When a template needs one and it is missing, the design shows a visible
 * placeholder ("Your offer") and the editor asks for it; it is never filled
 * with something plausible.
 *
 * `guardFacts` is the net under the AI: any line it writes that carries a
 * number, a price, a percentage or a claim word the business's own details
 * do not contain is thrown away and the rule-written line used instead.
 *
 * Pure, no imports beyond the spec: the Worker uses it for AI Autopilot posts.
 */
import { OBJECTIVES, type DesignContent, type DesignDoc, type ObjectiveId, type TemplateSpec, type TextSlot, type FormatId, type ImageRef, type ImageSlot } from './spec';
import { photosFor, topicsForIndustry, photoById, PHOTO_SOURCE } from './photos';

/** What an empty must-have slot shows. Plainly a placeholder — never a plausible value. */
export const PLACEHOLDER: Record<TextSlot | 'points', string> = {
  eyebrow: 'Label', headline: 'Your headline', subhead: 'A line about it', cta: 'Your button',
  offer: 'Your offer', price: 'Your price', priceNote: '',
  company: 'Your business', website: 'yourwebsite.com', phone: 'Your phone', email: 'Your email', address: 'The address',
  date: 'The date', time: 'The time', location: 'The place',
  quote: '“Paste a real review or your own words here.”', author: 'Who said it', authorRole: '', rating: '',
  beforeLabel: 'Before', afterLabel: 'After', occasion: 'The occasion',
  beds: 'Beds', baths: 'Baths', area: 'Size', handle: '@yourhandle',
  slideTitle: 'Slide title', slideBody: 'What this slide explains', slideNumber: '',
  points: 'A point you want to make',
};

/** Slots only the customer may fill — the AI is never asked for these. */
export const FACT_SLOTS: (keyof DesignContent)[] = ['offer', 'price', 'priceNote', 'date', 'time', 'location', 'quote', 'author', 'authorRole', 'rating', 'beds', 'baths', 'area', 'address', 'phone', 'email', 'website', 'handle'];

/** What a template shows in one slot, for one carousel slide when given. */
export function slotText(doc: DesignDoc, slot: TextSlot, slide = -1): string {
  const c = doc.content;
  if (slot === 'company') return doc.company ?? '';
  if (slot === 'slideTitle') return c.slides?.[slide]?.title ?? '';
  if (slot === 'slideBody') return c.slides?.[slide]?.body ?? '';
  if (slot === 'slideNumber') return slide >= 0 ? String(slide + 1).padStart(2, '0') : '';
  const v = (c as Record<string, unknown>)[slot];
  return typeof v === 'string' ? v : '';
}

/** The must-have slots a design still lacks, in words a person reads. */
export function missingNeeds(doc: DesignDoc, tpl: TemplateSpec): string[] {
  const out: string[] = [];
  for (const n of tpl.needs) {
    if (n === 'points') { if (!(doc.content.points ?? []).some(p => p.trim())) out.push('a few points'); continue; }
    if (n === 'photo' || n === 'photo2' || n === 'avatar' || n === 'product' || n === 'logo') {
      if (!doc.images[n as ImageSlot]?.src && (tpl.ownPhotos || n === 'logo' || n === 'avatar')) out.push(n === 'avatar' ? 'your photo' : n === 'photo2' ? 'your second photo' : n === 'logo' ? 'your logo' : 'your own photo');
      continue;
    }
    if (!slotText(doc, n as TextSlot).trim()) out.push(PLACEHOLDER[n as TextSlot].toLowerCase().replace(/^your /, 'your ').replace(/^“.*/, 'the words of a real review'));
  }
  return out;
}

/* ── The facts guard ─────────────────────────────────────────────────────── */

const CLAIM = /\b(best|#1|number one|no\.? ?1|award|award-winning|certified|accredited|licen[cs]ed|insured|guarantee[d]?|warrant(y|ied)|official|leading|top[- ]rated|5[- ]star|trusted by|voted|cheapest|lowest|free)\b/i;

/**
 * Is this line safe to show, given what the business has told us? A number,
 * money, a percentage, or a claim word must appear in the business's own
 * details, or the line is refused.
 */
export function guardFacts(line: string, facts: string): boolean {
  const f = facts.toLowerCase();
  const nums = line.match(/\d[\d,.]*/g) ?? [];
  if (nums.some(n => !f.includes(n.replace(/[,.]$/, '').toLowerCase()))) return false;
  if (/[$£€%]/.test(line) && !/[$£€%]/.test(facts)) return false;
  const claim = line.match(CLAIM);
  if (claim && !f.includes(claim[0].toLowerCase())) return false;
  return true;
}

/** Cut to a length at a word, without a dangling comma. */
export function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1).replace(/\s+\S*$/, '').replace(/[\s,;:–—-]+$/, '');
  return cut || t.slice(0, max);
}

/* ── The business, as the designer sees it ──────────────────────────────── */

export interface Business {
  id?: string;
  name: string;
  industry: string;
  description: string;
  /** Products or services, as the customer wrote them. */
  services: string[];
  website: string;
  phone: string;
  email: string;
  address: string;
  logo: string;
  colors: { primary: string; secondary?: string; accent?: string };
  /** Only ever typed by the customer. */
  offer?: string;
}

/** Everything the customer told us, as one text — what `guardFacts` checks against. */
export const factsOf = (b: Business, extra: Partial<DesignContent> = {}) =>
  [b.name, b.industry, b.description, b.services.join(', '), b.offer ?? '', ...Object.values(extra).filter(v => typeof v === 'string')].join(' \n ');

/** The industry a template list understands, from however the customer wrote theirs. */
export function industryId(text: string): string {
  const t = text.toLowerCase();
  if (/hvac|heat|cool|air ?con|furnace/.test(t)) return 'hvac';
  if (/roof/.test(t)) return 'roofing';
  if (/real ?estate|realtor|property|realty|broker/.test(t)) return 'real-estate';
  if (/plumb|electric|clean|landscap|garden|handyman|contractor|remodel|renovat|construct|paint|pest|home service/.test(t)) return 'home-services';
  if (/shop|store|e-?commerce|retail|boutique|apparel|fashion|product/.test(t)) return 'ecommerce';
  if (/agency|marketing agency|studio/.test(t)) return 'agency';
  if (/coach|creator|influencer|speaker|author|podcast|personal brand/.test(t)) return 'personal-brand';
  if (/restaurant|cafe|coffee|food|bakery|catering/.test(t)) return 'food';
  if (/gym|fitness|yoga|pilates|trainer/.test(t)) return 'fitness';
  if (/salon|beauty|spa|skin|nail|barber|cosmetic/.test(t)) return 'beauty';
  if (/dent|clinic|medical|health|physio|chiro|therap/.test(t)) return 'health';
  if (/law|legal|account|consult|finance|insurance|software|saas/.test(t)) return 'professional';
  return 'any';
}

/* ── Words written by rule — honest, plain, and from the profile ─────────── */

const first = (s: string) => s.split(/[.!?\n]/)[0]?.trim() ?? '';

/**
 * The starting words for a template, written from the profile alone. Used
 * when the AI is not available, and as the fallback for any AI line that the
 * guard refuses. Generic on purpose: true of any business of this kind, and
 * true of this one.
 */
export function ruleCopy(tpl: TemplateSpec, b: Business, objective: ObjectiveId, topic = ''): DesignContent {
  const service = clip(topic || b.services[0] || first(b.description) || b.industry || 'what we do', 40);
  const svc = service.replace(/^./, c => c.toUpperCase());
  const obj = OBJECTIVES.find(o => o.id === objective) ?? OBJECTIVES[0];
  const lim = (k: TextSlot | 'point', s: string) => clip(s, tpl.limits[k] ?? 80);
  const c: DesignContent = { ...(tpl.defaults ?? {}) };
  const byObjective: Record<ObjectiveId, string> = {
    sell: `${svc}, ready when you are`,
    leads: `${svc} you can count on`,
    bookings: `Book your ${service.toLowerCase()}`,
    awareness: `Meet ${b.name || 'us'}`,
    educate: `What to know about ${service.toLowerCase()}`,
    trust: `Why people choose ${b.name || 'us'}`,
    event: `Join us`,
    launch: `Introducing ${svc}`,
  };
  /* The customer's own topic is the headline when they gave one; with no
     topic and no profile, the template's own neutral line. */
  const known = !!(topic || b.services[0] || first(b.description) || b.industry);
  const fits = (s2: string) => s2.length <= (tpl.limits.headline ?? 60);
  c.headline = topic ? lim('headline', topic.replace(/^./, ch => ch.toUpperCase()))
    : !known && tpl.sample ? lim('headline', tpl.sample)
      : fits(byObjective[objective]) ? byObjective[objective] : lim('headline', svc);
  /* A sentence that does not fit is left out rather than cut mid-phrase. */
  const line = first(b.description);
  c.subhead = line && line.length <= (tpl.limits.subhead ?? 80) ? line : '';
  c.cta = lim('cta', obj.cta);
  if (b.services.length) c.points = b.services.slice(0, 3).map(s => lim('point', s));
  if (b.website) c.website = b.website.replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (b.phone) c.phone = b.phone;
  if (b.email) c.email = b.email;
  if (b.offer) c.offer = b.offer;
  if (tpl.id === 'quote-card') c.author = b.name || '';
  if (tpl.id === 'holiday-greeting') c.headline = lim('headline', `Thank you for being part of ${b.name ? 'our' : 'this'} year.`);
  if (tpl.pages) c.slides = (b.services.length ? b.services.slice(0, 4) : [service]).map(s => ({ title: lim('slideTitle', s.replace(/^./, ch => ch.toUpperCase())), body: lim('slideBody', `How ${b.name || 'we'} can help with ${s.toLowerCase()}. Add a sentence of your own here.`) }));
  return c;
}

/** The library picture for a business's industry and a template's topics. */
export function libraryPhoto(tpl: TemplateSpec, b: Business, slot: ImageSlot = 'photo', occasion = ''): ImageRef | null {
  if (tpl.ownPhotos) return null;
  const season = /christmas|holiday|winter|new year/i.test(occasion) ? 'winter' : /halloween/i.test(occasion) ? 'halloween' : /valentine/i.test(occasion) ? 'valentine' : /summer/i.test(occasion) ? 'summer' : /spring|easter/i.test(occasion) ? 'spring' : /autumn|fall|thanksgiving/i.test(occasion) ? 'autumn' : '';
  /* The business's own subject first; the template's only when the industry
     says nothing (topicsForIndustry's generic answer). */
  const own = topicsForIndustry(`${b.industry} ${b.description}`);
  const generic = own[0] === 'workspace' && own[2] === 'abstract';
  const topics = tpl.categories.includes('seasonal') && season ? [season as never] : tpl.id === 'holiday-greeting' ? tpl.photoTopics : generic ? [...tpl.photoTopics, ...own] : own;
  const pool = photosFor(topics);
  /* Each template starts from a different picture of the same subject, so a
     gallery of one business's designs is not twelve copies of one photo. */
  const seed = [...tpl.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const p = pool[(seed + (slot === 'photo2' ? 1 : slot === 'product' ? 2 : 0)) % pool.length];
  return p ? { src: `library:${p.id}`, libraryId: p.id, focal: p.focal, origin: 'library', license: PHOTO_SOURCE.license, licenseUrl: PHOTO_SOURCE.licenseUrl, credit: `Photo: ${PHOTO_SOURCE.name}` } : null;
}

/** A new design: template, format, the business's colours and logo, rule-written words. */
export function newDoc(tpl: TemplateSpec, b: Business, opts: { format?: FormatId; objective?: ObjectiveId; topic?: string; content?: Partial<DesignContent> } = {}): DesignDoc {
  const objective = opts.objective ?? tpl.objectives[0];
  const content = { ...ruleCopy(tpl, b, objective, opts.topic), ...(opts.content ?? {}) };
  const images: DesignDoc['images'] = {};
  if (b.logo) images.logo = { src: b.logo, origin: 'brand' };
  for (const slot of ['photo', 'photo2', 'product'] as const) {
    const uses = (tpl.pages ? [] : tpl.layers).some(l => l.kind === 'image' && l.slot === slot);
    if (!uses) continue;
    const p = libraryPhoto(tpl, b, slot, content.occasion);
    if (p) images[slot] = p;
  }
  return {
    v: 1, templateId: tpl.id,
    format: opts.format && tpl.formats.includes(opts.format) ? opts.format : tpl.formats[0],
    content, company: b.name, images, colors: { ...b.colors }, businessId: b.id, industry: b.industry, objective,
  };
}

/** A library photo's credit line, for the editor and the design's record. */
export function photoCredit(ref: ImageRef | undefined): string {
  if (!ref) return '';
  if (ref.origin === 'library' && ref.libraryId) return `${photoById(ref.libraryId)?.alt ?? 'Photo'} — ${PHOTO_SOURCE.name} (${PHOTO_SOURCE.license})`;
  if (ref.origin === 'openverse') return [ref.credit, ref.license].filter(Boolean).join(' · ');
  if (ref.origin === 'upload' || ref.origin === 'media') return 'Your own picture';
  if (ref.origin === 'brand') return 'Your logo';
  return '';
}
