/**
 * One Worker, serving the app and its API.
 *
 * On Freehostia these were two different things: Apache served the built React
 * files, and each URL under /api/ was a separate PHP script that re-opened the
 * database, re-read the session and re-declared its own CORS headers. Here the
 * platform serves the assets and everything under /api/ arrives at this
 * router, which resolves the session once and hands off.
 *
 * Paths keep their `.php` suffix on purpose. The client calls
 * `/api/smtp-send.php` in a dozen places, and a deployment that also required
 * rewriting every one of those call sites would be two migrations at once —
 * with no way to tell which of them broke something. The suffix is a URL, not
 * a language.
 */
import { corsHeaders, json, preflight } from './lib/http';
import type { Env } from './lib/db';
import { handleAuth } from './routes/auth';
import { handleData } from './routes/data';
import { handleSmtpSend } from './routes/smtpSend';
import { handleProviderSend } from './routes/providerSend';

type Handler = (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;

const ROUTES: Record<string, Handler> = {
  '/api/auth.php': handleAuth,
  '/api/data.php': handleData,
  '/api/smtp-send.php': (req, env) => handleSmtpSend(req, env),
  /* The connection test is the same conversation as a send, stopped after the
     login — so it is the same handler in verify mode rather than a second
     implementation that can drift from the first. */
  '/api/smtp-test.php': (req, env) => handleSmtpSend(req, env, { forceVerify: true }),
  '/api/provider-send.php': handleProviderSend,
};

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (!url.pathname.startsWith('/api/')) {
      /* Not ours: static assets and the SPA fallback are the platform's job. */
      return env.ASSETS.fetch(req);
    }

    const pre = preflight(req);
    if (pre) return pre;

    const handler = ROUTES[url.pathname];
    if (!handler) {
      return json({ success: false, error: `No endpoint at ${url.pathname}`, message: `No endpoint at ${url.pathname}` }, 404);
    }

    try {
      return await handler(req, env, ctx);
    } catch (e) {
      /* A thrown error must not become a 500 with a stack trace in it: the
         client shows `message` to the customer, and a database error string is
         not something they can act on or should see. */
      console.error(`${url.pathname} failed:`, e);
      const msg = 'Something went wrong on the server handling that request.';
      return new Response(JSON.stringify({ success: false, error: msg, message: msg }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
  },
} satisfies ExportedHandler<Env>;
