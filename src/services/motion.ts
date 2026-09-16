/**
 * Whether this browser shows the moving parts, and who decides.
 *
 * ── Why an override exists at all ──
 *
 * The app honours `prefers-reduced-motion` everywhere, which is right. But that
 * setting is not the considered accessibility choice people assume it is: on
 * Windows it is flipped by **battery saver**, by "Adjust for best performance"
 * set years ago on a slow machine, and by a Performance Options tick box that
 * silently overrules the Accessibility one. Plenty of people have it on without
 * knowing, see a static page, and conclude the site is broken — the owner of
 * this install among them.
 *
 * So the operating system sets the *default* and a person may overrule it for
 * this browser. That is the same bargain the light/dark switch already makes.
 *
 * ── Why it rewrites media conditions instead of the stylesheets ──
 *
 * The obvious implementation is to replace every
 * `@media (prefers-reduced-motion: …)` with an attribute selector on `:root`.
 * There are sixteen of them across four files, and unwrapping a block means
 * prefixing every selector inside it — which changes specificity, and therefore
 * the cascade, in sixteen places at once. That is a large, hard-to-see risk to
 * take for a display preference.
 *
 * This instead finds those blocks through the CSSOM and rewrites only their
 * condition: `all` to force them on, `not all` to force them off. The rules
 * inside are untouched, so specificity and order are exactly what the author
 * wrote, and setting the choice back to `system` restores the original text.
 *
 * ── What it deliberately does not do ──
 *
 * Change the default. Somebody who has never opened the setting still gets
 * whatever their system asked for, because an accessibility preference that a
 * website quietly ignores is worse than one it never offered.
 */

export type MotionChoice = 'system' | 'full' | 'reduced';

/* Global, like the theme: it describes this browser, not a workspace. Anyone
   switching between client accounts wants one answer, not one per account. */
const KEY = 'crm_motion';

const REDUCE = '(prefers-reduced-motion: reduce)';

/** What the operating system is asking for. */
export function systemPrefersReduced(): boolean {
  try { return window.matchMedia?.(REDUCE).matches ?? false; } catch { return false; }
}

export function motionChoice(): MotionChoice {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'full' || v === 'reduced' ? v : 'system';
  } catch {
    /* Private mode, or storage blocked. The system's answer is the safe one. */
    return 'system';
  }
}

/** The decision everything else asks about: is motion suppressed right now? */
export function motionReduced(): boolean {
  const choice = motionChoice();
  if (choice === 'full') return false;
  if (choice === 'reduced') return true;
  return systemPrefersReduced();
}

/*
 * The original condition of every block we rewrite.
 *
 * Kept so `system` can put back exactly what the author wrote, rather than a
 * reconstruction of it. Keyed by the rule object itself, so two stylesheets
 * with identical text cannot be confused for one another.
 */
const original = new WeakMap<CSSMediaRule, string>();

function eachMotionRule(fn: (rule: CSSMediaRule, kind: 'reduce' | 'no-preference') => void): void {
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      /* A cross-origin stylesheet throws on access. Ours are all same-origin;
         a font provider's is not, and is none of our business anyway. */
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSMediaRule)) continue;
      const text = original.get(rule) ?? rule.conditionText ?? rule.media.mediaText;
      if (!text.includes('prefers-reduced-motion')) continue;
      if (!original.has(rule)) original.set(rule, text);
      fn(rule, text.includes('no-preference') ? 'no-preference' : 'reduce');
    }
  }
}

/**
 * Apply the current choice to the page.
 *
 * Safe to call repeatedly — every call recomputes from the stored choice rather
 * than toggling, so two calls in a row leave the same state as one.
 */
export function applyMotion(): void {
  const choice = motionChoice();
  const reduced = motionReduced();

  /* An attribute as well, so anything added later can key off one thing rather
     than repeating this logic. */
  try { document.documentElement.dataset.motion = reduced ? 'reduced' : 'full'; } catch { /* no DOM */ }

  try {
    eachMotionRule((rule, kind) => {
      if (choice === 'system') {
        const text = original.get(rule);
        if (text) rule.media.mediaText = text;
        return;
      }
      const wanted = kind === 'reduce' ? reduced : !reduced;
      /* `all` matches everything, `not all` matches nothing. Changing only the
         condition leaves the rules inside, and their specificity, untouched. */
      rule.media.mediaText = wanted ? 'all' : 'not all';
    });
  } catch {
    /* A browser that will not let the condition be rewritten still gets the
       system behaviour, which is the behaviour it had before this existed. */
  }
}

export function setMotionChoice(choice: MotionChoice): void {
  try {
    if (choice === 'system') window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, choice);
  } catch { /* storage blocked; the change still applies for this page */ }
  applyMotion();
  /* So a hook that read `motionReduced()` at mount can re-read it. Named rather
     than a generic 'storage' event, which does not fire in the tab that wrote. */
  try { window.dispatchEvent(new Event('crm-motion-change')); } catch { /* older engine */ }
}

/**
 * Re-apply whenever a new stylesheet turns up.
 *
 * This is not belt and braces, it is the thing that makes the override work at
 * all. Vite injects each component's CSS when that component's module loads, so
 * at boot only `index.css` exists — the dashboard's and the marketing site's
 * arrive later, and on a route change later still. A single pass at startup
 * would rewrite the conditions in one file out of four and look like a partial
 * fix, which is the worst kind.
 *
 * Watching `head` for added nodes catches all of them without anything having
 * to remember to call this. It does nothing at all while the choice is
 * `system`, which is the common case.
 */
export function watchNewStylesheets(): void {
  if (typeof MutationObserver === 'undefined') return;
  let queued = false;
  const observer = new MutationObserver(records => {
    if (motionChoice() === 'system') return;
    const sawSheet = records.some(r => Array.from(r.addedNodes).some(
      n => n.nodeName === 'STYLE' || n.nodeName === 'LINK',
    ));
    if (!sawSheet || queued) return;
    /* A route change injects several at once; one pass after they have all
       landed beats one pass each. */
    queued = true;
    queueMicrotask(() => { queued = false; applyMotion(); });
  });
  try { observer.observe(document.head, { childList: true }); } catch { /* no head yet */ }
}

/**
 * Start following the system setting, for as long as the choice is `system`.
 *
 * Without this, turning battery saver on mid-session leaves the page animating
 * against an explicit request to stop.
 */
export function watchSystemMotion(): void {
  try {
    const mq = window.matchMedia(REDUCE);
    mq.addEventListener('change', () => {
      if (motionChoice() === 'system') {
        applyMotion();
        window.dispatchEvent(new Event('crm-motion-change'));
      }
    });
  } catch { /* no matchMedia, nothing to follow */ }
}
