/**
 * The drafts AI Autopilot writes, and where they land.
 *
 * ── Why this file exists ──
 *
 * `worker/src/autopilotTick.ts` writes a finished blog post into `crm_blog_posts`
 * every time its content play runs, and marks the action Done with a link to
 * "/blog-automation". Nothing on the client had ever read that key. The
 * customer was told a post had been written, followed the link, and found an
 * empty screen — the worst failure this codebase has a rule against, because
 * the record genuinely existed and the app said it did not.
 *
 * The Blog module is built around *projects*: a portfolio, a ranking strategy,
 * a month plan, a write desk. Autopilot does not produce any of that — it
 * produces one finished post at a time, on its own schedule, from the brand
 * brief. The two are not the same object and pretending otherwise would mean
 * inventing a project with an empty strategy behind every draft.
 *
 * So they are kept as what they are and shown as what they are: loose drafts,
 * in their own section, clearly labelled with what made them.
 */
import type { ContentSource } from '../types/provenance';

const POSTS_KEY = 'crm_blog_posts';

export interface AutopilotPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  keywords: string[];
  status: string;
  source?: ContentSource;
  createdAt: string;
  updatedAt?: string;
}

function load(): AutopilotPost[] {
  try {
    const raw = JSON.parse(localStorage.getItem(POSTS_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    /* Written by the Worker, so every field is defended rather than trusted —
       a draft missing a body should render as an empty draft, not a crash that
       takes the whole Blog screen with it. */
    return raw.map((r: Record<string, unknown>) => ({
      id: String(r.id ?? ''),
      title: String(r.title ?? 'Untitled draft'),
      slug: String(r.slug ?? ''),
      excerpt: String(r.excerpt ?? ''),
      body: String(r.body ?? ''),
      keywords: Array.isArray(r.keywords) ? r.keywords.map(String) : [],
      status: String(r.status ?? 'draft'),
      source: r.source as ContentSource | undefined,
      createdAt: String(r.createdAt ?? ''),
      updatedAt: r.updatedAt ? String(r.updatedAt) : undefined,
    })).filter(p => p.id);
  } catch { return []; }
}

function save(rows: AutopilotPost[]): boolean {
  try { localStorage.setItem(POSTS_KEY, JSON.stringify(rows)); return true; } catch { return false; }
}

export const loadAutopilotPosts = (): AutopilotPost[] => load();

export function deleteAutopilotPost(id: string): boolean {
  return save(load().filter(p => p.id !== id));
}

export function updateAutopilotPost(id: string, patch: Partial<AutopilotPost>): boolean {
  return save(load().map(p => (p.id === id
    ? { ...p, ...patch, updatedAt: new Date().toISOString() }
    : p)));
}

/** The draft as a file somebody can paste into whatever publishes their site. */
export function draftAsMarkdown(p: AutopilotPost): string {
  const head = [
    `# ${p.title}`,
    p.excerpt ? `\n_${p.excerpt}_` : '',
    p.keywords.length ? `\n**Keywords:** ${p.keywords.join(', ')}` : '',
  ].filter(Boolean).join('\n');
  return `${head}\n\n${p.body}\n`;
}
