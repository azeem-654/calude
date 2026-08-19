/**
 * Make a stored record into a design the editor can actually open.
 *
 * `crm_social_posts` is written by more than one thing. The designer saves a
 * full `DesignPost` — canvas, elements, aspect ratio, the lot. Content setup
 * and older versions of this module have written thinner records into the same
 * key, with a caption and a platform and little else.
 *
 * The gallery then read `post.aspectRatio.split(':')` on one of those and took
 * the whole screen down. Rather than sprinkling `?.` through every card, every
 * record is put through here once on the way in, so everything downstream can
 * rely on a complete design being there.
 *
 * Nothing is invented that changes meaning: a missing name becomes "Untitled
 * design", not a made-up title, and an unrecognised platform falls back to the
 * one whose canvas is squarest rather than being guessed at.
 */
import type { AspectRatio, CanvasBackground, CanvasElement, DesignPost, Platform } from './types';
import { PLATFORM_PRESETS, RATIO_SIZES } from './templates';

const PLATFORMS = Object.keys(PLATFORM_PRESETS) as Platform[];
const RATIOS = Object.keys(RATIO_SIZES) as AspectRatio[];

const DEFAULT_BG: CanvasBackground = {
  type: 'color', color: '#ffffff',
  gradientStart: '#6366f1', gradientEnd: '#8b5cf6', gradientAngle: 135, imageFit: 'cover',
};

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v : fallback;
}

function iso(v: unknown): string {
  const d = new Date(typeof v === 'string' || typeof v === 'number' ? v : NaN);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** True for anything already carrying the fields the canvas needs. */
export function isDesignPost(v: unknown): v is DesignPost {
  const p = v as Partial<DesignPost> | null;
  return !!p && typeof p.id === 'string'
    && typeof p.aspectRatio === 'string' && RATIOS.includes(p.aspectRatio as AspectRatio)
    && typeof p.canvasWidth === 'number' && Array.isArray(p.elements);
}

export function normalisePost(raw: unknown): DesignPost | null {
  const p = raw as Record<string, unknown> | null;
  if (!p || typeof p !== 'object') return null;
  const id = typeof p.id === 'string' && p.id ? p.id : '';
  if (!id) return null;

  const platform = (PLATFORMS.includes(p.platform as Platform) ? p.platform : 'instagram') as Platform;
  const aspectRatio = (RATIOS.includes(p.aspectRatio as AspectRatio) ? p.aspectRatio : '1:1') as AspectRatio;
  const size = RATIO_SIZES[aspectRatio];

  const status = p.status === 'published' || p.status === 'scheduled' ? p.status : 'draft';
  const created = iso(p.createdAt);

  return {
    id,
    /* A record written by content setup carries its text under `caption`. */
    name: str(p.name, str(p.caption, 'Untitled design')),
    platform,
    aspectRatio,
    canvasWidth: typeof p.canvasWidth === 'number' && p.canvasWidth > 0 ? p.canvasWidth : size.width,
    canvasHeight: typeof p.canvasHeight === 'number' && p.canvasHeight > 0 ? p.canvasHeight : size.height,
    background: (p.background && typeof p.background === 'object' ? p.background : DEFAULT_BG) as CanvasBackground,
    elements: Array.isArray(p.elements) ? (p.elements as CanvasElement[]) : [],
    status,
    thumbnail: typeof p.thumbnail === 'string' ? p.thumbnail : undefined,
    tags: Array.isArray(p.tags) ? (p.tags as unknown[]).filter((t): t is string => typeof t === 'string') : [],
    aiPrompt: typeof p.aiPrompt === 'string' ? p.aiPrompt : undefined,
    createdAt: created,
    updatedAt: iso(p.updatedAt ?? created),
  };
}

/** Every stored record, made openable. Anything with no id at all is dropped. */
export function normalisePosts(raw: unknown): DesignPost[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalisePost).filter((p): p is DesignPost => p !== null);
}
