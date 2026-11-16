<!-- Moved from CLAUDE.md, word for word: read this before working on architecture, the cron and "live in the cloud". -->

## Architecture

```
src/           React 19 + TypeScript, built by Vite
worker/src/    the Worker: routes/, lib/, scheduled.ts
worker/migrations/   D1 schema, applied in order
wrangler.jsonc the whole deployment
```

The Worker serves the built assets *and* every `/api/*` route. Assets are
matched first; only `/api/*` reaches the fetch handler (`run_worker_first`).

**API paths end in `.php`.** They are not PHP — the backend was PHP on shared
hosting and the URLs were kept so nothing client-side had to change. Add a new
endpoint by writing `worker/src/routes/<name>.ts` and registering it in the
`ROUTES` map in `worker/src/index.ts` as `/api/<name>.php`.

A cron fires every 5 minutes, and the order in `worker/src/index.ts`
`scheduled()` is deliberate:

0. `runProspectFinders` — each project's daily finder adds prospects first,
   so Autopilot can enrol them on the same tick.
1. `runAutopilot` — plan (once a day) and execute (every tick). Enrolling
   somebody is what makes a message due, so planning after sending would make
   every lead it picks up wait a full tick.
2. `runReplies` — answering a lead is the most time-sensitive thing on a tick.
3. `runScheduledSends` — the campaign batch.
4. `runDigests` — reports on the three above, so it goes last.

Then `recordTick` writes what happened into `crm_ticks`.

**"Live in the cloud" is read from `crm_ticks`.** `/api/cloud.php` `status`
(`routes/cloud.ts`, any member of the workspace) answers the last tick's time,
`live` (under 20 minutes ago) and what the cron minds for this workspace;
`services/cloudPulse.ts` shares it between the cloud in the top bar
(`Layout/CloudBadge.tsx`, on every screen — pulsing only when live, amber when
late, grey when unreadable) and the dashboard strip (`Dashboard/CloudLive.tsx`).
The site's **Live in the cloud** section (`Site/CloudSection.tsx`) lists only
what the cron does with nobody signed in. Two things that used to wait for a
browser now run there too: a one-off email scheduled for one contact
(`runOneOffEmails` in scheduled.ts, once it is 10 minutes overdue so an open
tab sends it first; claimed `sending` by compare-and-swap) and automation
changes to a contact (`applyContactChangesInCloud`, stamping
`server_applied_at`, migration 0064 — the browser still re-applies them, so a
stale save cannot lose one). Still browser-only: merging captured leads into
Contacts, Blog Automation's month writing, onboarding content generation, and
publishing social posts (always a person's press). `npm run test:cloud`
(self-contained: SMTP sink :8858, wrangler :8928, fresh D1) covers all of it.

**A scheduled run has no request, so it has no origin.** Anything needing an
absolute URL (a Stripe return address, the link in the digest) reads
`env.APP_ORIGIN`, set in `wrangler.jsonc`. Unset, those paths report that they
were skipped rather than sending something broken.

**Every AI key is checked every 15 minutes, and Workers AI answers when none
does** (2026-11-16, after the AppSumo reviewer met "at capacity").
`lib/aiProbe.ts` `runAiProbe` (5-minute cron, before `runAiHealth`, gated to
15 min) asks each install key for one word — skipping one a customer's request
proved in the last 15 minutes — and feeds the pool's own `markOk`/`markFailed`,
so a dead key is rested before a customer is sent to it; a recovered key ends
its rest in every isolate within 30 s (`installPool` clears local cooldowns the
database no longer holds). None answering mails the owner (`notePoolDown`); the
run is kept in `crm_meta` `ai_probe_last` and drawn on Platform services → AI
health (the key-check box; "Check now" forces it). `lib/aiHealth.ts` reads it:
no key answering is `failing` at once, one working key (or one key at all) is
`thin` ("One key left", mailed once a day). When every key fails for its own
reason, a **text-only** request is answered by Cloudflare Workers AI through the
`AI` binding (`lib/ai.ts` `askWorkersAi`, model `WORKERS_AI_TEXT`, overridable
by `WORKERS_AI_TEXT_MODEL`) — in `askGeminiParts` and in `/api/ai.php`
(`promptOf`) — only behind the operator's own keys (`hasInstallKeys`: an ended
trial on its own key does not get it), counted in `crm_ai_usage` as
`workers-ai`. Pictures, recordings, web research and live voice still need a
Google key. `npm run test:ai-keys` covers the check and the last resort.

**AI keeps going when the keys run out** (2026-11-14). When every AI key is
resting (lib/aiPool.ts: 2 min after a rate limit, an hour after a daily
quota), the customer is not shown the busy sentence. `lib/http.ts` `json`
marks every refusal carrying `AI_BUSY` (or `code: 'ai_busy'`) — from any
route, wrapped or not — with `X-AI-Busy: <seconds until the soonest key is
back>` (`aiBackInMs`, 0 = not a rest). `src/services/aiPatience.ts` patches
`fetch` (installed before fieldGuard) and, for `/api/*.php` calls with a
string body, waits and sends the same request again: up to ~3.5 min for a
short rest, then "paused" with a check every 5 min for up to 3 h while the
page is open (leaving asks first). `shared/AiPatienceBar.tsx` shows the
countdown and "Stop waiting", which hands the screen the busy answer as
before. **A retry can never save twice**, whatever the route does:
`index.ts` hands every API request a database that notes the tables it writes
(`lib/writeWatch.ts`), and a busy answer from a request that wrote anything
but bookkeeping (AI units, rate limits, key health, AI usage/alerts, meta,
sessions, audit, delivery log) loses `X-AI-Busy` — the page shows the error
instead, and the Worker logs `[ai-busy] <path> wrote …`. The AI unit is given
back either way (`aiRefund`). A caller's own `signal` still ends the wait
(Protron's chat keeps its fallback); `attemptTimeoutMs` is a per-attempt
limit instead (`aiFetch`, `intake.ts`). Cron work never needed it: it retries
on its own tick. `npm run test:patience`.
