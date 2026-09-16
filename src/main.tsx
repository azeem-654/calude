import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installTenantStorage } from './services/tenancy'
import { initTheme } from './services/theme'
import { applyMotion, watchNewStylesheets, watchSystemMotion } from './services/motion'

// Scope every crm_* localStorage key to the active sub-account BEFORE anything reads storage.
installTenantStorage();
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
