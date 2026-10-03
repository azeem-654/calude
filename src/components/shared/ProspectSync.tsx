/**
 * Keeps this browser's Contacts in step with what AI Autopilot's daily
 * prospect finders added on the server (services/finders.ts): once on load,
 * on every cloud refresh, and when the tab comes back into view. Draws nothing.
 */
import { useEffect } from 'react';
import { syncFinderContacts } from '../../services/finders';
import { CLOUD_REFRESH_EVENT } from '../../services/serverData';

export default function ProspectSync() {
  useEffect(() => {
    let last = 0;
    const go = () => {
      /* The refresh this sync fires must not start another one. */
      if (Date.now() - last < 60_000 || document.visibilityState !== 'visible') return;
      last = Date.now();
      void syncFinderContacts();
    };
    const t = window.setTimeout(go, 4000);
    window.addEventListener(CLOUD_REFRESH_EVENT, go);
    document.addEventListener('visibilitychange', go);
    return () => { window.clearTimeout(t); window.removeEventListener(CLOUD_REFRESH_EVENT, go); document.removeEventListener('visibilitychange', go); };
  }, []);
  return null;
}
