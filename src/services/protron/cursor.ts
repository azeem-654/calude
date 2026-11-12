/**
 * Protron's pointer: where on the screen it is working right now.
 *
 * ── Why it only moves when something real happens ──
 *
 * The owner's brief asked to *see* Protron work: the box being typed into,
 * the screen it opened, the step it just added to a workflow. A pointer that
 * drifts about on a timer would be theatre. So nothing here moves by itself:
 * an action calls `pointAt` with the element it is about to touch (or has
 * just changed) and a few words saying what it is doing, and the overlay
 * (components/Protron/ProtronCursor.tsx) glides there, rings the element and
 * shows the words. When the action settles it calls `pointerDone` and the
 * pointer fades. Work with nothing to point at — a server save, a search
 * running — shows on the action card's steps instead.
 *
 * The overlay never takes a click (pointer-events: none) and, under reduced
 * motion, jumps rather than glides. When Protron presses a control itself
 * (`clickAt`, only for controls screen.ts judged safe — tabs, links, Open,
 * Next…) the pointer shows the press as a ripple before the click.
 */

export const CURSOR_EVENT = 'pc-protron-cursor';

export interface CursorDetail {
  /** The element pointed at; absent with `done`. */
  el?: Element;
  label?: string;
  done?: boolean;
  /** The pointer presses here: a ripple at its tip (pressControl in screen.ts). */
  click?: boolean;
}

const calm = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function resolve(target: Element | string | null | undefined): Element | null {
  if (!target) return null;
  if (typeof target !== 'string') return target;
  try { return document.querySelector(target); } catch { return null; }
}

/**
 * Points at an element (or the first match of a selector) and waits for the
 * pointer to arrive. False when there is no such element on screen — the
 * caller carries on; the pointer is a view of the work, never a condition of it.
 */
export async function pointAt(target: Element | string | null | undefined, label: string, wait = true): Promise<boolean> {
  const el = resolve(target);
  if (!el || !(el as HTMLElement).getClientRects?.().length) return false;
  const r = el.getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight) el.scrollIntoView({ block: 'center', behavior: calm() ? 'auto' : 'smooth' });
  window.dispatchEvent(new CustomEvent<CursorDetail>(CURSOR_EVENT, { detail: { el, label } }));
  if (wait && !calm()) await new Promise(res => window.setTimeout(res, 480));
  return true;
}

/**
 * Points at an element and shows the press — the ripple a mouse click makes —
 * just before the caller clicks it. Only pressControl (screen.ts) calls this,
 * for controls it has judged safe to press.
 */
export async function clickAt(el: Element, label: string): Promise<boolean> {
  if (!(await pointAt(el, label))) return false;
  window.dispatchEvent(new CustomEvent<CursorDetail>(CURSOR_EVENT, { detail: { el, label, click: true } }));
  if (!calm()) await new Promise(res => window.setTimeout(res, 260));
  return true;
}

/** Waits for an element to appear (a screen still loading), up to `ms`. */
export async function waitForElement(selector: string, ms = 4000): Promise<Element | null> {
  const end = Date.now() + ms;
  for (;;) {
    const el = resolve(selector);
    if (el && (el as HTMLElement).getClientRects?.().length) return el;
    if (Date.now() > end) return null;
    await new Promise(res => window.setTimeout(res, 120));
  }
}

/** The work is finished: the pointer fades. */
export function pointerDone(): void {
  window.dispatchEvent(new CustomEvent<CursorDetail>(CURSOR_EVENT, { detail: { done: true } }));
}

/** The nav link for a screen, if it is on the bar: what a person would have clicked. */
export const navLinkFor = (path: string): string => `nav a[href="${path.replace(/"/g, '')}"], header a[href="${path.replace(/"/g, '')}"]`;
