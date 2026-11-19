# Brief for the local Claude Code session — white-label on the real internet

Paste this file (or its path) into the local session **after** the latest
promotion to live has finished (Actions → *Deploy to Cloudflare* is green).
Part A (checks 1–11) needs nothing from the owner; Part B (12–18) needs
`docs/CLOUDFLARE-SAAS-SETUP.md` done and the owner's go-ahead on wildwestcorp.com.

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

## The checks — Part A, the free address and branding

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

### Part B — the customer's own domain (only after `docs/CLOUDFLARE-SAAS-SETUP.md` is done)

Check 11 above then shows a form instead of "not switched on". Test domain:
**wildwestcorp.com** (DNS at GoDaddy), lent by the owner and to be handed back
exactly as it was.

**Before touching it (B0):** in GoDaddy → *My Products* → wildwestcorp.com →
**DNS** → **⋯ / Export zone file**, save it as
`docs/audit/wildwestcorp-dns-before.txt` (records only — no account details);
also note whether **Forwarding** is on and where to. Run
`dig +short wildwestcorp.com A`, `dig +short www.wildwestcorp.com`,
`dig +short wildwestcorp.com MX` and keep the answers. Do not change the
nameservers. Do not touch MX/email records.

| # | Check | Pass when |
|---|---|---|
| 12 | **Subdomain of their domain.** Settings → Branding → Your own domain: `sales.wildwestcorp.com` → Add it | A CNAME (`sales` → `whitelabel.protectedcentral.com`) and a TXT are shown, each with a copy button; status "Waiting for DNS" — never "Live" yet |
| 13 | At GoDaddy DNS add exactly those two records (CNAME name `sales`; TXT name as shown **without** the trailing `.wildwestcorp.com`, GoDaddy adds it) → in the app press **Check** every few minutes | Turns **Live**; on a phone, private tab, `https://sales.wildwestcorp.com` has a valid padlock and shows Testco's name, logo and headline, no "Protected Central"; `/pricing` is Testco's sign-in |
| 14 | Sign in at `https://sales.wildwestcorp.com` as wl1, then as wl2 | Each lands in their workspace with Testco branding; no page errors |
| 14a | As wl1, build any website and publish it with short name `testco-<random>`, page `home`; publish a funnel under the same name, page `sales` | The publish panel shows the address as `protectedcentral.com/testco-<random>/…`; on a phone, `https://protectedcentral.com/testco-<random>` is the website and `/testco-<random>/sales` the funnel; no "Protected Central" wording on either page |
| 14b | Settings → Branding → `sales.wildwestcorp.com` → **Visitors see** → *Your website — the pages published as testco-<random>* | Phone, private tab: `https://sales.wildwestcorp.com` is the website's home page, `/sales` is the funnel, the tab shows the page's title; switching back to *Your client sign-in* brings the sign-in back |
| 15 | **The root.** Type `wildwestcorp.com` in Your own domain (do not add yet) | The yellow note says a root cannot hold a CNAME at GoDaddy and suggests www + forwarding — report the wording |
| 16 | Add `www.wildwestcorp.com` instead, add its CNAME + TXT at GoDaddy, **Check** until Live; then GoDaddy → Forwarding → forward `wildwestcorp.com` to `https://www.wildwestcorp.com` (301) **only if the owner said the root serves nothing important** | `https://www.wildwestcorp.com` is Testco's sign-in with a valid padlock; `http://wildwestcorp.com` ends there too |
| 17 | Remove `sales.` and `www.` in the app (trash icon) | Both disappear from the list; within a few minutes neither serves Testco (a Cloudflare error page or nothing is expected) |
| 18 | **Hand the domain back**: delete every record you added at GoDaddy, switch forwarding back to how it was, export the zone file again as `wildwestcorp-dns-after.txt` and diff it with the before file; repeat the three `dig`s | The diff is empty (apart from GoDaddy's serial/SOA line) and the `dig` answers match the before ones |

## The report

One table: check number, pass/fail, what you saw (a sentence), and a
screenshot name for every fail. Put it in
`docs/audit/<date>-local-whitelabel-results.md` and tell the owner to
paste it into the cloud session.
