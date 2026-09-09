/**
 * Which inbound messages get answered, and which must never be.
 *
 * The matching and the sentiment heuristic are ported from
 * src/services/mailboxService.ts rather than reinvented — they are pure
 * functions over a message, and two copies that drifted would mean the inbox
 * screen and the cron disagreeing about whether a rule fired.
 *
 * What is *not* ported is the part that only made sense in a browser: the
 * client loop assumed a person was watching and could undo a bad reply within
 * seconds. Nobody is watching here, so this file also carries the refusals —
 * the messages that must never be replied to automatically, whatever the rules
 * say.
 */

export type Sentiment = 'positive' | 'neutral' | 'negative';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';

export interface InboundMessage {
  /** As IMAP gives it: a string. See 0011 for why it is not narrowed. */
  uid: string;
  from: string;
  fromName: string;
  subject: string;
  body: string;
  date: string;
}

export interface AutoReplyRule {
  id: string;
  name: string;
  enabled: boolean;
  match: { type: 'first_contact' | 'keyword' | 'out_of_hours' | 'always' | 'negative_sentiment'; keywords?: string[] };
  mode: 'auto_send' | 'draft';
  instruction: string;
}

/* ─── Sentiment, exactly as the client computes it ─── */
const NEG = ['angry', 'terrible', 'awful', 'refund', 'cancel', 'complaint', 'broken', 'worst', 'disappointed', 'unacceptable', 'frustrated', 'never', 'scam', 'urgent', 'asap', 'immediately', 'lawyer', 'legal'];
const POS = ['thanks', 'thank you', 'great', 'love', 'awesome', 'excellent', 'appreciate', 'perfect', 'happy', 'wonderful'];
const URGENT = ['urgent', 'asap', 'immediately', 'emergency', 'critical', 'right now', 'today'];

export function classify(text: string): { sentiment: Sentiment; priority: Priority } {
  const t = text.toLowerCase();
  const neg = NEG.filter(w => t.includes(w)).length;
  const pos = POS.filter(w => t.includes(w)).length;
  const sentiment: Sentiment = neg > pos ? 'negative' : pos > neg ? 'positive' : 'neutral';
  const urgent = URGENT.some(w => t.includes(w));
  const priority: Priority = urgent ? 'urgent' : neg >= 2 ? 'high' : sentiment === 'negative' ? 'high' : 'normal';
  return { sentiment, priority };
}

/**
 * ── Never answer these ──
 *
 * Every one of these is a real way an automated replier embarrasses the
 * business paying for it, and none is caught by the rules a customer writes.
 *
 * The loop kind is the dangerous one: two auto-responders discovering each
 * other send mail back and forth until somebody notices, and the sender is
 * usually a machine that will never get bored. Everything from a no-reply
 * address, a mailing list, or carrying an auto-submitted header is refused
 * outright.
 *
 * Unsubscribe requests are refused for a different reason — answering somebody
 * who asked to be left alone is the one reply guaranteed to make them angrier.
 */
const NO_REPLY_ADDRESS = /(^|[.@_-])(no[-_.]?reply|do[-_.]?not[-_.]?reply|noreply|postmaster|mailer[-_.]?daemon|bounce|notifications?|automated|alerts?)([.@_-]|$)/i;

const AUTOMATED_SUBJECT = /^(auto(matic)?[- ]?reply|out of (the )?office|automatic reply|undeliverable|delivery status notification|mail delivery|returned mail|read: |accepted: |declined: )/i;

const OPT_OUT = /\b(unsubscribe|opt[- ]?out|remove me|take me off|stop (emailing|contacting)|do not (contact|email))\b/i;

/** A legal threat or a formal complaint is a human's job, always. */
const ESCALATE = /\b(solicitor|lawyer|attorney|legal action|sue you|small claims|ombudsman|trading standards|chargeback|fraud|police)\b/i;

export type Refusal =
  | { refuse: false }
  /* 'held' is not quite a refusal — it means a person must write this one, so
     it is drafted and queued rather than dropped. Kept in the same type because
     the decision is made in the same place and by the same reading of the
     message. */
  | { refuse: true; outcome: 'stopped' | 'ignored' | 'held'; because: string };

/**
 * Should this message be left alone?
 *
 * Returns the reason as well as the verdict, because the reason goes in the log
 * — "no reply was sent because it came from a no-reply address" is checkable;
 * silence is not.
 */
export function shouldRefuse(msg: InboundMessage, headers: Record<string, string> = {}): Refusal {
  const from = (msg.from ?? '').toLowerCase();
  const subject = msg.subject ?? '';
  const text = `${subject} ${msg.body ?? ''}`;

  /* RFC 3834: mail that says it was generated automatically. Honouring it is
     the difference between a polite system and a mail loop. */
  const auto = headers['auto-submitted'] ?? headers['Auto-Submitted'] ?? '';
  if (auto && !/^no$/i.test(auto.trim())) {
    return { refuse: true, outcome: 'ignored', because: 'it was sent automatically and answering it risks a mail loop' };
  }
  if (headers['list-unsubscribe'] || headers['List-Unsubscribe'] || headers['list-id'] || headers['List-Id']) {
    return { refuse: true, outcome: 'ignored', because: 'it came from a mailing list rather than a person' };
  }
  if (headers['x-autoreply'] || headers['x-autorespond'] || headers['precedence']?.match(/bulk|auto|list/i)) {
    return { refuse: true, outcome: 'ignored', because: 'it is marked as bulk or automated mail' };
  }
  if (NO_REPLY_ADDRESS.test(from)) {
    return { refuse: true, outcome: 'ignored', because: 'it came from a no-reply address, so a reply would go nowhere' };
  }
  if (AUTOMATED_SUBJECT.test(subject)) {
    return { refuse: true, outcome: 'ignored', because: 'it is an out-of-office or delivery notice, not a question' };
  }
  if (OPT_OUT.test(text)) {
    return { refuse: true, outcome: 'stopped', because: 'they asked not to be contacted, and answering that is the one reply guaranteed to make it worse' };
  }
  if (ESCALATE.test(text)) {
    return { refuse: true, outcome: 'held', because: 'it mentions legal action or a formal complaint, which is a person\'s job' };
  }
  return { refuse: false };
}

/** True when this looks like a formal complaint that a person must handle. */
export function needsEscalation(msg: InboundMessage): boolean {
  return ESCALATE.test(`${msg.subject ?? ''} ${msg.body ?? ''}`);
}

/**
 * Business hours, as the client understands them.
 *
 * Deliberately crude and deliberately UTC: the customer's own hours string is
 * free text ("Mon–Fri 9am–6pm ET") and parsing it reliably is a bigger problem
 * than it looks. The only rule that depends on this is `out_of_hours`, and
 * being an hour out on it sends a slightly early "we'll get back to you
 * tomorrow" — not a wrong answer to a real question.
 */
export function withinBusinessHours(now = new Date()): boolean {
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  return day >= 1 && day <= 5 && hour >= 9 && hour < 18;
}

/** The first enabled rule that matches, or null. Ported from mailboxService. */
export function matchRule(
  rules: AutoReplyRule[],
  msg: InboundMessage,
  isFirstContact: boolean,
  sentiment: Sentiment,
  now = new Date(),
): AutoReplyRule | null {
  const text = `${msg.subject} ${msg.body}`.toLowerCase();
  for (const rule of rules ?? []) {
    if (!rule.enabled) continue;
    const m = rule.match;
    if (m.type === 'always') return rule;
    if (m.type === 'first_contact' && isFirstContact) return rule;
    if (m.type === 'out_of_hours' && !withinBusinessHours(now)) return rule;
    if (m.type === 'negative_sentiment' && sentiment === 'negative') return rule;
    if (m.type === 'keyword' && (m.keywords ?? []).some(k => k.trim() && text.includes(k.trim().toLowerCase()))) return rule;
  }
  return null;
}

/** The prompt, kept in step with draftEmailReply in src/lib/gemini.ts. */
export function replyPrompt(
  ctx: {
    companyName: string; industry: string; description: string; products: string;
    businessHours: string; website: string; knowledge: string; tone: string; signature: string;
  },
  email: { from: string; fromName: string; subject: string; body: string },
  extraInstruction = '',
): string {
  return `You are a customer support agent replying on behalf of a company. Write a reply to the customer's email below.

=== COMPANY PROFILE (the only source of truth about the company) ===
Company: ${ctx.companyName || '(unspecified)'}
Industry: ${ctx.industry || '(unspecified)'}
What we do: ${ctx.description || '(unspecified)'}
Products / services: ${ctx.products || '(unspecified)'}
Business hours: ${ctx.businessHours || '(unspecified)'}
Website: ${ctx.website || '(unspecified)'}
Knowledge base / FAQ / policies:
${ctx.knowledge || '(none provided)'}

=== STYLE ===
Tone: ${ctx.tone || 'professional'}. Keep it concise, warm and helpful. Address the customer by their first name if known. Do NOT invent facts, prices, features, or policies that are not in the company profile above — if the answer isn't covered, acknowledge the request and say a team member will follow up with specifics.
${extraInstruction ? `Extra instruction for THIS reply: ${extraInstruction}` : ''}
End the message with this exact signature block:
${ctx.signature || ctx.companyName || ''}

=== CUSTOMER EMAIL ===
From: ${email.fromName} <${email.from}>
Subject: ${email.subject}
Body:
${email.body}

Return ONLY valid JSON, no markdown fences:
{
  "subject": "Re: <original subject>",
  "body": "the full reply as plain text with \\n line breaks, including the signature",
  "confidence": <0-100: how well the company knowledge covered the customer's question>,
  "needsHuman": <true if you had to defer specifics to a human, else false>
}`;
}
