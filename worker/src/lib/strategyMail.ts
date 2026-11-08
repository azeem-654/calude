/**
 * The words of the strategy call's emails to the guest (routes/strategyCall.ts
 * sends them through lib/deliver.ts). Pure, so a test or a preview can render
 * them without a Worker.
 */
import { STRATEGY_CALL_PATH, type StrategySettings } from './strategyCall';

export type MailKind = 'booked' | 'moved' | 'cancelled' | 'reminder' | 'review';

/** The parts of a booking row an email reads. */
export interface MailRow { id: string; name: string; company: string; duration: number; answers: string }

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const parse = <T>(s: string | null | undefined, d: T): T => { try { return s ? JSON.parse(s) as T : d; } catch { return d; } };

export function meetingWords(s: StrategySettings): string {
  if (s.meetingType === 'phone') return s.meetingDetails || 'We will call you on the number you gave.';
  if (s.meetingType === 'in_person') return s.meetingDetails || 'The address will follow by email.';
  return s.meetingDetails ? `Join: ${s.meetingDetails}` : 'The video link will be sent to you before the call.';
}

/* ── The guest's emails ──
 * Plain on purpose: one column of text, a box for the time, one button. The
 * owner asked (2026-11-08) for a confirmation that reads like a person who has
 * read what the visitor wrote — so their own answers are quoted back with a
 * promise to come prepared on each, and the call is described as it will
 * actually run. No figures, no testimonials, no claims about other customers:
 * the email promises only what the owner does on the call. */
const P = (html: string, extra = '') => `<p style="margin:0 0 14px${extra}">${html}</p>`;
const H = (text: string) => `<p style="margin:22px 0 8px;font-size:15px;font-weight:700;color:#17191c">${esc(text)}</p>`;
const LIST = (items: string[], ordered = false) => `<${ordered ? 'ol' : 'ul'} style="margin:0 0 14px;padding-left:20px">${items.map(i => `<li style="margin:0 0 6px">${i}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`;
const BUTTON = (href: string, label: string) => `<p style="margin:18px 0"><a href="${esc(href)}" style="display:inline-block;padding:11px 22px;background:#17191c;color:#c8f24d;border-radius:999px;text-decoration:none;font-weight:700">${esc(label)}</a></p>`;
const BOX = (lines: string[]) => `<div style="margin:0 0 16px;padding:14px 16px;border:1px solid #e3e6ea;border-radius:12px;background:#f7f8fa">${lines.map((l, i) => `<div style="${i ? 'margin-top:4px;color:#3d434b' : 'font-weight:700'}">${l}</div>`).join('')}</div>`;
const WRAP = (inner: string) => `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;color:#17191c;font-size:15px;line-height:1.6">${inner}</div>`;

/** The visitor's own answers, with the questions they answered — what they told us they want help with. */
export function concernsOf(r: Pick<MailRow, 'answers'>): { q: string; a: string }[] {
  const a = parse<Record<string, unknown> & { _asked?: Record<string, string> }>(r.answers, {});
  const asked = a._asked ?? {};
  return Object.entries(a)
    .filter(([k, v]) => k !== '_asked' && typeof v === 'string' && v.trim())
    .map(([k, v]) => ({ q: asked[k] ?? '', a: String(v).trim() }));
}

export const QUOTES = (list: { q: string; a: string }[]) => list.map(c =>
  `<div style="margin:0 0 10px;padding:8px 14px;border-left:3px solid #c8f24d;background:#fbfcf6">`
  + (c.q ? `<div style="font-size:12.5px;color:#6b7280">${esc(c.q)}</div>` : '')
  + `<div style="white-space:pre-wrap">${esc(c.a.slice(0, 1200))}</div></div>`).join('');

const SIGN = (s: StrategySettings) => P(`Talk soon,<br>${esc(s.hostName || 'The Protected Central team')}${s.hostName ? `<br><span style="color:#6b7280">${esc(s.hostRole ? `${s.hostRole}, Protected Central` : 'Protected Central')}</span>` : ''}`, ';margin-top:22px');

/** The address of the after-call review, with a rating already chosen when the guest pressed a star in the email. */
const reviewLink = (origin: string, id: string, key: string, stars = 0) =>
  `${origin}${STRATEGY_CALL_PATH}?review=${encodeURIComponent(id)}.${encodeURIComponent(key)}${stars ? `&stars=${stars}` : ''}`;

export function guestMail(s: StrategySettings, r: MailRow, what: MailKind, when: string, manage: string, review: { origin: string; key: string }): { subject: string; html: string } {
  const first = esc(r.name.split(/\s+/)[0] || 'there');
  const title = esc(s.title);
  const company = r.company ? esc(r.company) : 'your business';
  const host = esc(s.hostName || 'we');
  const concerns = concernsOf(r);
  const box = BOX([title, esc(when), `${r.duration} minutes`, esc(meetingWords(s))]);
  const change = manage ? BUTTON(manage, 'Reschedule or cancel') : P('Need to change the time? Reply to this email and we will sort it out.');

  if (what === 'cancelled') {
    return {
      subject: `Cancelled: ${s.title}`,
      html: WRAP(P(`Hi ${first},`) + P(`Your ${title} on <strong>${esc(when)}</strong> is cancelled.`)
        + P('If you would still like to talk, you can book a new time whenever it suits you — or simply reply to this email with your question and we will answer it here.')
        + SIGN(s)),
    };
  }
  if (what === 'review') {
    const stars = [1, 2, 3, 4, 5].map(n => `<a href="${esc(reviewLink(review.origin, r.id, review.key, n))}" style="display:inline-block;margin:0 4px 6px 0;padding:8px 12px;border:1px solid #e3e6ea;border-radius:10px;color:#17191c;text-decoration:none;font-weight:700">${n} ★</a>`).join('');
    return {
      subject: `How did your ${s.title} go?`,
      html: WRAP(P(`Hi ${first},`)
        + P(`Thank you for your time on the ${title}. I hope you came away with clear answers and a next step you can act on${concerns.length ? ' — especially on what you told us you wanted help with' : ''}.`)
        + P('Would you take a minute to say how it went? An honest review, good or bad, is how we make every call more useful.')
        + P('<strong>How was the call?</strong>', ';margin-bottom:8px') + `<div style="margin:0 0 6px">${stars}</div>`
        + BUTTON(reviewLink(review.origin, r.id, review.key), 'Leave a review')
        + P('If anything was left unanswered — or the call did not happen for any reason — just reply to this email. It comes straight to us, and we will pick it up from there.')
        + SIGN(s)),
    };
  }
  if (what === 'moved' || what === 'reminder') {
    return {
      subject: what === 'moved' ? `Moved: ${s.title}` : `Reminder: ${s.title}`,
      html: WRAP(P(`Hi ${first},`)
        + P(what === 'moved' ? `Your ${title} has moved. Here is the new time:` : `A quick reminder that your ${title} is coming up:`)
        + box
        + (concerns.length
          ? P('We have your notes and will come prepared to work through them with you:') + QUOTES(concerns)
          : P('If there is something specific you would like to cover, reply to this email with it and we will come prepared.'))
        + change + SIGN(s)),
    };
  }

  /* booked */
  return {
    subject: `You're booked: ${s.title}`,
    html: WRAP(P(`Hi ${first},`)
      + P(`Thank you for booking — your ${title} is confirmed.`)
      + box
      + (concerns.length
        ? H('What you would like help with') + QUOTES(concerns)
          + P(`Thank you for telling us this up front. ${host === 'we' ? 'We' : host} will read it again before the call and come prepared to work through each point with you, so the time goes on real answers for ${company} — not a generic tour.`)
          + P('If anything else is on your mind before then, just reply to this email. It comes straight to us and goes on the list.')
        : P('Is there something specific on your mind — a goal, a problem, a question you keep coming back to? Reply to this email with it, and we will come to the call prepared with answers.'))
      + H('How the call works')
      + LIST([
        `We listen first: where ${company} is today, and what you would like to change.`,
        'We look together at where new enquiries come from — and where they slip away.',
        'You leave with clear next steps you can act on, whether you do them yourself or we set them up with you.',
      ], true)
      + H('What we can help you with')
      + LIST([
        '<strong>Finding new customers</strong> — searches that return real businesses, the contact details each one publishes, and where it was found.',
        '<strong>Following up without chasing</strong> — email and text sequences sent from your own mailbox that stop the moment someone replies.',
        '<strong>Turning enquiries into appointments</strong> — booking pages in your visitors’ time zones, reminders, and rebooking no-shows.',
        '<strong>More reviews</strong> — asking happy customers at the right moment, and keeping track of what people say about you.',
        '<strong>Staying visible</strong> — social posts, blog articles and short videos in your brand, each waiting for your approval.',
        '<strong>Running it for you</strong> — AI Autopilot plans the work and does it every day; nothing goes out until you approve it.',
      ])
      + H('To get the most from the call')
      + LIST([
        'Have your website open, and a rough idea of how many enquiries you get in a month.',
        'Bring every question you have — nothing is too small or too basic.',
      ])
      + P('The call is about your business and what would genuinely help it. There is no obligation and no hard sell.')
      + change + SIGN(s)),
  };
}

