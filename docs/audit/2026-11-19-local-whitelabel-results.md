# Local white-label check — 2026-11-19 (Part A done; Part B blocked at 13, domain restored)

Run by the local session against **live** (app.protectedcentral.com) from the
owner's Windows PC and home network, following
`docs/audit/LOCAL-SESSION-WHITELABEL-BRIEF.md` at staging `578201d`.

- Browsers: owner's Chrome (via Claude in Chrome), signed in as the test
  account, and the Claude desktop app's built-in browser as the second,
  signed-out device. Phone width = built-in browser emulating **390×844**;
  no physical phone was used.
- Test accounts: `aiautomationapp+wl1@gmail.com` (agency, "Testco") and
  `aiautomationapp+wl2@gmail.com` (client). Free address used:
  `testco-k7q4.protectedcentral.com`.
- Mail: every code/invite email was read in the owner's Gmail (real mail path).
- No money spent. No code changed.

## Part A — results

| # | Result | What I saw | Width | Console errors |
|---|---|---|---|---|
| 1 | PASS | Product name "Testco Agency", headline "Testco client sign-in", PNG logo → Save branding. After reload the top bar shows the TC logo and the home link reads "Testco Agency — home". (The "Branding saved" toast was not captured: the browser connection dropped during the save; the reload proved the save.) | 1536 | none |
| 2 | PASS | `testco-k7q4` → Claim it → listed as `testco-k7q4.protectedcentral.com` **Live** within ~2 s, with Open, trash and "Visitors see: Your client sign-in". | 1536 | none |
| 3 | **PARTIAL** | Certificate valid from this PC's network (curl `ssl_verify_result=0`, HTTP 200). Rendered page at 390: tab "Sign in — Testco Agency", heading "Welcome back to Testco Agency", TC logo, "Testco client sign-in", no "Create one", rendered text has no "Protected Central". **But the raw HTML served on that address still says Protected Central**: `<title>Protected Central — Every step, in the open.</title>`, `og:title` and `og:site_name` = "Protected Central" (3 mentions on every path). The tab shows that title for a moment before JS swaps it, and any link preview (WhatsApp, Slack, iMessage, Google) would show Protected Central. | 390 | none |
| 4 | PASS | `/pricing`, `/appsumo`, `/terms`, `/security` each render "Sign in — Testco Agency" (HTTP 200). Same raw-HTML title issue as #3. | 390 | none |
| 5 | PASS (note) | Renamed to "Testco Two" → Save. A **new tab** on the address shows "Sign in — Testco Two"; no re-claim needed; server `resolve` returns `appName: "Testco Two"`. Note: a tab that was already open on the address kept showing "Testco Agency" after reloads — the brand is cached per tab in `sessionStorage` key `crm_resolved_host`. Wording bug on the save line: **"Saved. The top bar picks this up on the next page load — it currently still shows "Testco Two"."** — the top bar actually still showed the *old* name "Testco Agency". | 1536 / 390 | none |
| 6 | PASS (note) | Signed in at the Testco address with a code → app opens, top bar TC logo, "Testco Two — home", no page errors, page text has no "Protected Central". **Browser tab title after sign-in is "Protected Central — Every step, in the open."** The sign-in code email is from **"Support Protected Central" <support@protectedcentral.com>** even though it was requested on Testco's page. | 1024 | none |
| 7 | PASS | Second browser (built-in, never used for branding) signed in as wl1 at app.protectedcentral.com → home link "Testco Two — home", TC logo. Branding comes from the server. Tab title again "Protected Central — Every step, in the open." | 1024 | none |
| 8 | PASS (notes) | Agency → New Sub-Account "Testco Client QA" (Trial) → Settings → Team & Permissions → Add member `+wl2`, Client, workspace Testco Client QA → "Invitation sent". wl2 signed in **at the Testco address** → "You have been invited" → Join → lands in the client workspace; server reports `role: client`, `accountId` = the Testco Client QA account; TC logo; page text has no "Protected Central". Notes below. | 1024 | none |
| 9 | PASS | `https://nobody-x9z3m1.protectedcentral.com/login` → valid certificate, HTTP 200, plain "Sign in — Protected Central" with "Welcome back to Protected Central" and a "Create one" link. | 1024 | none |
| 10 | PASS (note) | Trash icon → dialog "Stop serving testco-k7q4.protectedcentral.com? Anybody using that address will no longer be able to sign in there." → Stop serving it. After reload the address is gone; server `resolve` returns `match: null`. Note: the list still showed it until the page was reloaded. A browser **already signed in** on that address (wl2) keeps working there, now with Protected Central branding ("Protected Central — home"). | 1536 | none |
| 11 | n/a — switched on | Cloudflare for SaaS is connected on live, so **Your own domain** shows a form ("app.youragency.com" + Add it), not "not switched on". As expected for Part B. Nothing was added. | 1536 | none |
| 15 (read-only preview) | wording captured | Typed `wildwestcorp.com` without pressing Add: *"wildwestcorp.com is the root of the domain. Most DNS hosts (GoDaddy and Namecheap included) cannot put a CNAME on a root. It works if the domain's DNS is on Cloudflare (free — it flattens the CNAME for you) or a host with ALIAS / ANAME records — use one of those for the CNAME below. Otherwise connect www.wildwestcorp.com here instead and forward wildwestcorp.com to it at your registrar."* Box cleared; not added. | 1536 | none |

## White-label leaks found (for the cloud session)

1. **Raw HTML on a reseller address is Protected Central** — `<title>`, `og:title`, `og:site_name` (#3, #4). Fix server-side (Worker rewrites head for resolved hosts) so link previews and the first paint carry the reseller's name.
2. **Tab title after sign-in reverts to "Protected Central — Every step, in the open."** on the reseller address and on app.protectedcentral.com for a branded account (#6, #7, #8).
3. **All email is sent as "Support Protected Central" <support@protectedcentral.com>** — sign-in codes requested on the Testco page and the client invitation ("aiautomationapp+wl1 invited you to their workspace"). A reseller's client sees Protected Central in their inbox.
4. **Agency viewing a client workspace loses the brand**: after "Open workspace" on Testco Client QA, the top bar shows the Protected Central shield and the home link reads "Protected Central — home"; the loading screen says "Protected Central".
5. Loading screen on a branded account shows the Protected Central **shield icon** next to "Testco Agency"/"Testco Two".
6. Inside the branded app, the account button holds an image with alt text "Protected Central", and a hidden element reads "Powered by Protected Central" (support widget panel).
7. The invite page on the Testco address offers **"Create my own account"**, and the code screen says "A new address gets its own workspace and a 7-day free trial" — Protected Central's own sign-up offer on a reseller's client page.

## Other issues

- Agency page after creating one sub-account still says **"0 of 2 sub-accounts used"** (Total sub-accounts 1, On trial 1).
- New sub-account card shows plan **"Pro"**, but the form only offered "Advanced $97" and "Scale $297" (left at default).
- Team & Permissions: the "Create this team member" button was hidden behind the "Welcome — your 7-day trial has started" pop-up until it was closed.
- Branding: the saved name is cached per tab (`sessionStorage.crm_resolved_host`), so an open tab never picks up a rename.

## Part B — attempted, blocked at check 13, rolled back

Owner confirmed the zone is in **our own Cloudflare account** (the same
account as protectedcentral.com). Owner approved each record before it was added.

| # | Result | What I saw |
|---|---|---|
| B0 | DONE | Zone has 11 records (A root → 160.153.0.98 DNS only; CNAME go → cdrapplication.secureserver.net; CNAME mta-sts / smtp → trekmail; CNAME www → wildwestcorp.com; MX mail.trekmail.net; TXT DKIM, DMARC, MTA-STS, TLS-RPT, SPF). Full answers saved locally as `wildwestcorp-dns-before.txt` (not committed — only this report is). The domain **does have a full TrekMail mail setup**, contrary to the brief. |
| 12 | PASS | `sales.wildwestcorp.com` → Add it → "Waiting for DNS" (not Live), Check button, CNAME `sales.wildwestcorp.com → whitelabel.protectedcentral.com` and TXT `_cf-custom-hostname.sales.wildwestcorp.com`, each with a copy button. |
| 13 | **BLOCKED** | CNAME `sales` → `whitelabel.protectedcentral.com` (DNS only) saved fine. The TXT `_cf-custom-hostname.sales` **would not save in the Cloudflare dashboard**: three attempts by me and one by the owner all showed **"Connection blocked"** in the Add record dialog, and no request left the page. On protectedcentral.com → SSL/TLS → Custom Hostnames: fallback origin `whitelabel.protectedcentral.com` **Active**; `sales.wildwestcorp.com` hostname status **Active**, certificate **"Pending Validation (TXT)"**. The app stayed "Waiting for DNS" after Check. Meanwhile `https://sales.wildwestcorp.com` already answered 200 with the zone's own Let's Encrypt cert (`*.wildwestcorp.com`) and the generic Protected Central page (`resolve` → `match: null`). |
| 14–16 | NOT RUN | Blocked by 13. Check 15's wording was captured read-only (see Part A table). |
| 17 | DONE | Removed `sales.wildwestcorp.com` in the app (dialog "Stop serving sales.wildwestcorp.com?") → Cloudflare Custom Hostnames shows "No custom hostnames." |
| 18 | PASS | Deleted the `sales` CNAME (the only record added; the TXT never saved). Zone back to 11 of 200 records. Re-ran every lookup against `micah.ns.cloudflare.com`: **before and after files are identical** line for line. Public 8.8.8.8: root A 160.153.0.98, MX mail.trekmail.net, www CNAME wildwestcorp.com — same as before. `http://wildwestcorp.com` still 301 → `https://wildwestcorp.com/`. No forwarding or redirect was ever turned on. Nameservers untouched. |

**For the cloud session:**
- The "Connection blocked" refusal may come from the Cloudflare account itself: every dashboard page shows **"Your account has an overdue balance … $5.76"**. Confirm whether that, or a rule against `_cf-` record names, blocks the save. Adding the TXT through the API is worth trying.
- When the customer's zone is on Cloudflare (and even in the **same** account), the app's instructions are still the generic two records. Check whether same-account hostnames need the TXT at all, or whether the app should say what to do on Cloudflare.
- After Check, "Waiting for DNS" doesn't say *which* record is missing. Cloudflare knew it was the certificate TXT.

### Original read-only findings

Read-only lookups before touching anything (saved in
`docs/audit/wildwestcorp-dig-before.txt`, resolver 8.8.8.8, cross-checked on
1.1.1.1 and the authoritative server):

| Record | Answer |
|---|---|
| NS | `riya.ns.cloudflare.com`, `micah.ns.cloudflare.com` |
| A (root) | `160.153.0.98` |
| www | CNAME → `wildwestcorp.com` |
| MX | `mail.trekmail.net` |
| TXT | `v=spf1 include:spf.trekmail.net -all` |
| `http://wildwestcorp.com` | 301 → `https://wildwestcorp.com/` |

This contradicts the brief: **DNS is served by Cloudflare, not GoDaddy**,
and the domain **has live mail records** although the brief says "no email".

## Left in place (owner to decide)

- Accounts `aiautomationapp+wl1@gmail.com` (Testco Two branding, trial) and
  `aiautomationapp+wl2@gmail.com` (client).
- Sub-account "Testco Client QA" under wl1.
- Removed: free address `testco-k7q4`, custom hostname
  `sales.wildwestcorp.com`, and its CNAME. wildwestcorp.com is exactly as it was.
