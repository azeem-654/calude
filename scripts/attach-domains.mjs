/**
 * Point protectedcentral.com at the Worker.
 *
 * The Worker already serves app.protectedcentral.com. Both names run the same
 * code — services/hosts.ts decides which of the two sites a request is for —
 * so bringing the marketing site live is not a deploy, it is attaching another
 * hostname to the script that is already running.
 *
 * This is not part of the deploy. `wrangler deploy` publishes the code many
 * times a week; a domain is attached once and then stays attached, and doing it
 * on every push would mean giving the CI token permissions over the zone that
 * it does not otherwise need. Hence a script that is run by hand, with a token
 * that exists for the length of one command.
 *
 * Run:
 *   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… node scripts/attach-domains.mjs
 *
 * The token needs, on top of what the deploy uses:
 *   Zone   → Zone: Read      (to look the zone up by name)
 *   Zone   → Workers Routes: Edit
 *
 * It is safe to re-run: attaching a hostname that is already attached to this
 * same Worker is what the API call means, not an error to work around.
 */

const API = 'https://api.cloudflare.com/client/v4';

const SERVICE = 'crmpro';
const ENVIRONMENT = 'production';
/** The zone, and every hostname in it that should serve the Worker. */
const ZONE = 'protectedcentral.com';
const HOSTNAMES = ['protectedcentral.com', 'www.protectedcentral.com'];

const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;

if (!token || !account) {
  console.error('Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID first.');
  console.error('Both are in the Cloudflare dashboard; the account id is on the right of any zone\'s overview.');
  process.exit(1);
}

/**
 * Cloudflare answers with 200 and `success: false` for most refusals, so the
 * HTTP status alone does not say whether anything happened. The body is where
 * the truth is, and its `errors` array is what a person needs to read.
 */
async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    const why = (body.errors ?? []).map(e => `${e.code}: ${e.message}`).join('; ')
      || `HTTP ${res.status}`;
    throw new Error(why);
  }
  return body.result;
}

/*
 * Three things can go wrong and they need three different answers, so they are
 * told apart rather than reported as one "it failed". The token can be dead,
 * the token can be alive but unable to read the zone, or the zone can genuinely
 * not be on the account. Only the last of those is about DNS.
 */
try {
  await api('/user/tokens/verify');
} catch (e) {
  console.error(`The token itself was refused: ${e.message}`);
  console.error('It is expired, revoked, or not a Cloudflare API token.');
  process.exit(1);
}

let zones;
try {
  zones = await api(`/zones?name=${encodeURIComponent(ZONE)}`);
} catch (e) {
  console.error(`The token is valid but could not read zones: ${e.message}`);
  console.error('Add Zone → Zone: Read to it. The deploy token does not have this by');
  console.error('default, because deploying a Worker never needs to look at a zone.');
  process.exit(1);
}
if (!zones?.length) {
  console.error(`The token can read zones, but there is no ${ZONE} among them.`);
  console.error('Either the domain is not on this Cloudflare account yet — add it, and');
  console.error('point the registrar at the nameservers Cloudflare gives you — or the');
  console.error('token is scoped to specific zones and this is not one of them.');
  process.exit(1);
}
const zoneId = zones[0].id;
console.log(`Zone ${ZONE} → ${zoneId}`);

let failed = false;
for (const hostname of HOSTNAMES) {
  try {
    await api('/accounts/' + account + '/workers/domains', {
      method: 'PUT',
      body: JSON.stringify({ environment: ENVIRONMENT, hostname, service: SERVICE, zone_id: zoneId }),
    });
    console.log(`  ✓ ${hostname} → ${SERVICE}`);
  } catch (e) {
    failed = true;
    console.error(`  ✗ ${hostname}: ${e.message}`);
  }
}

if (failed) {
  console.error('\nOne or more hostnames were not attached. The usual causes are a token');
  console.error('without Workers Routes: Edit on the zone, or the hostname already being');
  console.error('served by something else — a Pages project or an A record — which has to');
  console.error('be removed before a Worker can take the name.');
  process.exit(1);
}

console.log('\nDone. Both names now serve the crmpro Worker, and DNS for them is');
console.log('managed by Cloudflare — there is no A record to add.');
console.log('protectedcentral.com is the marketing site; app.protectedcentral.com is the app.');
