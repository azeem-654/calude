/**
 * Blog Automation — the shapes.
 *
 * The module exists for one measurable thing: getting the customer's own site
 * ranking. Everything here is arranged around that, which is why the profile a
 * portfolio produces is not just "how do they write" but "what do they sell, to
 * whom, which pages have to rank, and what would someone type into Google to
 * find them". A blog that sounds right and ranks for nothing has failed.
 */

/* ── What the user gives us ── */

export type PortfolioKind = 'text' | 'file' | 'url' | 'site-page';

export interface PortfolioItem {
  id: string;
  kind: PortfolioKind;
  /** What to call it in the UI — a filename, a page name, a URL, or a snippet label. */
  label: string;
  /** The readable text this item contributed. */
  text: string;
  /** For `url` and `site-page`: where it lives, so a post can link to it. */
  url?: string;
  /** For `site-page`: the Website record it came from. */
  websiteId?: string;
  addedAt: string;
}

/* ── What we distil ── */

export type SearchIntent =
  /** "how do I…", "what is…" — the top of the funnel, where blogs win. */
  | 'informational'
  /** "best…", "X vs Y", "review" — comparing before buying. */
  | 'commercial'
  /** "buy", "pricing", "near me" — ready to act; usually a money page, not a post. */
  | 'transactional'
  /** The brand's own name. */
  | 'navigational';

export interface Keyword {
  term: string;
  intent: SearchIntent;
  /**
   * 0–100, how hard this looks to rank for *from what we can see* — length,
   * specificity and how commercial it is. It is a heuristic, not a search-volume
   * figure, and the UI says so rather than implying we queried Google.
   */
  difficulty: number;
  /** How often the portfolio itself talks about this. Evidence it is really theirs. */
  weight: number;
}

/**
 * A pillar plus the long-tail terms that support it.
 *
 * Clusters are the unit the planner will schedule against: one authoritative
 * pillar post and several supporting posts that link up to it, which is what
 * actually builds topical authority rather than a scatter of unrelated articles.
 */
export interface TopicCluster {
  id: string;
  pillar: string;
  keywords: Keyword[];
  /** The money page this cluster should send its link equity to. */
  targetPageId?: string;
}

/** A page that has to rank — a service, a product, the thing that earns. */
export interface MoneyPage {
  id: string;
  title: string;
  url: string;
  /** What it is for, in the user's words, so posts link to it in context. */
  purpose: string;
  /** The one term this page itself is trying to own. */
  primaryKeyword: string;
  websiteId?: string;
}

export interface VoiceProfile {
  /** Two or three words: "plain, direct, warm". */
  tone: string;
  /** Rough reading age, so posts match the audience rather than the writer. */
  readingLevel: 'plain' | 'standard' | 'technical';
  averageSentenceWords: number;
  /** Phrases the business actually uses, kept so posts sound like them. */
  signaturePhrases: string[];
  /** Words to keep out — jargon they avoid, or competitor names. */
  avoid: string[];
  /** First person plural, second person, and so on. */
  person: 'we' | 'i' | 'neutral';
}

export interface SeoProfile {
  /** What the business sells, in one sentence. */
  offering: string;
  /** Who it sells to. */
  audience: string;
  /** Where it sells — blank when it is not a local business. */
  location: string;
  /** Terms a competitor owns that are worth going after. */
  competitorTerms: string[];
}

export type ProfileSource = 'ai' | 'heuristic';

/**
 * One project's brain: everything later parts read from.
 *
 * `edited` records that a human has corrected it, so a regeneration never
 * silently overwrites their judgement.
 */
export interface BlogProject {
  id: string;
  name: string;
  /** The site whose ranking this project exists to improve. */
  websiteId?: string;
  domain: string;
  portfolio: PortfolioItem[];
  voice: VoiceProfile;
  seo: SeoProfile;
  clusters: TopicCluster[];
  moneyPages: MoneyPage[];
  /** Whether the profile came from the model or from reading the text. */
  profileSource: ProfileSource;
  /** Set when the AI was tried and failed, so the UI can say what happened. */
  profileNote?: string;
  edited: boolean;
  createdAt: string;
  updatedAt: string;
}

/** How complete a project is — shown as a checklist, not a percentage alone. */
export interface Readiness {
  hasPortfolio: boolean;
  hasOffering: boolean;
  hasMoneyPage: boolean;
  hasClusters: boolean;
  hasDomain: boolean;
  percent: number;
  /** The single next thing worth doing. */
  next: string;
}
