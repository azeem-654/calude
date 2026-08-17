/**
 * Objective in, plan out.
 *
 * "Find 500 dental clinics in Texas with more than one location, email them,
 * follow up three times, then try SMS" is a complete brief to a person and
 * nothing at all to a program. This turns it into the structured thing the rest
 * of the module works from: who to reach, what is being offered, on which
 * channels, how often, and when to stop.
 *
 * Two rules run through the whole file.
 *
 * It never invents a fact the objective did not contain. If no number of
 * prospects was given, the plan carries a stated default and says so in its
 * reasoning — it does not quietly decide on five hundred. The same goes for
 * price, location and industry: absent means absent, and the plan says which
 * parts it had to assume.
 *
 * It never claims a model wrote something a regular expression did. Every plan
 * records whether it came from the AI or the fallback, and the screen says which
 * — because "the AI decided to target multi-location clinics" is a much stronger
 * claim than "the word 'multi-location' appeared in your sentence", and a user
 * deciding how much to trust the plan needs to know which one happened.
 */
import { getGeminiKey } from '../lib/gemini';
import type { AIChannel, AIStrategy } from '../types/aiSalesAgent';

const MODEL = 'gemini-2.0-flash';

/** Sensible when the objective is silent, and always declared as a default. */
export const DEFAULTS = {
  targetCount: 100,
  followUps: 2,
  intervalDays: 3,
};

/* ── Reading the sentence ──────────────────────────────────────────────── */

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20, fifty: 50,
  hundred: 100, thousand: 1000,
};

function toNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const word = WORD_NUMBERS[raw.trim().toLowerCase()];
  if (word !== undefined) return word;
  const n = Number(raw.replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

const NUM = '(\\d[\\d,]*|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|fifty|hundred|thousand)';

export interface ObjectiveReading {
  targetCount: number | null;
  /** What the money in the sentence was, verbatim — never reformatted. */
  priceHint: string | null;
  offer: string | null;
  industry: string | null;
  location: string | null;
  sizeHint: string | null;
  channels: AIChannel[];
  followUps: number | null;
  intervalDays: number | null;
  wantsMeetings: boolean;
}

/**
 * Pull out what the sentence actually says. Anything it cannot find comes back
 * null, which is the difference between "the user asked for 500" and "we
 * guessed 500" — and the caller has to decide which it is telling the user.
 */
export function readObjective(text: string): ObjectiveReading {
  const s = ` ${text.replace(/\s+/g, ' ').trim()} `;
  const lower = s.toLowerCase();

  /* Money first, so its digits cannot be mistaken for a prospect count. A
     figure is money when it carries a currency mark or a per-period phrase. */
  /* The period is part of the price. "$3,000" and "$3,000/month" are different
     offers, and showing the first when the user wrote the second misstates what
     is being sold. */
  const PERIOD = '(?:\\s?(?:a|per|\\/)\\s?(?:month|year|week|mo|yr))';
  /* The figure ends on a digit. Letting it end on punctuation swallowed the
     comma in "at $49, follow up three times" — which was then printed as the
     price, and left "at  follow" behind for the offer to trip over. */
  const AMOUNT = '\\d(?:[\\d,]*\\d)?(?:\\.\\d{1,2})?';
  const money = s.match(new RegExp(`([£$€]\\s?${AMOUNT}(?:\\s?[km])?${PERIOD}?)|(${AMOUNT}${PERIOD})`, 'i'));
  /* Sentence punctuation is not part of the price. "at $49, follow up three
     times" was reading as "$49," and printing the comma back on screen. */
  const priceHint = money ? money[0].trim() : null;
  const withoutMoney = money ? s.replace(money[0], ' ') : s;

  /* Counts attached to a cadence are not prospect counts. */
  const cadenceSpans = [...withoutMoney.matchAll(new RegExp(`(?:every|each)\\s+${NUM}\\s*(?:day|week|business day)`, 'gi'))]
    .concat([...withoutMoney.matchAll(new RegExp(`${NUM}\\s*(?:times|follow[- ]?ups?|days?|weeks?)`, 'gi'))]);
  let hunting = withoutMoney;
  for (const m of cadenceSpans) hunting = hunting.replace(m[0], ' ');

  const countMatch = hunting.match(new RegExp(`\\b${NUM}\\b`, 'i'));
  const rawCount = toNumber(countMatch?.[1]);
  const targetCount = rawCount !== null && rawCount >= 2 ? Math.round(rawCount) : null;

  /* Follow-ups: "follow up three times", "three follow-ups", "3 more emails". */
  const fu = lower.match(new RegExp(`follow(?:ing)?[- ]?up[^.]{0,24}?${NUM}\\s*(?:times|more)`, 'i'))
    || lower.match(new RegExp(`${NUM}\\s*follow[- ]?ups?`, 'i'))
    || lower.match(new RegExp(`follow(?:ing)?[- ]?up\\s+${NUM}\\s*times`, 'i'));
  const followUps = fu ? toNumber(fu[1]) : null;

  const iv = lower.match(new RegExp(`every\\s+${NUM}\\s*(day|week)`, 'i'))
    || lower.match(new RegExp(`${NUM}\\s*(day|week)s?\\s*(?:apart|between|later|gap)`, 'i'));
  const intervalDays = iv ? (toNumber(iv[1]) ?? null) === null ? null
    : (iv[2].toLowerCase().startsWith('week') ? (toNumber(iv[1]) as number) * 7 : toNumber(iv[1]) as number)
    : null;

  const channels: AIChannel[] = [];
  if (/\b(e-?mail|inbox|newsletter)/i.test(s)) channels.push('email');
  if (/\b(sms|text message|texts?\b|whatsapp)/i.test(s)) channels.push('sms');
  const wantsMeetings = /\b(meeting|appointment|call|demo|book|calendar|consultation)/i.test(s);
  if (wantsMeetings) channels.push('calendar');
  if (channels.length === 0) channels.push('email');

  /* "in Texas", "in the West Midlands" — a proper noun after "in". */
  const loc = s.match(/\bin\s+((?:the\s+)?[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,3})/);
  const location = loc ? loc[1].trim() : null;

  /* The thing being sold, when the sentence says "our X service/offer". */
  /* Matched against the price-stripped text: capturing "$3,000/month marketing
     service" as the offer and then printing "at $3,000/month" after it says the
     price twice in one sentence. */
  const offerMatch = withoutMoney.match(/\b(?:our|a|the)\s+([\w\s+-]{2,40}?)\s+(service|offer|package|programme|program|plan|retainer)\b/i);
  /* "email them about a free new patient check-up" names the offer just as
     plainly as "our marketing service" does, and it is how most people write
     it. Without this the plan fell back to the words "The offer named in the
     objective", which then went out in the actual emails. */
  const aboutMatch = withoutMoney.match(
    /\b(?:about|offering|promoting|selling|to sell)\s+((?:a|an|our|the)\s+)?([a-z][\w'-]*(?:\s+[a-z][\w'-]*){0,6})/i);
  const about = aboutMatch
    ? `${aboutMatch[1] ?? ''}${aboutMatch[2]}`
      .replace(/\s+(?:and|then|so|to|at|for|with|from|in|on)$/i, '')
      .replace(/\s+/g, ' ').trim()
    : null;
  const offer = offerMatch
    ? `${offerMatch[1].trim()} ${offerMatch[2].trim()}`.replace(/\s+/g, ' ')
    : (about && about.length >= 4 ? about : null);

  /* The industry: the noun phrase carrying the count, e.g. "dental clinics". */
  let industry: string | null = null;
  if (countMatch) {
    const after = hunting.slice((countMatch.index ?? 0) + countMatch[0].length);
    const phrase = after.match(/^\s+((?:[a-z][\w-]*\s+){0,2}[a-z][\w-]*)/i);
    /* Trailing function words come off one at a time, not once. "60 enquiries
       already in our CRM" was reading as "enquiries already", which then
       described the audience as an industry on every screen. */
    if (phrase) {
      industry = phrase[1].trim();
      let trimmed = industry;
      do {
        industry = trimmed;
        trimmed = industry.replace(/\s+(in|that|with|who|which|already|still|sitting|from|for|on|at|and|or|to|our|the)$/i, '');
      } while (trimmed !== industry);
    }
  }
  if (!industry) {
    const m = s.match(/\b(?:find|target|reach|contact|prospect for)\s+((?:[a-z][\w-]*\s+){0,2}[a-z][\w-]*)/i);
    if (m) industry = m[1].trim();
  }
  /* A word for records in a CRM is not an industry. "Work the 60 enquiries" is
     a sentence about this database, not about a market, and treating it as one
     puts "I work with enquiries on…" in a cold email. */
  if (industry && /^(me|them|us|people|everyone|anyone|new|more|enquir(?:y|ies)|inquir(?:y|ies)|leads?|contacts?|customers?|clients?|prospects?|records?|entries|names)$/i.test(industry)) {
    industry = null;
  }

  const sizeHint = /\bmulti[- ]?locations?\b/i.test(s) ? 'multiple locations'
    : /\bmore than one location\b/i.test(s) ? 'more than one location'
    : /\b(\d+)\+?\s*(?:or more\s*)?(?:staff|employees|people|seats)\b/i.test(s) ? (s.match(/\b(\d+)\+?\s*(?:or more\s*)?(?:staff|employees|people|seats)\b/i) as RegExpMatchArray)[0].trim()
    : null;

  return {
    targetCount, priceHint, offer, industry, location, sizeHint,
    channels, followUps, intervalDays, wantsMeetings,
  };
}

/* ── The plan the reading implies ──────────────────────────────────────── */

/**
 * A plan built entirely from what the sentence said, with every gap filled by a
 * declared default. Used when there is no AI key, when the model is unreachable,
 * and whenever the model returns something that does not hold up.
 */
export function fallbackStrategy(objective: string): AIStrategy {
  const r = readObjective(objective);
  const assumed: string[] = [];

  const targetCount = r.targetCount ?? (assumed.push(`No number of prospects was given, so this plan uses ${DEFAULTS.targetCount}.`), DEFAULTS.targetCount);
  const followUps = r.followUps ?? (assumed.push(`No follow-up count was given, so this plan uses ${DEFAULTS.followUps}.`), DEFAULTS.followUps);
  const intervalDays = r.intervalDays ?? (assumed.push(`No gap between messages was given, so this plan uses ${DEFAULTS.intervalDays} days.`), DEFAULTS.intervalDays);

  /* "dental clinics in Texas with more than one location", not "more than one
     location dental clinics in Texas" — the pieces only read as a sentence in
     this order. */
  const who = [
    r.industry,
    r.location ? `in ${r.location}` : null,
    r.sizeHint ? `with ${r.sizeHint}` : null,
  ].filter(Boolean).join(' ').trim();

  /* "in Plano" is not a description of anybody. When the sentence named a place
     but no industry, say so in words rather than leaving the preposition
     dangling at the front of the field. */
  const icpDescription = r.industry
    ? who
    : r.location
      ? `Anyone in ${r.location} the objective covers — it named a place but not an industry.`
      : 'Everyone the objective describes — it did not name an industry or a place, so this needs narrowing before it runs.';
  if (!r.industry) assumed.push('The objective did not name an industry, so prospects are only filtered on what it did say.');

  const signals: string[] = [];
  if (r.sizeHint) signals.push(r.sizeHint);
  if (r.industry) signals.push(`works in ${r.industry}`);
  if (r.location) signals.push(`based in ${r.location}`);
  if (r.priceHint) signals.push(`could plausibly afford ${r.priceHint}`);

  const rationale: string[] = [];
  rationale.push(r.channels.includes('email')
    ? 'Email leads, because it is the cheapest channel to test a message on before spending anything else.'
    : 'Email leads by default — the objective did not name a channel.');
  if (r.channels.includes('sms')) {
    rationale.push('SMS is held back for people who already engaged: an unsolicited text to a stranger is the fastest way to a complaint.');
  }
  if (r.wantsMeetings) rationale.push('A booking link goes out only once someone replies with interest, so the calendar fills with conversations rather than clicks.');
  rationale.push(...assumed);

  /* "about your a free new patient check-up" — an offer taken from someone's own
     words often carries its own article, and pinning "your" in front of it
     makes the one sentence they read first ungrammatical. */
  const offerPhrase = r.offer
    ? (/^(a|an|the|our|your|my|their)\s/i.test(r.offer) ? r.offer : `your ${r.offer}`)
    : 'your offer';

  const summary = [
    `Contact ${targetCount.toLocaleString()} ${r.industry || 'prospects'}${r.location ? ` in ${r.location}` : ''}`,
    r.priceHint ? ` about ${offerPhrase} at ${r.priceHint}` : r.offer ? ` about ${offerPhrase}` : '',
    `. Open on ${r.channels.includes('email') ? 'email' : r.channels[0]}, then ${followUps} follow-up${followUps === 1 ? '' : 's'} ${intervalDays} days apart`,
    r.channels.includes('sms') ? ', with SMS kept for people who have already engaged' : '',
    r.wantsMeetings ? ', and a booking link for anyone who shows interest.' : '.',
  ].join('');

  return {
    summary,
    icp: {
      description: icpDescription,
      industry: r.industry ?? undefined,
      location: r.location ?? undefined,
      sizeHint: r.sizeHint ?? undefined,
      signals,
    },
    offer: { what: r.offer || 'The offer named in the objective', priceHint: r.priceHint ?? undefined },
    channels: r.channels,
    cadence: { followUps, intervalDays },
    exitConditions: [
      'They reply',
      'They book a meeting',
      'They unsubscribe or ask to stop',
      `All ${followUps} follow-ups have been sent with no response`,
    ],
    targetCount,
    rationale,
    generatedBy: 'fallback',
  };
}

/* ── Asking the model ──────────────────────────────────────────────────── */

export interface ProposalResult {
  strategy: AIStrategy;
  /** Why the fallback was used, when it was. Shown to the user, not swallowed. */
  note?: string;
}

interface RawStrategy {
  summary?: unknown;
  icp?: { description?: unknown; industry?: unknown; location?: unknown; sizeHint?: unknown; signals?: unknown };
  offer?: { what?: unknown; priceHint?: unknown };
  channels?: unknown;
  cadence?: { followUps?: unknown; intervalDays?: unknown };
  exitConditions?: unknown;
  targetCount?: unknown;
  rationale?: unknown;
}

const str = (v: unknown, max = 400): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strList = (v: unknown, max = 8): string[] =>
  Array.isArray(v) ? v.map(x => str(x, 200)).filter(Boolean).slice(0, max) : [];

/**
 * Ask the model, then check its answer against the sentence it was given.
 *
 * A model asked for a sales plan will happily produce a confident number of
 * prospects, a price and a region that appear nowhere in the objective. The
 * reading from readObjective() is treated as the authority for anything the
 * user actually stated, and the model's version is only kept where the user
 * said nothing. That way the AI contributes judgement and wording without
 * quietly rewriting the brief.
 */
export async function proposeStrategy(objective: string): Promise<ProposalResult> {
  const fallback = fallbackStrategy(objective);
  const key = getGeminiKey();
  if (!key) {
    return { strategy: fallback, note: 'Planned without an AI model — no Gemini key is set in Settings. Every number below came from your sentence or from a stated default.' };
  }

  const read = readObjective(objective);
  const prompt = `You are planning a B2B outbound sales campaign for a small business.

Their objective, word for word:
"""
${objective.slice(0, 1200)}
"""

Write a plan. Ground every part of it in the objective above. Do not introduce a
number of prospects, a price, an industry or a location that the objective does
not state — if it does not say, leave that field out entirely.

Return JSON only:
{
  "summary": "one paragraph, plain English, what will happen",
  "icp": { "description": "who to contact", "industry": "", "location": "", "sizeHint": "", "signals": ["what makes a lead worth contacting"] },
  "offer": { "what": "", "priceHint": "" },
  "channels": ["email","sms","calendar"],
  "cadence": { "followUps": 3, "intervalDays": 2 },
  "exitConditions": ["when to stop chasing someone"],
  "targetCount": 500,
  "rationale": ["why this approach, one reason per entry"]
}

The rationale must be reasons a business owner would find useful, not a
restatement of the plan. Mention the trade-off in any channel you chose.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini returned ${res.status}`);
    const data = await res.json();
    const raw = JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}') as RawStrategy;

    const merged = reconcile(raw, read, fallback);
    if (!merged) throw new Error('the model returned a plan with no usable content');
    return { strategy: merged };
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    return {
      strategy: fallback,
      note: `Planned without an AI model — ${why}. Every number below came from your sentence or from a stated default.`,
    };
  }
}

/**
 * Keep the model's judgement, keep the user's facts.
 *
 * Returns null when the response is too thin to be worth showing, so the caller
 * falls back rather than presenting an empty plan as though it were a considered
 * one.
 */
export function reconcile(raw: RawStrategy, read: ObjectiveReading, fallback: AIStrategy): AIStrategy | null {
  const summary = str(raw.summary, 600);
  if (!summary) return null;

  const overridden: string[] = [];
  const keepUserNumber = (theirs: unknown, mine: number | null, label: string, fallbackValue: number): number => {
    const n = typeof theirs === 'number' && Number.isFinite(theirs) ? Math.round(theirs) : null;
    if (mine !== null) {
      if (n !== null && n !== mine) overridden.push(`You asked for ${mine} ${label}; the model suggested ${n}. Yours is used.`);
      return mine;
    }
    return n !== null && n > 0 ? n : fallbackValue;
  };

  const targetCount = keepUserNumber(raw.targetCount, read.targetCount, 'prospects', fallback.targetCount);
  const followUps = keepUserNumber(raw.cadence?.followUps, read.followUps, 'follow-ups', fallback.cadence.followUps);
  const intervalDays = keepUserNumber(raw.cadence?.intervalDays, read.intervalDays, 'days between messages', fallback.cadence.intervalDays);

  const theirChannels = Array.isArray(raw.channels)
    ? (raw.channels as unknown[]).map(c => str(c, 20).toLowerCase()).filter((c): c is AIChannel => c === 'email' || c === 'sms' || c === 'calendar')
    : [];
  /* A channel the user named is not optional. A channel only the model wants is. */
  const channels = [...new Set([...read.channels, ...theirChannels])];

  /* Facts the user stated win outright; the model may only fill blanks. */
  const location = read.location ?? (str(raw.icp?.location, 80) || undefined);
  const industry = read.industry ?? (str(raw.icp?.industry, 80) || undefined);
  const sizeHint = read.sizeHint ?? (str(raw.icp?.sizeHint, 80) || undefined);
  const priceHint = read.priceHint ?? (str(raw.offer?.priceHint, 60) || undefined);

  const rationale = strList(raw.rationale, 6);
  return {
    summary,
    icp: {
      description: str(raw.icp?.description, 300) || fallback.icp.description,
      industry, location, sizeHint,
      signals: strList(raw.icp?.signals, 8).length ? strList(raw.icp?.signals, 8) : fallback.icp.signals,
    },
    offer: { what: str(raw.offer?.what, 160) || fallback.offer.what, priceHint },
    channels,
    cadence: { followUps, intervalDays },
    exitConditions: strList(raw.exitConditions, 6).length ? strList(raw.exitConditions, 6) : fallback.exitConditions,
    targetCount,
    rationale: [...rationale, ...overridden],
    generatedBy: 'ai',
  };
}

/* ── Checking an edited plan ───────────────────────────────────────────── */

export interface StrategyProblem { field: string; message: string }

/**
 * What is wrong with a plan a person has edited.
 *
 * These are refusals, not suggestions: each one describes something that would
 * either send nothing or send far too much, and the campaign cannot be approved
 * while any of them stand.
 */
export function checkStrategy(s: AIStrategy): StrategyProblem[] {
  const out: StrategyProblem[] = [];
  if (!s.summary.trim()) out.push({ field: 'summary', message: 'Say in a line what this campaign is meant to do.' });
  if (!s.icp.description.trim()) out.push({ field: 'icp', message: 'Describe who to contact, or there is nothing to build a list from.' });
  if (s.channels.length === 0) out.push({ field: 'channels', message: 'Pick at least one channel — with none, nothing can be sent.' });
  if (!Number.isFinite(s.targetCount) || s.targetCount < 1) out.push({ field: 'targetCount', message: 'How many prospects? One or more.' });
  if (s.targetCount > 100000) out.push({ field: 'targetCount', message: 'That is more than 100,000 prospects. Split it into smaller campaigns you can actually watch.' });
  if (s.cadence.followUps < 0 || s.cadence.followUps > 10) out.push({ field: 'followUps', message: 'Between 0 and 10 follow-ups. More than that is not persistence, it is a complaint.' });
  if (s.cadence.intervalDays < 1) out.push({ field: 'intervalDays', message: 'Leave at least a day between messages.' });
  if (s.cadence.intervalDays > 90) out.push({ field: 'intervalDays', message: 'More than 90 days between messages — by then it reads as a cold email again.' });
  if (s.exitConditions.length === 0) out.push({ field: 'exitConditions', message: 'Say when to stop chasing someone. Without that the sequence never ends.' });
  return out;
}
