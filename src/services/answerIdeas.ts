/**
 * Likely answers to the New Project wizard's typed questions, without the AI.
 *
 * ── Why this exists ──
 *
 * Every typed question used to be an empty box with one fixed example in it —
 * "Amazon sellers doing over £20k a month in the UK" shown to a med spa. The
 * AI now proposes answers for the business in front of it (`suggest` in
 * routes/intake.ts); this is what the wizard shows when the AI is not there,
 * or before it answers: ideas for the trade the request names, the request's
 * own words first, and a generic set only when no trade is recognised.
 *
 * Pure, so `npm run test:intake` can check a med spa is never offered Amazon
 * sellers again.
 */

export interface Ideas {
  options: string[];
  /** What "Let AI decide" picks: one or more of `options`. */
  pick: string[];
  /** One sentence on why — said beside the pick. */
  why: string;
  placeholder: string;
}

export interface IdeaContext {
  /** The request, as typed or spoken. */
  prompt: string;
  /** What the business does, from its profile or website. */
  description?: string;
  /** Answers already given, by question id. */
  answers?: Record<string, string>;
}

interface Trade {
  re: RegExp;
  name: string;
  audience: string[];
  offer: string[];
  /** Businesses this trade might partner with or sell to, for a daily finder. */
  trades: string[];
  topics: string[];
  feel: string[];
  /** An Unsplash photograph for the first section of a page — checked by eye to show this trade. */
  photo: string;
}

const TRADES: Trade[] = [
  {
    re: /\b(med ?spa|medspa|medical spa|aesthetic|botox|filler|injectable|skin clinic|laser hair|cosmetic clinic)/i,
    name: 'med spa', photo: 'photo-1570172619644-dfd03ed5d881',
    audience: ['New enquiries from Instagram, Facebook and Google', 'Women 30–55 nearby interested in Botox and fillers', 'Past clients due for a top-up treatment',
      'People who asked about a treatment but never booked', 'Brides-to-be and event guests', 'Men interested in skin and hair treatments'],
    offer: ['A free skin consultation', 'A complimentary treatment plan and price quote', 'An introductory price on a first Botox treatment',
      'A free add-on facial with any filler booking', 'A monthly membership with members’ pricing', 'A free laser hair removal patch test'],
    trades: ['hair salons', 'beauty salons', 'gyms', 'bridal shops', 'wedding planners', 'yoga studios'],
    topics: ['Botox vs fillers explained', 'What to expect at a first consultation', 'Laser hair removal FAQs', 'Preparing your skin for summer', 'Aftercare tips for injectables'],
    feel: ['calm, clean, luxurious', 'soft, elegant, modern', 'clinical, trustworthy, premium'],
  },
  {
    re: /\b(dentist|dental|orthodont|invisalign|teeth)/i,
    name: 'dental practice', photo: 'photo-1629909613654-28e377c37b09',
    audience: ['Families within 5 miles of the practice', 'Patients overdue for a check-up', 'Adults interested in Invisalign or whitening',
      'New movers in the area looking for a dentist', 'People who enquired but never booked', 'Nervous patients who avoid the dentist'],
    offer: ['A free new-patient consultation', 'A whitening consultation at no charge', 'Same-week emergency appointments',
      'An Invisalign assessment', 'A family check-up day', 'Payment plans on treatment'],
    trades: ['schools', 'nurseries', 'gyms', 'employers with 50+ staff', 'pharmacies', 'sports clubs'],
    topics: ['How often you really need a check-up', 'Invisalign vs braces', 'Whitening: what works and what does not', 'Looking after children’s teeth', 'What to do in a dental emergency'],
    feel: ['bright, friendly, reassuring', 'clean, modern, clinical', 'warm and family-friendly'],
  },
  {
    re: /\b(real estate|realtor|estate agent|property|properties|homes? for sale|mortgage|letting)/i,
    name: 'real estate', photo: 'photo-1560518883-ce09059eeffa',
    audience: ['Homeowners thinking of selling in the next 6 months', 'First-time buyers', 'Landlords with 2+ rental properties',
      'People who asked for a valuation but never listed', 'Relocating families', 'Investors looking for rental yield'],
    offer: ['A free home valuation', 'A free market report for their street', 'A first-time buyer guide and call',
      'A rental appraisal for landlords', 'An off-market property list', 'A 15-minute selling strategy call'],
    trades: ['real estate agents', 'mortgage brokers', 'property managers', 'home builders', 'interior designers', 'moving companies'],
    topics: ['What your home is worth this month', 'First-time buyer mistakes to avoid', 'Staging tips that sell faster', 'The local market in 60 seconds', 'Renting vs buying'],
    feel: ['premium, clean, confident', 'warm, local, trustworthy', 'modern and minimal'],
  },
  {
    re: /\b(plumb|hvac|heating|boiler|roof|electric|contractor|builder|landscap|cleaning|pest|handyman|remodel|renovat)/i,
    name: 'home services', photo: 'photo-1621905251189-08b45d6a269e',
    audience: ['Homeowners within 20 miles', 'Landlords and property managers', 'Past customers due for a service',
      'People who asked for a quote but never booked', 'Small commercial premises nearby', 'New homeowners in the area'],
    offer: ['A free quote within 24 hours', 'A discounted annual service', 'Same-day call-outs',
      'A free safety inspection', 'A maintenance plan with priority booking', 'A 10% first-job discount'],
    trades: ['property managers', 'letting agents', 'real estate agents', 'facilities managers', 'home builders', 'insurance brokers'],
    topics: ['Signs your system needs a service', 'How to avoid a winter breakdown', 'What a fair quote looks like', 'Seasonal maintenance checklist', 'DIY or call a pro?'],
    feel: ['bold, practical, dependable', 'clean and trustworthy', 'friendly and local'],
  },
  {
    re: /\b(restaurants?|cafes?|café|coffee|bakery|bars?|pubs?|takeaway|catering|food truck)\b/i,
    name: 'restaurant', photo: 'photo-1517248135467-4c7edcad34c4',
    audience: ['Locals within 3 miles', 'Past diners who have not been back in 60 days', 'Office teams nearby for lunch and events',
      'Families looking for weekend meals', 'People planning birthdays and parties', 'Tourists visiting the area'],
    offer: ['A free dessert on the next visit', 'A set lunch menu for offices', 'Private dining for events',
      'Kids eat free on weekdays', 'A loyalty card: the 10th meal free', 'Catering for office meetings'],
    trades: ['offices', 'coworking spaces', 'event planners', 'hotels', 'schools', 'gyms'],
    topics: ['This week’s specials', 'Behind the scenes in the kitchen', 'Meet the team', 'Seasonal menu launch', 'Planning a party with us'],
    feel: ['warm, rustic, inviting', 'bright and playful', 'elegant and refined'],
  },
  {
    re: /\b(gym|fitness|personal train|yoga|pilates|crossfit|martial art|boxing)/i,
    name: 'fitness', photo: 'photo-1534438327276-14e5300c3a48',
    audience: ['Adults nearby starting their fitness journey', 'Lapsed members who stopped coming', 'People who took a trial but did not join',
      'Busy professionals wanting short sessions', 'Over-50s looking to stay active', 'Local teams and clubs'],
    offer: ['A free 7-day pass', 'A free fitness assessment', 'A first month at a reduced rate', 'A free intro class', 'Corporate memberships for teams', 'A 6-week transformation programme'],
    trades: ['offices', 'physiotherapists', 'sports clubs', 'schools', 'nutritionists', 'corporate HR teams'],
    topics: ['Beginner workouts that stick', 'Eating for energy', 'Member success stories', 'How to come back after a break', 'Class timetable highlights'],
    feel: ['bold, energetic, motivating', 'calm and balanced', 'dark, premium, intense'],
  },
  {
    re: /\b(law|lawyer|attorney|solicitor|legal|accountant|accounting|bookkeep|tax|cpa|financial advis|insurance)/i,
    name: 'professional services', photo: 'photo-1600880292203-757bb62b4baf',
    audience: ['Small business owners nearby', 'Founders in their first two years', 'People who enquired but did not book',
      'Past clients due a review', 'Contractors and freelancers', 'Families planning for the future'],
    offer: ['A free 20-minute consultation', 'A fixed-fee review of their situation', 'A year-end checklist', 'A free document health check', 'A second opinion at no charge', 'A plain-English guide and call'],
    trades: ['small businesses', 'accountants', 'real estate agents', 'financial advisers', 'startups', 'construction companies'],
    topics: ['Deadlines to know this quarter', 'Common mistakes we see', 'Plain-English answers to client questions', 'What changed this year', 'When to get professional advice'],
    feel: ['trustworthy, calm, professional', 'clean and modern', 'premium and understated'],
  },
  {
    re: /\b(e-?commerce|online store|online shop|shopify|amazon|products?|store|shop|brand)\b/i,
    name: 'online shop', photo: 'photo-1441986300917-64674bd600d8',
    audience: ['Past buyers who have not ordered in 90 days', 'Visitors who abandoned their basket', 'Newsletter subscribers who never bought',
      'Repeat customers and VIPs', 'Gift buyers ahead of holidays', 'Followers on Instagram and TikTok'],
    offer: ['10% off the next order', 'Free shipping this week', 'A bundle at a better price', 'Early access to the new collection', 'A free gift with orders over a threshold', 'A loyalty reward for repeat buyers'],
    trades: ['boutiques', 'gift shops', 'concept stores', 'corporate gifting companies', 'event planners', 'interior designers'],
    topics: ['New arrivals', 'How to style or use our bestsellers', 'Customer favourites', 'Behind the brand', 'Gift guides'],
    feel: ['bold, colourful, fun', 'minimal and premium', 'natural and earthy'],
  },
  {
    re: /\b(agency|marketing|seo|web design|software|saas|app|consult|coach|course|training)/i,
    name: 'B2B services', photo: 'photo-1522071820081-009f0129c71c',
    audience: ['Owners of small businesses with 5–50 staff', 'Marketing managers at growing companies', 'Leads who downloaded something but never talked to us',
      'Past clients who might need more', 'Founders who just raised money', 'Local businesses with weak websites'],
    offer: ['A free 20-minute audit', 'A personalised action plan', 'A free trial', 'A live demo', 'A case study and a short call', 'A fixed-price starter package'],
    trades: ['small businesses', 'restaurants', 'dentists', 'real estate agents', 'law firms', 'gyms'],
    topics: ['Quick wins for this month', 'Mistakes we see every week', 'Client results, step by step', 'Tools we recommend', 'Industry news explained'],
    feel: ['confident, modern, clean', 'bold and tech-forward', 'friendly and approachable'],
  },
  {
    re: /\b(salon|barber|hair|nails|beauty|lash|brow|spa)\b/i,
    name: 'salon', photo: 'photo-1560066984-138dadb4c035',
    audience: ['Clients due for their next appointment', 'Locals within 5 miles', 'People who booked once and never came back',
      'Brides and wedding parties', 'Students and young professionals', 'Clients who left a review'],
    offer: ['A free fringe trim or brow tidy', 'A first-visit discount', 'Refer a friend: both get a treat', 'A loyalty card', 'A pamper package', 'Late-night appointments'],
    trades: ['bridal shops', 'wedding planners', 'photographers', 'gyms', 'hotels', 'event venues'],
    topics: ['Trends this season', 'Before and after', 'At-home care tips', 'Meet the stylists', 'Booking tips for busy weeks'],
    feel: ['chic, soft, stylish', 'bold and fashion-forward', 'natural and calm'],
  },
];

const GENERIC: Trade = {
  re: /$^/, name: '', photo: 'photo-1497366811353-6870744d04b2',
  audience: ['New enquiries from your website and social media', 'Past customers who have not bought in a while', 'People who asked for a price but never decided',
    'Local businesses that could use what you offer', 'Customers who left a good review', 'Newsletter subscribers'],
  offer: ['A free consultation', 'A free quote', 'An introductory discount', 'A short demo or call', 'A useful guide', 'A limited-time offer'],
  trades: ['small businesses', 'real estate agents', 'restaurants', 'gyms', 'dentists', 'accountants'],
  topics: ['Answers to questions customers ask', 'Behind the scenes', 'Customer stories', 'Tips from the team', 'News and updates'],
  feel: ['clean, modern, friendly', 'bold and confident', 'premium and minimal'],
};

/**
 * A stock photograph for the first section of a client's page, by trade.
 *
 * Unsplash's licence allows commercial use without asking; the images are
 * served from Unsplash's own CDN (hotlinked, as their guidelines ask) at a
 * width a hero needs. Each id was looked at, so a dentist does not get a
 * gym. The client can upload their own instead, or have none.
 */
export function stockPhotoFor(text: string, width = 1600): string {
  return `https://images.unsplash.com/${tradeOf(text).photo}?w=${width}&q=70&auto=format&fit=crop`;
}

/** The trade a request and a business description are about, or the generic set. */
export function tradeOf(text: string): Trade {
  return TRADES.find(t => t.re.test(text)) ?? GENERIC;
}

const firstClause = (s: string) => (s.split(/(?<=[.!?])\s/)[0] ?? '').trim();

/**
 * Ideas for one question. Returns null for a question with nothing sensible
 * to suggest (a website address, a colour) — those keep their own box.
 */
export function ideasFor(id: string, ctx: IdeaContext): Ideas | null {
  const text = `${ctx.prompt} ${ctx.description ?? ''}`;
  const t = tradeOf(text);
  const where = (ctx.answers?.location || ctx.answers?.prospectPlaces || '').split(';')[0].trim();
  const named = t.name ? `for a ${t.name}` : 'for your request';
  const local = (s: string) => (where && /nearby|within|local|area/i.test(s) ? `${s.replace(/ nearby| in the area/i, '')} in ${where}` : s);
  switch (id) {
    case 'audience': {
      const options = t.audience.map(local);
      return { options, pick: [options[0]], why: `People who already showed interest answer first — the likeliest bookings ${named}.`, placeholder: `e.g. ${options[1] ?? options[0]}` };
    }
    case 'offer': case 'product':
      return { options: t.offer, pick: [t.offer[0]], why: 'One concrete, low-risk first step gets more replies than "our services".', placeholder: `e.g. ${t.offer[0]}` };
    case 'prospectTrades':
      return { options: t.trades, pick: t.trades.slice(0, 2), why: `These businesses are listed in directories and plausibly buy from or refer to a ${t.name || 'business like yours'}.`, placeholder: `e.g. ${t.trades.slice(0, 2).join(', ')}` };
    case 'topics':
      return { options: t.topics, pick: t.topics.slice(0, 3), why: 'Questions your customers already ask make posts people read and share.', placeholder: `e.g. ${t.topics.slice(0, 2).join(', ')}` };
    case 'designStyle':
      return { options: t.feel, pick: [t.feel[0]], why: `A feel that suits a ${t.name || 'business like yours'} and reads well on a phone.`, placeholder: `e.g. ${t.feel[0]}` };
    case 'location': case 'prospectPlaces': {
      if (!where && !/\b(in|near|around)\s+[A-Z]/.test(ctx.prompt)) return null;
      const place = where || firstClause(ctx.prompt).match(/\b(?:in|near|around)\s+([A-Z][\w .,'-]{2,40})/)?.[1]?.replace(/[.,]+$/, '') || '';
      if (!place) return null;
      const options = [place, `${place} and 10 miles around`, `${place} and 25 miles around`];
      return { options, pick: [options[0]], why: 'Where your request says you are — widen it once the first batches come in.', placeholder: `e.g. ${options[1]}` };
    }
    case 'roles':
      return { options: ['Office and admin', 'Warehouse and logistics', 'Sales', 'Healthcare', 'Hospitality', 'Trades and construction'], pick: ['Sales'], why: 'A sector to start with — add the rest once the first ones work.', placeholder: 'e.g. Warehouse and logistics, West Midlands' };
    default:
      return null;
  }
}

/** The typed questions the wizard offers ideas for. */
export const IDEA_QUESTIONS = new Set(['audience', 'offer', 'product', 'prospectTrades', 'topics', 'designStyle', 'location', 'prospectPlaces', 'roles']);
