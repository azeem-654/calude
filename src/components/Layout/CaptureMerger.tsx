/**
 * Brings people captured on public pages into Contacts, wherever the owner is.
 *
 * `mergeCaptured()` (services/engagement.ts) turns a form submission, a chat or
 * a booking into a contact and a deal, but it ran only while Customer
 * Engagement was open — so a visitor who booked through the booking page never
 * became a contact for an owner who did not happen to open that screen (audit
 * M13, 2026-11-16). Mounted once in the top bar: on open and every three
 * minutes, then the context re-reads what changed.
 */
import { useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { applyContactChanges, mergeCaptured } from '../../services/engagement';
import { CLOUD_REFRESH_EVENT } from '../../services/serverData';
import { getActiveAccountId } from '../../services/tenancy';

const EVERY_MS = 180_000;

export default function CaptureMerger() {
  const { addNotification } = useApp();
  useEffect(() => {
    let alive = true;
    let running = false;
    const pass = async () => {
      if (running || !getActiveAccountId()) return;
      running = true;
      try {
        const r = await mergeCaptured();
        await applyContactChanges();
        if (!alive) return;
        if (r.added || r.deals || r.enrolled) {
          window.dispatchEvent(new Event(CLOUD_REFRESH_EVENT));
          const bits = [
            r.added ? `${r.added} new ${r.added === 1 ? 'contact' : 'contacts'}` : '',
            r.deals ? `${r.deals} ${r.deals === 1 ? 'deal' : 'deals'} on the board` : '',
          ].filter(Boolean);
          if (bits.length) addNotification(`${bits.join(', ')} from your forms, chat and booking page.`, 'success');
        }
        for (const p of r.problems ?? []) addNotification(p, 'error');
      } catch { /* the next pass tries again */ } finally { running = false; }
    };
    const first = window.setTimeout(() => void pass(), 4_000);
    const t = window.setInterval(() => void pass(), EVERY_MS);
    return () => { alive = false; window.clearTimeout(first); window.clearInterval(t); };
  }, [addNotification]);
  return null;
}
