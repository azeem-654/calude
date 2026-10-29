/**
 * The AI writes a template's words — within the template's limits, from the
 * business's own details, and never its facts.
 *
 * It is asked only for framing words (eyebrow, headline, supporting line,
 * button, points, carousel slides, the caption). Offers, prices, dates,
 * reviews and contact details are not in what it may write, and every line
 * it returns goes through `guardFacts`: a number, a price or a claim word
 * the business did not give us sends that line back to the rule-written one.
 * The call goes through /api/ai.php like every browser AI call — counted
 * against the plan's AI requests, and refused there if it carries patient
 * information.
 */
import { askGeminiJson, hasGeminiKey } from '../../../lib/gemini';
import { clip, factsOf, guardFacts, ruleCopy, type Business } from '../../../../worker/src/lib/design/content';
import { OBJECTIVES, type DesignContent, type ObjectiveId, type TemplateSpec } from '../../../../worker/src/lib/design/spec';

export interface CopyResult { content: DesignContent; caption: string; hashtags: string[]; by: 'ai' | 'rules'; refused: string[]; note?: string }

const slotsOf = (tpl: TemplateSpec) => {
  const layers = tpl.pages ? [...tpl.pages.cover.layers, ...tpl.pages.slide.layers, ...tpl.pages.end.layers] : tpl.layers;
  return new Set(layers.flatMap(l => ('slot' in l && l.slot ? [l.slot] : [])));
};

export async function writeCopy(tpl: TemplateSpec, b: Business, objective: ObjectiveId, topic: string, fill: Partial<DesignContent> = {}): Promise<CopyResult> {
  const rules = { ...ruleCopy(tpl, b, objective, topic), ...fill };
  const base: CopyResult = { content: rules, caption: rules.subhead || rules.headline || '', hashtags: [], by: 'rules', refused: [] };
  if (!hasGeminiKey()) return { ...base, note: 'AI is not available here, so the words were written from your business details. Edit any of them.' };
  const slots = slotsOf(tpl);
  const want = (['eyebrow', 'headline', 'subhead', 'cta'] as const).filter(k => slots.has(k));
  const wantPoints = slots.has('points');
  const wantSlides = !!tpl.pages;
  const wantOccasion = slots.has('occasion') && !fill.occasion;
  const L = tpl.limits;
  const obj = OBJECTIVES.find(o => o.id === objective)?.label ?? objective;
  const prompt = `You write the words for one social media graphic. They are set inside a fixed design, so keep strictly to the character limits.

BUSINESS (the only facts you may use):
Name: ${b.name || '(not given)'}
Industry: ${b.industry || '(not given)'}
What they do: ${b.description || '(not given)'}
Services or products: ${b.services.join('; ') || '(not given)'}
${fill.offer ? `Offer the customer typed: ${fill.offer}` : 'No offer was given.'}

THE POST: ${topic || '(no topic given — choose one from what the business does)'}
GOAL: ${obj}
DESIGN: "${tpl.name}" — ${tpl.description}

RULES — breaking any of these makes the line unusable:
- Never invent facts: no numbers, prices, percentages, discounts, dates, years in business, ratings, reviews, awards, certifications, guarantees, "licensed", "insured", "best", "#1", or results — unless they appear word for word in BUSINESS above.
- Never write a testimonial or quote anybody.
- Plain, confident, specific to this business. No hashtags in the headline, no emoji, no exclamation marks in the headline.

Return ONLY JSON:
{${want.map(k => `"${k}": "max ${L[k] ?? 60} chars"`).join(', ')}${wantPoints ? `, "points": ["3 short points about what the business really offers, max ${L.point ?? 44} chars each"]` : ''}${wantSlides ? `, "slides": [{"title": "max ${L.slideTitle ?? 44} chars", "body": "max ${L.slideBody ?? 180} chars"}  ×3 to 5, each one useful tip or step]` : ''}${wantOccasion ? ', "occasion": "the greeting, max 28 chars"' : ''}, "caption": "the post caption, 1–3 short sentences, max 300 chars", "hashtags": ["4 to 6 relevant hashtags without #"]}`;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(await askGeminiJson(prompt, 0.75)) as Record<string, unknown>;
  } catch (e) {
    const why = (e instanceof Error ? e.message : '').replace(/^Gemini API error \(\d+\):\s*/i, '').trim();
    return { ...base, note: `AI writing is not available just now${why ? ` (${why.replace(/\.$/, '')})` : ''}, so the words were written from your business details. Edit any of them.` };
  }
  const facts = factsOf(b, fill);
  const refused: string[] = [];
  const out: DesignContent = { ...rules };
  const take = (k: keyof DesignContent & string, max: number) => {
    const v = typeof raw[k] === 'string' ? clip(String(raw[k]), max) : '';
    if (!v) return;
    if (guardFacts(v, facts)) (out as Record<string, unknown>)[k] = v;
    else refused.push(v);
  };
  for (const k of want) take(k, L[k] ?? 60);
  if (wantOccasion) take('occasion', L.occasion ?? 28);
  if (wantPoints && Array.isArray(raw.points)) {
    const pts = (raw.points as unknown[]).map(p => clip(String(p ?? ''), L.point ?? 44)).filter(Boolean);
    const ok = pts.filter(p => guardFacts(p, facts));
    refused.push(...pts.filter(p => !ok.includes(p)));
    if (ok.length >= 2) out.points = ok.slice(0, 4);
  }
  if (wantSlides && Array.isArray(raw.slides)) {
    const sl = (raw.slides as { title?: unknown; body?: unknown }[]).map(x => ({ title: clip(String(x?.title ?? ''), L.slideTitle ?? 44), body: clip(String(x?.body ?? ''), L.slideBody ?? 180) })).filter(x => x.title);
    const ok = sl.filter(x => guardFacts(`${x.title} ${x.body}`, facts));
    refused.push(...sl.filter(x => !ok.includes(x)).map(x => x.title));
    if (ok.length) out.slides = ok.slice(0, 6);
  }
  const cap = typeof raw.caption === 'string' ? clip(raw.caption, 300) : '';
  const caption = cap && guardFacts(cap, facts) ? cap : base.caption;
  if (cap && caption !== cap) refused.push(cap);
  const hashtags = Array.isArray(raw.hashtags) ? (raw.hashtags as unknown[]).map(h => String(h ?? '').replace(/[^\p{L}\p{N}_]/gu, '')).filter(h => h.length > 1 && h.length < 30).slice(0, 6) : [];
  return {
    content: { ...out, ...fill }, caption, hashtags, by: 'ai', refused,
    note: refused.length ? `${refused.length} line${refused.length === 1 ? '' : 's'} the AI wrote mentioned something your business details do not say (a number, price or claim), so ${refused.length === 1 ? 'it was' : 'they were'} replaced.` : undefined,
  };
}
