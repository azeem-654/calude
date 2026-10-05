/**
 * Phone alerts (lib/push.ts) against a mock Google and a mock Apple, with no
 * network: the token exchange is signed with a real RSA key and checked with
 * its public half, the APNs token with a real P-256 key, and every request the
 * sender makes is inspected — the paths, the headers, the payload, and what a
 * phone that has gone away does to the device table.
 *
 *   npm run test:push
 */
import { generateKeyPairSync, createVerify, verify as edVerify } from 'node:crypto';
import { alertFor, pushToWorkspace } from '../src/lib/push';

const out: string[] = [];
const ok = (n: string, p: boolean, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);

/* Keys made for the test: a Google service account and an Apple .p8. */
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const sa = {
  client_email: 'push@test-project.iam.gserviceaccount.com', project_id: 'test-project',
  private_key: rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};

/* A device table the sender reads and tidies. */
let devices = [
  { token: 'fcm-token-android-0000000000', platform: 'android', app: 'support' },
  { token: 'a'.repeat(64), platform: 'ios', app: 'support' },
  { token: 'fcm-token-gone-000000000000', platform: 'android', app: 'customer' },
];
const deleted: string[] = [];
const DB = {
  prepare(sql: string) {
    return {
      bind: (...args: unknown[]) => ({
        all: async () => ({ results: /FROM crm_push_devices WHERE account_id/.test(sql) ? devices : [] }),
        run: async () => { if (/^DELETE/.test(sql)) { deleted.push(String(args[0])); devices = devices.filter(d => d.token !== args[0]); } return { meta: {} }; },
        first: async () => null,
      }),
    };
  },
};

const calls: { url: string; init: RequestInit }[] = [];
globalThis.fetch = (async (url: string, init: RequestInit) => {
  calls.push({ url, init });
  if (url.endsWith('/token')) return new Response(JSON.stringify({ access_token: 'ya29.test', expires_in: 3600 }), { status: 200 });
  if (url.includes('/messages:send')) {
    const b = JSON.parse(String(init.body));
    if (b.message.token.includes('gone')) return new Response(JSON.stringify({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }), { status: 404 });
    return new Response('{"name":"projects/test-project/messages/1"}', { status: 200 });
  }
  if (url.includes('/3/device/')) return new Response('', { status: 200 });
  return new Response('nope', { status: 500 });
}) as typeof fetch;

const env = {
  DB, FCM_SERVICE_ACCOUNT: JSON.stringify(sa), FCM_TOKEN_URL: 'https://mock.google/token', FCM_BASE: 'https://mock.fcm',
  APNS_KEY: ec.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), APNS_KEY_ID: 'KEY1234567', APNS_TEAM_ID: 'TEAM123456', APNS_BASE: 'https://mock.apple',
} as never;

const unb64 = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/* ── Nothing configured: nothing sent, and it says so ── */
{
  const r = await pushToWorkspace({ DB } as never, 'acct-1', alertFor('live.call', 'live-1', 'Sam is calling')!);
  ok('with no keys set, nothing is sent and it says why', r.sent === 0 && r.skipped === 'not configured' && calls.length === 0, JSON.stringify(r));
}

/* ── A call: one alert to each phone ── */
const r = await pushToWorkspace(env, 'acct-1', alertFor('live.call', 'live-1', 'Sam is calling from the website')!);
ok('a call goes to the Android and the iPhone, and the gone phone fails', r.sent === 2 && r.failed === 1, JSON.stringify(r));

const tok = calls.find(c => c.url.endsWith('/token'))!;
const assertion = new URLSearchParams(String(tok.init.body)).get('assertion')!;
const [h, p, sig] = assertion.split('.');
const v = createVerify('RSA-SHA256'); v.update(`${h}.${p}`);
ok('the Google token request is a JWT signed with the service account\'s key', v.verify(rsa.publicKey, unb64(sig)));
const claims = JSON.parse(unb64(p).toString());
ok('…for the messaging scope, issued by the service account', claims.scope === 'https://www.googleapis.com/auth/firebase.messaging' && claims.iss === sa.client_email, JSON.stringify(claims));

const fcm = calls.filter(c => c.url.includes('/messages:send'));
const m = JSON.parse(String(fcm[0].init.body)).message;
ok('FCM is asked at the project\'s send path with the access token', fcm[0].url === 'https://mock.fcm/v1/projects/test-project/messages:send' && (fcm[0].init.headers as Record<string, string>).Authorization === 'Bearer ya29.test');
ok('…a call rings on the "calls" channel, high priority, and opens the call', m.android.priority === 'HIGH' && m.android.notification.channel_id === 'calls' && m.data.route === '/engagement?tab=live&answer=live-1' && m.notification.title === 'Incoming call', JSON.stringify(m));

const apple = calls.find(c => c.url.includes('/3/device/'))!;
const ah = apple.init.headers as Record<string, string>;
ok('the iPhone alert goes to Apple for that device, as the support app', apple.url === `https://mock.apple/3/device/${'a'.repeat(64)}` && ah['apns-topic'] === 'com.protectedcentral.support' && ah['apns-push-type'] === 'alert', JSON.stringify(ah));
const [ah1, ap1, asig] = ah.authorization.replace('bearer ', '').split('.');
ok('…with an ES256 token Apple can check against the key', edVerify('sha256', Buffer.from(`${ah1}.${ap1}`), { key: ec.publicKey, dsaEncoding: 'ieee-p1363' }, unb64(asig))
  && JSON.parse(unb64(ah1).toString()).kid === 'KEY1234567' && JSON.parse(unb64(ap1).toString()).iss === 'TEAM123456');
const ab = JSON.parse(String(apple.init.body));
ok('…time-sensitive, with the screen to open', ab.aps['interruption-level'] === 'time-sensitive' && ab.route === '/engagement?tab=live&answer=live-1', JSON.stringify(ab));
ok('a phone FCM says is gone is forgotten', deleted.includes('fcm-token-gone-000000000000') && devices.length === 2);

/* ── The others ── */
ok('a waiting chat opens that conversation', alertFor('conversation.escalated', 'conv-9', '')!.route === '/engagement?tab=inbox&c=conv-9');
ok('a ticket opens the tickets', alertFor('ticket.created', 't-1', 'Billing question')!.route === '/engagement?tab=tickets');
ok('an ordinary timeline event alerts nobody', alertFor('form.submitted', 'x', '') === null && alertFor('contact.captured', 'x', '') === null);

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
if (failed) process.exit(1);
