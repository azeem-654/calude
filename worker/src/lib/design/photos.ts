/**
 * The photo library the templates start from.
 *
 * ── Where these come from, and what may be done with them ──
 *
 * Every picture is from Unsplash and was looked at, one by one, before it was
 * listed (2026-10-29): the topic is what the picture actually shows. The
 * Unsplash License allows commercial use and changes without asking or
 * paying, and asks for no credit (a credit is welcome). It does not allow
 * selling the photo unchanged or building a competing photo service from
 * them — so the library is small, curated and only ever used inside a
 * customer's design. Pictures are served from Unsplash's own image CDN
 * (hotlinked, as Unsplash asks), cropped there to the size each layer needs.
 * https://unsplash.com/license
 *
 * Left out on purpose: photos with a visible brand or logo (a customer's post
 * must not look like a Nike advert), photos with words that make a claim
 * ("50% off"), and portraits of strangers — a stranger's face next to a
 * testimonial or a personal brand would say something untrue. Templates that
 * need a real person or the customer's own work set `ownPhotos` and ask for
 * an upload instead.
 *
 * More can be added the same way: look at it, check the licence, give it the
 * topics it shows. A customer can also search Openverse for CC0 and
 * public-domain pictures from the editor (routes/media.ts `photo_search`),
 * which records each picture's licence and creator with it.
 */
import type { PhotoTopic } from './spec';

export interface LibraryPhoto {
  /** Unsplash's image id, as in images.unsplash.com/photo-<id>. */
  id: string;
  topics: PhotoTopic[];
  alt: string;
  /** Where to keep the subject when cropped, 0–1 each way. */
  focal: [number, number];
  /** Whether light or dark words read better over most of it. */
  tone: 'light' | 'dark';
}

export const PHOTO_SOURCE = { name: 'Unsplash', license: 'Unsplash License', licenseUrl: 'https://unsplash.com/license' } as const;

export const PHOTOS: LibraryPhoto[] = [
  /* Products — no visible brand. */
  { id: '1505740420928-5e560c06d30e', topics: ['product'], alt: 'Black headphones on a yellow background', focal: [0.5, 0.5], tone: 'light' },
  { id: '1523275335684-37898b6baf30', topics: ['product'], alt: 'White wristwatch on a pale grey surface', focal: [0.45, 0.5], tone: 'light' },
  { id: '1608571423902-eed4a5ad8108', topics: ['beauty-product', 'product'], alt: 'Amber dropper bottle on a wooden stand with leaf shadows', focal: [0.55, 0.5], tone: 'light' },
  { id: '1576426863848-c21f53c60b19', topics: ['beauty-product', 'product'], alt: 'White serum bottle with a gold cap on a soft white background', focal: [0.42, 0.45], tone: 'light' },
  { id: '1612817288484-6f916006741a', topics: ['beauty-product', 'product'], alt: 'Flat lay of skincare jars and a bottle among pebbles and greenery', focal: [0.5, 0.5], tone: 'light' },
  { id: '1544816155-12df9643f363', topics: ['product', 'shopping', 'fashion'], alt: 'Plain canvas tote bag hanging on a pale wall', focal: [0.5, 0.55], tone: 'light' },
  { id: '1610701596007-11502861dcfa', topics: ['product'], alt: 'Handmade ceramic cups and bowls on a white shelf', focal: [0.4, 0.6], tone: 'light' },
  { id: '1592078615290-033ee584e267', topics: ['product', 'interior'], alt: 'Black chair with wooden legs on a teal background', focal: [0.5, 0.55], tone: 'light' },
  { id: '1555041469-a586c61ea9bc', topics: ['product', 'interior'], alt: 'Green velvet sofa against a white wall', focal: [0.5, 0.6], tone: 'light' },
  { id: '1523381210434-271e8be1f52b', topics: ['fashion', 'product'], alt: 'Green t-shirts on wooden hangers', focal: [0.5, 0.5], tone: 'dark' },
  { id: '1489987707025-afc232f7ea0f', topics: ['fashion', 'shopping'], alt: 'Rail of colourful t-shirts', focal: [0.5, 0.5], tone: 'dark' },
  { id: '1434389677669-e08b4cac3105', topics: ['fashion', 'product'], alt: 'Cream knitted poncho on a hanger', focal: [0.5, 0.45], tone: 'light' },
  /* Shopping and retail. */
  { id: '1607082348824-0a96f2a4b9da', topics: ['shopping'], alt: 'Black shopping bags with rope handles on a dark surface', focal: [0.5, 0.4], tone: 'dark' },
  { id: '1483985988355-763728e1935b', topics: ['shopping', 'fashion'], alt: 'Woman in a burgundy coat carrying shopping bags', focal: [0.55, 0.4], tone: 'light' },
  { id: '1563013544-824ae1b704d3', topics: ['shopping'], alt: 'Hands holding a card while shopping on a laptop', focal: [0.5, 0.45], tone: 'dark' },
  { id: '1556740738-b6a63e27c4df', topics: ['shopping'], alt: 'Shop assistant at a till taking a card payment', focal: [0.5, 0.45], tone: 'light' },
  { id: '1472851294608-062f824d29cc', topics: ['shopping'], alt: 'An "Open" sign hanging in a shop door', focal: [0.5, 0.45], tone: 'dark' },
  { id: '1441986300917-64674bd600d8', topics: ['shopping', 'fashion'], alt: 'Clothing boutique with shelves and rails', focal: [0.5, 0.5], tone: 'dark' },
  /* Homes, outside. */
  { id: '1600596542815-ffad4c1539a9', topics: ['home-exterior'], alt: 'Modern white house with a pool under a blue sky', focal: [0.55, 0.5], tone: 'light' },
  { id: '1600585154340-be6161a56a0c', topics: ['home-exterior'], alt: 'Modern dark house lit up at dusk beside a tree', focal: [0.5, 0.55], tone: 'dark' },
  { id: '1564013799919-ab600027ffc6', topics: ['home-exterior'], alt: 'White two-storey house with a pool and palm trees', focal: [0.5, 0.45], tone: 'light' },
  { id: '1512917774080-9991f1c4c750', topics: ['home-exterior'], alt: 'Contemporary house with glass walls beside a pool', focal: [0.45, 0.45], tone: 'light' },
  { id: '1568605114967-8130f3a36994', topics: ['home-exterior', 'roofing'], alt: 'Timber house with lit windows and a steep roof at dusk', focal: [0.5, 0.45], tone: 'dark' },
  { id: '1570129477492-45c003edd2be', topics: ['home-exterior', 'roofing'], alt: 'Grey shingle house with a white porch and green lawn', focal: [0.5, 0.45], tone: 'light' },
  { id: '1580587771525-78b9dba3b914', topics: ['home-exterior'], alt: 'Modern house with a pool and lawn', focal: [0.5, 0.5], tone: 'light' },
  { id: '1613490493576-7fde63acd811', topics: ['home-exterior'], alt: 'Modern villa with a long pool', focal: [0.5, 0.45], tone: 'light' },
  { id: '1605276374104-dee2a0ed3cd6', topics: ['home-exterior', 'roofing'], alt: 'Brick family house with a double garage', focal: [0.5, 0.5], tone: 'light' },
  { id: '1558036117-15d82a90b9b1', topics: ['home-exterior', 'roofing'], alt: 'Timber house on a hill at sunset', focal: [0.55, 0.5], tone: 'dark' },
  { id: '1600047509807-ba8f99d2cdde', topics: ['home-exterior'], alt: 'Modern house with wood cladding and a lawn', focal: [0.5, 0.5], tone: 'light' },
  { id: '1600566753190-17f0baa2a6c3', topics: ['home-exterior'], alt: 'Modern home with timber and glass at the front', focal: [0.5, 0.5], tone: 'light' },
  { id: '1574362848149-11496d93a7c7', topics: ['home-exterior'], alt: 'Apartment building with balconies among trees', focal: [0.5, 0.45], tone: 'light' },
  /* Homes, inside. */
  { id: '1586023492125-27b2c045efd7', topics: ['interior'], alt: 'Yellow armchair in a bright living room', focal: [0.55, 0.6], tone: 'light' },
  { id: '1600607687939-ce8a6c25118c', topics: ['interior'], alt: 'Open-plan living room with a grey sofa', focal: [0.5, 0.6], tone: 'light' },
  { id: '1556911220-bff31c812dba', topics: ['interior', 'renovation'], alt: 'White kitchen with a marble worktop', focal: [0.5, 0.55], tone: 'light' },
  { id: '1560448204-e02f11c3d0e2', topics: ['interior'], alt: 'Bright living room with tall windows', focal: [0.5, 0.55], tone: 'light' },
  { id: '1502672260266-1c1ef2d93688', topics: ['interior'], alt: 'Living room with plants and a sofa', focal: [0.5, 0.6], tone: 'light' },
  { id: '1484154218962-a197022b5858', topics: ['interior', 'renovation'], alt: 'Modern kitchen with black splashback and pendant lights', focal: [0.5, 0.5], tone: 'light' },
  { id: '1493809842364-78817add7ffb', topics: ['interior'], alt: 'Light apartment with herringbone floor', focal: [0.5, 0.55], tone: 'light' },
  { id: '1600210492486-724fe5c67fb0', topics: ['interior'], alt: 'Living room with framed prints and a leather sofa', focal: [0.5, 0.6], tone: 'light' },
  { id: '1618221195710-dd6b41faaea6', topics: ['interior'], alt: 'Warm living room with low sofa and pendant lamp', focal: [0.5, 0.65], tone: 'light' },
  { id: '1617806118233-18e1de247200', topics: ['interior'], alt: 'Dining room with green velvet chairs', focal: [0.5, 0.6], tone: 'light' },
  { id: '1631679706909-1844bbd07221', topics: ['interior'], alt: 'Neutral living room with round mirrors', focal: [0.5, 0.6], tone: 'light' },
  { id: '1600566752355-35792bedcfea', topics: ['interior', 'renovation', 'plumbing'], alt: 'Modern dark-tiled bathroom with a freestanding bath', focal: [0.5, 0.6], tone: 'dark' },
  { id: '1505693416388-ac5ce068fe85', topics: ['interior'], alt: 'Bedroom with an upholstered headboard', focal: [0.5, 0.55], tone: 'light' },
  { id: '1560518883-ce09059eeffa', topics: ['keys', 'home-exterior'], alt: 'House keys beside a small model house', focal: [0.5, 0.5], tone: 'light' },
  /* Trades. */
  { id: '1545259741-2ea3ebf61fa3', topics: ['hvac'], alt: 'Round smart thermostat on a white wall', focal: [0.6, 0.5], tone: 'light' },
  { id: '1513828583688-c52646db42da', topics: ['hvac'], alt: 'Industrial fan and ductwork', focal: [0.3, 0.45], tone: 'dark' },
  { id: '1632759145351-1d592919f522', topics: ['roofing'], alt: 'Roofer standing on a house roof with a ladder', focal: [0.6, 0.35], tone: 'light' },
  { id: '1504307651254-35680f356dfd', topics: ['roofing', 'renovation'], alt: 'Builders in hi-vis on a construction site seen from above', focal: [0.5, 0.4], tone: 'light' },
  { id: '1503387762-592deb58ef4e', topics: ['renovation'], alt: 'Hands drawing on architectural plans', focal: [0.5, 0.5], tone: 'light' },
  { id: '1607472586893-edb57bdc0e39', topics: ['plumbing'], alt: 'Grey pipework and valves on a brick wall', focal: [0.5, 0.4], tone: 'dark' },
  { id: '1585704032915-c3400ca199e7', topics: ['plumbing'], alt: 'Chrome mixer tap over a white basin', focal: [0.5, 0.4], tone: 'light' },
  { id: '1621905251189-08b45d6a269e', topics: ['electrical', 'hvac'], alt: 'Technician in a hard hat working on an electric meter', focal: [0.4, 0.4], tone: 'dark' },
  { id: '1562259949-e8e7689d7828', topics: ['renovation'], alt: 'Paint roller with blue paint on a white surface', focal: [0.4, 0.5], tone: 'light' },
  { id: '1504328345606-18bbc8c9d7d1', topics: ['renovation'], alt: 'Welder at work with sparks flying', focal: [0.45, 0.5], tone: 'dark' },
  { id: '1581578731548-c64695cc6952', topics: ['cleaning'], alt: 'Cleaner in gloves washing a window', focal: [0.5, 0.45], tone: 'dark' },
  { id: '1527515637462-cff94eecc1ac', topics: ['cleaning'], alt: 'Cordless vacuum cleaning a sparkling carpet', focal: [0.5, 0.45], tone: 'light' },
  { id: '1558904541-efa843a96f01', topics: ['garden'], alt: 'Close-up of a freshly cut green lawn', focal: [0.5, 0.6], tone: 'light' },
  { id: '1416879595882-3373a0480b5b', topics: ['garden'], alt: 'Garden trowel in soil', focal: [0.45, 0.5], tone: 'light' },
  /* Food and drink. */
  { id: '1517248135467-4c7edcad34c4', topics: ['food'], alt: 'Restaurant dining room with wooden tables', focal: [0.5, 0.55], tone: 'dark' },
  { id: '1504674900247-0877df9cc836', topics: ['food'], alt: 'Plated steak and greens on a dark table', focal: [0.5, 0.5], tone: 'dark' },
  { id: '1546069901-ba9599a7e63c', topics: ['food'], alt: 'Colourful salad bowl from above', focal: [0.5, 0.5], tone: 'light' },
  { id: '1565299624946-b28f40a0ae38', topics: ['food'], alt: 'Pizza on a wooden board', focal: [0.5, 0.5], tone: 'dark' },
  { id: '1495474472287-4d71bcdd2085', topics: ['coffee', 'food'], alt: 'Two hands bringing latte cups together', focal: [0.5, 0.5], tone: 'dark' },
  { id: '1509042239860-f550ce710b93', topics: ['coffee', 'food'], alt: 'Latte art cups on a wooden table with plants', focal: [0.5, 0.55], tone: 'dark' },
  /* Fitness, beauty, clinics. */
  { id: '1534438327276-14e5300c3a48', topics: ['fitness'], alt: 'Rows of dumbbells in a bright gym', focal: [0.5, 0.5], tone: 'dark' },
  { id: '1571019613454-1cb2f99b2d8b', topics: ['fitness'], alt: 'Woman doing sit-ups on a wooden floor', focal: [0.55, 0.55], tone: 'light' },
  { id: '1517836357463-d25dfeac3438', topics: ['fitness'], alt: 'Barbell lift close-up on a gym floor', focal: [0.5, 0.55], tone: 'dark' },
  { id: '1560066984-138dadb4c035', topics: ['salon'], alt: 'Empty hair salon with chairs and mirrors', focal: [0.5, 0.5], tone: 'light' },
  { id: '1570172619644-dfd03ed5d881', topics: ['salon', 'clinic'], alt: 'Facial treatment being applied with a brush', focal: [0.5, 0.45], tone: 'light' },
  { id: '1629909613654-28e377c37b09', topics: ['clinic'], alt: 'Clean dental treatment room', focal: [0.5, 0.5], tone: 'light' },
  /* Work. */
  { id: '1600880292203-757bb62b4baf', topics: ['team', 'office'], alt: 'Two colleagues high-fiving at a desk', focal: [0.45, 0.4], tone: 'light' },
  { id: '1522071820081-009f0129c71c', topics: ['team', 'workspace'], alt: 'Team working on laptops around a table', focal: [0.5, 0.45], tone: 'light' },
  { id: '1497366811353-6870744d04b2', topics: ['office'], alt: 'Open office with a long table and big windows', focal: [0.5, 0.55], tone: 'light' },
  { id: '1552664730-d307ca884978', topics: ['team', 'office'], alt: 'Team workshop with sticky notes on a wall', focal: [0.45, 0.45], tone: 'light' },
  { id: '1542744173-8e7e53415bb0', topics: ['team', 'office'], alt: 'Meeting around a table with laptops', focal: [0.5, 0.5], tone: 'light' },
  { id: '1531482615713-2afd69097998', topics: ['team', 'workspace'], alt: 'Woman working on a laptop in a busy office', focal: [0.55, 0.45], tone: 'light' },
  { id: '1497032628192-86f99bcd76bc', topics: ['workspace'], alt: 'Desk from above with a laptop, coffee and pens', focal: [0.5, 0.5], tone: 'dark' },
  { id: '1499951360447-b19be8fe80f5', topics: ['workspace'], alt: 'Tidy desk with a laptop, monitor and plant', focal: [0.5, 0.5], tone: 'light' },
  { id: '1486312338219-ce68d2c6f44d', topics: ['workspace'], alt: 'Hands typing on a laptop', focal: [0.55, 0.5], tone: 'light' },
  { id: '1484480974693-6ca0a78fb36b', topics: ['study', 'workspace'], alt: 'Hand writing a checklist in a notebook', focal: [0.55, 0.5], tone: 'light' },
  { id: '1456513080510-7bf3a84b82f8', topics: ['study'], alt: 'Open book in front of a bookshelf', focal: [0.5, 0.6], tone: 'dark' },
  { id: '1506880018603-83d5b814b5a6', topics: ['study'], alt: 'Open book held up in warm sunlight', focal: [0.5, 0.45], tone: 'dark' },
  { id: '1478737270239-2f02b77fc618', topics: ['creator'], alt: 'Studio microphone in a dark room', focal: [0.6, 0.55], tone: 'dark' },
  { id: '1516035069371-29a1b244cc32', topics: ['creator'], alt: 'Camera body and lenses on a black surface', focal: [0.5, 0.45], tone: 'dark' },
  /* Events and celebrations. */
  { id: '1540575467063-178a50c2df87', topics: ['event'], alt: 'Audience at a conference, seen from behind', focal: [0.5, 0.5], tone: 'dark' },
  { id: '1511578314322-379afb476865', topics: ['event'], alt: 'Empty conference hall set up with tables and screens', focal: [0.5, 0.45], tone: 'light' },
  { id: '1492684223066-81342ee5ff30', topics: ['event', 'celebration'], alt: 'Confetti falling over a crowd at a concert', focal: [0.5, 0.4], tone: 'dark' },
  { id: '1514525253161-7a46d19cd819', topics: ['event', 'celebration'], alt: 'Concert crowd under coloured lights', focal: [0.5, 0.45], tone: 'dark' },
  { id: '1530103862676-de8c9debad1d', topics: ['celebration'], alt: 'Bunch of colourful balloons', focal: [0.5, 0.4], tone: 'light' },
  { id: '1513151233558-d860c5398176', topics: ['celebration'], alt: 'Colourful confetti on a teal background', focal: [0.5, 0.5], tone: 'dark' },
  /* Seasons. */
  { id: '1512389142860-9c449e58a543', topics: ['winter'], alt: 'Frame of pine branches and berries on snow-white', focal: [0.5, 0.5], tone: 'light' },
  { id: '1543589077-47d81606c1bf', topics: ['winter'], alt: 'Decorated Christmas tree with red ornaments', focal: [0.5, 0.5], tone: 'dark' },
  { id: '1482517967863-00e15c9b44be', topics: ['winter'], alt: 'Soft Christmas lights and a bauble', focal: [0.6, 0.5], tone: 'dark' },
  { id: '1467810563316-b5476525c0f9', topics: ['new-year', 'celebration'], alt: 'Hands holding sparklers at dusk', focal: [0.5, 0.5], tone: 'dark' },
  { id: '1507525428034-b723cf961d3e', topics: ['summer'], alt: 'Calm beach at sunset', focal: [0.5, 0.5], tone: 'light' },
  { id: '1490750967868-88aa4486c946', topics: ['spring'], alt: 'Yellow spring flowers against a blue sky', focal: [0.5, 0.6], tone: 'light' },
  { id: '1476820865390-c52aeebb9891', topics: ['autumn'], alt: 'Road through autumn trees', focal: [0.5, 0.5], tone: 'dark' },
  { id: '1509557965875-b88c97052f0e', topics: ['halloween'], alt: 'Halloween skeleton decorations under neon light', focal: [0.5, 0.45], tone: 'dark' },
  { id: '1518199266791-5375a83190b7', topics: ['valentine'], alt: 'Heart-shaped lights out of focus', focal: [0.5, 0.5], tone: 'dark' },
  /* Backgrounds. */
  { id: '1557683316-973673baf926', topics: ['abstract'], alt: 'Smooth teal-to-navy gradient', focal: [0.5, 0.5], tone: 'dark' },
  { id: '1557682250-33bd709cbe85', topics: ['abstract'], alt: 'Smooth violet-to-pink gradient', focal: [0.5, 0.5], tone: 'dark' },
  { id: '1579546929518-9e396f3cc809', topics: ['abstract'], alt: 'Soft rainbow gradient', focal: [0.5, 0.5], tone: 'light' },
  { id: '1617791160505-6f00504e3519', topics: ['abstract'], alt: '3D ribbon of blue and violet blades', focal: [0.5, 0.5], tone: 'dark' },
  { id: '1620641788421-7a1c342ea42e', topics: ['abstract'], alt: 'Purple and pink abstract glow', focal: [0.5, 0.5], tone: 'dark' },
  { id: '1550684376-efcbd6e3f031', topics: ['texture'], alt: 'Black textured surface', focal: [0.5, 0.5], tone: 'dark' },
  { id: '1558591710-4b4a1ae0f04d', topics: ['texture', 'abstract'], alt: 'White flowing waves texture', focal: [0.5, 0.5], tone: 'light' },
  { id: '1533035353720-f1c6a75cd8ab', topics: ['texture'], alt: 'Grey concrete texture', focal: [0.5, 0.5], tone: 'light' },
];

export const photoById = (id: string): LibraryPhoto | undefined => PHOTOS.find(p => p.id === id);

/** Pictures for a list of topics, the first topic's first. Never empty. */
export function photosFor(topics: PhotoTopic[]): LibraryPhoto[] {
  const out: LibraryPhoto[] = [];
  for (const t of topics) for (const p of PHOTOS) if (p.topics.includes(t) && !out.includes(p)) out.push(p);
  return out.length ? out : PHOTOS.filter(p => p.topics.includes('abstract'));
}

/**
 * A library photo at the size a layer needs. Unsplash's CDN crops it there,
 * around the focal point, so a 9:16 story gets a sharp 9:16 picture rather
 * than the middle of a wide one blown up.
 */
export function photoUrl(id: string, w: number, h: number, focal: [number, number] = [0.5, 0.5], zoom = 1): string {
  /* Rounded up to a 16px step so nearby sizes share one cached download. */
  const step = (v: number) => Math.max(32, Math.min(2400, Math.ceil(v / 16) * 16));
  const z = Math.max(1, Math.min(4, zoom));
  return `https://images.unsplash.com/photo-${id}?w=${step(w)}&h=${step(h)}&fit=crop&crop=focalpoint&fp-x=${focal[0].toFixed(2)}&fp-y=${focal[1].toFixed(2)}${z > 1 ? `&fp-z=${z.toFixed(2)}` : ''}&q=80&auto=format`;
}

/** Topics a business's industry suggests, for picking its photos. */
export function topicsForIndustry(industry: string): PhotoTopic[] {
  const t = industry.toLowerCase();
  if (/hvac|heat|cool|air ?con|furnace/.test(t)) return ['hvac', 'electrical', 'home-exterior'];
  if (/roof/.test(t)) return ['roofing', 'home-exterior'];
  if (/plumb/.test(t)) return ['plumbing', 'renovation'];
  if (/electric/.test(t)) return ['electrical', 'renovation'];
  if (/clean|maid|janitor/.test(t)) return ['cleaning', 'interior'];
  if (/landscap|garden|lawn/.test(t)) return ['garden', 'home-exterior'];
  if (/home service|handyman|contractor|remodel|renovat|construct|build/.test(t)) return ['renovation', 'home-exterior', 'interior'];
  if (/real ?estate|realtor|property|realty|broker|mortgage/.test(t)) return ['home-exterior', 'interior', 'keys'];
  if (/shop|store|e-?commerce|retail|boutique|brand|apparel|fashion/.test(t)) return ['product', 'shopping', 'fashion'];
  if (/skin|cosmetic|beauty|spa|salon|hair|nail|barber/.test(t)) return ['beauty-product', 'salon'];
  if (/restaurant|cafe|coffee|food|bakery|catering|bar\b/.test(t)) return ['food', 'coffee'];
  if (/gym|fitness|yoga|pilates|trainer|wellness/.test(t)) return ['fitness'];
  if (/dent|clinic|medical|health|physio|chiro|therap/.test(t)) return ['clinic', 'office'];
  if (/coach|creator|podcast|influencer|speaker|author|consult/.test(t)) return ['creator', 'workspace', 'study'];
  if (/agency|marketing|software|saas|tech|account|law|legal|finance|insurance/.test(t)) return ['office', 'team', 'workspace'];
  return ['workspace', 'office', 'abstract'];
}
