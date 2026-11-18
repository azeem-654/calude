# Brief for the local Claude Code session — white-label on the real internet

Paste this file (or its path) into the local session **after** the 2026-11-18
promotion to live has finished (Actions → *Deploy to Cloudflare* is green).

## What the cloud session already proved (do not repeat)

`npm run test:whitelabel` (49 checks) drives a real Chromium against a local
Worker with real hostnames (`acme-growth.protectedcentral.com` resolved to the
machine): branding saved in Settings → Branding, the free subdomain claimed,
then a browser that has never seen the reseller opens it and sees their name
in the tab and heading, their logo, their headline, and no "Protected Central",
no partner strip, no shield, no "Create one"; `/pricing`, `/appsumo`,
`/security` and `/` on that address are the sign-in page; a rename reaches the
address; a second device shows the brand; another account cannot claim,
remove, re-brand or read it; oversized and non-image logos are refused by
name. It also confirmed on Cloudflare (read-only) that the wildcard DNS record
and the `*.protectedcentral.com/*` route to the live Worker exist.

What it **cannot** do: use a real phone, a real network path, real mail, or a
domain other than protectedcentral.com.

## Rules

1. **Test and report; do not change code.** The cloud session writes code.
2. **Live is real.** Use a throwaway sign-up with a `+test` address, a made-up
   agency name, and delete what you made afterwards. Spend no money.
3. **Never paste a key, password or code into the report.**
4. Every screen at **390 wide** (a real phone if you can) and **1280**; note
   red console errors.
5. **Do not touch chasepassion.com or gohighlevelinstitute.com** — they are
   other Workers on the same Cloudflare account. Use a domain that serves
   nothing today.

## The checks

| # | Check | Pass when |
|---|---|---|
| 1 | Sign up on app.protectedcentral.com as `you+wl1@…`. Settings → **Branding**: product name "Testco Agency", headline "Testco client sign-in", upload a PNG/SVG logo → **Save branding** | "Branding saved"; the top bar shows the logo after a reload |
| 2 | Same screen → **Your own address** → type `testco-<random>` → **Claim it** | Listed as live within a second |
| 3 | On a **phone, in a private tab**, open `https://testco-<random>.protectedcentral.com` | Padlock is valid (no certificate warning); the tab, heading, logo and headline are Testco's; the words "Protected Central" appear nowhere; no "Create one" link |
| 4 | On that address try `/pricing`, `/appsumo`, `/terms`, `/security` | Each is Testco's sign-in page |
| 5 | Back on the desktop, rename to "Testco Two" and **Save branding**; open the address in a *new* private tab | Shows "Testco Two" (no re-claim needed) |
| 6 | Sign in **at the Testco address** with the `+wl1` account | The app opens with Testco's logo on the top bar; no page errors |
| 7 | Sign in to the same account on **another browser** at app.protectedcentral.com | Top bar shows Testco's logo/name (branding came from the server) |
| 8 | Agency → add a client sub-account, invite `you+wl2@…`; accept the invite; sign in as wl2 **at the Testco address** | wl2 lands in the client workspace and sees Testco's branding, not ours |
| 9 | Open `https://nobody-<random>.protectedcentral.com/login` | Plain Protected Central sign-in (an unclaimed name is not anybody's brand) — report what you see |
| 10 | Settings → Branding → remove the address (trash icon) | The address stops showing Testco within a new private tab |
| 11 | Settings → Branding → **Your own domain** | Says it is not switched on yet (see below) — it must **not** accept a hostname |

### Only after the owner switches on Cloudflare for SaaS

The zone does not have it today (Cloudflare answered "This feature is available
with SSL for SaaS" on 2026-11-18), so customers' own domains cannot work yet and
the app correctly offers only the free subdomain. Once the owner enables
**SSL/TLS → Custom Hostnames** on protectedcentral.com (check the price the
dashboard shows first) and fills Settings → Platform services → Domains & Email
(zone id, token with *SSL and Certificates: Edit*, CNAME target):

| # | Check | Pass when |
|---|---|---|
| 12 | Settings → Branding → Your own domain: `app.<a spare domain you own>` → Add | DNS records shown (CNAME + TXT) |
| 13 | Add those records at that domain's DNS → **Check** (repeat after a few minutes) | Turns active; `https://app.<spare domain>` opens Testco's sign-in with a valid padlock |
| 14 | Remove it | Released; the hostname no longer serves Testco |

## The report

One table: check number, pass/fail, what you saw (a sentence), and a
screenshot name for every fail. Put it in
`docs/audit/2026-11-18-local-whitelabel-results.md` and tell the owner to
paste it into the cloud session.
