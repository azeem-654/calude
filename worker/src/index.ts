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
import { handleSupplier } from './routes/supplier';
import { handleBilling, handleBillingWebhook } from './routes/billing';
import { handleProjects } from './routes/projects';
import { handleSetup } from './routes/setup';
import { handleWhitelabel } from './routes/whitelabel';
import { handleModeration } from './routes/moderation';
import { handleProspects } from './routes/prospects';
import { handlePortal } from './routes/portal';
import { handleShop } from './routes/shop';
import { handleAiWrite } from './routes/aiwrite';
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
import { runPendingSetups } from './lib/setupRun';
import { runReplies } from './replyTick';
import { runDigests } from './autopilotDigest';

type Handler = (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;

const ROUTES: Record<string, Handler> = {
  '/api/auth.php': handleAuth,
  /* Content held for review, and what became of the accounts that produced it.
     Owner-only but for one action, which tells a customer why they cannot
     send. */
  '/api/moderation.php': handleModeration,
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
  /* Projects and the client portfolios they write from — what AI Autopilot
     actually runs. See routes/projects.ts for why the Sales Agent folded in. */
  '/api/projects.php': handleProjects,
  '/api/setup.php': handleSetup,
  '/api/whitelabel.php': handleWhitelabel,
  /* The client report. `view` answers to nobody signed in — see routes/portal.ts
     for what that changes. */
  '/api/portal.php': handlePortal,
  /* The public shop. Half of this answers to nobody signed in — see
     routes/shop.ts for what that changes. */
  '/api/shop.php': handleShop,
  /* Marketing copy written by the AI, on the server, on the workspace's own
     key. The module used to call this "AI-generated" over string templates. */
  '/api/aiwrite.php': handleAiWrite,
  /* Business ideas, products and orders. */
  '/api/commerce.php': handleCommerce,
  /* Checkout for the customer's own products, on the customer's own Stripe
     account — never the operator's. routes/storefront.ts says why. */
  '/api/storefront.php': handleStorefront,
  '/api/storefront-webhook.php': handleStorefrontWebhook,
  /* The supplier who makes and posts the goods, on the customer's own account. */
  '/api/supplier.php': handleSupplier,
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

  /* How this app charges its own subscribers, on whichever processor the
     owner connected. The stripe-* endpoints below are the older, Stripe-only
     way in and still work — see routes/billing.ts. */
  '/api/billing.php': handleBilling,
  '/api/billing-webhook.php': handleBillingWebhook,
  '/api/stripe-config.php': handleStripeConfig,
  '/api/stripe-checkout.php': handleStripeCheckout,
  '/api/stripe-portal.php': handleStripePortal,
  '/api/stripe-webhook.php': handleStripeWebhook,

  /* Businesses from OpenStreetMap, free and with no key. The Google Places
     route below it is kept for installs that configured one, but it is no
     longer what the app reaches for. */
  '/api/prospects.php': handleProspects,
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

    /*
     * A client report's link preview.
     *
     * The page itself already titles its own tab, but a messenger drawing a
     * preview card runs no JavaScript — it reads the og: tags out of the served
     * HTML, which name this platform. On a link whose whole purpose is being
     * pasted to somebody else's client, that preview is the white label falling
     * over at the last step.
     *
     * So the asset is fetched and rewritten on the way out. The client's name
     * comes from the token, which means a pasted link previews as their own
     * business rather than as anything of ours.
     */
    if (url.pathname.startsWith('/p/')) {
      const res = await env.ASSETS.fetch(req);
      const token = url.pathname.slice(3).split('/')[0].toLowerCase();
      let client = '';
      if (token.length >= 24) {
        const row = await env.DB.prepare(
          `SELECT COALESCE(f.name, '') AS name FROM crm_client_portals p
           LEFT JOIN crm_portfolios f ON f.id = p.portfolio_id
           WHERE p.token = ? AND p.enabled = 1`,
        ).bind(token).first<{ name: string }>().catch(() => null);
        client = row?.name ?? '';
      }
      /* A dead or unknown link gets a neutral title rather than ours — it still
         must not advertise the platform, and it must not confirm that the token
         was ever real. */
      const title = client ? `${client} — progress` : 'Progress report';
      return new HTMLRewriter()
        .on('title', { element(el) { el.setInnerContent(title); } })
        .on('meta[property^="og:"], meta[name^="twitter:"]', {
          element(el) {
            const key = el.getAttribute('property') ?? el.getAttribute('name') ?? '';
            if (key.endsWith(':title')) el.setAttribute('content', title);
            else if (key.endsWith(':site_name')) el.setAttribute('content', client || 'Progress report');
            else if (key.endsWith(':description')) el.setAttribute('content', 'A read-only summary of work in progress.');
            /* Images and URLs are ours and are removed rather than replaced:
               there is no per-client image to put there, and our logo in a
               preview card is the same leak in a different shape. */
            else if (key.endsWith(':image') || key.endsWith(':url')) el.remove();
          },
        })
        .transform(res);
    }

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
      /*
       * Provisioning first, before anything else on the tick.
       *
       * A customer who has just paid is watching a progress list right now, and
       * every other pass here is measured in hours rather than seconds. It also
       * has to come before Autopilot: an order's last step hands a project to
       * the planner, and running the planner first would make that project wait
       * a full tick for a plan it could have had immediately.
       */
      const setups = await runPendingSetups(env);

      const auto = await runAutopilot(env);
      /*
       * Replies before sends, for the same reason planning comes before both:
       * answering a lead is the most time-sensitive thing on this tick, and a
       * person who emails at nine should not wait for a campaign batch first.
       */
      const replies = await runReplies(env);
      const report = await runScheduledSends(env);
      /*
       * The digest goes last, and only in the customer's own morning.
       *
       * Last because it reports on the three passes above, and a digest sent
       * before them would describe yesterday while today's work sat unmentioned
       * a few milliseconds away.
       */
      const digest = await runDigests(env);
      const ms = Date.now() - started;

      /* Autopilot's problems belong in the same place a customer already looks
         to find out what the schedule did while they were away. */
      for (const n of auto.notes.slice(0, 10)) report.notes.push({ accountId: '', text: n, kind: 'problem' });
      for (const n of replies.notes.slice(0, 10)) report.notes.push({ accountId: '', text: n, kind: 'problem' });
      for (const n of digest.notes.slice(0, 5)) report.notes.push({ accountId: '', text: n, kind: 'problem' });
      /* Written to the database as well as the log: the log is for us, the row
         is for the customer asking why their campaign did not go out. */
      await recordTick(env, ms, report);
      /* Logged rather than swallowed: with no user watching, this log is the
         only account of what the schedule actually did. */
      console.log(JSON.stringify({
        cron: event.cron, ms,
        accounts: report.accounts, sent: report.sent, failed: report.failed,
        started: report.started,
        setups,
        autopilot: {
          planned: auto.planned, carried: auto.carried,
          awaiting: auto.awaiting, failed: auto.failed,
        },
        replies: {
          read: replies.read, replied: replies.replied,
          drafted: replies.drafted, refused: replies.refused, failed: replies.failed,
        },
        digest: { sent: digest.sent, skipped: digest.skipped, failed: digest.failed },
        notes: report.notes.slice(0, 20),
      }));
    })());
  },
} satisfies ExportedHandler<Env>;
