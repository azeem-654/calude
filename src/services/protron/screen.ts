/**
 * What Protron can see of a screen, and how it fills one in — live.
 *
 * ── What it reads ──
 *
 * The screen's shape, not its records: headings, the boxes of a form (their
 * labels, what kind they are, whether they are empty), any error message on
 * show and the names of the buttons. Never what is typed in a box. That is
 * enough for the AI to say "the Subject box is still empty" or "that red
 * message means the mailbox password was refused", and to know which box a
 * value belongs in — without a customer's contacts, deals or messages ever
 * leaving the page for it.
 *
 * Password, card, key and token boxes are not read and cannot be filled:
 * Protron never touches a secret, even one the customer typed into the chat.
 *
 * ── How it fills ──
 *
 * One box at a time, in front of the customer: the box is scrolled to,
 * lit, and typed into a few characters at a time, so what Protron did is
 * seen being done rather than found afterwards. Values go in through the
 * element's own value setter and an `input` event, which is what React
 * listens to — the screen's own validation runs exactly as for typing.
 * Nothing is submitted: saving, sending or publishing stays the customer's
 * button. What was in each box before is kept for Undo.
 */

/** Fired with the rectangle of the box about to be typed into. */
import { clickAt, pointAt } from './cursor';

export const EDITING_EVENT = 'pc-protron-editing';

export interface ScreenField {
  key: string;
  label: string;
  kind: string;
  options?: string[];
  filled: boolean;
  required: boolean;
}

export interface ScreenSnapshot {
  /** The open dialog's name, when the reading is of a dialog. */
  dialog: string;
  headings: string[];
  fields: ScreenField[];
  alerts: string[];
  buttons: string[];
}

const SECRET = /pass(word|code)?|card|cvc|cvv|iban|ssn|social security|secret|api.?key|token|otp|2fa|one-time/i;
const SKIP_TYPES = new Set(['password', 'hidden', 'file', 'submit', 'button', 'image', 'reset', 'range', 'color']);
const MINE = '.pt-panel, .pt-launch, .pt-bubble, .pt-talk';

const clean = (s: string | null | undefined, max = 60): string => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function visible(el: Element): boolean {
  if (el.closest(MINE)) return false;
  if (el.closest('[hidden], [aria-hidden="true"]')) return false;
  const r = (el as HTMLElement).getClientRects();
  return r.length > 0 && r[0].width > 0 && r[0].height > 0;
}

/** The part of the page the customer is working in: the open dialog when there is one. */
function scope(): { root: ParentNode; dialog: string } {
  const dialogs = [...document.querySelectorAll('[aria-modal="true"], [role="dialog"]')].filter(d => !d.closest(MINE) && visible(d));
  const top = dialogs[dialogs.length - 1];
  if (top) return { root: top, dialog: clean(top.getAttribute('aria-label') || top.querySelector('h1,h2,h3')?.textContent, 60) || 'a dialog' };
  return { root: document.querySelector('main') ?? document.body, dialog: '' };
}

function labelOf(el: HTMLElement): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return clean(aria);
  const by = el.getAttribute('aria-labelledby');
  if (by) { const t = by.split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' '); if (clean(t)) return clean(t); }
  if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l && clean(l.textContent)) return clean(l.textContent); }
  const wrap = el.closest('label');
  if (wrap) { const t = clean([...wrap.childNodes].filter(n => n !== el && !(n instanceof HTMLInputElement)).map(n => n.textContent).join(' ')); if (t) return t; }
  /* The common pattern here: <div><label>Name</label><input/></div>. */
  let p: HTMLElement | null = el.parentElement;
  for (let i = 0; p && i < 3; i++, p = p.parentElement) {
    const l = p.querySelector(':scope > label, :scope > span, :scope > div > label');
    if (l && !l.contains(el) && clean(l.textContent)) return clean(l.textContent);
  }
  return clean((el as HTMLInputElement).placeholder) || clean(el.getAttribute('name')) || '';
}

function kindOf(el: HTMLElement): string {
  if (el instanceof HTMLTextAreaElement) return 'long text';
  if (el instanceof HTMLSelectElement) return 'choice';
  const t = (el as HTMLInputElement).type || 'text';
  return t === 'checkbox' ? 'tick box' : t;
}

function readable(el: HTMLElement): boolean {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return false;
  if (el.disabled || (el as HTMLInputElement).readOnly) return false;
  if (el instanceof HTMLInputElement && (SKIP_TYPES.has(el.type) || el.type === 'radio')) return false;
  if (/^cc-/.test(el.getAttribute('autocomplete') ?? '')) return false;
  const words = `${labelOf(el)} ${el.getAttribute('name') ?? ''} ${el.getAttribute('data-field') ?? ''} ${(el as HTMLInputElement).placeholder ?? ''}`;
  if (SECRET.test(words)) return false;
  return visible(el);
}

let counter = 0;

/** The screen as Protron is told it. Labels only — never a value. */
export function readScreen(): ScreenSnapshot {
  if (typeof document === 'undefined') return { dialog: '', headings: [], fields: [], alerts: [], buttons: [] };
  const { root, dialog } = scope();
  const fields: ScreenField[] = [];
  for (const el of [...root.querySelectorAll<HTMLElement>('input, textarea, select')]) {
    if (fields.length >= 25 || !readable(el)) continue;
    let key = el.getAttribute('data-field') || el.getAttribute('data-protron-key') || '';
    if (!key) { key = `box${++counter}`; el.setAttribute('data-protron-key', key); }
    const label = labelOf(el) || key;
    const f: ScreenField = {
      key, label, kind: kindOf(el),
      filled: el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : !!(el as HTMLInputElement).value?.trim(),
      required: (el as HTMLInputElement).required || el.getAttribute('aria-required') === 'true',
    };
    if (el instanceof HTMLSelectElement) f.options = [...el.options].map(o => clean(o.textContent, 40)).filter(Boolean).slice(0, 15);
    fields.push(f);
  }
  const headings = [...root.querySelectorAll('h1, h2, h3')].filter(visible).map(h => clean(h.textContent, 70)).filter(Boolean).slice(0, 8);
  const alerts = [...document.querySelectorAll('[role="alert"], [aria-live="assertive"], [data-error="1"]')]
    .filter(visible).map(a => clean(a.textContent, 160)).filter(Boolean).slice(0, 4);
  const buttons = [...root.querySelectorAll('button, [role="button"], a[href]')].filter(visible)
    .map(b => clean(b.getAttribute('aria-label') || b.textContent, 30)).filter(t => t.length > 1)
    .filter((t, i, a) => a.indexOf(t) === i).slice(0, 14);
  return { dialog, headings, fields, alerts, buttons };
}

/** The snapshot in a few lines for the model. */
export function describeScreen(s: ScreenSnapshot): string {
  const lines: string[] = [];
  if (s.dialog) lines.push(`A dialog is open: "${s.dialog}".`);
  if (s.headings.length) lines.push(`Headings: ${s.headings.join(' | ')}.`);
  if (s.fields.length) {
    lines.push('Form boxes (key — label — kind — state):');
    for (const f of s.fields) lines.push(`  ${f.key} — ${f.label} — ${f.kind}${f.options ? ` [${f.options.join(', ')}]` : ''} — ${f.filled ? 'filled' : 'empty'}${f.required ? ', required' : ''}`);
  }
  if (s.alerts.length) lines.push(`Messages on screen: ${s.alerts.map(a => `"${a}"`).join('; ')}.`);
  if (s.buttons.length) lines.push(`Buttons: ${s.buttons.join(', ')}.`);
  return lines.join('\n');
}

function find(key: string): HTMLElement | null {
  const sel = `[data-field="${CSS.escape(key)}"], [data-protron-key="${CSS.escape(key)}"]`;
  return [...document.querySelectorAll<HTMLElement>(sel)].find(el => readable(el)) ?? null;
}

/** Waits until a box with this key is on screen (a dialog that is still opening). */
export async function waitForField(key: string, ms = 4000): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) { if (find(key)) return true; await sleep(120); }
  return false;
}

const sleep = (ms: number) => new Promise(r => window.setTimeout(r, ms));
const calm = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function setValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, v: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export interface FillOutcome { ok: boolean; label: string; previous: string; message?: string }

/** Types one value into one box, visibly. */
export async function fillField(key: string, value: string): Promise<FillOutcome> {
  const el = find(key);
  if (!el) return { ok: false, label: key, previous: '', message: 'That box is not on this screen any more.' };
  const label = labelOf(el) || key;
  /* On a phone the panel sits on the bottom half while it works: the box goes to the top. */
  el.scrollIntoView({ block: window.innerWidth <= 760 ? 'start' : 'center', behavior: calm() ? 'auto' : 'smooth' });
  el.classList.add('pt-editing');
  await sleep(calm() ? 0 : 260);
  /* The panel steps out of the way if it is over the box (ProtronPanel). */
  const r = el.getBoundingClientRect();
  window.dispatchEvent(new CustomEvent(EDITING_EVENT, { detail: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }));
  /* The pointer goes to the box being typed into (cursor.ts). */
  void pointAt(el, `Typing “${label.slice(0, 40)}”`, false);
  try {
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      const want = /^(true|yes|on|1|checked|tick)$/i.test(value.trim());
      const previous = String(el.checked);
      if (el.checked !== want) el.click();
      return { ok: true, label, previous };
    }
    if (el instanceof HTMLSelectElement) {
      const v = value.trim().toLowerCase();
      const opt = [...el.options].find(o => o.value.toLowerCase() === v || clean(o.textContent).toLowerCase() === v)
        ?? [...el.options].find(o => clean(o.textContent).toLowerCase().includes(v));
      if (!opt) return { ok: false, label, previous: el.value, message: `“${value.slice(0, 40)}” is not one of its choices.` };
      const previous = el.value;
      setValue(el, opt.value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, label, previous };
    }
    const box = el as HTMLInputElement | HTMLTextAreaElement;
    const previous = box.value;
    if (box instanceof HTMLInputElement && box.type === 'number' && value.trim() && !Number.isFinite(Number(value))) {
      return { ok: false, label, previous, message: 'That box takes a number.' };
    }
    const max = box.maxLength > 0 ? box.maxLength : 5000;
    const text = value.slice(0, max);
    box.focus({ preventScroll: true });
    if (calm() || box.type === 'date' || box.type === 'time' || box.type === 'number') {
      setValue(box, text);
    } else {
      /* About a second and a half a box, however long the text: live, not slow. */
      const steps = Math.min(text.length, 36);
      for (let i = 1; i <= steps; i++) {
        setValue(box, text.slice(0, Math.ceil((text.length * i) / steps)));
        await sleep(40);
      }
      if (!steps) setValue(box, '');
    }
    box.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, label, previous };
  } finally {
    window.setTimeout(() => el.classList.remove('pt-editing'), 700);
  }
}

/** Puts back what was in the boxes before Protron filled them. */
export async function restoreFields(list: { key: string; previous: string }[]): Promise<number> {
  let n = 0;
  for (const { key, previous } of list) {
    const el = find(key);
    if (!el) continue;
    if (el instanceof HTMLInputElement && el.type === 'checkbox') { if (String(el.checked) !== previous) el.click(); n++; continue; }
    setValue(el as HTMLInputElement, previous);
    el.dispatchEvent(new Event('change', { bubbles: true }));
    n++;
  }
  return n;
}

/* ── Pressing a button, visibly (owner, 2026-11-12: "the pointer may start clicking") ──
 *
 * Protron may press only controls that show or move: a tab, a section that
 * opens and closes, a link to another screen, and buttons whose words say
 * they only open, show or move (Open, View, Next, Back, Close, New…).
 * Anything whose words say it saves, sends, spends or removes is never
 * pressed — Protron points at it and the customer presses it. Words are a
 * judgement on what a button says, so the refusals are checked first and
 * "Save", "Send", "Generate", "Delete", "Pay" and the like win over anything. */

/** Words on a control that change, send or spend something: never pressed by Protron. */
const PRESS_NEVER = /\b(send|publish|post|delete|remove|erase|pay|charge|refund|buy|purchase|order|checkout|subscribe|upgrade|downgrade|plan|billing|activate|deactivate|launch|go live|switch|turn on|turn off|enable|disable|import|invite|approve|accept|decline|reject|save|submit|confirm|apply|generate|regenerate|run|start|stop|sign ?out|log ?out|connect|disconnect|verify|test|book|schedule|export|download|upload|archive|duplicate|copy|create|finish|complete|reset|clear|restore|transfer|withdraw|merge|assign|unsubscribe|subscription|block|close (my |this )?(account|workspace))\b/i;
/** Words on a button that only open, show or move. */
const PRESS_SAFE = /^(open|view|show|hide|see|next|back|previous|prev|close|cancel|more|less|expand|collapse|details|edit|new|filter|sort|browse|explore|preview|menu|help|learn more|overview|all)\b/i;

export type PressKind = 'tab' | 'disclosure' | 'link' | 'button';

/** '' when Protron may press it; otherwise why not, in a sentence. Pure — tested. */
export function pressSafety(label: string, kind: PressKind): string {
  const l = label.replace(/\s+/g, ' ').trim();
  if (!l) return 'That control has no name I can be sure of.';
  if (PRESS_NEVER.test(l)) return `“${l}” changes, sends or spends something — that one is yours to press.`;
  if (kind === 'tab' || kind === 'disclosure' || kind === 'link') return '';
  return PRESS_SAFE.test(l) ? '' : `I only press buttons that open or show things — “${l}” is yours to press.`;
}

function controlName(el: Element): string {
  return clean(el.getAttribute('aria-label') || el.textContent, 60);
}

function kindOfControl(el: Element): PressKind {
  if (el.getAttribute('role') === 'tab') return 'tab';
  if (el.hasAttribute('aria-expanded')) return 'disclosure';
  if (el instanceof HTMLAnchorElement) {
    const href = el.getAttribute('href') ?? '';
    /* Only a link to another screen of this app: no downloads, no other sites. */
    if (href.startsWith('/') && !href.startsWith('//') && !el.hasAttribute('download') && !/^\/api\//.test(href)) return 'link';
    return 'button';
  }
  return 'button';
}

/** The control on screen with this name: exact first, else the one name that starts with it. */
export function findControl(label: string): Element | null {
  const want = label.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!want || typeof document === 'undefined') return null;
  const { root } = scope();
  const all = [...root.querySelectorAll('button, [role="button"], [role="tab"], a[href]')]
    .filter(el => visible(el) && !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true');
  const exact = all.find(el => controlName(el).toLowerCase() === want);
  if (exact) return exact;
  const starts = all.filter(el => controlName(el).toLowerCase().startsWith(want));
  return starts.length === 1 ? starts[0] : null;
}

export interface PressOutcome { ok: boolean; label: string; message: string }

/** Moves the pointer to a control and, when it is one Protron may press, clicks it. */
export async function pressControl(label: string): Promise<PressOutcome> {
  const el = findControl(label);
  if (!el) return { ok: false, label, message: `There is no “${label.slice(0, 40)}” on this screen right now.` };
  const name = controlName(el);
  const why = pressSafety(name, kindOfControl(el));
  if (why) {
    /* Pointed at, so the customer sees which button is theirs. */
    await pointAt(el, `Press “${name.slice(0, 30)}” yourself`);
    return { ok: false, label: name, message: why };
  }
  await clickAt(el, `Clicking “${name.slice(0, 30)}”`);
  (el as HTMLElement).click();
  await sleep(calm() ? 0 : 350);
  return { ok: true, label: name, message: `Pressed “${name}”.` };
}
