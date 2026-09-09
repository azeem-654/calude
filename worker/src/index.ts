/**
 * One Worker, serving the app and its API.
 *
 * This used to be two different things: a web server for the built React files,
 * and a separate PHP script per URL under /api/, each re-opening the database,
 * re-reading the session and re-declaring its own CORS headers. Here the
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
import { handleMailbox } from './routes/mailbox';
import { handleInfra } from './routes/infra';
import { handleAutomation } from './routes/automation';
import { handleAutopilot } from './routes/autopilot';
import { handleReplies } from './routes/replies';
import { handleCommerce } from './routes/commerce';
import { handleStorefront, handleStorefrontWebhook } from './routes/storefront';
import { handleSmtpSend } from './routes/smtpSend';
import { handleProviderSend } from './routes/providerSend';
import { handleValidateKey } from './routes/validateKey';
import { handlePlacement } from './routes/placement';
import { handleTrack } from './routes/track';
import { handleUnsubscribe } from './routes/unsubscribe';
import { handleBooking } from './routes/booking';
import { handleYtThumb, handleImgProxy, handlePlacesSearch, handleReviewsFetch } from './routes/proxies';
import { handleStripeConfig, handleStripeCheckout, handleStripePortal, handleStripeWebhook } from './routes/stripe';
import {
  handleImapFetch, handleMailProbe, handleSmsSend, handleSmsInbound, handleDeliverability,
  handleBlogPublish, handleDiagnostics, handleInstall,
} from './routes/misc';
import { runScheduledSends, recordTick } from './scheduled';
import { runAutopilot } from './autopilotTick';
import { runReplies } from './replyTick';

type Handler = (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;

const ROUTES: Record<string, Handler> = {
  '/api/auth.php': handleAuth,
  '/api/data.php': handleData,
  '/api/mailbox.php': handleMailbox,
  /* Domains, DNS and mailbox provisioning. Every provider credential lives on
     this side of the wire; the browser only ever asks for an outcome. */
  '/api/infra.php': handleInfra,
  /* Scheduled campaign starts, the tick's own health, and what the plan allows. */
  '/api/automation.php': handleAutomation,
  /* Autopilot's ledger: what it is doing, what it did and why, and the two
     decisions that belong to a person — approving a held-back action, and
     pausing the whole thing. */
  '/api/autopilot.php': handleAutopilot,
  /* The AI key Autopilot writes replies with, and the replies a guardrail held
     back for a person to read. */
  '/api/replies.php': handleReplies,
  /* Business ideas, products and orders. */
  '/api/commerce.php': handleCommerce,
  /* Checkout for the customer's own products, on the customer's own Stripe
     account — never the operator's. routes/storefront.ts says why. */
  '/api/storefront.php': handleStorefront,
  '/api/storefront-webhook.php': handleStorefrontWebhook,
  '/api/smtp-send.php': (req, env) => handleSmtpSend(req, env),
  /* The connection test is the same conversation as a send, stopped after the
     login — so it is the same handler in verify mode rather than a second
     implementation that can drift from the first. */
  '/api/smtp-test.php': (req, env) => handleSmtpSend(req, env, { forceVerify: true }),
  '/api/provider-send.php': handleProviderSend,
  '/api/validate-key.php': handleValidateKey,
  '/api/mail-probe.php': handleMailProbe,
  '/api/imap-fetch.php': handleImapFetch,
  '/api/sms-send.php': handleSmsSend,
  /* Twilio's inbound webhook. Unauthenticated by necessity — Twilio has no
     session — so it identifies the workspace by the number the message was
     sent to, and does nothing at all for a number we do not own. */
  '/api/sms-inbound.php': handleSmsInbound,

  '/api/track.php': handleTrack,
  '/api/unsubscribe.php': handleUnsubscribe,
  '/api/booking.php': handleBooking,
  '/api/deliverability.php': handleDeliverability,
  '/api/placement.php': handlePlacement,
  '/api/blog-publish.php': handleBlogPublish,

  '/api/stripe-config.php': handleStripeConfig,
  '/api/stripe-checkout.php': handleStripeCheckout,
  '/api/stripe-portal.php': handleStripePortal,
  '/api/stripe-webhook.php': handleStripeWebhook,

  '/api/places-search.php': handlePlacesSearch,
  '/api/reviews-fetch.php': handleReviewsFetch,
  '/api/yt-thumb.php': (req) => handleYtThumb(req),
  '/api/img-proxy.php': (req) => handleImgProxy(req),

  '/api/diagnostics.php': handleDiagnostics,
  '/api/install.php': async () => handleInstall(),
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
  /**
   * The cron tick.
   *
   * Cloudflare calls this on the schedule in wrangler.jsonc whether or not
   * anybody is using the app, which is the entire point: scheduled campaigns
   * and sequence follow-ups now go out on their own.
   */
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil((async () => {
      const started = Date.now();

      /*
       * Autopilot decides first, the sends go second, in that order and in the
       * same tick.
       *
       * Enrolling somebody is what makes a message due, so planning after
       * sending would make every lead Autopilot picks up wait a full tick for
       * no reason. The enrolments it creates are due immediately, and the pass
       * below picks them up as it goes — the same argument runDueSchedules
       * settled for scheduled campaign starts.
       */
      const auto = await runAutopilot(env);
      /*
       * Replies before sends, for the same reason planning comes before both:
       * answering a lead is the most time-sensitive thing on this tick, and a
       * person who emails at nine should not wait for a campaign batch first.
       */
      const replies = await runReplies(env);
      const report = await runScheduledSends(env);
      const ms = Date.now() - started;

      /* Autopilot's problems belong in the same place a customer already looks
         to find out what the schedule did while they were away. */
      for (const n of auto.notes.slice(0, 10)) report.notes.push({ accountId: '', text: n, kind: 'problem' });
      for (const n of replies.notes.slice(0, 10)) report.notes.push({ accountId: '', text: n, kind: 'problem' });
      /* Written to the database as well as the log: the log is for us, the row
         is for the customer asking why their campaign did not go out. */
      await recordTick(env, ms, report);
      /* Logged rather than swallowed: with no user watching, this log is the
         only account of what the schedule actually did. */
      console.log(JSON.stringify({
        cron: event.cron, ms,
        accounts: report.accounts, sent: report.sent, failed: report.failed,
        started: report.started,
        autopilot: {
          planned: auto.planned, carried: auto.carried,
          awaiting: auto.awaiting, failed: auto.failed,
        },
        replies: {
          read: replies.read, replied: replies.replied,
          drafted: replies.drafted, refused: replies.refused, failed: replies.failed,
        },
        notes: report.notes.slice(0, 20),
      }));
    })());
  },
} satisfies ExportedHandler<Env>;
