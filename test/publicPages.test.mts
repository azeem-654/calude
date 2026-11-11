/** PUB-4: the public site knows its own pages; anything else is a 404. `npm run test:publicpages` */
import { NOT_FOUND_HEAD, headFor, isKnownPublicPath, isPublicSiteHost } from '../worker/src/lib/publicPages';
import { SITEMAP_PATHS } from '../worker/src/lib/industryPages';
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d: unknown = '') => { if (c) pass++; else fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c ? '' : ` — ${JSON.stringify(d)}`}`); };
ok('every sitemap page is known', SITEMAP_PATHS.every(isKnownPublicPath), SITEMAP_PATHS.filter(p => !isKnownPublicPath(p)));
ok('…with or without a trailing slash, in any case', isKnownPublicPath('/Pricing/') && isKnownPublicPath('/privacy/'));
ok('booking, shop, reports, forms, sign-in callbacks and files are known', ['/book/strategy-call', '/shop/tees', '/p/abc', '/f/form', '/auth/google', '/favicon.ico', '/logo.svg', '/.well-known/security.txt', '/appsumo', '/ecommerce'].every(isKnownPublicPath));
ok('a mistyped or retired address is not', !isKnownPublicPath('/pricng') && !isKnownPublicPath('/features') && !isKnownPublicPath('/contacts'));
ok('only the live public host does this', isPublicSiteHost('protectedcentral.com') && isPublicSiteHost('www.protectedcentral.com') && !isPublicSiteHost('app.protectedcentral.com') && !isPublicSiteHost('localhost') && !isPublicSiteHost('testing.protectedcentral.com'));
ok('each public page has its own title and description', ['/pricing', '/privacy', '/refund-policy', '/cookie-policy', '/terms-of-service', '/security'].every(p => { const h = headFor(p); return !!h && h.title.includes('Protected Central') && h.description.length > 30; }));
ok('titles are not shared', new Set(['/pricing', '/privacy', '/terms-of-service'].map(p => headFor(p)!.title)).size === 3);
ok('the not-found head says so', /not found/i.test(NOT_FOUND_HEAD.title));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
