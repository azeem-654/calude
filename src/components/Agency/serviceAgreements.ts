/**
 * The e-commerce managed service's paperwork: a Service Agreement and a
 * monthly Scope of Work, drawn from what the owner fills in.
 *
 * ── Why templates and not finished contracts ──
 *
 * Nobody here is a lawyer, and a contract that reads as final invites somebody
 * to sign it unread. Every document this file produces opens and closes with
 * the same line: a draft for review by a qualified attorney. Nothing is
 * invented to fill a gap — a term the owner has not set is printed as
 * "[to be agreed]", which is what a draft should show its reviewer.
 *
 * ── Why the defaults come from lib/offers.ts ──
 *
 * The public page (/ecommerce-management-services) already says what the fee
 * is for, what the client pays separately, what the client keeps doing and
 * that nothing is guaranteed. The agreement repeats those words from the same
 * object, so the page and the paper cannot drift apart.
 *
 * Pure: no React, no storage. AgreementTemplates.tsx draws the form and the
 * preview; test/serviceAgreements.test.mts checks the rules above.
 */
import { ECOMMERCE_OFFER, dollars } from '../../../worker/src/lib/offers';

export const DRAFT_NOTICE = 'DRAFT — a template for review by a qualified attorney before use. It is not legal advice, and nothing in it is in force until both parties sign a version their own advisers have approved.';
export const TBD = '[to be agreed]';

export interface AgreementInput {
  /* Parties */
  providerName: string;
  providerAddress: string;
  clientName: string;
  clientAddress: string;
  effectiveDate: string;            // yyyy-mm-dd
  /* Term */
  initialTermMonths: number | null;
  renewal: 'monthly' | 'same-term' | 'none';
  noticeDays: number | null;
  /** Days a party has to put a material breach right before the other may end the agreement for cause. */
  cureDays: number | null;
  /* Money */
  monthlyFeeCents: number | null;
  setupFeeCents: number | null;
  invoiceDay: number | null;        // day of the month invoices are issued
  paymentDays: number | null;       // net days
  lateInterestPct: string;          // e.g. "1% a month, or the highest rate the law allows if lower"
  additionalWorkRateCents: number | null;   // per hour, for work outside the scope
  /* Scope */
  platforms: string;                // "Shopify store; Amazon and eBay seller accounts"
  productsPerMonth: number | null;
  adChannels: string;
  monthlyAdBudget: string;          // set by the client, paid by them
  emailSmsCampaigns: number | null;
  contentPieces: number | null;
  supportHours: string;             // "Mon–Fri 9:00–17:00 ET, email and the help desk"
  reportDay: number | null;
  extraDeliverables: string[];      // free lines the owner adds
  extraExclusions: string[];
  extraClientDuties: string[];
  /* Law */
  governingLaw: string;             // a state or country — the lawyer's choice, never defaulted
  liabilityCapMonths: number | null;
  /** How long confidentiality lasts after the end — a lawyer's call, so never defaulted. */
  confidentialityYears: number | null;
}

export function blankAgreement(today = new Date().toISOString().slice(0, 10)): AgreementInput {
  return {
    providerName: '', providerAddress: '', clientName: '', clientAddress: '', effectiveDate: today,
    initialTermMonths: null, renewal: 'monthly', noticeDays: null, cureDays: null,
    monthlyFeeCents: ECOMMERCE_OFFER.monthlyCents, setupFeeCents: null, invoiceDay: 1, paymentDays: null, lateInterestPct: '',
    additionalWorkRateCents: null,
    platforms: '', productsPerMonth: null, adChannels: '', monthlyAdBudget: '', emailSmsCampaigns: null, contentPieces: null,
    supportHours: '', reportDay: null, extraDeliverables: [], extraExclusions: [], extraClientDuties: [],
    governingLaw: '', liabilityCapMonths: null, confidentialityYears: null,
  };
}

/** A section of a document: its heading and its paragraphs (a list is a paragraph per item). */
export interface DocSection { heading: string; paragraphs: string[]; list?: boolean }
export interface DraftDoc { kind: 'agreement' | 'scope'; title: string; sections: DocSection[]; missing: string[] }

const has = (s: string) => s.trim().length > 0;

/**
 * Collects what a reviewer must still settle, while the text is written —
 * so the "still to agree" list is exactly the placeholders in the document.
 */
function gaps() {
  const missing: string[] = [];
  const str = (v: string, what: string) => { if (has(v)) return v.trim(); missing.push(what); return TBD; };
  const num = (v: number | null, what: string, f: (n: number) => string = String) => {
    if (v !== null && Number.isFinite(v) && v >= 0) return f(v);
    missing.push(what); return TBD;
  };
  return { missing, str, num };
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};
const longDate = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? TBD : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};
const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
const months = (n: number) => `${n} month${n === 1 ? '' : 's'}`;

export function serviceAgreement(a: AgreementInput): DraftDoc {
  const g = gaps();
  const provider = g.str(a.providerName, 'Provider’s legal name');
  const client = g.str(a.clientName, 'Client’s legal name');
  const start = has(a.effectiveDate) ? longDate(a.effectiveDate) : g.str('', 'Effective date');
  const term = g.num(a.initialTermMonths, 'Initial term', months);
  const notice = g.num(a.noticeDays, 'Notice period', days);
  const cure = g.num(a.cureDays, 'Days to cure a breach', days);
  const fee = g.num(a.monthlyFeeCents, 'Monthly fee', c => dollars(c));
  const pay = g.num(a.paymentDays, 'Payment terms (days)', days);
  const law = g.str(a.governingLaw, 'Governing law');
  const cap = g.num(a.liabilityCapMonths, 'Liability cap', months);
  const rate = g.num(a.additionalWorkRateCents, 'Rate for additional work', c => `${dollars(c)} an hour`);
  const secrecy = g.num(a.confidentialityYears ?? null, 'How long confidentiality lasts', n => `${n} year${n === 1 ? '' : 's'}`);
  const renewal = a.renewal === 'none'
    ? `This Agreement ends at the end of the Initial Term unless the parties sign a renewal.`
    : a.renewal === 'same-term'
      ? `At the end of the Initial Term this Agreement renews for further periods equal to the Initial Term, unless either party gives written notice of non-renewal at least ${notice} before the end of the current period.`
      : `After the Initial Term this Agreement continues month to month until either party ends it by giving at least ${notice} written notice.`;

  const sections: DocSection[] = [
    { heading: 'Parties', paragraphs: [
      `This E-commerce Business Setup & Growth Management Services Agreement (the “Agreement”) is made on ${start} (the “Effective Date”) between ${provider}${has(a.providerAddress) ? `, of ${a.providerAddress.trim()}` : ''} (the “Provider”), and ${client}${has(a.clientAddress) ? `, of ${a.clientAddress.trim()}` : ''} (the “Client”).`,
    ] },
    { heading: '1. Services', paragraphs: [
      `The Provider will perform the e-commerce setup and management services described in the Scope of Work signed with this Agreement (the “Scope”). ${ECOMMERCE_OFFER.feeBasis}`,
      'A new or changed Scope takes effect only when both parties sign it. Where this Agreement and a Scope disagree, the Scope governs for that month’s deliverables and this Agreement governs everything else.',
    ] },
    { heading: '2. Term and renewal', paragraphs: [
      `This Agreement starts on the Effective Date and runs for an initial term of ${term} (the “Initial Term”). ${renewal}`,
    ] },
    { heading: '3. Ending the agreement', paragraphs: [
      `Either party may end this Agreement for convenience after the Initial Term by giving at least ${notice} written notice.`,
      `Either party may end this Agreement by written notice if the other materially breaches it and does not put the breach right within ${cure} of being told about it in writing, or if the other becomes insolvent.`,
      'When the Agreement ends, the Client pays for services performed up to the end date; each party returns or deletes the other’s confidential information as section 8 describes; and the Provider hands back access to every account it was given, removing its own users.',
    ] },
    { heading: '4. Fees and payment', paragraphs: [
      `The Client pays a monthly fee of ${fee}${a.setupFeeCents ? ` and a one-time setup fee of ${dollars(a.setupFeeCents)}` : ''}, in US dollars, plus any taxes that apply to the services.`,
      `The Provider invoices on the ${a.invoiceDay ? ordinal(Math.min(28, Math.max(1, a.invoiceDay))) : TBD} day of each month for that month’s services. Invoices are due within ${pay} of the invoice date.${has(a.lateInterestPct) ? ` Overdue amounts carry interest at ${a.lateInterestPct.trim()}.` : ''}`,
      'The fee does not change during the Initial Term. Afterwards the Provider may change it with at least the notice period above, in writing.',
    ] },
    { heading: '5. What is not included', paragraphs: [
      'These are paid by the Client directly and are never part of the Provider’s fee unless a signed Scope says otherwise:',
      ...ECOMMERCE_OFFER.separate,
      ...a.extraExclusions.filter(has),
      ECOMMERCE_OFFER.noGuarantee,
    ] },
    { heading: '6. Client responsibilities', paragraphs: [
      'The Client is responsible for:',
      ...ECOMMERCE_OFFER.clientDuties,
      ...a.extraClientDuties.filter(has),
    ] },
    { heading: '7. Additional work', paragraphs: [
      `Work outside the Scope is done only after the Client approves it in writing (email is enough), at ${rate} or a fixed price quoted in advance. The Provider says before starting whether a request is outside the Scope.`,
    ] },
    { heading: '8. Confidentiality', paragraphs: [
      'Each party keeps the other’s non-public business information confidential, uses it only to perform or receive the services, and shares it only with staff and contractors who need it and are bound by similar duties. This does not cover information that is public, already known to the recipient, independently developed, or that the law requires to be disclosed (after notice to the other party where allowed).',
      `These duties continue for ${secrecy} after the Agreement ends, and for trade secrets for as long as they remain trade secrets.`,
    ] },
    { heading: '9. Data handling', paragraphs: [
      'The Client remains the owner and controller of its customer, order and account data. The Provider processes it only to perform the services and on the Client’s instructions, using access the Client grants and can withdraw at any time.',
      'The Provider uses unique logins for its staff, does not share passwords, uses multi-factor sign-in where a platform offers it, and tells the Client without undue delay after becoming aware of any unauthorised access to the Client’s data or accounts.',
      'Card numbers are never collected or stored by the Provider; payments are taken by the Client’s own payment processor. Where the law requires a separate data-processing agreement, the parties sign one and it forms part of this Agreement.',
    ] },
    { heading: '10. Ownership', paragraphs: [
      'Content, listings and creative made for the Client under a paid Scope belong to the Client once paid for. The Provider keeps its own tools, templates and know-how, and may reuse general methods that do not contain the Client’s confidential information.',
    ] },
    { heading: '11. Liability', paragraphs: [
      `Neither party is liable for indirect or consequential loss, including lost profits or sales. Each party’s total liability under this Agreement is limited to the fees paid or payable in the ${cap} before the claim arose. Nothing limits liability that cannot be limited by law.`,
    ] },
    { heading: '12. General', paragraphs: [
      `This Agreement is governed by the laws of ${law}. Notices must be in writing to the addresses above or to an email address a party names for notices. This Agreement and its signed Scopes are the whole agreement between the parties on this subject; changes must be in writing and signed by both.`,
    ] },
    { heading: 'Signatures', paragraphs: [
      `Signed for the Provider (${provider}): ______________________  Name: ______________  Title: ______________  Date: __________`,
      `Signed for the Client (${client}): ______________________  Name: ______________  Title: ______________  Date: __________`,
    ] },
  ];
  return { kind: 'agreement', title: 'E-commerce Services Agreement', sections: listify(sections), missing: g.missing };
}

export function scopeOfWork(a: AgreementInput): DraftDoc {
  const g = gaps();
  const provider = g.str(a.providerName, 'Provider’s legal name');
  const client = g.str(a.clientName, 'Client’s legal name');
  const platforms = g.str(a.platforms, 'Platforms and marketplaces in scope');
  const products = g.num(a.productsPerMonth, 'Products/listings a month');
  const ads = g.str(a.adChannels, 'Advertising channels');
  const budget = has(a.monthlyAdBudget) ? a.monthlyAdBudget.trim() : TBD;
  if (!has(a.monthlyAdBudget)) g.missing.push('Monthly ad budget (set by the Client)');
  const campaigns = g.num(a.emailSmsCampaigns, 'Email and SMS campaigns a month');
  const content = g.num(a.contentPieces, 'Social and blog pieces a month');
  const support = g.str(a.supportHours, 'Support hours and channels');
  const report = g.num(a.reportDay, 'Report day', n => `the ${ordinal(Math.min(28, Math.max(1, n)))} working day`);
  const fee = g.num(a.monthlyFeeCents, 'Monthly fee', c => dollars(c));

  const sections: DocSection[] = [
    { heading: 'About this Scope', paragraphs: [
      `This Scope of Work is made under the E-commerce Services Agreement between ${provider} (the “Provider”) and ${client} (the “Client”), and sets out what one month of service includes for a monthly fee of ${fee}. It takes effect on ${a.effectiveDate ? longDate(a.effectiveDate) : TBD} and stays in effect until replaced by a newer signed Scope.`,
    ] },
    { heading: 'Monthly deliverables', list: true, paragraphs: [
      `Platforms and marketplaces in scope: ${platforms}. The Client gives the Provider the access each platform allows.`,
      `Products and listings: up to ${products} set up or substantially updated each month.`,
      `Advertising: management of ${ads}, within a monthly ad budget of ${budget} set and paid by the Client directly to each platform.`,
      `Email and SMS: up to ${campaigns} campaigns or automations built or run each month, each approved by the Client before it is sent.`,
      `Content: up to ${content} social or blog pieces prepared each month, each approved by the Client before it is published.`,
      `Customer support and tickets: ${support}. Refunds, disputes and anything needing the Client’s decision are escalated to the Client.`,
      `Monthly report: delivered by ${report} of each month, covering the work done and the figures the platforms themselves report.`,
      ...a.extraDeliverables.filter(has),
    ] },
    { heading: 'Settled before the first month', list: true, paragraphs: ECOMMERCE_OFFER.scopeCovers },
    { heading: 'Not included', list: true, paragraphs: [...ECOMMERCE_OFFER.separate, ...a.extraExclusions.filter(has)] },
    { heading: 'The Client’s part', list: true, paragraphs: [...ECOMMERCE_OFFER.clientDuties, ...a.extraClientDuties.filter(has)] },
    { heading: 'Unused allowances and changes', paragraphs: [
      'Monthly quantities are upper limits, not commitments to produce work that is not needed, and they do not carry over to the next month unless both parties agree in writing. Work beyond them is additional work under section 7 of the Agreement.',
      ECOMMERCE_OFFER.noGuarantee,
    ] },
    { heading: 'Signatures', paragraphs: [
      `Signed for the Provider (${provider}): ______________________  Date: __________`,
      `Signed for the Client (${client}): ______________________  Date: __________`,
    ] },
  ];
  return { kind: 'scope', title: 'Scope of Work — E-commerce Business Setup & Growth Management', sections: listify(sections), missing: g.missing };
}

/* The exclusions and duties sections are an intro line plus a list; mark them
   so the renderers draw bullets after the first paragraph. */
function listify(sections: DocSection[]): DocSection[] {
  return sections.map(s => (s.heading.startsWith('5.') || s.heading.startsWith('6.') ? { ...s, list: true } : s));
}

const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] as string));

/** A self-contained page: opened in a new tab it prints to PDF; saved, it opens anywhere. */
export function toHtml(doc: DraftDoc): string {
  const body = doc.sections.map(s => {
    const intro = s.list && s.heading.match(/^\d+\./) ? s.paragraphs.slice(0, 1) : [];
    const items = s.list ? s.paragraphs.slice(intro.length) : [];
    const plain = s.list ? intro : s.paragraphs;
    return `<h2>${esc(s.heading)}</h2>${plain.map(p => `<p>${esc(p)}</p>`).join('')}${items.length ? `<ul>${items.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}`;
  }).join('\n');
  const todo = doc.missing.length ? `<div class="todo"><b>Still to agree (${doc.missing.length}):</b> ${doc.missing.map(esc).join(' · ')}</div>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(doc.title)} (draft)</title>
<style>body{font:15px/1.6 Georgia,'Times New Roman',serif;color:#111;max-width:760px;margin:40px auto;padding:0 20px}h1{font-size:24px;margin:0 0 6px}h2{font-size:16px;margin:26px 0 6px}.draft{border:2px solid #b42318;color:#b42318;padding:10px 14px;font:600 13px/1.5 Arial,sans-serif;margin:14px 0 20px}.todo{background:#fff7e6;border:1px solid #f0c36d;padding:10px 14px;font:13px/1.5 Arial,sans-serif;margin:0 0 20px}@media print{.todo{display:none}}</style></head>
<body><div class="draft">${esc(DRAFT_NOTICE)}</div><h1>${esc(doc.title)}</h1>${todo}
${body}
<div class="draft">${esc(DRAFT_NOTICE)}</div></body></html>`;
}

export function toText(doc: DraftDoc): string {
  const lines = [DRAFT_NOTICE, '', doc.title.toUpperCase(), ''];
  for (const s of doc.sections) {
    lines.push(s.heading, '');
    const introLen = s.list && /^\d+\./.test(s.heading) ? 1 : 0;
    s.paragraphs.forEach((p, i) => lines.push(s.list && i >= introLen ? `  • ${p}` : p));
    lines.push('');
  }
  lines.push(DRAFT_NOTICE);
  return lines.join('\n');
}
