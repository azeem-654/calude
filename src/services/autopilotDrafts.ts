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
  /** For the search result. Absent from drafts written before 2026-11. */
  metaDescription?: string;
  /** Free photos from Openverse (worker/src/lib/blogPictures.ts): a cover, and the ones placed in the body. */
  images?: DraftPicture[];
}

export interface DraftPicture {
  id: string;
  role: 'cover' | 'inline';
  url: string;
  alt: string;
  creator: string;
  license: string;
  landing: string;
  provider: string;
}

/* Only an address a picture can be drawn from — the Worker wrote these, but a
   stored row is still a claim, and an <img> is not where to find out. */
export const safePictureUrl = (u: string): boolean => /^(https?:\/\/|\/api\/media\.php\?)/i.test(u);

function pictures(raw: unknown): DraftPicture[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r: Record<string, unknown>) => ({
    id: String(r?.id ?? ''), role: r?.role === 'cover' ? 'cover' as const : 'inline' as const,
    url: String(r?.url ?? ''), alt: String(r?.alt ?? ''), creator: String(r?.creator ?? ''),
    license: String(r?.license ?? ''), landing: String(r?.landing ?? ''), provider: String(r?.provider ?? ''),
  })).filter(p => p.url && safePictureUrl(p.url));
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
      metaDescription: r.metaDescription ? String(r.metaDescription) : undefined,
      images: pictures(r.images),
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
    p.metaDescription ? `\n**Meta description:** ${p.metaDescription}` : '',
    p.keywords.length ? `\n**Keywords:** ${p.keywords.join(', ')}` : '',
  ].filter(Boolean).join('\n');
  /* The cover goes first in a copy: wherever this is pasted, it is the
     picture to set as the featured image. Absolute, so it loads there. */
  const cover = p.images?.find(i => i.role === 'cover');
  const abs = (u: string) => (u.startsWith('/') ? `${location.origin}${u}` : u);
  const coverLine = cover ? `\n\n![${cover.alt}](${abs(cover.url)})` : '';
  return `${head}${coverLine}\n\n${p.body.replace(/\]\((\/api\/media\.php\?[^)]+)\)/g, (_m, u: string) => `](${abs(u)})`)}\n`;
}

/* ── The body, as blocks a screen can draw without rendering HTML ── */

export type DraftBlock =
  | { kind: 'h2' | 'h3' | 'p' | 'quote'; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'img'; url: string; alt: string; caption: string };

/**
 * The Markdown a draft is stored as, split into the few shapes the writer
 * produces. React draws each one as text, so nothing here needs sanitising —
 * the reason this is not a Markdown-to-HTML renderer.
 */
export function draftBlocks(md: string): DraftBlock[] {
  const out: DraftBlock[] = [];
  const lines = md.replace(/\r/g, '').split('\n');
  let para: string[] = [];
  let list: { kind: 'ul' | 'ol'; items: string[] } | null = null;
  const flush = () => {
    if (para.length) out.push({ kind: 'p', text: para.join(' ') });
    if (list) out.push(list);
    para = []; list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) { flush(); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) { flush(); out.push({ kind: h[1].length >= 3 ? 'h3' : 'h2', text: h[2] }); continue; }
    const img = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(t);
    if (img) {
      flush();
      const cap = /^\*(.+)\*$/.exec((lines[i + 1] ?? '').trim());
      if (cap) i++;
      if (safePictureUrl(img[2])) out.push({ kind: 'img', url: img[2], alt: img[1], caption: cap ? cap[1] : '' });
      continue;
    }
    const ul = /^[-*+]\s+(.*)$/.exec(t);
    const ol = /^\d+[.)]\s+(.*)$/.exec(t);
    if (ul || ol) {
      if (para.length) { out.push({ kind: 'p', text: para.join(' ') }); para = []; }
      const kind = ul ? 'ul' : 'ol';
      if (list && list.kind !== kind) { out.push(list); list = null; }
      if (!list) list = { kind, items: [] };
      list.items.push((ul ?? ol)![1]);
      continue;
    }
    if (t.startsWith('>')) { flush(); out.push({ kind: 'quote', text: t.replace(/^>\s?/, '') }); continue; }
    if (list) { list.items[list.items.length - 1] += ` ${t}`; continue; }
    para.push(t);
  }
  flush();
  return out;
}
