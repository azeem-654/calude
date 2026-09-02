---
name: verify-in-browser
description: Drive the real app in a headless browser to check a UI change actually works. Use after changing anything under src/components, or when asked to verify, test, or screenshot a screen. Builds, runs the real Worker with a local D1, signs in, and reports overflow, console errors and what rendered.
---

# Verify a change in the real app

A typecheck proves almost nothing about this app. The layout traps that have
actually shipped bugs here — a fixed overlay trapped in a stacking context, a
grid item wider than the phone it is on, a panel clipped by a scroller — are all
invisible to the compiler and obvious in a browser.

This runs the same Worker and a real D1, so the API is exercised too.

## 1. Build and serve

```bash
VITE_BASE=/ npm run build        # without VITE_BASE the assets 404
npx wrangler d1 migrations apply crmpro --local
npx wrangler dev --port 8787 --local &
```

Give it ~18 seconds, then confirm with
`curl -s -o /dev/null -w "%{http_code}" http://localhost:8787/login`.

## 2. Drive it

Chromium and Playwright are installed; do not run `playwright install`.

```js
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 180)));

await p.goto('http://localhost:8787/login', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1200);
await p.fill('input[placeholder="Email or username"]', EMAIL);
await p.fill('input[type="password"]', PASSWORD);
await p.getByRole('button', { name: 'Sign in' }).click();
await p.waitForTimeout(2800);
```

The email field is `type="text"`, not `type="email"` — match on the placeholder.

Register a throwaway account against the local D1 rather than reusing one:

```bash
curl -s -X POST http://localhost:8787/api/auth.php -H 'Content-Type: application/json' \
  -d '{"action":"register","email":"t@test.dev","password":"Sup3rSecret!23","name":"T","businessName":"T"}'
```

## 3. Report

Check all three on every run, at 390px and 1280px:

- `document.documentElement.scrollWidth - clientWidth` — must be 0. Anything
  else is a horizontal scrollbar on a phone.
- `pageerror` — must be empty.
- What actually rendered: read `innerText`, count the elements you expected.
  A screenshot proves it looks right; the text proves it *is* right.

Say what you checked and what came back. "No console errors, no overflow at
390px and 1280px, six channel tabs rendered" is a result. "Looks good" is not.

## Traps that have cost time here

- **Scope locators to the dialog.** `getByRole('button', {name: /^Social/})`
  matches the nav behind the overlay. Use
  `page.locator('[role="dialog"]').getByRole(...)`.
- **Seed with `version: 1`.** `loadOnboarding()` discards any stored state
  without it, so a fixture silently does nothing.
- **Write plain storage keys.** `installTenantStorage` adds the `crm_acct_<id>_`
  prefix itself; writing a prefixed key from `page.evaluate` double-prefixes it.
- **A scroller clips its children.** Measuring `getBoundingClientRect().right`
  on an element inside `overflow: auto` reports a position you cannot see.
