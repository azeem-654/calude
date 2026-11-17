/**
 * Takes invented proof out of a page block before a customer ever sees it.
 *
 * The funnel builder's templates were written as showcase pages: named
 * five-star quotes, "Join 25K+ companies", "$2.1B processed", "4.9/5". Put on a
 * customer's page they become claims about the customer's business that nobody
 * made — the house rule is no invented figures, reviews or testimonials on a
 * customer screen (CLAUDE.md), and a public funnel would publish them
 * (audit M7, 2026-11-16). Rewriting every template by hand would lose their
 * layout; this keeps the layout and empties the proof:
 *
 * - reviews become placeholder slots (no stars, "Placeholder"), which the
 *   renderers draw as slots and publishing drops (routes/published.ts);
 * - a stats row keeps its labels and asks for the customer's own figure;
 * - any sentence in the copy that states a count, a share, a sum or an award
 *   is removed.
 */
import type { FunnelBlock } from '../../types';

const CLAIM = new RegExp([
  String.raw`\d[\d,.]*\s*(\+|[KkMB]\b|%|x\b|\/5\b)`,             // 25K+, 99.9%, 3x, 4.9/5
  String.raw`\$\s?\d[\d,.]*\s*[KkMB]\b`,                           // $2.1B
  String.raw`\b(over|more than|trusted by|join)\s+\d`,             // over 10,000
  String.raw`\b\d[\d,]*\s+(companies|customers|clients|users|members|students|businesses|brands|teams|people|families|homes|projects|agencies|reviews)\b`,
  String.raw`\b(award[- ]winning|#1|number one|top[- ]rated|world[- ]class|best[- ]in[- ]class|since (19|20)\d\d)\b`,
].join('|'), 'i');

/** The text with every sentence that makes such a claim taken out. */
export function scrubClaims(text: string | undefined): string | undefined {
  if (!text || !CLAIM.test(text)) return text;
  return text.split(/(?<=[.!?])\s+/).filter(s => !CLAIM.test(s)).join(' ').trim();
}

const slot = (i: number) => ({
  quote: i === 0 ? 'Paste a real review here.' : 'Another real review — or delete this one.',
  author: 'Customer name', role: 'Placeholder — replace or delete', stars: 0, placeholder: true,
});

export function scrubInvented(block: FunnelBlock): FunnelBlock {
  const s = { ...(block.settings ?? {}) } as NonNullable<FunnelBlock['settings']> & Record<string, unknown>;
  if (Array.isArray(s.testimonialItems)) {
    s.testimonialItems = s.testimonialItems.map((t, i) => (t.placeholder ? t : slot(i)));
    if (s.subtitle && CLAIM.test(String(s.subtitle))) s.subtitle = 'What customers say';
    if (/thousands|loved by|millions/i.test(String(s.subtitle ?? ''))) s.subtitle = 'What customers say';
  }
  if (Array.isArray(s.statItems)) s.statItems = s.statItems.map(x => ({ ...x, value: 'Your figure' }));
  for (const k of ['subheading', 'subtitle', 'description'] as const) {
    if (typeof s[k] === 'string') (s as Record<string, unknown>)[k] = scrubClaims(s[k] as string);
  }
  if (Array.isArray(s.featureItems)) s.featureItems = s.featureItems.map(f => ({ ...f, desc: scrubClaims(f.desc) ?? '' }));
  if (Array.isArray(s.listItems)) s.listItems = s.listItems.filter(l => !CLAIM.test(String(l)));
  return { ...block, content: scrubClaims(block.content) ?? block.content, settings: s };
}
