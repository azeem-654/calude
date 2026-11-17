# Brief for the local Claude Code session — live checks

Paste this file (or its path) into the local session. It tests what the cloud
session cannot: the cloud sandbox has no outgoing mail (SMTP is blocked), cannot
reach OpenStreetMap's Overpass, has no real browser on the live site, and must
not sign in to live. The local session has the owner's own browser and network.

## Rules for the local session

1. **Test and report; do not change code.** One session writes code (the cloud
   one), so two never edit the same files. If something is broken, describe it.
2. **Live is real.** Use the AppSumo reviewer logins or a throwaway sign-up, a
   made-up business, and `+test` addresses (e.g. `azeem+t1@…`). Spend no money:
   no real purchase, no domain, no paid plan. Delete test sites/contacts after.
3. **Never paste a key, password or code into the report.** Say "key saved,
   Test was green", not the key.
4. Check every screen at **phone width (390)** and **desktop (1280)**; note the
   browser console's red errors.

## The checks (app.protectedcentral.com, after the 2026-11-17 promote)

| # | Check | Pass when |
|---|---|---|
| 1 | Owner → Settings → Platform services → **AI health → Check now**; then **AI & cloud usage → AI keys — live** | Every key says answered; for any that does not, copy the **reason** shown beside it (not the key) |
| 2 | Owner → paste a free **SerpApi** key (serpapi.com, no card) in *Google reviews without a Maps key* → Save and test | Green "Working" |
| 3 | Owner → paste a free **Geoapify** key (myprojects.geoapify.com) in *Free business directory* → Save | Tested green |
| 4 | Reviewer login → **Plan & billing** and **/appsumo** | "AppSumo lifetime deal — AppSumo Tier 3", never "Not subscribed" |
| 5 | Reviewer → **AI Prospecting** → "dentists in Austin, Texas with a website" | A list of businesses within ~1 minute |
| 6 | Reviewer → **Reviews** → Find your business on Google → a real business name and town → pick it → Refresh | Rating, count and recent reviews appear |
| 7 | Help button in the corner (reviewer login) | Chat / ticket / strategy call open |
| 8 | Fresh sign-up with a new `+test` address | Code email arrives (check spam), sign-in works |
| 9 | Top bar | No "Cloud delayed"; dashboard does not say the schedule "last ran never" |
| 10 | Reviewer → AI Autopilot → New business workspace: "I run Blue Ridge Plumbing in Richmond, Virginia. Find homeowners and property managers who need emergency plumbing…" → build. Then a second one for "Lone Star Electric, Austin TX" | Plumber is not real estate (no Sellers/Buyers question); the second never mentions Blue Ridge; time each AI step |
| 11 | Websites → template → edit headline → **Publish** → open the link in a private window | The page opens without a login; Unpublish → "Page not found" |
| 12 | Funnels → same as 11 | Same |
| 13 | Scheduling → publish the booking page → book it from a private window → back in the app | Booking on **Calendar** and Today's schedule; the guest is in **Contacts** within ~3 minutes |
| 14 | Customer Engagement form → submit it empty from a private window | Refused ("Please fill in…"); no "New enquiry" contact |
| 15 | Live home page, /pricing, plan cards, Plan & billing usage, AI Autopilot header | No "Shorts", "Reels", "AI Video Studio" except the labelled *Coming soon* section |
| 16 | Send a real test email to `support@protectedcentral.com` from Gmail | Arrives in the app's inbox (only after checklist row 62) |

## Report format (paste back to the cloud session)

Save as `docs/audit/live-check-<date>.md` and either paste it into the cloud
session's chat or commit it to a branch named `test-reports` and say so.

```
# Live check <date> <time, your zone>
Build seen: (Settings → … or the footer version, if shown)

| # | Result | What I saw (exact on-screen wording for anything wrong) | Width | Console errors |
|---|---|---|---|---|
| 1 | PASS/FAIL | … | 1280 | none / the red line |

Screenshots: (file names, attached separately)
Timings: wizard step 1 = … s, build = … s
```

Exact wording matters most: the cloud session searches the code for the
sentence on screen. A screenshot without the sentence typed out is half as
useful.
