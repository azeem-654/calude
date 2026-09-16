/**
 * What this platform will and will not carry, decided in one place.
 *
 * ── Why the check is at the exits, not the keystrokes ──
 *
 * Content arrives here by too many routes to guard one at a time: somebody
 * types it, pastes it, imports it from their old site, or the AI writes it from
 * a brief. Guarding every entry means finding every entry, forever, and missing
 * the one added next month.
 *
 * So the check sits where content *leaves* — a send, a publish, a public page —
 * plus one entry that is worth judging on its own: the description of the
 * business itself, because an adult business does not need to write anything
 * explicit for the answer to be no.
 *
 * ── Why a weighted lexicon and not a word list ──
 *
 * A word list blocks real customers. A plumber writes "we drill hard into
 * concrete"; a security firm sells "escort services"; a butcher's site is full
 * of words about cutting flesh. Every one of them is a false positive that
 * looks, to the person it happens to, exactly like the product being broken —
 * and they do not complain, they leave.
 *
 * So terms carry weights and categories. A handful are conclusive alone. Most
 * are weak and mean nothing until several agree, and some are cancelled
 * outright by context: `escort` next to `security`, `vehicle` or `convoy` is a
 * different trade and scores nothing.
 *
 * ── Why the AI only ever runs second ──
 *
 * It costs money per call and it is slower than a send has patience for. The
 * lexicon is free and runs on everything; the AI is asked only about the
 * borderline, where its job is mostly to *clear* things the lexicon suspected.
 *
 * When it cannot be reached, the answer is `review`, never `allow`. Holding
 * something that turned out fine costs the owner one click; sending something
 * that turned out not to be cannot be undone.
 *
 * ── The one category with no approval path ──
 *
 * `illegal` — material sexualising children. It is blocked, never queued, and
 * its text is never put on a screen for somebody to weigh up. There is no
 * legitimate version of that decision to make.
 */

export type Category = 'adult' | 'violence' | 'politics' | 'hate' | 'illegal' | 'none';

/**
 * `allow` goes through. `review` is saved and held — not sent, not published —
 * until the owner decides. `block` is refused at the point it was attempted and
 * never reaches a queue.
 */
export type Verdict = 'allow' | 'review' | 'block';

export interface Screening {
  verdict: Verdict;
  category: Category;
  /** 0–100. The thresholds below are the whole of the policy. */
  score: number;
  /** Which terms fired. Kept so a bad rule can be found and argued with. */
  matched: string[];
  /** One sentence, written for the owner's queue rather than for a log. */
  reason: string;
}

/*
 * One number, and it is the policy.
 *
 * Reachable by one strong term, or by three weak ones agreeing.
 *
 * ── Why there is no "score so high it blocks" ──
 *
 * There was, and testing showed what it actually did: four adult terms in one
 * paragraph reached it by addition, so a plainly adult site was refused
 * outright with no approval path — on a platform whose owner had asked to see
 * exactly that and decide for himself. Accumulation measures how *much* of
 * something there is, and the decision here is about what *kind*.
 *
 * So `illegal` blocks, on its own, because there is no version of that decision
 * to make. Everything else is held for a person, however high it scores.
 */
const REVIEW_AT = 40;

interface Term {
  /** Matched as a whole word, or as a phrase when it contains a space. */
  word: string;
  cat: Category;
  weight: number;
  /**
   * Also matched against the de-spaced text, which catches `p o r n` and
   * `p-o-r-n`. Only for terms that are not substrings of ordinary words —
   * without that care, `anal` fires inside `analysis` every time.
   */
  squeeze?: boolean;
  /**
   * Words that make this one innocent. `escort` beside `security` is a trade,
   * `shoot` beside `video` or `photo` is a camera, `arms` beside `length` is a
   * body part. A cancelled term scores nothing at all rather than scoring less.
   */
  unless?: string[];
}

/*
 * The seed lexicon.
 *
 * Not exhaustive and not meant to be — exhaustive is unreachable, and chasing
 * it produces the brittle list this is trying not to be. It is meant to catch
 * the obvious with very few false positives, and hand everything ambiguous to
 * the AI pass, which is far better at nuance than any list can be.
 */
const TERMS: Term[] = [
  /* ── Sexual content. The strong ones are conclusive alone; nothing else in
        ordinary business writing looks like them. ── */
  { word: 'pornography', cat: 'adult', weight: 45, squeeze: true },
  { word: 'porn', cat: 'adult', weight: 45, squeeze: true },
  { word: 'xxx', cat: 'adult', weight: 30 },
  { word: 'hardcore sex', cat: 'adult', weight: 50 },
  { word: 'explicit sex', cat: 'adult', weight: 45 },
  { word: 'sexually explicit', cat: 'adult', weight: 50 },
  { word: 'nude photos', cat: 'adult', weight: 45 },
  { word: 'nudes', cat: 'adult', weight: 35 },
  { word: 'camgirl', cat: 'adult', weight: 50, squeeze: true },
  { word: 'cam girls', cat: 'adult', weight: 45 },
  { word: 'webcam girls', cat: 'adult', weight: 50 },
  { word: 'onlyfans', cat: 'adult', weight: 45, squeeze: true },
  { word: 'fetish', cat: 'adult', weight: 30 },
  { word: 'bdsm', cat: 'adult', weight: 35, squeeze: true },
  { word: 'hentai', cat: 'adult', weight: 50, squeeze: true },
  { word: 'sex toys', cat: 'adult', weight: 40 },
  { word: 'adult entertainment', cat: 'adult', weight: 35 },
  { word: 'adult video', cat: 'adult', weight: 40 },
  { word: 'strip club', cat: 'adult', weight: 35 },
  { word: 'brothel', cat: 'adult', weight: 45 },
  /* `escort` is the textbook false positive: security escorts, vehicle
     escorts, escorted tours, and a Ford. It needs company to mean anything. */
  { word: 'escort', cat: 'adult', weight: 20, unless: ['security', 'vehicle', 'convoy', 'ford', 'tour', 'medical', 'patient', 'funeral'] },
  { word: 'escort service', cat: 'adult', weight: 40, unless: ['security', 'vehicle', 'convoy', 'medical'] },
  { word: 'incall', cat: 'adult', weight: 30 },
  { word: 'outcall', cat: 'adult', weight: 25 },
  { word: 'erotic', cat: 'adult', weight: 30 },
  { word: 'nsfw', cat: 'adult', weight: 30, squeeze: true },
  { word: '18+', cat: 'adult', weight: 20 },
  { word: 'adults only', cat: 'adult', weight: 20 },
  /* Weak on their own. "Sexual health clinic" and "over 18s" are ordinary. */
  { word: 'sexual', cat: 'adult', weight: 10, unless: ['health', 'harassment', 'discrimination', 'assault', 'education', 'wellbeing', 'clinic'] },
  { word: 'lingerie', cat: 'adult', weight: 8 },
  { word: 'seductive', cat: 'adult', weight: 10 },

  /* ── Violence. The line is *glorified or instructional*, not *mentioned*.
        A butcher, a martial arts gym, a security firm and a news summary all
        use this vocabulary honestly, so almost everything here is weak. ── */
  { word: 'beheading', cat: 'violence', weight: 50, squeeze: true },
  { word: 'gore video', cat: 'violence', weight: 45 },
  { word: 'snuff film', cat: 'violence', weight: 50 },
  { word: 'torture porn', cat: 'violence', weight: 50 },
  { word: 'how to make a bomb', cat: 'violence', weight: 60 },
  { word: 'pipe bomb', cat: 'violence', weight: 50 },
  { word: 'mass shooting', cat: 'violence', weight: 30 },
  { word: 'kill yourself', cat: 'violence', weight: 45 },
  { word: 'mutilation', cat: 'violence', weight: 25, unless: ['genital', 'fgm', 'safeguarding', 'charity'] },
  { word: 'dismember', cat: 'violence', weight: 30 },
  { word: 'graphic violence', cat: 'violence', weight: 30 },
  /* `shoot` is a camera far more often than a gun in marketing copy. */
  { word: 'shoot', cat: 'violence', weight: 5, unless: ['photo', 'video', 'film', 'shoot out of', 'shoot up the charts', 'headshot', 'session'] },
  { word: 'weapons', cat: 'violence', weight: 8, unless: ['secret weapon', 'weapons-grade coffee'] },

  /* ── Political campaigning. Scoped narrowly on purpose.
        "Any mention of government" would hold every accountant writing about a
        tax change and every builder writing about planning permission. What is
        actually meant is electioneering: asking for a vote, a party, a
        candidate, a referendum. ── */
  { word: 'vote for', cat: 'politics', weight: 40 },
  { word: 'election campaign', cat: 'politics', weight: 40 },
  { word: 'political party', cat: 'politics', weight: 35 },
  { word: 'campaign rally', cat: 'politics', weight: 35 },
  { word: 'ballot', cat: 'politics', weight: 20, unless: ['ballot box prize', 'raffle'] },
  { word: 'referendum', cat: 'politics', weight: 30 },
  { word: 'candidate for', cat: 'politics', weight: 25, unless: ['candidate for the role', 'candidate for this job', 'ideal candidate'] },
  { word: 'polling station', cat: 'politics', weight: 35 },
  /* Weak on purpose. "The general election may change corporation tax" is an
     accountant doing their job, and scoring that alone held their newsletter.
     It means something next to `vote for` or `elect me`, and nothing without. */
  { word: 'general election', cat: 'politics', weight: 15 },
  { word: 'elect me', cat: 'politics', weight: 45 },
  { word: 'our manifesto', cat: 'politics', weight: 30 },
  { word: 'political donation', cat: 'politics', weight: 40 },

  /* ── Hate. Slurs are not listed here in the clear. What is listed is the
        *structure* of hateful copy, which is what marketing material actually
        looks like, and the AI pass handles the rest. ── */
  { word: 'racial superiority', cat: 'hate', weight: 60 },
  { word: 'ethnic cleansing', cat: 'hate', weight: 60 },
  { word: 'white power', cat: 'hate', weight: 55 },
  { word: 'holocaust denial', cat: 'hate', weight: 60 },
  { word: 'gas the', cat: 'hate', weight: 50 },
  { word: 'subhuman', cat: 'hate', weight: 50 },
  { word: 'deport them all', cat: 'hate', weight: 45 },

  /* ── Illegal. One match is the end of the conversation. ── */
  { word: 'child porn', cat: 'illegal', weight: 100, squeeze: true },
  { word: 'child pornography', cat: 'illegal', weight: 100, squeeze: true },
  { word: 'cp videos', cat: 'illegal', weight: 100 },
  { word: 'underage sex', cat: 'illegal', weight: 100 },
  { word: 'underage nude', cat: 'illegal', weight: 100 },
  /* The exemption is not politeness. `collapsed` turns `lollipop` into
     `lolipop`, which contains `loli` — so without this a sweet shop is accused
     of the worst thing on the list. */
  { word: 'loli', cat: 'illegal', weight: 100, squeeze: true, unless: ['lollipop', 'lolly', 'lollies'] },
  { word: 'jailbait', cat: 'illegal', weight: 100, squeeze: true },
  { word: 'preteen sex', cat: 'illegal', weight: 100 },
];

/**
 * Fold away the tricks, without folding away meaning.
 *
 * Accents, leetspeak digits and stretched letters are the cheap evasions, and
 * all three are reversible without touching honest writing: no real word needs
 * `p0rn`, and collapsing `sooo` to `soo` changes nothing anybody meant.
 */
function normalise(raw: string): string {
  return raw
    .normalize('NFD').replace(/\p{M}+/gu, '')
    .toLowerCase()
    /* Digits and symbols standing in for letters. Done before word matching so
       `pr0n` and `s3x` are seen as what they are. */
    .replace(/[0]/g, 'o').replace(/[1|!]/g, 'i').replace(/[3]/g, 'e')
    .replace(/[4@]/g, 'a').replace(/[5$]/g, 's').replace(/[7]/g, 't')
    /* Stretched letters: `pooorn`. Two survive, because real words have two. */
    .replace(/(.)\1{2,}/g, '$1$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Everything but letters and digits removed: catches `p o r n` and `p.o.r.n`. */
const squeezed = (s: string): string => s.replace(/[^a-z0-9]/g, '');

/**
 * Squeezed, then every run of a repeated letter cut to one.
 *
 * `normalise` leaves two of a stretched letter because real words have two, and
 * that was enough to defeat this entirely: `poooorn` became `poorn`, which
 * matches nothing. Cutting to one catches it.
 *
 * It is aggressive — `lollipop` becomes `lolipop` — so it is used only for
 * terms marked `squeeze`, and the term is collapsed the same way so both sides
 * agree. The damage it can still do is why `loli` carries the sweet-shop
 * exemption below.
 */
const collapsed = (s: string): string => squeezed(s).replace(/(.)\1+/g, '$1');

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Judge a piece of text on the lexicon alone.
 *
 * Pure, and deliberately so — no database, no network, no environment. That is
 * what makes the policy testable: every rule in the list above can be argued
 * with in a unit test, including the false positives it is supposed to let
 * through, which is the half that is usually never checked.
 */
export function screenText(raw: string): Screening {
  const text = normalise(String(raw ?? '').slice(0, 200_000));
  if (!text) return { verdict: 'allow', category: 'none', score: 0, matched: [], reason: '' };
  const flat = squeezed(text);
  const tight = collapsed(text);

  const scores: Record<string, number> = {};
  const matched: string[] = [];

  for (const t of TERMS) {
    const word = normalise(t.word);
    /* A phrase is matched as it stands; a single word gets boundaries, so
       `anal` cannot fire inside `analysis` and `arms` cannot fire inside
       `pharmaceutical`. */
    const re = word.includes(' ')
      ? new RegExp(escapeRe(word), 'g')
      : new RegExp(`\\b${escapeRe(word)}\\b`, 'g');

    let hit = re.test(text);
    /* The de-spaced passes are opt-in per term. Run on everything they would
       match `ass` inside `passenger list` and never stop. */
    if (!hit && t.squeeze) hit = flat.includes(squeezed(word)) || tight.includes(collapsed(word));
    if (!hit) continue;

    /* Context that makes it innocent. Checked against the ordinary text, since
       these are honest words that need no de-obfuscating. */
    if (t.unless?.some(u => text.includes(normalise(u)))) continue;

    scores[t.cat] = (scores[t.cat] ?? 0) + t.weight;
    matched.push(t.word);
  }

  if (!matched.length) return { verdict: 'allow', category: 'none', score: 0, matched: [], reason: '' };

  /* The worst category wins rather than the total. A little of four different
     things is not the same as a lot of one, and the owner needs to be told
     which one. */
  const [category, score] = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])[0] as [Category, number];
  const capped = Math.min(score, 100);

  const verdict: Verdict =
    category === 'illegal' ? 'block'
      : capped >= REVIEW_AT ? 'review'
        : 'allow';

  return { verdict, category, score: capped, matched, reason: reasonFor(category, verdict, matched) };
}

const LABEL: Record<Category, string> = {
  adult: 'sexual or adult content',
  violence: 'graphic violence',
  politics: 'political campaigning',
  hate: 'hateful content',
  illegal: 'material that sexualises children',
  none: 'nothing',
};

function reasonFor(cat: Category, verdict: Verdict, matched: string[]): string {
  const terms = matched.slice(0, 5).map(m => `"${m}"`).join(', ');
  if (verdict === 'block') {
    return cat === 'illegal'
      ? 'Refused: this reads as material that sexualises children. It is not held for review and it is not sent.'
      : `Refused: ${LABEL[cat]}. Matched ${terms}.`;
  }
  return `Held for review — this reads as ${LABEL[cat]}. Matched ${terms}.`;
}

/* ── The second pass ──────────────────────────────────────────────────────── */

export interface AiRuling {
  verdict: Verdict;
  category: Category;
  reason: string;
  /** False when the AI could not be reached, so the caller knows to stay held. */
  ran: boolean;
}

const AI_PROMPT = `You are the content policy reviewer for a business marketing platform.
A keyword filter flagged the text below. Keyword filters are blunt and you are
here mainly to CLEAR text it got wrong — ordinary trades use words like "drill",
"shoot" (a photo), "escort" (a vehicle or a patient) and "hard" innocently.

Decide one of:
- allow: ordinary business content, whatever words it happens to contain.
- review: genuinely adult, sexual, graphically violent, hateful, or political
  campaigning (asking for a vote, a party, a candidate, a referendum).
  Discussion of public policy by an ordinary business is NOT political
  campaigning.
- block: sexual content involving minors, or incitement to violence.

Answer with JSON only: {"verdict":"allow|review|block","category":"adult|violence|politics|hate|illegal|none","reason":"one short sentence"}`;

/**
 * Ask the AI about something the lexicon suspected.
 *
 * It can clear, confirm, or escalate — but it is never asked in the first
 * place unless the lexicon already scored the text, so it cannot be the thing
 * that lets everything through by answering `allow` to a question nobody
 * checked.
 */
export async function aiReview(apiKey: string, text: string): Promise<AiRuling> {
  const fail: AiRuling = { verdict: 'review', category: 'none', reason: '', ran: false };
  if (!apiKey) return fail;

  try {
    const { askGemini } = await import('./ai');
    /* Temperature 0: this is a ruling, not a piece of writing, and the same
       text must not be cleared on Monday and held on Tuesday. */
    const r = await askGemini(apiKey, `${AI_PROMPT}\n\n---\n${text.slice(0, 6000)}`, 0);
    if (!r.ok || !r.text) return fail;

    const m = r.text.match(/\{[\s\S]*\}/);
    if (!m) return fail;
    const parsed = JSON.parse(m[0]) as { verdict?: string; category?: string; reason?: string };

    const v = parsed.verdict === 'allow' ? 'allow' : parsed.verdict === 'block' ? 'block' : 'review';
    const cats: Category[] = ['adult', 'violence', 'politics', 'hate', 'illegal', 'none'];
    const c = cats.includes(parsed.category as Category) ? parsed.category as Category : 'none';
    return { verdict: v, category: c, reason: String(parsed.reason ?? '').slice(0, 300), ran: true };
  } catch {
    /* Unreachable, over quota, or answered with something that was not JSON.
       All three mean the same thing here: nobody cleared this, so it stays
       held. */
    return fail;
  }
}
