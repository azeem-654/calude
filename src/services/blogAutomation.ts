/**
 * Blog Automation — store and portfolio intake.
 *
 * Persists through the tenant-scoped `crm_*` keys, so a project belongs to the
 * sub-account that created it without this file knowing scoping exists.
 */
import type {
  BlogProject, PortfolioItem, PortfolioKind, Readiness,
} from '../types/blogAutomation';

const PROJECTS_KEY = 'crm_blog_projects';

/* ── Storage ── */

function load<T>(key: string): T[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(raw) ? (raw as T[]) : [];
  } catch { return []; }
}

/** Writes report failure rather than swallowing it. */
function save<T>(key: string, rows: T[]): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(rows));
    return true;
  } catch (err) {
    const quota = err instanceof DOMException
      && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    console.error(`Blog Automation could not save ${key}:`, err);
    lastSaveError = quota
      ? 'Your browser storage is full. Remove a portfolio item or an old project to free space — nothing new can be saved until you do.'
      : 'The browser refused to save this. Check that storage is not blocked for this site.';
    return false;
  }
}

let lastSaveError = '';

export function takeSaveError(): string {
  const err = lastSaveError;
  lastSaveError = '';
  return err;
}

export const loadProjects = (): BlogProject[] => load<BlogProject>(PROJECTS_KEY);
export const saveProjects = (rows: BlogProject[]): boolean => save(PROJECTS_KEY, rows);

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getProject(id: string): BlogProject | undefined {
  return loadProjects().find(p => p.id === id);
}

export function upsertProject(project: BlogProject): boolean {
  const rows = loadProjects();
  const i = rows.findIndex(p => p.id === project.id);
  const next = { ...project, updatedAt: new Date().toISOString() };
  if (i < 0) rows.unshift(next); else rows[i] = next;
  return saveProjects(rows);
}

export function deleteProject(id: string): boolean {
  return saveProjects(loadProjects().filter(p => p.id !== id));
}

/* ── Portfolio intake ── */

/**
 * What we can actually read.
 *
 * Only formats whose text can be extracted in the browser without a parser we
 * do not have. A PDF or a .docx would be accepted and then contribute nothing,
 * which is worse than refusing it — the profile would quietly be built from
 * less than the user thinks they gave it.
 */
export const READABLE_TYPES = ['.txt', '.md', '.markdown', '.html', '.htm', '.csv', '.json'];

/** 2 MB a file. The profile needs prose, not a database dump. */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
/** Beyond this the profile stops improving and storage starts hurting. */
export const MAX_TOTAL_CHARS = 400_000;

export interface UploadCheck {
  ok: boolean;
  error?: string;
}

export function validateUpload(file: File, currentChars: number): UploadCheck {
  const name = file.name.toLowerCase();
  const ext = name.slice(name.lastIndexOf('.'));
  if (!READABLE_TYPES.includes(ext)) {
    return {
      ok: false,
      error: `${file.name} is a ${ext || 'file with no extension'}. Readable formats are ${READABLE_TYPES.join(', ')} — paste the text instead and it will be used in full.`,
    };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 2 MB a file.` };
  }
  if (file.size === 0) {
    return { ok: false, error: `${file.name} is empty.` };
  }
  if (currentChars >= MAX_TOTAL_CHARS) {
    return { ok: false, error: 'The portfolio is already at its size limit. Remove something before adding more.' };
  }
  return { ok: true };
}

/**
 * HTML to readable text.
 *
 * Script and style contents are dropped rather than flattened into the prose —
 * otherwise a page's JavaScript ends up in the writing sample and the voice
 * profile learns from minified code.
 */
export function htmlToText(html: string): string {
  const tidy = (t: string) => t.replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  // DOMParser is the right tool and is what runs in the app. It does not exist
  // outside a browser, so there is a plain-text fallback rather than a throw —
  // the same function then works under a test runner or any later server pass.
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, noscript, svg, template').forEach(el => el.remove());
    return tidy(doc.body?.textContent ?? '');
  }
  return tidy(
    html
      .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>'),
  );
}

/** Read an accepted file into the text the profile is built from. */
export async function readPortfolioFile(file: File): Promise<string> {
  const raw = await file.text();
  const name = file.name.toLowerCase();
  if (name.endsWith('.html') || name.endsWith('.htm')) return htmlToText(raw);
  if (name.endsWith('.json')) {
    // Pull the strings out; a JSON export of a blog is mostly keys we do not want.
    try {
      const strings: string[] = [];
      const walk = (v: unknown) => {
        if (typeof v === 'string') { if (v.length > 40) strings.push(v); return; }
        if (Array.isArray(v)) { v.forEach(walk); return; }
        if (v && typeof v === 'object') Object.values(v).forEach(walk);
      };
      walk(JSON.parse(raw));
      return strings.join('\n\n');
    } catch { return raw; }
  }
  return raw;
}

export function makePortfolioItem(kind: PortfolioKind, label: string, text: string, extra: Partial<PortfolioItem> = {}): PortfolioItem {
  return {
    id: newId('pf'),
    kind,
    label: label.trim().slice(0, 140) || 'Untitled',
    // Trimmed to the budget so one enormous paste cannot crowd out everything else.
    text: text.trim().slice(0, MAX_TOTAL_CHARS),
    addedAt: new Date().toISOString(),
    ...extra,
  };
}

export const portfolioChars = (items: PortfolioItem[]): number =>
  items.reduce((n, i) => n + i.text.length, 0);

/* ── Readiness ── */

/**
 * What still needs doing, as a checklist with one clear next step.
 *
 * A bare percentage tells someone they are 60% ready without telling them what
 * the missing 40% is, which is the least useful possible form of the same
 * information.
 */
export function readiness(p: BlogProject): Readiness {
  const hasPortfolio = portfolioChars(p.portfolio) >= 400;
  const hasOffering = p.seo.offering.trim().length > 0;
  const hasMoneyPage = p.moneyPages.length > 0;
  const hasClusters = p.clusters.length > 0;
  const hasDomain = p.domain.trim().length > 0;

  const checks = [hasPortfolio, hasOffering, hasMoneyPage, hasClusters, hasDomain];
  const done = checks.filter(Boolean).length;

  const next = !hasPortfolio
    ? 'Add some of your existing writing — a few hundred words is enough to read a voice from.'
    : !hasOffering
      ? 'Say what the business sells and who it sells to.'
      : !hasClusters
        ? 'Build the topic clusters, so posts can be planned around them.'
        : !hasMoneyPage
          ? 'Add at least one page that has to rank — posts link to it, which is how the ranking moves.'
          : !hasDomain
            ? 'Set the domain the posts will publish to.'
            : 'Ready. The month planner comes next.';

  return {
    hasPortfolio, hasOffering, hasMoneyPage, hasClusters, hasDomain,
    percent: Math.round((done / checks.length) * 100),
    next,
  };
}

/** A blank project, so every field the rest of the module reads always exists. */
export function emptyProject(name: string): BlogProject {
  const now = new Date().toISOString();
  return {
    id: newId('blog'),
    name: name.trim().slice(0, 120) || 'Untitled project',
    domain: '',
    portfolio: [],
    voice: {
      tone: '', readingLevel: 'standard', averageSentenceWords: 18,
      signaturePhrases: [], avoid: [], person: 'we',
    },
    seo: { offering: '', audience: '', location: '', competitorTerms: [] },
    clusters: [],
    moneyPages: [],
    profileSource: 'heuristic',
    edited: false,
    createdAt: now,
    updatedAt: now,
  };
}
