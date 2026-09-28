import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installTenantStorage } from './services/tenancy'
import { moveSessionToCookie } from './services/auth'
import { installFieldGuard } from './services/fieldGuard'
import { initTheme } from './services/theme'
import { applyMotion, watchNewStylesheets, watchSystemMotion } from './services/motion'

// Scope every crm_* localStorage key to the active sub-account BEFORE anything reads storage.
installTenantStorage();
/* Every refused call that names a field is checked against the screen
   (services/fieldGuard.ts): a form must never ask for a box it does not show. */
installFieldGuard();
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
