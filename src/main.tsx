import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installTenantStorage } from './services/tenancy'
import { adoptSessionWorkspace, moveSessionToCookie } from './services/auth'
import { installFieldGuard } from './services/fieldGuard'
import { installAiPatience } from './services/aiPatience'
import { installCrashReport } from './services/crashReport'
import { captureRef } from './services/referral'
import { captureIndustry } from './services/industrySetup'
import { capturePlan } from './services/sitePlan'
import { captureVisitor } from './services/funnel'
import { initTheme } from './services/theme'
import { isWhiteLabelHost } from './services/hosts'
import { applyMotion, watchNewStylesheets, watchSystemMotion } from './services/motion'

/* Installable from the phone's browser ("Add to Home screen"), so the owner
   can answer support from a home-screen icon without an app store (owner,
   2026-11-15). Added here rather than in index.html because the manifest
   names Protected Central, and a reseller's own address must not. */
if (!isWhiteLabelHost()) {
  for (const [rel, href] of [['manifest', '/manifest.webmanifest'], ['apple-touch-icon', '/app-icons/apple-touch-icon.png']]) {
    const l = document.createElement('link'); l.rel = rel; l.href = href;
    /* The testing site's lock wants its cookie, which a manifest fetch leaves behind by default. */
    if (rel === 'manifest') l.crossOrigin = 'use-credentials';
    document.head.appendChild(l);
  }
  for (const [name, content] of [['apple-mobile-web-app-capable', 'yes'], ['mobile-web-app-capable', 'yes'], ['apple-mobile-web-app-title', 'Protected Central']]) {
    const m = document.createElement('meta'); m.name = name; m.content = content; document.head.appendChild(m);
  }
}

// Scope every crm_* localStorage key to the active sub-account BEFORE anything reads storage.
installTenantStorage();
/* A customer's own workspace in the registry, before any screen asks for it —
   browsers that signed in before sign-in did this are mended here. */
adoptSessionWorkspace();
/* Every refused call that names a field is checked against the screen
   (services/fieldGuard.ts): a form must never ask for a box it does not show. */
/* A busy AI is waited out rather than shown as an error (services/aiPatience.ts) —
   installed first, so the guard sees the answer the screen gets, not each try. */
installAiPatience();
installFieldGuard();
/* And a screen that crashed is reported, not just seen (services/crashReport.ts). */
installCrashReport();
/* An affiliate's `?ref=` is remembered before anything routes (services/referral.ts). */
captureRef();
/* The trade a sign-up came from (`?industry=`), for its first workspace (services/industrySetup.ts). */
captureIndustry();
/* A plan made on the public site ("Find my solution") arrives in the address's
   fragment, and the funnel's visitor id in its query — both taken out of the
   address and kept on this origin before anything routes (services/sitePlan.ts,
   services/funnel.ts). */
capturePlan();
captureVisitor();
// Apply the saved light/dark theme before first paint.
initTheme();
/*
 * And the motion choice. It works by rewriting media conditions in the
 * stylesheets, and Vite injects most of those later — so the watcher is what
 * actually does the work, and this first pass just catches index.css before
 * anything paints.
 */
applyMotion();
watchNewStylesheets();
watchSystemMotion();
// A session from before HttpOnly cookies moves onto one, once (services/auth.ts).
void moveSessionToCookie();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
