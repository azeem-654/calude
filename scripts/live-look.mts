/**
 * What a picture of the app for the public site must look like: the live app.
 *
 * Shared by site-clips.mts (the module demos) and site-reels.mts (the stills):
 * both drive a local Worker reached as app.protectedcentral.com, so the
 * incubator is off as on live, and this also hides the entries of modules held
 * back on 2026-11-18 in case a checkout does not gate them yet. Runs in the
 * page (addInitScript), so it may use nothing from this module's scope.
 */
/* Entries for modules the live app holds back (see the header). Matched on a
   control's whole label, or a phrase only those modules' cards carry. */
export const LIVE_LOOK = () => {
  const WHOLE = /^(Reviews|Reputation|Shops?|Online shop|Jobs|Jobs & revenue|Medical billing|Revenue cycle|RCM|Growth service)$/i;
  const PHRASE = /(e-commerce store|online store|connect a shop|Websites → Shops|medical billing|jobs & revenue)/i;
  /* This Worker has no AI key, so screens that use AI say so and carry on
     without it; the live app has its key, and a visitor would never see
     these notices. The notice goes; what the screen did without AI stays. */
  const NO_AI = /^(The AI could not be reached|The AI is not available|AI writing is not available|Not made yet: Writing is unavailable)/;
  const sweep = () => {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('button,a,[role=tab],[role=menuitem],[role=option]'))) {
      const label = (el.getAttribute('aria-label') || el.textContent || '').trim();
      if (WHOLE.test(label) || WHOLE.test((el.textContent || '').trim()) || (PHRASE.test(label) && label.length < 200)) el.style.setProperty('display', 'none', 'important');
    }
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('p,div,span'))) {
      if (el.childElementCount < 3 && NO_AI.test((el.textContent || '').trim())) el.style.setProperty('display', 'none', 'important');
    }
    /* A card that is about the shop: the smallest bordered box around the phrase. */
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!PHRASE.test(n.nodeValue || '')) continue;
      let box = n.parentElement;
      while (box && box !== document.body && !(getComputedStyle(box).borderTopWidth !== '0px' && box.getBoundingClientRect().height > 40)) box = box.parentElement;
      /* Only a card: a bordered box taller than this is a column holding much
         else besides, and hiding it would take the screen with it. */
      if (box && box !== document.body && box.getBoundingClientRect().height < 320) box.style.setProperty('display', 'none', 'important');
    }
  };
  const go = () => { sweep(); new MutationObserver(sweep).observe(document.body, { childList: true, subtree: true, characterData: true }); };
  if (document.body) go(); else addEventListener('DOMContentLoaded', go);
};
