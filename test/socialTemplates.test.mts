/**
 * The social template library: every template is well-formed and genuinely
 * different, and nothing fills a design with facts nobody gave.
 * `npm run test:socialtemplates`.
 */
import { CATEGORIES, FONT_PAIRS, FORMATS, type TemplateSpec, type Layer } from '../worker/src/lib/design/spec';
import { TEMPLATES } from '../worker/src/lib/design/templates';
import { PHOTOS, photosFor, photoUrl } from '../worker/src/lib/design/photos';
import { FACT_SLOTS, guardFacts, newDoc, ruleCopy, type Business } from '../worker/src/lib/design/content';
import { LAYOUT_TEMPLATE, designForPost } from '../worker/src/lib/design/forPost';
import { SOCIAL_LAYOUTS } from '../worker/src/lib/designLayouts';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d: unknown = '') => { if (c) pass++; else fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c ? '' : ` — ${JSON.stringify(d).slice(0, 400)}`}`); };
const layersOf = (t: TemplateSpec): Layer[] => (t.pages ? [...t.pages.cover.layers, ...t.pages.slide.layers, ...t.pages.end.layers] : t.layers);
const TEXT = new Set(['eyebrow', 'headline', 'subhead', 'cta', 'offer', 'price', 'priceNote', 'company', 'website', 'phone', 'email', 'address', 'date', 'time', 'location', 'quote', 'author', 'authorRole', 'rating', 'beforeLabel', 'afterLabel', 'occasion', 'beds', 'baths', 'area', 'handle', 'slideTitle', 'slideBody', 'slideNumber', 'points', 'photo', 'photo2', 'product', 'logo', 'avatar']);

console.log('The library');
ok('at least twenty templates, ids unique', TEMPLATES.length >= 20 && new Set(TEMPLATES.map(t => t.id)).size === TEMPLATES.length);
ok('every category has a template', CATEGORIES.every(c => TEMPLATES.some(t => t.categories.includes(c.id))), CATEGORIES.filter(c => !TEMPLATES.some(t => t.categories.includes(c.id))));
ok('at least seven layout families and six styles', new Set(TEMPLATES.map(t => t.family)).size >= 7 && new Set(TEMPLATES.map(t => t.style)).size >= 6);
ok('every template names a real font pair, format and photo topic', TEMPLATES.every(t => FONT_PAIRS.some(f => f.id === t.fontPair) && t.formats.length && t.formats.every(f => FORMATS.some(x => x.id === f)) && t.photoTopics.every(pt => PHOTOS.some(p => p.topics.includes(pt)))));
ok('every layer is bound to a slot that exists', TEMPLATES.every(t => layersOf(t).every(l => !('slot' in l) || !l.slot || TEXT.has(l.slot as string)) && t.needs.every(n => TEXT.has(n))));
ok('every layer box stays near the canvas, in every shape', TEMPLATES.every(t => layersOf(t).every(l => [l.box, ...Object.values(l.at ?? {}).filter(Boolean)].every(b => { const x = { ...l.box, ...(b as object) }; return x.x >= -0.5 && x.y >= -0.5 && x.x + x.w <= 1.6 && x.y + x.h <= 1.6 && x.w > 0 && x.h > 0; }))));
const sig = (t: TemplateSpec) => layersOf(t).map(l => `${l.kind}:${l.box.x.toFixed(2)},${l.box.y.toFixed(2)},${l.box.w.toFixed(2)}`).join('|');
ok('no two templates are the same composition', new Set(TEMPLATES.map(sig)).size === TEMPLATES.length);
ok('the carousel has a cover, a slide and an end page', TEMPLATES.filter(t => t.pages).every(t => t.pages!.cover.layers.length && t.pages!.slide.layers.some(l => 'slot' in l && l.slot === 'slideTitle') && t.pages!.end.layers.length));
ok('photo ids unique, and a library URL is cropped at the CDN', new Set(PHOTOS.map(p => p.id)).size === PHOTOS.length && /w=1088&h=1360&fit=crop&crop=focalpoint/.test(photoUrl(PHOTOS[0].id, 1080, 1350)));
ok('every topic a template asks for has a picture', TEMPLATES.every(t => photosFor(t.photoTopics).length > 0));

console.log('Nothing invented');
const biz: Business = { name: 'Northwind Comfort', industry: 'HVAC', description: 'Heating and cooling for homes in Austin.', services: ['Furnace tune-ups', 'AC repair'], website: 'northwindcomfort.com', phone: '(512) 555-0142', email: '', address: '', logo: '', colors: { primary: '#1f6feb' } };
ok('a number, price or claim the business never gave is refused', !guardFacts('Save 20% this week', 'Heating and cooling') && !guardFacts('Award-winning service', 'Heating') && !guardFacts('From $99', 'tune-ups') && !guardFacts('Voted #1 in Austin', 'Austin') && !guardFacts('Licensed and insured', 'HVAC'));
ok('…and allowed when the business said it', guardFacts('Save 20% this week', 'Offer: 20% off') && guardFacts('Licensed and insured', 'We are licensed and insured') && guardFacts('Book your furnace tune-up', 'Furnace tune-ups'));
const all = TEMPLATES.map(t => ({ t, c: ruleCopy(t, biz, t.objectives[0]) }));
ok('rule-written words never carry a figure', all.every(({ c }) => [c.headline, c.subhead, c.cta, c.eyebrow, ...(c.points ?? [])].filter(Boolean).every(s => guardFacts(String(s), [biz.name, biz.description, biz.services.join(' ')].join(' ')))), all.map(x => x.c.headline));
ok('no fact slot is filled unless the business gave it', all.every(({ c }) => !c.offer && !c.price && !c.date && !c.quote && !c.rating));
ok('the business\'s own offer is used, word for word', ruleCopy(TEMPLATES.find(t => t.id === 'flash-offer')!, { ...biz, offer: '15% off tune-ups' }, 'sell').offer === '15% off tune-ups');
ok('own-photo templates start with no stranger\'s photo', TEMPLATES.filter(t => t.ownPhotos).every(t => !newDoc(t, biz).images.photo && !newDoc(t, biz).images.avatar));
ok('other templates start with a photo of the business\'s own trade', (() => { const d = newDoc(TEMPLATES.find(t => t.id === 'spotlight-offer')!, biz); const p = PHOTOS.find(x => x.id === d.images.photo?.libraryId); return !!p && p.topics.some(x => ['hvac', 'electrical', 'home-exterior'].includes(x)); })());
ok('a topic becomes the headline, whole', newDoc(TEMPLATES[0], biz, { topic: 'Furnace check before winter' }).content.headline === 'Furnace check before winter');
ok('the AI is never asked for a fact slot', FACT_SLOTS.includes('offer') && FACT_SLOTS.includes('quote') && FACT_SLOTS.includes('rating') && FACT_SLOTS.includes('price'));

console.log('AI Autopilot posts');
ok('every wizard layout names a template that needs no upload', SOCIAL_LAYOUTS.every(l => { const t = TEMPLATES.find(x => x.id === LAYOUT_TEMPLATE[l]); return !!t && !t.ownPhotos; }));
const withBadge = designForPost({ platform: 'instagram', headline: 'Winter tune-ups', body: 'Book before the cold.', badge: '10% off', cta: 'Book now' }, { company: 'Northwind', primary: '#1f6feb' }, 'offer');
ok('an offer post carries the offer it was given, in the offer template', withBadge.templateId === 'flash-offer' && withBadge.content.offer === '10% off' && withBadge.format === 'square');
const noBadge = designForPost({ platform: 'linkedin', headline: 'Winter tune-ups', body: '' }, { company: 'Northwind', primary: '#1f6feb' }, 'offer');
ok('…and without one falls back rather than showing "Your offer"', noBadge.templateId === 'spotlight-offer' && !noBadge.content.offer && noBadge.format === 'landscape');

console.log('The AI copywriter');
const store = new Map<string, string>([['crm_session', JSON.stringify({ backend: 'php', token: 'cookie' })], ['crm_active_account', 'acct-test']]);
(globalThis as Record<string, unknown>).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
const answer = { eyebrow: 'Winter ready', headline: 'Voted #1 furnace care in Austin', subhead: 'Heating checks that keep the cold out.', cta: 'Book a tune-up', points: ['Furnace tune-ups', 'Save 30% on repairs', 'AC repair'], offer: '50% off everything', caption: 'Stay warm this winter — book now for $49.', hashtags: ['hvac', '#austin', 'winter ready'] };
(globalThis as Record<string, unknown>).fetch = async () => new Response(JSON.stringify({ success: true, response: { candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] } }), { status: 200 });
/* aiCopy reaches the AI through src/lib/gemini.ts, which reads Vite's import.meta.env — bundled here with it defined. */
const { build } = await import('esbuild');
const out = `${process.env.TMPDIR ?? '/tmp'}/aiCopy-${process.pid}.mjs`;
await build({ entryPoints: [new URL('../src/components/SocialCreator/design/aiCopy.ts', import.meta.url).pathname], bundle: true, format: 'esm', platform: 'neutral', outfile: out, define: { 'import.meta.env': '{"DEV":false}' }, logLevel: 'error' });
const { writeCopy } = await import(out) as typeof import('../src/components/SocialCreator/design/aiCopy');
const w = await writeCopy(TEMPLATES.find(t => t.id === 'seasonal-slant')!, biz, 'bookings', 'Winter furnace checks');
ok('the AI\'s words are used where they are true', w.by === 'ai' && w.content.eyebrow === 'Winter ready' && w.content.cta === 'Book a tune-up', w.content);
ok('a made-up ranking in the headline is replaced by the rule-written line', !/#1|voted/i.test(w.content.headline ?? '') && !!w.content.headline, w.content.headline);
ok('a made-up saving in the points is dropped', !(w.content.points ?? []).some(p => /30%/.test(p)) && (w.content.points ?? []).includes('Furnace tune-ups'), w.content.points);
ok('an offer the AI volunteered is ignored', !w.content.offer);
ok('a caption with a price nobody gave is replaced', !/\$49/.test(w.caption), w.caption);
ok('the customer is told how many lines were replaced', /3 lines/.test(w.note ?? ''), w.note);
ok('hashtags are cleaned', JSON.stringify(w.hashtags) === JSON.stringify(['hvac', 'austin', 'winterready']), w.hashtags);
(globalThis as Record<string, unknown>).fetch = async () => new Response(JSON.stringify({ success: false, error: 'The AI is not available on this install right now.' }), { status: 200 });
const down = await writeCopy(TEMPLATES[0], biz, 'sell', '');
ok('with the AI down, the design is still made from the business details, and says so', down.by === 'rules' && !!down.content.headline && /not available/.test(down.note ?? ''), down.note);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
