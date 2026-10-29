/**
 * A template design for a post somebody else wrote — an AI Autopilot agent,
 * the content plan, a business flow — so those posts are real designs too,
 * not the old headline on a gradient.
 *
 * The layout the customer chose in the AI Autopilot wizard (designOptions.ts
 * → lib/designLayouts.ts SOCIAL_LAYOUTS) still decides: each old layout id
 * names the template closest to it in spirit. Only templates that work
 * without the customer's own photo are used here, because nobody is there to
 * upload one when an agent writes a post at night; the photo comes from the
 * library for the business's industry and can be replaced in the editor.
 */
import { templateOf } from './templates';
import { newDoc, clip, type Business } from './content';
import type { DesignDoc, FormatId } from './spec';

export const LAYOUT_TEMPLATE: Record<string, string> = {
  bold: 'spotlight-offer', offer: 'flash-offer', split: 'service-checklist', diagonal: 'seasonal-slant',
  minimal: 'editorial-tip', quote: 'corporate-insight', framed: 'luxe-frame',
};

export function designForPost(
  post: { platform: string; headline: string; body?: string; hashtags?: string[]; badge?: string; cta?: string },
  brand: { company: string; primary: string; accent?: string; secondary?: string; logo?: string; industry?: string; description?: string; services?: string[]; website?: string; phone?: string },
  layout = 'bold',
): DesignDoc {
  const offer = (post.badge ?? '').trim();
  /* "Offer" without an offer would be a placeholder on a post that may be published unreviewed. */
  const id = layout === 'offer' && !offer ? LAYOUT_TEMPLATE.bold : LAYOUT_TEMPLATE[layout] ?? LAYOUT_TEMPLATE.bold;
  const tpl = templateOf(id);
  const square = post.platform === 'instagram' || post.platform === 'facebook';
  const format: FormatId = square ? 'square' : post.platform === 'twitter' ? 'wide' : 'landscape';
  const biz: Business = {
    name: brand.company, industry: brand.industry ?? '', description: brand.description ?? '', services: brand.services ?? [],
    website: brand.website ?? '', phone: brand.phone ?? '', email: '', address: '', logo: brand.logo ?? '',
    colors: { primary: brand.primary, accent: brand.accent, secondary: brand.secondary }, offer: offer || undefined,
  };
  const first = (post.body ?? '').split(/(?<=[.!?])\s/)[0]?.trim() ?? '';
  const doc = newDoc(tpl, biz, {
    format, objective: offer ? 'sell' : tpl.objectives[0],
    content: {
      headline: clip(post.headline, tpl.limits.headline ?? 60),
      subhead: first && first.length <= (tpl.limits.subhead ?? 80) ? first : '',
      ...(post.cta ? { cta: clip(post.cta, tpl.limits.cta ?? 18) } : {}),
      ...(offer ? { offer } : {}),
    },
  });
  return { ...doc, caption: post.body ?? '', hashtags: post.hashtags ?? [] };
}
