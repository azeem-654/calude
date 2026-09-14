/**
 * What the browser tab says on a page a stranger opened.
 *
 * ── Why this exists ──
 *
 * `index.html` carries one `<title>`, and it names this platform. That is right
 * for the marketing site and for the product, and wrong for the three pages a
 * visitor reaches without ever signing in: a shop, a booking page and a client's
 * progress report. All three belong to *somebody else's* business, and two of
 * them are the whole of a reseller's white label — a client who opens a report
 * their agency sent and reads the name of the software underneath it has just
 * been told who the agency really is.
 *
 * So each public page names itself. One hook rather than three copies, because
 * the next public page should get this for free rather than having to remember.
 *
 * The title is restored on unmount: a single-page app that leaves a stale title
 * behind shows the shop's name over the dashboard somebody navigated to next.
 */
import { useEffect } from 'react';

export function usePageTitle(title: string): void {
  useEffect(() => {
    if (!title.trim()) return;
    const before = document.title;
    document.title = title.trim().slice(0, 120);
    return () => { document.title = before; };
  }, [title]);
}
