# Protected Central — scenario test report for AppSumo

**Tested:** 16 November 2026 · **Build:** current production build · **Accounts:** AppSumo reviewer logins (Tier 3) and two new buyers redeeming codes
**Screen sizes:** desktop 1280 px and phone 390 px

> Draft for the owner. Section 3 lists what is not ready; update it once the fixes in the audit are in, and do not send it before the five live checks at the end are done.

## 1. Summary

| Area | Result |
|---|---|
| Every screen opens (37 addresses × 2 screen sizes) | Pass — no crashes, no sideways scrolling on a phone |
| AppSumo code redemption and stacking | Pass |
| AI Autopilot: describe a business → questions → blueprint → build | Pass (2 businesses built) |
| Blog & SEO: strategy → month plan → article → cover image | Pass |
| Graphics Designer | Pass |
| Email campaigns written by AI | Pass — sending correctly blocked until a mailbox is connected |
| Lead capture form → contact → deal | Pass |
| Booking page | Pass, with one open issue (calendar) |
| Contacts, Deals (6 views), Reports | Pass |
| Online shop | Pass — will not open to the public until a payment processor is connected |
| Websites and Funnels | **Partial** — build and edit work; public publishing is not available yet |
| AI Prospecting search | **Not verified in this run** (see section 4) |
| Automated checks | Pass — 13 automated suites, more than 930 checks, 0 failures (security, account isolation, sign-up, form validation, AppSumo codes and licensing, plan allowances) |

## 2. Scenarios run

Mock businesses used: **Blue Ridge Plumbing** (plumber, Richmond, Virginia), **Lone Star Electric** (electrician, Austin, Texas), **Dominion Realty Group** (real estate team, Arlington, Virginia).

### AppSumo redemption
| # | Scenario | Result |
|---|---|---|
| 1 | New buyer opens `/appsumo` signed out, types a code, creates an account, redeems → **Tier 1, 1 of 3 codes** | Pass |
| 2 | Same buyer redeems a second code typed in lower case with spaces → **Tier 2**; Plan & billing reads "AppSumo lifetime deal — paid once on AppSumo, nothing to pay here"; AI Autopilot shows the Tier 2 limit (0/10) | Pass |
| 3 | Second buyer stacks three codes → **Tier 3**; the code box is removed at 3 of 3 | Pass |
| 4 | Same code again → "You have already redeemed that code on this account" | Pass |
| 5 | Made-up code → "That code was not recognised…" | Pass |

### AI Autopilot
| # | Scenario | Result |
|---|---|---|
| 6 | Plumber, Richmond VA: "Find homeowners and property managers who need emergency plumbing and water heater replacement, follow up every enquiry, and post on social media every day." → 14 questions → blueprint → build. Created **5 workflows, 3 AI agents, 5 schedules** and a quote-request page in about 3 minutes | Pass (see 3.4) |
| 7 | Electrician, Austin TX: "Write a weekly blog article and email my past customers a monthly maintenance reminder." → correctly recognised as Blog & SEO + customer reactivation → 9 questions → build in ~70 s → first article written: *"Electrical Panel Upgrade: When You Need One"* (717 words) | Pass (see 3.4) |
| 8 | "Chat with Protron" on the dashboard: asked "How do I connect my Gmail mailbox so emails can be sent?" → correct answer (Settings → Email & SMS) | Pass |

### Blog & SEO — real estate team, Arlington VA
| # | Scenario | Result |
|---|---|---|
| 9 | Paste a 900-character "About us" → ranking strategy in 15 s (28 keywords, e.g. "first-time home buyer Arlington VA", "buy a home near the Pentagon") | Pass |
| 10 | Plan November: 4 posts, pillar first; approve the month | Pass |
| 11 | Write the pillar post → *"How to Buy a Home Near the Pentagon: A Stress-Free Guide for Military and Federal Buyers"*, 990 words, 13 headings, in 15 s; nine SEO checks shown, the two failing ones named honestly | Pass |
| 12 | Read the article; generate a cover image (6 s); Publish tab offers WordPress or a downloadable bundle | Pass |

### Graphics Designer — plumber
| # | Scenario | Result |
|---|---|---|
| 13 | Home-services template → "Water heater replacement special — same-day install in Richmond" → finished design in 8 s with business name, five formats, three variations, caption and hashtags; Download PNG and Save to Media Center | Pass |

### Email campaigns — plumber
| # | Scenario | Result |
|---|---|---|
| 14 | "Winter water heater check-up, $89 flush" → goal *Promote offer*, tone *Friendly* → three emails written (day 0, 3, 7) in ~9 s | Pass |
| 15 | Try to send with no mailbox connected → "No email provider configured"; the send button is disabled and reads "Connect a mailbox to send"; Save as draft works. Nothing pretends to have sent | Pass |

### Lead capture, booking, CRM
| # | Scenario | Result |
|---|---|---|
| 16 | Build a "Plumbing quote request" form (name, email, phone, message), set it live at `/f/plumbing-quote-request`, submit it as a signed-out visitor "Marcus Hill" → thank-you shown → appears under Submissions → contact created with an open deal in "New Lead" | Pass |
| 17 | Signed-out visitor "Dana Wright" books Tue 17 Nov, 10:00 on the public booking page → "You are booked", with .ics, Google Calendar, reschedule and cancel → listed as Confirmed under Booking pages | Pass (see 3.3) |
| 18 | Add contact "Priya Nair, Nair Property Management" by hand → saved, still there after reload; an invalid email address is refused | Pass |
| 19 | Create deal "Panel upgrade — Nair Property (12 units)", $8,400 at 50% → pipeline $8,400, weighted $4,200; mark another deal Won → 1 won, win rate 100%; Board, List, Table, Calendar, Funnel and Gantt views all open | Pass |
| 20 | Reports reflect the above: 1 deal won, 3 contacts, source "Engagement" | Pass |

### Online shop — plumber
| # | Scenario | Result |
|---|---|---|
| 21 | Add product "Smart Leak Detector", $49, for sale → create shop page → try to open it to the public with no payment processor → refused with "Connect and test a payment processor under Getting paid before publishing" | Pass — by design |

### Websites — electrician
| # | Scenario | Result |
|---|---|---|
| 22 | Choose "Business Website" from 17 templates → preview → use → edit the headline to "Lone Star Electric — Austin, Texas" → save → still there after reopening → in-app preview | Pass |
| 23 | Open the finished site as a member of the public | **Not available yet** (see 3.1) |

### Everything else
| # | Scenario | Result |
|---|---|---|
| 24 | All 13 Settings tabs open | Pass |
| 25 | Customer Engagement: Widgets, AI agents, Voice, Live help — each says plainly what is not connected yet | Pass |
| 26 | Phone (390 px): dashboard, AI Autopilot, wizard, Graphics, Blog, Billing, booking page | Pass |
| 27 | Public pages on the live site load in 2–4 s with no errors: home, pricing, AppSumo, changelog, refund policy, strategy-call booking, sign-in, sign-up | Pass |

## 3. Not ready, or changed since the first submission

1. **Websites and Funnels cannot yet be opened by the public.** They can be built, edited and previewed inside the app. Booking pages, lead forms and shops are public and work.
2. **Content Studio has been taken out of this submission.** Video editing and AI Shorts had bugs and are being fixed; on the live app that area is a Media Library only. The Graphics Designer (formerly part of it) is in and tested above. Our listing and tier table need the video allowances removed to match.
3. **A booking made on the public page shows under Booking pages but not yet on the Calendar grid.**
4. **AI Autopilot set-up, two known faults:** a plumber's request was started from our real-estate template and asked two real-estate questions; and a second business in the same account picked up the first business's profile. Both are being fixed.
5. **Social posts are prepared, not posted.** The app designs the post and writes the caption; the customer downloads it and posts it. Some screens still say "posts to social" and are being reworded.
6. **Reviewer logins show "Not subscribed" on Plan & billing** although they are on Tier 3. Accounts that redeem a real code show the correct lifetime-deal card.
7. **Voice** (live spoken conversation with the assistant, phone answering) is not switched on.

## 4. Not verified in this run

- **AI Prospecting search results.** The test environment could not reach the business-directory source, so only the failure message was seen (it was clear and nothing crashed). To be confirmed on the live app before review.
- Sending real email, SMS, card payments and Google reviews need the customer's own mailbox, Twilio, Stripe/Creem and Google accounts; the app said so in each place rather than failing.

## 5. Owner: five checks on the live app before sending this

1. Sign in with a reviewer login → AI Prospecting → "dentists in Austin, Texas with a website" returns businesses.
2. The Help button is in the corner and opens chat / ticket / strategy call.
3. Sign up with a fresh email address → the sign-in code email arrives (check spam).
4. The top bar does not say "Cloud delayed".
5. Reviews → "Find your business on Google" finds a business.
