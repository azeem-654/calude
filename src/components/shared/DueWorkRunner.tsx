/**
 * Drives the scheduled-work tick for the whole app.
 *
 * Renders nothing. It lives in the shell rather than on a screen because the
 * work it drives — scheduled emails, sequence follow-ups, open and click
 * tracking — used to run only when somebody opened the Dashboard. A sequence
 * that says "wait three days" needs a heartbeat that does not depend on which
 * page the user happens to be looking at.
 */
import { useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { startDueWork } from '../../services/dueWork';

export default function DueWorkRunner() {
  const { contacts, sequences, addNotification } = useApp();

  /* Read through a ref so the loop always sees current data without being torn
     down and restarted every time a contact changes — a restart mid-pass is how
     the same follow-up goes out twice. */
  const latest = useRef({ contacts, sequences });
  useEffect(() => { latest.current = { contacts, sequences }; });

  const notify = useRef(addNotification);
  useEffect(() => { notify.current = addNotification; });

  useEffect(() => startDueWork(
    () => latest.current,
    (report) => {
      const parts: string[] = [];
      if (report.scheduledSent) parts.push(`${report.scheduledSent} scheduled email${report.scheduledSent > 1 ? 's' : ''}`);
      if (report.sequenceSent) parts.push(`${report.sequenceSent} sequence email${report.sequenceSent > 1 ? 's' : ''}`);
      if (parts.length) notify.current(`${parts.join(' and ')} sent`, 'info');
    },
  ), []);

  return null;
}
