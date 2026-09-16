/**
 * The gate every send and every publish passes through.
 *
 * `moderation.ts` decides what text *is*. This decides what happens to it: who
 * has already ruled on it, whether the account is still in good standing, and
 * what the customer is told. It is the only part that touches the database, so
 * the policy itself stays pure and testable.
 *
 * ── A decision is remembered, not re-taken ──
 *
 * Keyed on the workspace and a fingerprint of the words. The same body offered
 * again — resent, rescheduled, published to a second channel — is the same
 * decision, so the owner is asked once. That is also what stops the AI pass
 * being charged for on every retry of a campaign going out to four thousand
 * people.
 *
 * ── Held means held ──
 *
 * The caller gets `ok: false` and a sentence to show. What it must not do is
 * report the send as successful, or mark the campaign as sent, or stamp the
 * record as done — the whole point of a hold is that it is visible. Every call
 * site below returns the message rather than swallowing it.
 */
import { aiReview, screenText, type Category, type Verdict } from './moderation';
import { nowIso, type Env } from './db';

export type Surface =
  | 'email' | 'sms' | 'blog' | 'website' | 'product' | 'shop' | 'social' | 'portfolio' | 'reply';

export interface GateResult {
  /** True when the caller may go ahead. Everything else is a stop. */
  ok: boolean;
  verdict: Verdict | 'suspended';
  category: Category;
  /** Shown to the customer. Written for them, not for a log. */
  message: string;
  /** The queue row, when one was made. Empty otherwise. */
  reviewId: string;
}

const pass: GateResult = { ok: true, verdict: 'allow', category: 'none', message: '', reviewId: '' };

const rid = () => `rev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * A fingerprint of the words, not of the bytes.
 *
 * Case, spacing and surrounding punctuation change constantly as somebody edits
 * a campaign; the decision should not be re-taken because a comma moved. What
 * is *not* folded away is the wording itself, so genuinely new copy is a new
 * question.
 */
async function fingerprint(text: string): Promise<string> {
  const norm = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(norm));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface Standing {
  state: 'ok' | 'warned' | 'suspended';
  reason: string;
  clause: string;
}

const GOOD: Standing = { state: 'ok', reason: '', clause: '' };

/** What became of an account. A missing row is good standing, never a silent stop. */
export async function standingFor(env: Env, email: string): Promise<Standing> {
  if (!email) return GOOD;
  const row = await env.DB.prepare('SELECT state, reason, clause FROM crm_account_standing WHERE email = ?')
    .bind(email.toLowerCase()).first<{ state: string; reason: string; clause: string }>();
  if (!row) return GOOD;
  return {
    state: row.state === 'suspended' ? 'suspended' : row.state === 'warned' ? 'warned' : 'ok',
    reason: row.reason ?? '',
    clause: row.clause ?? '',
  };
}

/** Whose account a workspace is. Standing follows the person, not the workspace. */
async function ownerOf(env: Env, accountId: string): Promise<string> {
  const row = await env.DB.prepare('SELECT owner_email FROM crm_workspaces WHERE account_id = ?')
    .bind(accountId).first<{ owner_email: string }>();
  return row?.owner_email ?? '';
}

/**
 * Screen one piece of content on its way out.
 *
 * `text` should be everything a reader would see — subject *and* body, name
 * *and* description. Screening the body alone leaves the subject line as an
 * unguarded place to put anything.
 */
export async function gate(
  env: Env, accountId: string, surface: Surface, text: string,
): Promise<GateResult> {
  const owner = await ownerOf(env, accountId);

  /*
   * Standing first, before the words are even looked at.
   *
   * A suspended account is not having its copy judged — it is not sending. And
   * this has to be here rather than in the UI: the scheduled tick sends without
   * anybody's browser being open, so a check that lives on a screen is not a
   * check at all.
   */
  const standing = await standingFor(env, owner);
  if (standing.state === 'suspended') {
    return {
      ok: false, verdict: 'suspended', category: 'none', reviewId: '',
      message: standing.reason
        ? `This account is suspended and cannot send or publish. ${standing.reason}`
        : 'This account is suspended and cannot send or publish. Contact support.',
    };
  }

  const ruling = screenText(text);
  if (ruling.verdict === 'allow') return pass;

  const hash = await fingerprint(text);

  /* Already ruled on. The owner is asked once per piece of writing. */
  const prior = await env.DB.prepare(
    'SELECT id, status, note FROM crm_content_reviews WHERE account_id = ? AND subject_hash = ?',
  ).bind(accountId, hash).first<{ id: string; status: string; note: string }>();

  if (prior?.status === 'approved') return pass;
  if (prior?.status === 'rejected') {
    return {
      ok: false, verdict: 'block', category: ruling.category, reviewId: prior.id,
      message: prior.note
        ? `This content was reviewed and not approved. ${prior.note}`
        : 'This content was reviewed and not approved for sending.',
    };
  }
  if (prior?.status === 'held') {
    return {
      ok: false, verdict: 'review', category: ruling.category, reviewId: prior.id,
      message: 'This is waiting to be reviewed. It has not been sent, and it will go out once it is approved.',
    };
  }

  /*
   * Refused outright, and the text is not kept.
   *
   * A row is still written, because the owner deciding whether to suspend an
   * account needs to know an attempt was made — but with an empty excerpt.
   * Nobody is being asked to weigh this up, so nobody needs it on a screen.
   */
  if (ruling.verdict === 'block') {
    const id = rid();
    await env.DB.prepare(
      `INSERT INTO crm_content_reviews
         (id, account_id, surface, subject_hash, excerpt, category, matched, score, status, decided_by, decided_at, note, created_at)
       VALUES (?,?,?,?,'',?,?,?,'rejected','system',?,'Refused automatically. Not shown and not approvable.',?)`,
    ).bind(id, accountId, surface, hash, ruling.category, ruling.matched.join(', '), ruling.score, nowIso(), nowIso()).run();
    return { ok: false, verdict: 'block', category: ruling.category, reviewId: id, message: ruling.reason };
  }

  /*
   * The second pass, and the one thing it is mostly for: clearing what the
   * lexicon got wrong. An `allow` here is written down as approved so the same
   * copy is never paid for twice.
   */
  const { loadAiKey } = await import('./ai');
  const key = await loadAiKey(env, accountId);
  const ai = await aiReview(key ?? '', text);

  if (ai.ran && ai.verdict === 'allow') {
    const id = rid();
    await env.DB.prepare(
      `INSERT INTO crm_content_reviews
         (id, account_id, surface, subject_hash, excerpt, category, matched, score, ai_verdict, ai_reason, status, decided_by, decided_at, note, created_at)
       VALUES (?,?,?,?,?,?,?,?,'allow',?,'approved','ai',?,'Cleared on review — the keyword match was not what it looked like.',?)`,
    ).bind(id, accountId, surface, hash, text.slice(0, 4000), ruling.category,
      ruling.matched.join(', '), ruling.score, ai.reason, nowIso(), nowIso()).run();
    return pass;
  }

  const id = rid();
  await env.DB.prepare(
    `INSERT INTO crm_content_reviews
       (id, account_id, surface, subject_hash, excerpt, category, matched, score, ai_verdict, ai_reason, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,'held',?)`,
  ).bind(
    id, accountId, surface, hash, text.slice(0, 4000),
    ai.ran && ai.category !== 'none' ? ai.category : ruling.category,
    ruling.matched.join(', '), ruling.score,
    ai.ran ? ai.verdict : '', ai.ran ? ai.reason : '', nowIso(),
  ).run();

  return {
    ok: false, verdict: 'review', category: ruling.category, reviewId: id,
    /*
     * Said plainly, and without pretending it went out.
     *
     * The alternative — quietly dropping it and reporting success — is the
     * thing this codebase exists not to do: the customer finds out when nobody
     * replies to a campaign they believe they sent.
     */
    message: 'Held for review before it goes out. Somebody will look at it shortly, and it will send once approved.',
  };
}
