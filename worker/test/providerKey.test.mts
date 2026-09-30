/**
 * What a pasted provider key is before anything is sent.
 *
 * A Brevo SMTP key pasted into the API key box came back from Brevo as "Key
 * not found" (2026-09-30), which reads as a typo and sends people to paste the
 * same wrong key again. These pin the refusal, the unwrapping of Brevo's
 * base64 MCP keys, and the tidying of keys that arrive with a line break or
 * quotes round them — and that nothing is ever sent over the network for any.
 */
import { normaliseKey, verifyProvider, explain } from '../src/lib/providerApi.ts';

let pass = 0; let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

const api = 'xkeysib-' + 'a'.repeat(64) + '-' + 'B'.repeat(16);
const smtp = 'xsmtpsib-' + 'a'.repeat(64) + '-' + 'B'.repeat(16);

eq('a Brevo API key is used as it is', normaliseKey('brevo', api), { key: api });
eq('line breaks, spaces and quotes are removed', normaliseKey('brevo', ` "${api.slice(0, 40)}\n${api.slice(40)}" \n`), { key: api });
eq('an "api-key:" prefix copied with it is removed', normaliseKey('brevo', `api-key: ${api}`), { key: api });
eq('a Brevo MCP key is unwrapped to the API key inside', normaliseKey('brevo', btoa(JSON.stringify({ api_key: api }))), { key: api });
eq('a Brevo SMTP key is refused by name', /SMTP key/.test((normaliseKey('brevo', smtp) as { error?: string }).error ?? ''), true);
eq('the sendinblue alias is checked the same way', 'error' in normaliseKey('sendinblue', smtp), true);
eq('other providers only get the whitespace tidied', normaliseKey('resend', ' re_abc\n'), { key: 're_abc' });
eq('an unknown shape is left for Brevo to judge', normaliseKey('brevo', 'something-else'), { key: 'something-else' });

/* Refused without a request: fetch throws if anything tries. */
const real = globalThis.fetch;
let fetched = 0;
globalThis.fetch = (async () => { fetched++; throw new Error('no network in this test'); }) as typeof fetch;
const v = await verifyProvider({ name: 'brevo', key: smtp, secret: '', domain: '', url: '' }, 'support@example.com');
globalThis.fetch = real;
eq('validating an SMTP key fails on the key box', { ok: v.ok, field: v.field }, { ok: false, field: 'provider.key' });
eq('…and never reaches Brevo', fetched, 0);

eq('a Brevo 401 names the API Keys tab',
  /xkeysib-/.test(explain('brevo', 401, '{"code":"unauthorized","message":"Key not found"}', 'refused the key')), true);
eq('a Brevo IP restriction says so rather than blaming the key',
  /Authorised IPs/.test(explain('brevo', 401, '{"code":"unauthorized","message":"We have detected you are using an unrecognised IP address 1.2.3.4"}')), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
