/**
 * A template design as a post in the Graphics Designer's list — the record
 * every other screen already reads (crm_social_posts): the Autopilot board,
 * the dashboard, the content plan. The design itself rides on `design`; the
 * old fields are filled so a screen that knows nothing about templates still
 * shows a post of the right shape and colour rather than a blank square.
 */
import { formatOf, paletteFor, RATIO_OF, type DesignDoc, type FormatId } from '../../../../worker/src/lib/design/spec';
import { templateOf } from '../../../../worker/src/lib/design/templates';
import { RATIO_SIZES } from '../templates';
import type { DesignPost, Platform } from '../types';

export const PLATFORM_OF: Record<FormatId, Platform> = { square: 'instagram', portrait: 'instagram', story: 'instagram', landscape: 'linkedin', wide: 'twitter' };

export function postFields(doc: DesignDoc): Pick<DesignPost, 'platform' | 'aspectRatio' | 'canvasWidth' | 'canvasHeight' | 'background' | 'elements' | 'design'> {
  const ratio = RATIO_OF[doc.format];
  const size = RATIO_SIZES[ratio] ?? { width: 540, height: 540 };
  const pal = paletteFor(doc.colors);
  return {
    platform: PLATFORM_OF[doc.format], aspectRatio: ratio, canvasWidth: size.width, canvasHeight: size.height,
    background: { type: 'gradient', color: pal.primary, gradientStart: pal.primary, gradientEnd: pal.primaryDeep, gradientAngle: 160, imageFit: 'cover' },
    elements: [],
    design: doc,
  };
}

export function newPost(doc: DesignDoc, extra: Partial<DesignPost> = {}): DesignPost {
  const now = new Date().toISOString();
  return {
    id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: (doc.content.headline || doc.content.offer || doc.content.occasion || templateOf(doc.templateId).name).slice(0, 60),
    status: 'draft', tags: ['template', doc.templateId], createdAt: now, updatedAt: now,
    caption: doc.caption, hashtags: doc.hashtags,
    ...postFields(doc), ...extra,
  };
}

/** "Instagram & Facebook feed, LinkedIn — 1080 × 1350". */
export const formatLine = (id: FormatId) => { const f = formatOf(id); return `${f.label} · ${f.width} × ${f.height}`; };
