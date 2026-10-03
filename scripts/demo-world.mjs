/**
 * The businesses the marketing pictures are full of — every kind of trade a
 * visitor might run, in the towns they might run it in.
 *
 * site-seed.mjs builds the sample workspace's contacts and deals from it, and
 * site-reels.mts serves it as the business directory AI Prospecting searches
 * while the screens are photographed (a mock of Geoapify's two endpoints), so
 * a search for "real estate agents in Richmond, Virginia" comes back with
 * forty-odd agents and a dentist search with dentists — the screen doing what
 * it does, against a directory that is invented.
 *
 * ── Why invented, and why on `.example` ──
 *
 * A picture of a lead list on a public page is a picture of named businesses.
 * Real ones would be somebody's details on our marketing, used without asking;
 * so every name is made up from parts, every website and address is on
 * `.example` (reserved: it can never belong to anybody), and every number is
 * in the 555-01xx range kept for fiction. The site says "sample workspace"
 * beside every screen.
 *
 * Deterministic: the same trade and town always give the same businesses, so
 * a retaken picture does not reshuffle.
 */

/** Every industry, with the Geoapify category its searches map to (lib/geoapify.ts `categoriesFor`). */
export const INDUSTRIES = [
  { key: 'realtor', trade: 'real estate agents', label: 'Real estate agent', cat: 'office.estate_agent', first: ['Brightline', 'Keystone', 'Harbor', 'Summit', 'Oak & Ivy', 'Crescent', 'Lighthouse', 'Blue Ridge', 'Capitol', 'Riverbend', 'Monument', 'Old Dominion'], second: ['Realty', 'Real Estate Group', 'Homes', 'Property Partners', 'Realty Co.', 'Estates'] },
  { key: 'dentist', trade: 'dentists', label: 'Dentist', cat: 'healthcare.dentist', first: ['Parkway', 'Riverside', 'Bayview', 'Cedar', 'Northgate', 'Kingsley', 'Willow', 'Fairfield', 'Ashton', 'Meadow'], second: ['Dental Care', 'Family Dentistry', 'Smile Studio', 'Dental Group', 'Orthodontics', 'Dental Practice'] },
  { key: 'law', trade: 'law firms', label: 'Law firm', cat: 'office.lawyer', first: ['Harbour', 'Whitfield &', 'Ellison', 'Marlowe', 'Grant & Reyes', 'Prescott', 'Calloway', 'Ashford'], second: ['Law', 'Legal', 'Partners LLP', 'Attorneys', 'Law Group', 'Solicitors'] },
  { key: 'gym', trade: 'gyms', label: 'Gym', cat: 'sport.fitness', first: ['Legacy', 'Ironhouse', 'Peak', 'Forge', 'Momentum', 'Elevate', 'Core', 'Northside'], second: ['Fitness', 'Strength Club', 'Athletic Club', 'Gym', 'Performance', 'Training'] },
  { key: 'restaurant', trade: 'restaurants', label: 'Restaurant', cat: 'catering.restaurant', first: ['Vine Street', 'Olive & Oak', 'The Copper', 'Saffron', 'Harbourside', 'Little Lisbon', 'Juniper', 'Ember'], second: ['Kitchen', 'Bistro', 'Grill', 'Trattoria', 'Dining Room', 'Eatery'] },
  { key: 'accountant', trade: 'accountants', label: 'Accountant', cat: 'office.accountant', first: ['Prestonwood', 'Ledgerline', 'Clearwater', 'Hartley', 'Bluecoat', 'Penrose', 'Sterling', 'Oakley'], second: ['Accountants', 'CPA', 'Tax & Advisory', 'Bookkeeping', 'Accounting'] },
  { key: 'salon', trade: 'hair salons', label: 'Hair salon', cat: 'service.beauty.hairdresser', first: ['Rosa', 'Velvet', 'Studio Nine', 'Gloss', 'The Mane', 'Luxe', 'Copper Rose', 'Haven'], second: ['Hair', 'Salon', 'Hair Studio', 'Hair & Beauty', 'Barbers'] },
  { key: 'auto', trade: 'auto repair shops', label: 'Auto repair', cat: 'service.vehicle.repair', first: ['Tenby', 'Precision', 'Route 9', 'Northline', 'Torque', 'Main Street', 'Redline', 'Allied'], second: ['Auto Repair', 'Garage', 'Motors', 'Auto Care', 'Service Centre'] },
  { key: 'insurance', trade: 'insurance agencies', label: 'Insurance agency', cat: 'office.insurance', first: ['Shield', 'Cornerstone', 'Anchor', 'Liberty Lane', 'Granite', 'Evergreen'], second: ['Insurance', 'Insurance Agency', 'Risk Partners', 'Insurance Group'] },
  { key: 'vet', trade: 'veterinarians', label: 'Veterinarian', cat: 'pet.veterinary', first: ['Willow Bend', 'Paws &', 'Greenfield', 'Hillside', 'Brookside', 'Maple'], second: ['Animal Hospital', 'Veterinary Clinic', 'Vets', 'Pet Clinic'] },
  { key: 'cafe', trade: 'cafes', label: 'Café', cat: 'catering.cafe', first: ['Bean & Barley', 'Corner', 'Daybreak', 'Kettle', 'Fern', 'Northern Grind'], second: ['Coffee', 'Café', 'Espresso Bar', 'Coffee House'] },
  { key: 'hotel', trade: 'hotels', label: 'Hotel', cat: 'accommodation', first: ['The Rowan', 'Harbour View', 'Kingsgate', 'The Linden', 'Seaside', 'Granary'], second: ['Hotel', 'Inn', 'House', 'Suites', 'Lodge'] },
  { key: 'electrician', trade: 'electricians', label: 'Electrician', cat: 'service.electrician', first: ['Bright Spark', 'Volt', 'Live Wire', 'Northern', 'Current', 'Ampere'], second: ['Electrical', 'Electricians', 'Electric Co.', 'Power Services'] },
  { key: 'clinic', trade: 'chiropractors', label: 'Clinic', cat: 'healthcare.clinic_or_praxis', first: ['Rowan', 'Align', 'Spine & Joint', 'Wellspring', 'Balance', 'Motion'], second: ['Chiropractic', 'Health Clinic', 'Physio', 'Wellness Centre'] },
  { key: 'florist', trade: 'florists', label: 'Florist', cat: 'commercial.florist', first: ['Petal', 'Bloom & Wild', 'Stem', 'The Flower', 'Posy', 'Wildflower'], second: ['Florist', 'Flowers', 'Studio', 'House'] },
  { key: 'photo', trade: 'photographers', label: 'Photographer', cat: 'service.photographer', first: ['Lens &', 'Golden Hour', 'Northlight', 'Frame', 'Silver'], second: ['Photography', 'Studio', 'Photo Co.', 'Pictures'] },
  { key: 'architect', trade: 'architects', label: 'Architect', cat: 'office.architect', first: ['Fenwick', 'Linea', 'Studio Arc', 'Halden', 'Plane'], second: ['Architects', 'Architecture', 'Design Studio', 'Associates'] },
  { key: 'mortgage', trade: 'mortgage brokers', label: 'Mortgage broker', cat: 'office.financial_advisor', first: ['Keystone', 'Homeward', 'Clearpath', 'First Key', 'Beacon'], second: ['Mortgages', 'Home Loans', 'Lending', 'Mortgage Co.'] },
  { key: 'property', trade: 'property managers', label: 'Property manager', cat: 'office.estate_agent', first: ['Alderman', 'Tenantly', 'Park Lane', 'Gatehouse', 'Cityside'], second: ['Property Management', 'Lettings', 'Rentals', 'Property Group'] },
  { key: 'school', trade: 'driving schools', label: 'Driving school', cat: 'education.driving_school', first: ['Green Light', 'Clutch', 'Pass First', 'Road Ready', 'Mirror'], second: ['Driving School', 'Driving Academy', 'School of Motoring'] },
  { key: 'daycare', trade: 'daycare centres', label: 'Daycare', cat: 'childcare', first: ['Little Acorns', 'Sunbeam', 'Treetops', 'Busy Bees', 'Rainbow'], second: ['Nursery', 'Daycare', 'Early Learning', 'Childcare'] },
  { key: 'venue', trade: 'wedding venues', label: 'Wedding venue', cat: 'activity.events_venue', first: ['Ashcombe', 'The Orangery at', 'Hawthorn', 'Millbrook', 'Rosewood'], second: ['Barn', 'Hall', 'Estate', 'Manor', 'House'] },
  { key: 'bakery', trade: 'bakeries', label: 'Bakery', cat: 'commercial.food_and_drink.bakery', first: ['Crumb', 'Rise', 'Golden Crust', 'Butter &', 'Flour Street'], second: ['Bakery', 'Bakehouse', 'Patisserie', 'Bread Co.'] },
  { key: 'it', trade: 'IT support companies', label: 'IT support', cat: 'office.it', first: ['Kestrel', 'Bytewise', 'Northstar', 'Helix', 'Cobalt'], second: ['IT', 'Tech Support', 'Networks', 'Systems', 'Managed IT'] },
  { key: 'marketing', trade: 'marketing agencies', label: 'Marketing agency', cat: 'office.advertising_agency', first: ['Bluecoat', 'Creekside', 'Paper Plane', 'Loud', 'Signal'], second: ['Media', 'Studio', 'Creative', 'Marketing', 'Agency'] },
];

/** Towns, each with where it is and how its numbers and addresses are written. */
export const TOWNS = [
  { name: 'Richmond, Virginia', short: 'Richmond', lat: 37.5407, lon: -77.436, us: true, area: '804', zip: 'VA 23219', streets: ['W Broad St', 'E Main St', 'Monument Ave', 'Cary St', 'Patterson Ave', 'Grace St'] },
  { name: 'Virginia Beach, Virginia', short: 'Virginia Beach', lat: 36.8529, lon: -75.978, us: true, area: '757', zip: 'VA 23451', streets: ['Atlantic Ave', 'Laskin Rd', 'Pacific Ave', 'Shore Dr', 'Holland Rd'] },
  { name: 'Norfolk, Virginia', short: 'Norfolk', lat: 36.8508, lon: -76.2859, us: true, area: '757', zip: 'VA 23510', streets: ['Granby St', 'Colley Ave', 'Waterside Dr', 'Brambleton Ave'] },
  { name: 'Austin, Texas', short: 'Austin', lat: 30.2672, lon: -97.7431, us: true, area: '512', zip: 'TX 78701', streets: ['Congress Ave', 'S Lamar Blvd', 'E 6th St', 'Guadalupe St', 'Burnet Rd'] },
  { name: 'Denver, Colorado', short: 'Denver', lat: 39.7392, lon: -104.9903, us: true, area: '303', zip: 'CO 80202', streets: ['Larimer St', 'Colfax Ave', 'Broadway', 'Blake St', 'Speer Blvd'] },
  { name: 'Miami, Florida', short: 'Miami', lat: 25.7617, lon: -80.1918, us: true, area: '305', zip: 'FL 33130', streets: ['Brickell Ave', 'Biscayne Blvd', 'SW 8th St', 'Coral Way'] },
  { name: 'Phoenix, Arizona', short: 'Phoenix', lat: 33.4484, lon: -112.074, us: true, area: '602', zip: 'AZ 85004', streets: ['N Central Ave', 'E Camelback Rd', 'W Roosevelt St', 'N 7th St'] },
  { name: 'Plano, Texas', short: 'Plano', lat: 33.0198, lon: -96.6989, us: true, area: '972', zip: 'TX 75074', streets: ['Parker Rd', 'Legacy Dr', 'Preston Rd', 'K Ave'] },
  { name: 'Leeds', short: 'Leeds', lat: 53.8008, lon: -1.5491, us: false, area: '0113', zip: 'LS1', streets: ['Park Row', 'Briggate', 'The Headrow', 'Kirkgate', 'Boar Lane', 'Wellington St'] },
  { name: 'Manchester', short: 'Manchester', lat: 53.4808, lon: -2.2426, us: false, area: '0161', zip: 'M1', streets: ['Deansgate', 'King St', 'Oldham St', 'Portland St', 'Whitworth St'] },
  { name: 'Bristol', short: 'Bristol', lat: 51.4545, lon: -2.5879, us: false, area: '0117', zip: 'BS1', streets: ['Park St', 'Corn St', 'Whiteladies Rd', 'Gloucester Rd'] },
];

/* A small, stable hash, so the same input always gives the same business. */
function h(s) {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  return x >>> 0;
}
const slug = s => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '').slice(0, 28);

export const industryFor = trade => {
  const t = String(trade).toLowerCase();
  return INDUSTRIES.find(i => t.includes(i.trade.split(' ')[0].replace(/s$/, '')) || i.trade === t)
    ?? INDUSTRIES.find(i => i.cat.split(',').some(c => t.includes(c.split('.').pop())));
};
export const townFor = place => {
  const p = String(place).toLowerCase();
  return TOWNS.find(t => t.name.toLowerCase() === p) ?? TOWNS.find(t => p.includes(t.short.toLowerCase())) ?? null;
};

/** One business: a name made from parts, an address on a real street name, `.example` contact details. */
export function business(ind, town, n) {
  const k = h(`${ind.key}|${town.short}|${n}`);
  const a = ind.first[k % ind.first.length];
  const b = ind.second[(k >>> 8) % ind.second.length];
  /* Past the first round of combinations, a district keeps the names apart. */
  const district = n >= ind.first.length ? ` ${['North', 'East', 'West', 'Midtown', 'Old Town', 'Southside', 'Uptown', 'Riverside'][n % 8]}` : '';
  const name = `${a} ${b}${district}`.replace(/\s+/g, ' ').trim();
  const domain = `${slug(`${a}${b}`)}${district ? slug(district) : ''}.example`;
  const street = town.streets[(k >>> 4) % town.streets.length];
  const no = 10 + ((k >>> 12) % 880);
  const phone = town.us ? `(${town.area}) 555-01${String(n % 100).padStart(2, '0')}` : `${town.area} 496 0${String(100 + (n % 900)).slice(-3)}`;
  /* Most list a website and the address on it; a few have no site at all, as
     a real directory does. (A site that publishes no address would be read —
     and `.example` cannot be fetched, so the picture would show a failed read
     that says nothing about the product.) */
  const site = (k % 11) !== 0;
  const mail = site;
  const box = ['hello', 'info', 'office', 'contact', 'enquiries', 'team', 'bookings'][(k >>> 6) % 7];
  return {
    name,
    address: town.us ? `${no} ${street}, ${town.short}, ${town.zip}` : `${no} ${street}, ${town.short} ${town.zip}`,
    phone,
    website: site ? `https://${domain}/` : '',
    email: mail ? `${box}@${domain}` : '',
    lat: town.lat + (((k >>> 3) % 1000) - 500) / 9000,
    lon: town.lon + (((k >>> 13) % 1000) - 500) / 7000,
    category: ind.cat.split(',')[0],
  };
}

/** A town's businesses of one trade, as many as a directory page would hold. */
export function businessesIn(ind, town, count) {
  const out = [];
  const seen = new Set();
  for (let n = 0; out.length < count && n < count * 3; n++) {
    const b = business(ind, town, n);
    if (seen.has(b.name)) continue;
    seen.add(b.name);
    out.push(b);
  }
  return out;
}

/** How many a town has of a trade — bigger towns more, and never the same round number twice. */
export function countFor(ind, town) {
  return 34 + (h(`${ind.key}|${town.short}`) % 27);
}

const FIRST = ['Aisha', 'Tom', 'Marta', 'Devon', 'Priya', 'Grant', 'Nia', 'Owen', 'Rosa', 'Caleb', 'Hana', 'Iris', 'Marcus', 'Lena', 'Jamal', 'Sofia', 'Ethan', 'Chloe', 'Mateo', 'Grace', 'Ravi', 'Olivia', 'Liam', 'Zara', 'Noah', 'Emma', 'Kofi', 'Ava', 'Diego', 'Mia', 'Hugo', 'Leah', 'Arjun', 'Ella', 'Sam', 'Yara'];
const LAST = ['Khan', 'Reilly', 'Vega', 'Brooks', 'Nair', 'Whitfield', 'Osei', 'Baptiste', 'Marin', 'Doyle', 'Sato', 'Flynn', 'Ellis', 'Ward', 'Okafor', 'Romero', 'Hughes', 'Patel', 'Lindqvist', 'Moreau', 'Chen', 'Bennett', 'Adeyemi', 'Fischer', 'Kowalski', 'Hart', 'Mensah', 'Silva', 'Novak', 'Price', 'Yilmaz', 'Grant', 'Iyer', 'Shaw', 'Ortega', 'Ng'];

/**
 * People, one at each of a spread of businesses across every industry and
 * town — the sample workspace's contacts. `count` of them, in a fixed order.
 */
export function peopleAcrossIndustries(count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const ind = INDUSTRIES[i % INDUSTRIES.length];
    const town = TOWNS[(i * 5 + Math.floor(i / INDUSTRIES.length)) % TOWNS.length];
    const b = business(ind, town, i % 9);
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 7) % LAST.length];
    const domain = b.website ? b.website.replace(/^https:\/\//, '').replace(/\/$/, '') : `${slug(b.name)}.example`;
    out.push({ first, last, company: b.name, industry: ind.label, town: town.short, email: `${first.toLowerCase()}@${domain}`, phone: b.phone, address: b.address });
  }
  return out;
}
