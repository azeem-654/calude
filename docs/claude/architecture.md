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
