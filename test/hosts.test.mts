/**
 * Which site a hostname means.
 *
 * Run with `npm run test:hosts`. It fakes `window.location.hostname` and asks
 * the three questions the whole app hangs off, because getting one of them
 * wrong is invisible in a typecheck and obvious to a customer.
 *
 * Every case here is a real address this deployment answers on, including the
 * two Cloudflare hands out by default and nobody asked for.
 */
async function at(hostname: string) {
  /* A fresh module per hostname: `hosts.ts` reads location at call time, but
     `markWhiteLabelHost` is module state and would leak between cases. */
  (globalThis as { window?: unknown }).window = { location: { hostname } };
  const mod = await import(`../src/services/hosts.ts?h=${encodeURIComponent(hostname)}`);
  return mod as typeof import('../src/services/hosts');
}

const out: string[] = [];
const ok = (n: string, p: boolean, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);

/* ── The live product ── */
{
  const h = await at('app.protectedcentral.com');
  ok('app. is the product', h.isAppHost());
  ok('app. is not the marketing site', !h.isMarketingHost());
  ok('app. is not a rehearsal — no warning bar, no unfinished features',
    !h.isStagingHost() && !h.isRehearsal());
}

/* ── The marketing site ── */
for (const name of ['protectedcentral.com', 'www.protectedcentral.com']) {
  const h = await at(name);
  ok(`${name} is the marketing site`, h.isMarketingHost());
  ok(`${name} is not the product`, !h.isAppHost());
  ok(`${name} is not a rehearsal`, !h.isStagingHost());
}

/* ── The testing copy, on its custom domain ── */
{
  const h = await at('testing.protectedcentral.com');
  ok('testing. renders the product, not the pitch', h.isAppHost() && !h.isMarketingHost());
  ok('testing. draws the warning bar', h.isStagingHost());
  ok('testing. runs held-back features', h.isRehearsal());
}

/* ── The testing copy, on the addresses Cloudflare turns on by itself ──
 *
 * These were the hole: both are public, and both used to be neither an app
 * host nor a staging host — so they served the marketing pitch with no warning
 * on it.
 */
for (const name of ['crmpro-staging.azeem654.workers.dev', 'abc123-crmpro-staging.azeem654.workers.dev']) {
  const h = await at(name);
  ok(`${name} draws the warning bar`, h.isStagingHost());
  ok(`${name} renders the product, not the pitch`, h.isAppHost() && !h.isMarketingHost());
  ok(`${name} runs held-back features`, h.isRehearsal());
}

/* ── And the live Worker's own preview URL is not mislabelled ── */
{
  const h = await at('crmpro.azeem654.workers.dev');
  ok('the live Worker’s preview URL is not called staging', !h.isStagingHost(),
    'matching .workers.dev alone would put a TESTING bar on production');
}

/* ── A developer’s machine ── */
{
  const h = await at('localhost');
  ok('localhost runs held-back features', h.isRehearsal());
  ok('localhost is not labelled as the testing site', !h.isStagingHost());
}

/* ── A reseller’s own domain is a customer’s front door, not a rehearsal ── */
{
  const h = await at('crm.someagency.co.uk');
  h.markWhiteLabelHost(true);
  ok('a white-label host renders the product', h.isAppHost());
  ok('and never the marketing site', !h.isMarketingHost());
  ok('and is not treated as a rehearsal', !h.isStagingHost() && !h.isRehearsal());
}


/* ── The address bar and the Worker have to agree ──
   The failure this exists for: on 2026-09-18 a wildcard Worker route on the
   live app swallowed testing.protectedcentral.com, so the live Worker served
   the testing address — on the live database, wearing the testing banner.
   Nothing failed; it simply looked normal. ── */
{
  const t = await at('testing.protectedcentral.com');
  ok('testing served by the staging Worker agrees',
    t.hostMatchesServer('https://testing.protectedcentral.com') === true);
  ok('testing served by the LIVE Worker is caught',
    t.hostMatchesServer('https://app.protectedcentral.com') === false,
    'the exact mistake that happened went undetected');
  ok('a trailing slash does not read as a mismatch',
    t.hostMatchesServer('https://testing.protectedcentral.com/') === true);

  const a = await at('app.protectedcentral.com');
  ok('live served by the live Worker agrees',
    a.hostMatchesServer('https://app.protectedcentral.com') === true);
  ok('and live served by the staging Worker is caught the other way too',
    a.hostMatchesServer('https://testing.protectedcentral.com') === false);

  /* "Cannot tell" must never produce the same alarm as "they disagree", or the
     alarm gets ignored by the time it isneeded. */
  ok('an older Worker that says nothing is not an accusation',
    t.hostMatchesServer('') === null);
  ok('and neither is an unparseable answer', t.hostMatchesServer('not a url') === null);

  const w = await at('crmpro-staging.azeem654.workers.dev');
  ok('a workers.dev preview is not checked', w.hostMatchesServer('https://testing.protectedcentral.com') === null);
  const r = await at('crm.someagency.co.uk');
  ok('and nor is a reseller domain, which legitimately differs',
    r.hostMatchesServer('https://app.protectedcentral.com') === null);
}

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
if (failed) process.exit(1);
