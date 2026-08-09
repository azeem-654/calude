/**
 * Getting a finished post from here onto a platform.
 *
 * What this is not: browser automation. A page served from this app cannot read
 * or write anything inside an instagram.com tab — the same-origin policy is the
 * boundary that stops any website driving your logged-in sessions, and no
 * library lifts it from a normal web page. Anything claiming to "auto-fill and
 * click post" from the front end is either lying or describing a browser
 * extension. Automating these platforms also breaks their terms and gets real
 * accounts suspended, which is a bad thing to ship to paying customers.
 *
 * What this is: the most that can honestly be done, which turns out to be most
 * of the work. Three routes, chosen per placement by the rulebook's `handoff`:
 *
 *   intent  — the platform publishes an official prefill URL, so its composer
 *             opens with the text already in the box
 *   share   — no prefill, but navigator.share can hand the file and caption
 *             straight to the native app (mobile, and some desktop browsers)
 *   manual  — neither: download the media, copy the caption, open the composer
 *
 * Every route ends with the user pressing Post themselves, which is also what
 * keeps them in control of what goes out in their name.
 */
import { placementRules } from './socialAutomation';
import type { CampaignAsset, Placement } from '../types/socialAutomation';

export type HandoffRoute = 'intent' | 'share' | 'manual';

/** The caption exactly as it should arrive on the platform. */
export function captionFor(asset: CampaignAsset): string {
  const tags = asset.hashtags.length ? `\n\n${asset.hashtags.join(' ')}` : '';
  // The body already carries its own hashtags when the composer fitted them in,
  // so only append when they are not there yet.
  return asset.hashtags.length && asset.body.includes(asset.hashtags[0])
    ? asset.body
    : `${asset.body}${tags}`;
}

/** The first http(s) link in the asset, which is what most intents want. */
export function linkFor(asset: CampaignAsset): string {
  const found = [...asset.media, asset.body].find(v => /^https?:\/\//.test(v ?? ''));
  if (found && /^https?:\/\//.test(found)) return found;
  const inBody = asset.body.match(/https?:\/\/\S+/);
  return inBody ? inBody[0] : '';
}

/**
 * Official prefill URLs. These are documented, supported endpoints — not
 * scraped internals — so they keep working and do not violate anything.
 */
export function intentUrl(asset: CampaignAsset): string {
  const caption = captionFor(asset);
  const link = linkFor(asset);
  const enc = encodeURIComponent;

  switch (asset.placement) {
    case 'x_post':
    case 'x_thread': {
      // Threads are posted one tweet at a time; the first is what opens.
      const text = asset.parts?.length ? asset.parts[0].body : caption;
      return `https://x.com/intent/post?text=${enc(text)}${link ? `&url=${enc(link)}` : ''}`;
    }
    case 'linkedin_feed':
      // shareActive opens the real composer with the text already in it.
      return `https://www.linkedin.com/feed/?shareActive=true&text=${enc(caption)}`;
    case 'facebook_feed':
      // Facebook's sharer takes a URL only; the caption goes via the clipboard.
      return link
        ? `https://www.facebook.com/sharer/sharer.php?u=${enc(link)}`
        : 'https://www.facebook.com/';
    case 'pinterest_pin':
      return `https://pinterest.com/pin/create/button/?description=${enc(caption)}`
        + (link ? `&url=${enc(link)}` : '')
        + (asset.media[0] && /^https?:\/\//.test(asset.media[0]) ? `&media=${enc(asset.media[0])}` : '');
    default:
      return '';
  }
}

/** Where to go when there is no prefill: the platform's own composer. */
export const COMPOSER_URL: Record<Placement, string> = {
  instagram_reel: 'https://www.instagram.com/',
  instagram_feed: 'https://www.instagram.com/',
  instagram_story: 'https://www.instagram.com/',
  tiktok_video: 'https://www.tiktok.com/upload',
  facebook_feed: 'https://www.facebook.com/',
  facebook_reel: 'https://www.facebook.com/reels/create',
  facebook_story: 'https://www.facebook.com/stories/create',
  linkedin_feed: 'https://www.linkedin.com/feed/',
  linkedin_newsletter: 'https://www.linkedin.com/newsletters/',
  x_post: 'https://x.com/compose/post',
  x_thread: 'https://x.com/compose/post',
  youtube_shorts: 'https://studio.youtube.com/',
  youtube_community: 'https://studio.youtube.com/',
  pinterest_pin: 'https://www.pinterest.com/pin-builder/',
};

export function routeFor(asset: CampaignAsset): HandoffRoute {
  if (!asset.placement) return 'manual';
  const rules = placementRules(asset.placement);
  if (!rules) return 'manual';
  // An intent is only useful if we can actually build one for this asset.
  if (rules.handoff === 'intent' && intentUrl(asset)) return 'intent';
  if (rules.handoff === 'share') return 'share';
  return 'manual';
}

/** What the user has to do on their side, spelled out per route. */
export function routeHint(asset: CampaignAsset): string {
  switch (routeFor(asset)) {
    case 'intent':
      return 'Opens the composer with your text already in it. Check it over and press Post.';
    case 'share':
      return 'Sends the video and caption to the app if your device supports sharing; otherwise the caption is copied and the composer opens.';
    default:
      return 'The caption is copied and the composer opens — paste it in, attach the media, and post.';
  }
}

/* ── Browser capabilities ── */

export function canWebShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through to the legacy path */ }
  try {
    // Older browsers, and any context where the async clipboard is blocked.
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch { return false; }
}

/**
 * Open a platform in a new tab. `noopener` matters: without it the opened page
 * gets a handle back to this one via window.opener and can navigate it.
 */
export function openTab(url: string): Window | null {
  if (!url) return null;
  return window.open(url, '_blank', 'noopener,noreferrer');
}

/** Save the media so it can be attached by hand. */
export function downloadMedia(asset: CampaignAsset, filename: string): boolean {
  const src = asset.media[0];
  if (!src) return false;
  const a = document.createElement('a');
  a.href = src;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return true;
}

export interface HandoffOutcome {
  route: HandoffRoute;
  opened: boolean;
  copied: boolean;
  shared: boolean;
  note: string;
}

/**
 * Do whatever this asset's route allows, and report exactly what happened so
 * the UI can tell the user rather than guess.
 */
export async function handOff(asset: CampaignAsset): Promise<HandoffOutcome> {
  const route = routeFor(asset);
  const caption = captionFor(asset);

  if (route === 'intent') {
    // Opened first, for the same user-activation reason as below.
    const opened = !!openTab(intentUrl(asset));
    // Facebook's sharer cannot take text, so the caption still goes to the clipboard.
    const needsCopy = asset.placement === 'facebook_feed';
    const copied = needsCopy ? await copyToClipboard(caption) : false;
    return {
      route, opened, copied, shared: false,
      note: opened
        ? (needsCopy ? 'Composer opened. The caption is on your clipboard — paste it in.' : 'Composer opened with your text already in it.')
        : 'Your browser blocked the new tab. Allow pop-ups for this site and try again.',
    };
  }

  if (route === 'share' && canWebShare()) {
    try {
      await navigator.share({ title: asset.title, text: caption });
      return { route, opened: false, copied: false, shared: true, note: 'Handed to the share sheet.' };
    } catch (err) {
      // A user who dismisses the sheet is not an error worth shouting about.
      const aborted = err instanceof Error && err.name === 'AbortError';
      if (aborted) return { route, opened: false, copied: false, shared: false, note: 'Sharing cancelled.' };
    }
  }

  // Open the tab before awaiting anything. A popup is only allowed while the
  // browser still counts this as the user's click, and the first await spends
  // that activation — putting the clipboard first meant Instagram, TikTok and
  // YouTube were silently blocked by the popup blocker.
  const opened = asset.placement ? !!openTab(COMPOSER_URL[asset.placement]) : false;
  const copied = await copyToClipboard(caption);
  return {
    route, opened, copied, shared: false,
    note: [
      copied ? 'Caption copied' : 'Could not copy the caption — select it above',
      opened ? 'composer opened' : 'open the platform yourself',
    ].join(', ') + '.',
  };
}
