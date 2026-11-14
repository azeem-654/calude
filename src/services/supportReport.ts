/**
 * "Report a problem" from Protron: a picture of the screen, the customer's
 * own pictures and their words, sent to support by email
 * (worker/src/routes/supportReport.ts).
 *
 * ── Why the page draws itself rather than asking the browser ──
 *
 * The browser's own capture (`getDisplayMedia`) asks the customer to choose
 * a screen in a dialog they have never seen, and does not exist on phones.
 * Redrawing the page from its own DOM (modern-screenshot) needs no prompt and
 * works everywhere; what it can miss — a video frame, a picture from another
 * site — is why the customer can add their own screenshot as well. The
 * library is loaded only when the button is pressed.
 *
 * Anything marked `data-no-shot` (Protron's panel and launcher) is left out,
 * so the picture is of the app, not of the report being written.
 */
import { shrinkImage } from './chatImage';

const base = (): string => (import.meta.env.DEV ? 'http://localhost:8787' : '');

/** A JPEG data URL of what is on screen now, or an error in plain words. */
export async function captureScreen(): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
  try {
    const { domToBlob } = await import('modern-screenshot');
    const root = document.documentElement;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const blob = await Promise.race([
      domToBlob(root, {
        width: w,
        height: h,
        /* Only what is in view: the document is moved under the frame by how far it is scrolled. */
        style: { transform: `translate(${-window.scrollX}px, ${-window.scrollY}px)` },
        backgroundColor: getComputedStyle(document.body).backgroundColor || '#ffffff',
        scale: Math.min(window.devicePixelRatio || 1, 2),
        filter: node => !(node instanceof Element && node.closest('[data-no-shot]')),
        timeout: 8000,
      }),
      new Promise<null>(r => window.setTimeout(() => r(null), 15_000)),
    ]);
    if (!blob) return { ok: false, error: 'Taking the screenshot took too long. You can add one of your own instead.' };
    const shrunk = await shrinkImage(blob.type ? blob : new Blob([blob], { type: 'image/png' }));
    return { ok: true, dataUrl: shrunk.data };
  } catch {
    return { ok: false, error: 'This screen could not be captured. You can add a screenshot of your own instead.' };
  }
}

/** A picture the customer chose, made small enough to send. */
export async function preparePicture(file: File): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
  try { return { ok: true, dataUrl: (await shrinkImage(file)).data }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'That picture could not be read.' }; }
}

export interface ReportResult { ok: boolean; message: string; field?: string; partial?: boolean }

export async function sendReport(r: { description: string; screenshot: string; pictures: string[] }): Promise<ReportResult> {
  let token = 'cookie';
  try { token = (JSON.parse(localStorage.getItem('crm_session') || 'null') as { token?: string } | null)?.token || 'cookie'; } catch { /* signed out */ }
  let accountId = '';
  try { accountId = localStorage.getItem('crm_active_account') || ''; } catch { /* none */ }
  if (!accountId) return { ok: false, message: 'Sign in again, then send the report.' };
  try {
    const res = await fetch(`${base()}/api/support-report.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({
        token, accountId,
        description: r.description, screenshot: r.screenshot || undefined, pictures: r.pictures,
        path: `${location.pathname}${location.search}`, pageTitle: document.title, viewport: `${window.innerWidth}×${window.innerHeight}`,
      }),
    });
    const j = await res.json().catch(() => null) as { success?: boolean; error?: string; field?: string; message?: string; sent?: string } | null;
    if (!j) return { ok: false, message: `The report could not be sent (the server answered ${res.status}).` };
    if (!j.success) return { ok: false, message: j.error || 'The report could not be sent.', field: j.field };
    return { ok: true, message: j.message || 'Sent to our support team.', partial: j.sent === 'partial' };
  } catch {
    return { ok: false, message: 'The report could not be sent — check your connection and try again.' };
  }
}
