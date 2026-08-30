/**
 * Checking that an API key works, from the server.
 *
 * These checks have to happen somewhere other than the browser. Neither the
 * OpenAI API nor Apollo's sends an Access-Control-Allow-Origin header, so the
 * browser refuses the request before it leaves the machine — the app used to
 * respond to "Test key" by telling the customer to install Node and run a
 * local proxy, which is not something anybody paying for a hosted product
 * should be asked to do.
 *
 * The key is used for one read-only call and is never stored here: the
 * customer's own settings hold it, and this endpoint only reports what the
 * provider said about it.
 */
import { body, fail, json } from '../lib/http';
import { requireSessionForSocket, type Env } from '../lib/db';

interface KeyBody { token?: string; provider?: string; apiKey?: string }

/** What the provider said, in a sentence that names the next step. */
function explain(name: string, status: number, text: string): string {
  let detail = '';
  try {
    const j = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
    if (typeof j.error === 'object' && j.error?.message) detail = j.error.message;
    else if (typeof j.error === 'string') detail = j.error;
    else if (j.message) detail = j.message;
  } catch { /* not JSON */ }
  if (!detail) detail = text.replace(/<[^>]*>/g, '').trim().slice(0, 200);

  if (status === 401 || status === 403) {
    return `${name} rejected the key. ${detail || 'It is not valid for this account.'}`;
  }
  if (status === 429) {
    return `${name} accepted the key but you are over its rate limit or out of credit. ${detail}`;
  }
  return `${name} answered HTTP ${status}. ${detail}`;
}

export async function handleValidateKey(req: Request, env: Env): Promise<Response> {
  const d = await body<KeyBody>(req);
  const gate = await requireSessionForSocket(env.DB, d.token);
  if ('denied' in gate) return gate.denied;

  const provider = String(d.provider ?? '').toLowerCase().trim();
  const apiKey = String(d.apiKey ?? '').trim();
  if (!apiKey) return fail('Paste the API key you want to test.');
  /* A key travels in a header, so a newline in it would end the header and
     start a line of the attacker's choosing. */
  if (/[\r\n\0]/.test(apiKey)) return fail('That key contains characters an API key cannot contain — copy it again.');

  try {
    if (provider === 'openai') {
      /* Listing models is the cheapest authenticated call OpenAI has: it bills
         nothing and still fails on a bad or revoked key. */
      const r = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15000),
      });
      if (r.ok) {
        let models = 0;
        try {
          const j = await r.json() as { data?: unknown[] };
          models = Array.isArray(j.data) ? j.data.length : 0;
        } catch { /* the 200 is the answer; the count is a nicety */ }
        return json({
          success: true, provider: 'openai',
          message: models
            ? `Key is valid — ${models} models available on this account.`
            : 'Key is valid.',
        });
      }
      const msg = explain('OpenAI', r.status, await r.text());
      return json({ success: false, provider: 'openai', status: r.status, message: msg, error: msg });
    }

    if (provider === 'apollo') {
      const r = await fetch('https://api.apollo.io/v1/auth/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        body: JSON.stringify({ api_key: apiKey }),
        signal: AbortSignal.timeout(15000),
      });
      const text = await r.text();
      let healthy = false;
      try { healthy = (JSON.parse(text) as { is_logged_in?: boolean }).is_logged_in === true; } catch { /* not JSON */ }
      if (r.ok && healthy) {
        return json({ success: true, provider: 'apollo', message: 'Key is valid — Apollo.io recognised this account.' });
      }
      const msg = r.ok
        ? 'Apollo.io answered, but did not recognise this key as signed in. Check you copied the whole key from Settings → Integrations → API.'
        : explain('Apollo.io', r.status, text);
      return json({ success: false, provider: 'apollo', status: r.status, message: msg, error: msg });
    }

    return fail(`"${provider}" is not a key this app can test. Testable keys: OpenAI, Apollo.io.`);
  } catch (e) {
    const timedOut = e instanceof Error && e.name === 'TimeoutError';
    const msg = timedOut
      ? 'The provider did not answer within 15 seconds. Try again in a moment.'
      : `Could not reach the provider: ${e instanceof Error ? e.message : String(e)}`;
    return json({ success: false, provider, message: msg, error: msg });
  }
}
