/**
 * A state, nation or province, and its largest towns — without asking anybody.
 *
 * ── Why a table in the code ──
 *
 * Both free directories search inside a named boundary. Geoapify can list a
 * region's towns (`citiesIn`), but only on the owner's key, and OpenStreetMap's
 * Overpass — the directory every install has — cannot search a whole state at
 * all: "commercial property in Virginia" is every building in a state of eight
 * million people, and it times out. Without this, a customer who typed
 * "Virginia" was shown "Could not reach OpenStreetMap (timed out)" in the
 * middle of setting up a project, which reads as the product being broken.
 *
 * So a region is worked a town at a time, largest first — the same as the
 * daily finder does with Geoapify's list — and these are the towns when there
 * is no key to ask. Town names and order are from the national censuses
 * (US 2020, UK 2021, Canada 2021, Australia 2021), largest first; a list of
 * town names is a fact, not anybody's data. A region not here is searched as
 * typed, as before.
 */

const US: Record<string, [string, string[]]> = {
  al: ['Alabama', ['Huntsville', 'Birmingham', 'Montgomery', 'Mobile', 'Tuscaloosa', 'Hoover', 'Dothan', 'Auburn']],
  ak: ['Alaska', ['Anchorage', 'Fairbanks', 'Juneau', 'Wasilla', 'Sitka', 'Ketchikan', 'Kenai', 'Kodiak']],
  az: ['Arizona', ['Phoenix', 'Tucson', 'Mesa', 'Chandler', 'Gilbert', 'Glendale', 'Scottsdale', 'Peoria', 'Tempe', 'Surprise']],
  ar: ['Arkansas', ['Little Rock', 'Fayetteville', 'Fort Smith', 'Springdale', 'Jonesboro', 'Rogers', 'Conway', 'North Little Rock']],
  ca: ['California', ['Los Angeles', 'San Diego', 'San Jose', 'San Francisco', 'Fresno', 'Sacramento', 'Long Beach', 'Oakland', 'Bakersfield', 'Anaheim']],
  co: ['Colorado', ['Denver', 'Colorado Springs', 'Aurora', 'Fort Collins', 'Lakewood', 'Thornton', 'Arvada', 'Westminster', 'Pueblo', 'Boulder']],
  ct: ['Connecticut', ['Bridgeport', 'Stamford', 'New Haven', 'Hartford', 'Waterbury', 'Norwalk', 'Danbury', 'New Britain']],
  de: ['Delaware', ['Wilmington', 'Dover', 'Newark', 'Middletown', 'Smyrna', 'Milford', 'Seaford', 'Georgetown']],
  dc: ['District of Columbia', ['Washington']],
  fl: ['Florida', ['Jacksonville', 'Miami', 'Tampa', 'Orlando', 'St. Petersburg', 'Hialeah', 'Port St. Lucie', 'Tallahassee', 'Cape Coral', 'Fort Lauderdale']],
  ga: ['Georgia', ['Atlanta', 'Columbus', 'Augusta', 'Macon', 'Savannah', 'Athens', 'Sandy Springs', 'Roswell']],
  hi: ['Hawaii', ['Honolulu', 'Hilo', 'Kailua', 'Kapolei', 'Kaneohe', 'Pearl City', 'Waipahu', 'Kahului']],
  id: ['Idaho', ['Boise', 'Meridian', 'Nampa', 'Idaho Falls', 'Caldwell', 'Pocatello', "Coeur d'Alene", 'Twin Falls']],
  il: ['Illinois', ['Chicago', 'Aurora', 'Naperville', 'Joliet', 'Rockford', 'Springfield', 'Elgin', 'Peoria']],
  in: ['Indiana', ['Indianapolis', 'Fort Wayne', 'Evansville', 'South Bend', 'Carmel', 'Fishers', 'Bloomington', 'Hammond']],
  ia: ['Iowa', ['Des Moines', 'Cedar Rapids', 'Davenport', 'Sioux City', 'Iowa City', 'West Des Moines', 'Ankeny', 'Waterloo']],
  ks: ['Kansas', ['Wichita', 'Overland Park', 'Kansas City', 'Olathe', 'Topeka', 'Lawrence', 'Shawnee', 'Manhattan']],
  ky: ['Kentucky', ['Louisville', 'Lexington', 'Bowling Green', 'Owensboro', 'Covington', 'Richmond', 'Georgetown', 'Florence']],
  la: ['Louisiana', ['New Orleans', 'Baton Rouge', 'Shreveport', 'Lafayette', 'Lake Charles', 'Kenner', 'Bossier City', 'Monroe']],
  me: ['Maine', ['Portland', 'Lewiston', 'Bangor', 'South Portland', 'Auburn', 'Biddeford', 'Sanford', 'Saco']],
  md: ['Maryland', ['Baltimore', 'Columbia', 'Germantown', 'Silver Spring', 'Waldorf', 'Frederick', 'Ellicott City', 'Rockville']],
  ma: ['Massachusetts', ['Boston', 'Worcester', 'Springfield', 'Cambridge', 'Lowell', 'Brockton', 'Quincy', 'Lynn', 'New Bedford']],
  mi: ['Michigan', ['Detroit', 'Grand Rapids', 'Warren', 'Sterling Heights', 'Ann Arbor', 'Lansing', 'Dearborn', 'Livonia']],
  mn: ['Minnesota', ['Minneapolis', 'Saint Paul', 'Rochester', 'Bloomington', 'Duluth', 'Brooklyn Park', 'Plymouth', 'Woodbury']],
  ms: ['Mississippi', ['Jackson', 'Gulfport', 'Southaven', 'Biloxi', 'Hattiesburg', 'Olive Branch', 'Tupelo', 'Meridian']],
  mo: ['Missouri', ['Kansas City', 'St. Louis', 'Springfield', 'Columbia', 'Independence', "Lee's Summit", "O'Fallon", 'St. Joseph']],
  mt: ['Montana', ['Billings', 'Missoula', 'Great Falls', 'Bozeman', 'Butte', 'Helena', 'Kalispell', 'Havre']],
  ne: ['Nebraska', ['Omaha', 'Lincoln', 'Bellevue', 'Grand Island', 'Kearney', 'Fremont', 'Hastings', 'Norfolk']],
  nv: ['Nevada', ['Las Vegas', 'Henderson', 'Reno', 'North Las Vegas', 'Sparks', 'Carson City', 'Fernley', 'Elko']],
  nh: ['New Hampshire', ['Manchester', 'Nashua', 'Concord', 'Derry', 'Dover', 'Rochester', 'Salem', 'Merrimack']],
  nj: ['New Jersey', ['Newark', 'Jersey City', 'Paterson', 'Elizabeth', 'Lakewood', 'Edison', 'Woodbridge', 'Toms River', 'Trenton']],
  nm: ['New Mexico', ['Albuquerque', 'Las Cruces', 'Rio Rancho', 'Santa Fe', 'Roswell', 'Farmington', 'Hobbs', 'Clovis']],
  ny: ['New York', ['New York', 'Buffalo', 'Yonkers', 'Rochester', 'Syracuse', 'Albany', 'New Rochelle', 'Mount Vernon']],
  nc: ['North Carolina', ['Charlotte', 'Raleigh', 'Greensboro', 'Durham', 'Winston-Salem', 'Fayetteville', 'Cary', 'Wilmington', 'High Point']],
  nd: ['North Dakota', ['Fargo', 'Bismarck', 'Grand Forks', 'Minot', 'West Fargo', 'Williston', 'Dickinson', 'Mandan']],
  oh: ['Ohio', ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Akron', 'Dayton', 'Parma', 'Canton']],
  ok: ['Oklahoma', ['Oklahoma City', 'Tulsa', 'Norman', 'Broken Arrow', 'Edmond', 'Lawton', 'Moore', 'Midwest City']],
  or: ['Oregon', ['Portland', 'Eugene', 'Salem', 'Gresham', 'Hillsboro', 'Bend', 'Beaverton', 'Medford']],
  pa: ['Pennsylvania', ['Philadelphia', 'Pittsburgh', 'Allentown', 'Reading', 'Erie', 'Scranton', 'Bethlehem', 'Lancaster', 'Harrisburg']],
  ri: ['Rhode Island', ['Providence', 'Warwick', 'Cranston', 'Pawtucket', 'East Providence', 'Woonsocket', 'Coventry', 'Cumberland']],
  sc: ['South Carolina', ['Charleston', 'Columbia', 'North Charleston', 'Mount Pleasant', 'Rock Hill', 'Greenville', 'Summerville', 'Sumter']],
  sd: ['South Dakota', ['Sioux Falls', 'Rapid City', 'Aberdeen', 'Brookings', 'Watertown', 'Mitchell', 'Yankton', 'Pierre']],
  tn: ['Tennessee', ['Nashville', 'Memphis', 'Knoxville', 'Chattanooga', 'Clarksville', 'Murfreesboro', 'Franklin', 'Jackson']],
  tx: ['Texas', ['Houston', 'San Antonio', 'Dallas', 'Austin', 'Fort Worth', 'El Paso', 'Arlington', 'Corpus Christi', 'Plano', 'Lubbock']],
  ut: ['Utah', ['Salt Lake City', 'West Valley City', 'West Jordan', 'Provo', 'St. George', 'Orem', 'Sandy', 'Ogden']],
  vt: ['Vermont', ['Burlington', 'South Burlington', 'Rutland', 'Essex Junction', 'Barre', 'Montpelier', 'Winooski', 'St. Albans']],
  va: ['Virginia', ['Virginia Beach', 'Chesapeake', 'Norfolk', 'Richmond', 'Arlington', 'Newport News', 'Alexandria', 'Hampton', 'Roanoke', 'Portsmouth', 'Suffolk', 'Lynchburg']],
  wa: ['Washington', ['Seattle', 'Spokane', 'Tacoma', 'Vancouver', 'Bellevue', 'Kent', 'Everett', 'Renton']],
  wv: ['West Virginia', ['Charleston', 'Huntington', 'Morgantown', 'Parkersburg', 'Wheeling', 'Weirton', 'Fairmont', 'Martinsburg']],
  wi: ['Wisconsin', ['Milwaukee', 'Madison', 'Green Bay', 'Kenosha', 'Racine', 'Appleton', 'Waukesha', 'Eau Claire']],
  wy: ['Wyoming', ['Cheyenne', 'Casper', 'Gillette', 'Laramie', 'Rock Springs', 'Sheridan', 'Green River', 'Evanston']],
};

const ELSEWHERE: [string, string[], string[]][] = [
  ['England', [], ['London', 'Birmingham', 'Manchester', 'Leeds', 'Liverpool', 'Sheffield', 'Bristol', 'Newcastle upon Tyne', 'Nottingham', 'Leicester']],
  ['Scotland', [], ['Glasgow', 'Edinburgh', 'Aberdeen', 'Dundee', 'Inverness', 'Stirling', 'Perth']],
  ['Wales', [], ['Cardiff', 'Swansea', 'Newport', 'Wrexham', 'Barry', 'Neath', 'Bridgend']],
  ['Northern Ireland', [], ['Belfast', 'Derry', 'Lisburn', 'Newry', 'Bangor', 'Armagh']],
  ['Ontario', ['on'], ['Toronto', 'Ottawa', 'Mississauga', 'Brampton', 'Hamilton', 'London', 'Markham', 'Vaughan']],
  ['Quebec', ['qc'], ['Montreal', 'Quebec City', 'Laval', 'Gatineau', 'Longueuil', 'Sherbrooke']],
  ['British Columbia', ['bc'], ['Vancouver', 'Surrey', 'Burnaby', 'Richmond', 'Abbotsford', 'Coquitlam', 'Kelowna', 'Victoria']],
  ['Alberta', ['ab'], ['Calgary', 'Edmonton', 'Red Deer', 'Lethbridge', 'St. Albert', 'Medicine Hat']],
  ['New South Wales', ['nsw'], ['Sydney', 'Newcastle', 'Wollongong', 'Central Coast', 'Maitland', 'Wagga Wagga']],
  ['Victoria', ['vic'], ['Melbourne', 'Geelong', 'Ballarat', 'Bendigo', 'Shepparton', 'Mildura']],
  ['Queensland', ['qld'], ['Brisbane', 'Gold Coast', 'Sunshine Coast', 'Townsville', 'Cairns', 'Toowoomba']],
  ['Western Australia', ['wa'], ['Perth', 'Mandurah', 'Bunbury', 'Geraldton', 'Kalgoorlie', 'Albany']],
  ['South Australia', ['sa'], ['Adelaide', 'Mount Gambier', 'Whyalla', 'Murray Bridge', 'Port Augusta', 'Port Lincoln']],
  /* Whole countries, the same way: a search of "Australia" timed out on the
     map's servers, so a country is searched at its largest towns. */
  ['Australia', ['au'], ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Gold Coast', 'Canberra', 'Newcastle']],
  ['United Kingdom', ['uk'], ['London', 'Birmingham', 'Manchester', 'Glasgow', 'Leeds', 'Liverpool', 'Bristol', 'Edinburgh']],
  ['United States', ['usa'], ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego']],
  ['Canada', [], ['Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Edmonton', 'Ottawa', 'Winnipeg', 'Mississauga']],
  ['New Zealand', ['nz'], ['Auckland', 'Wellington', 'Christchurch', 'Hamilton', 'Tauranga', 'Dunedin']],
  ['Ireland', [], ['Dublin', 'Cork', 'Limerick', 'Galway', 'Waterford']],
];

const COUNTRIES = new Set(['Australia', 'United Kingdom', 'United States', 'Canada', 'New Zealand', 'Ireland']);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

/* Full names win over abbreviations; a US two-letter code is the US state
   (WA is Washington), because that is how this product's customers write it. */
const BY_NAME = new Map<string, { name: string; towns: string[] }>();
for (const [code, [name, towns]] of Object.entries(US)) {
  BY_NAME.set(norm(name), { name, towns });
  BY_NAME.set(code, { name, towns });
}
for (const [name, codes, towns] of ELSEWHERE) {
  if (!BY_NAME.has(norm(name))) BY_NAME.set(norm(name), { name, towns });
  for (const c of codes) if (!BY_NAME.has(c)) BY_NAME.set(c, { name, towns });
}

/** The region a name means ("Virginia", "VA", "virginia, usa"), or null. */
export function regionNamed(place: string): { name: string; towns: string[] } | null {
  /* "Virginia, USA" is Virginia; "Australia" alone is the country. */
  const p = norm(place.replace(/,?\s*(usa|us|united states|uk|united kingdom|canada|australia)$/i, '')) || norm(place);
  return BY_NAME.get(p) ?? null;
}

/** "Virginia" → "Virginia Beach, Virginia", "Chesapeake, Virginia", … largest first. Null for anything else, a town included. */
export function regionTowns(place: string, max = 12): string[] | null {
  if (place.includes(',') && !/,\s*(usa|us|united states|uk|united kingdom|canada|australia)$/i.test(place)) return null;
  const r = regionNamed(place);
  return r ? r.towns.slice(0, max).map(t => `${t}, ${r.name}`) : null;
}

/** "Richmond, VA" → { town: 'Richmond', region: 'Virginia' }. The region is null when it is not one this table knows. */
export function splitPlace(place: string): { town: string; region: string | null } {
  const parts = place.split(',').map(x => x.trim()).filter(Boolean);
  if (parts.length < 2) return { town: place.trim(), region: null };
  /* "Leeds, UK" is Leeds: narrowing a town to a whole country only makes the
     map's search slower (a country's boundary is enormous) and finds nothing more. */
  const r = regionNamed(parts[parts.length - 1]);
  return { town: parts[0], region: r && !COUNTRIES.has(r.name) ? r.name : null };
}
