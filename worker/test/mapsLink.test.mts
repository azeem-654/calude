/**
 * Every shape of Google Maps link a customer pastes, read without a network.
 *
 * Run with `npm run test:mapslink`. The redirects themselves are proved by
 * test/reputation.e2e.mjs against a mock shortener; this is the reading of
 * what they land on, where a wrong answer would attach somebody's reviews to
 * the wrong business.
 */
import { cidFromFtid, cidOfMapsUri, parseMapsLink } from '../src/lib/mapsLink';

const out: string[] = [];
const ok = (n: string, p: boolean, d: unknown = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${JSON.stringify(d)}`}`);
const P = 'ChIJN1t_tDeuEmsRUsoyG83frY4';

/* ── Plain words are not links ── */
for (const s of ['Acme Bakery London', 'BakeryOnTheCorner', 'plumber', 'ChIJ', 'joe@example.com']) {
  ok(`"${s}" is searched as words`, parseMapsLink(s) === null, parseMapsLink(s));
}

/* ── Place IDs ── */
ok('a bare place id', parseMapsLink(P)?.placeId === P);
ok('place_id: prefix', parseMapsLink(`place_id:${P}`)?.placeId === P);
ok('?q=place_id:', parseMapsLink(`https://www.google.com/maps/place/?q=place_id:${P}`)?.placeId === P);
ok('Maps URLs API query_place_id', parseMapsLink(`https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${P}`)?.placeId === P);
ok('the review-form link Google hands out', parseMapsLink(`https://search.google.com/local/writereview?placeid=${P}`)?.placeId === P);
ok('the reviews link', parseMapsLink(`https://search.google.com/local/reviews?placeid=${P}`)?.placeId === P);
ok('a !19s place id in the data segment',
  parseMapsLink(`https://www.google.com/maps/place/Acme/@51.5,-0.1,17z/data=!4m6!3m5!1s0x48761b:0x2a0!8m2!3d51.5!4d-0.1!16s%2Fg%2F11!19s${P}?entry=ttu`)?.placeId === P);
ok('a sign-in wall around the review form',
  parseMapsLink(`https://accounts.google.com/ServiceLogin?continue=${encodeURIComponent(`https://search.google.com/local/writereview?placeid=${P}&source=g.page.m.rc._`)}`)?.placeId === P);
ok('a consent page around a place link',
  parseMapsLink(`https://consent.google.com/m?continue=${encodeURIComponent(`https://www.google.com/maps/place/Acme+Bakery/@51.5,-0.1,17z`)}&gl=GB`)?.query === 'Acme Bakery');

/* ── Feature ids and CIDs ── */
ok('ftid → the decimal cid', cidFromFtid('0x47e66e2964e34e2d:0x8ddca9ee380ef7e0') === BigInt('0x8ddca9ee380ef7e0').toString());
ok('a malformed ftid gives nothing', cidFromFtid('0x1:zz') === '' && cidFromFtid('') === '');
ok('cid of a Places googleMapsUri', cidOfMapsUri('https://maps.google.com/?cid=10281119596374313554') === '10281119596374313554');
ok('…and of one with more after it', cidOfMapsUri('https://maps.google.com/?cid=42&g_mp=x') === '42');

const desktop = parseMapsLink('https://www.google.com/maps/place/Caf%C3%A9+de+Flore/@48.8541,2.3326,17z/data=!3m1!4b1!4m6!3m5!1s0x47e671d5a1f5b3a1:0x9a5b3a1f5b3a1f5b!8m2!3d48.8542!4d2.3327!16s%2Fg%2F1tdfq9qk?entry=ttu');
ok('a desktop place link: the name, decoded', desktop?.query === 'Café de Flore', desktop);
ok('…the cid from its feature id', desktop?.cid === BigInt('0x9a5b3a1f5b3a1f5b').toString(), desktop);
ok('…and the pin, not the camera', desktop?.lat === 48.8542 && desktop?.lng === 2.3327, desktop);

const app = parseMapsLink('https://maps.google.com/?q=Acme%20Bakery,%201%20High%20St&ftid=0x48761b:0x2a0&entry=gps&g_ep=CAE');
ok('what a phone share resolves to: q and ftid', app?.query === 'Acme Bakery, 1 High St' && app?.cid === String(0x2a0), app);

const cidOnly = parseMapsLink('https://maps.google.com/?cid=10281119596374313554');
ok('a bare ?cid= link: the cid and nothing to search with', cidOnly?.cid === '10281119596374313554' && !cidOnly?.query && !cidOnly?.placeId, cidOnly);
ok('a cid link on another Google domain', parseMapsLink('https://www.google.co.uk/maps?cid=123456')?.cid === '123456');

const searchLink = parseMapsLink('https://www.google.com/maps/search/Louvre+Museum/@48.8606,2.3376,15z');
ok('a search link: its words and the camera', searchLink?.query === 'Louvre Museum' && searchLink?.lat === 48.8606, searchLink);
ok('a coordinates-only q is not a name', !parseMapsLink('https://maps.google.com/?q=51.5,-0.12')?.query);

/* ── Short links: recognised, not read ── */
for (const s of ['https://maps.app.goo.gl/AbC123xyz', 'maps.app.goo.gl/AbC123xyz', 'https://goo.gl/maps/AbC123', 'https://g.page/acme-bakery', 'https://g.page/r/CfdfwsavI3iYEAg/review', 'https://share.google/AbCdEf123']) {
  ok(`${s} must be followed`, parseMapsLink(s)?.short === true, parseMapsLink(s));
}

/* ── Not Google ── */
ok('another site is refused as not Google', parseMapsLink('https://www.yelp.com/biz/acme')?.notGoogle === true);
ok('a lookalike host is not Google', parseMapsLink('https://google.com.evil.example/maps/place/X')?.notGoogle === true);
ok('a lookalike shortener is not Google', parseMapsLink('https://maps.app.goo.gl.evil.example/x')?.notGoogle === true);

const failed = out.filter(l => l.startsWith('FAIL'));
console.log(out.join('\n'));
console.log(failed.length ? `\n${failed.length} failed` : `\nall ${out.length} passed`);
process.exit(failed.length ? 1 : 0);
