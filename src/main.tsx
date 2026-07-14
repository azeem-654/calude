import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installTenantStorage } from './services/tenancy'
import { initTheme } from './services/theme'

// Scope every crm_* localStorage key to the active sub-account BEFORE anything reads storage.
installTenantStorage();
// Apply the saved light/dark theme before first paint.
initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
