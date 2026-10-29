/**
 * Spotting patient information before it leaves for somewhere it must not go.
 *
 * Patient records stay in the practice's own EHR / practice-management
 * system; Protected Central keeps only references, codes and amounts
 * (docs/HIPAA-LAUNCH-BLOCKERS.md). The medical billing module already refuses
 * an SSN in any box (`phiProblem` in lib/rcm.ts). This is the same idea for
 * the places that are *not* that module but could still be handed patient
 * details by somebody typing or pasting: the AI, a support ticket or chat, a
 * marketing campaign. None of those is covered by a business associate
 * agreement today.
 *
 * ── Why only these patterns ──
 *
 * Each one is either a fixed format (an SSN, a Medicare Beneficiary
 * Identifier) or a value next to its own label ("DOB: 04/12/1961", "MRN
 * 448812", "member ID W1234…"). A bare date or a bare number is everywhere
 * in marketing copy — an event date, a price, an order number — and refusing
 * those would teach people to ignore the refusal. So this catches what is
 * unmistakably patient data and misses what is ambiguous; it is a safety net,
 * not a guarantee, and the screens say patient details belong in the
 * practice's own system.
 *
 * Pure, no imports: the browser imports it too (services/phiGuard.ts).
 */

export interface PhiFinding {
  /** What it looked like, in words a person reads. */
  kind: 'Social Security number' | 'Medicare number' | 'date of birth' | 'medical record number' | 'insurance member ID' | 'patient name and date of birth';
  /** The characters matched, for redaction. Never logged or stored. */
  match: string;
}

const SSN = /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g;
/* CMS's Medicare Beneficiary Identifier: 11 characters, letters from a set
   that leaves out S, L, O, I, B and Z; written with or without dashes. */
const MBI_L = '[AC-HJKMNP-RT-Y]';
const MBI_A = '[AC-HJKMNP-RT-Y0-9]';
const MBI = new RegExp(`\\b[1-9]${MBI_L}${MBI_A}\\d-?${MBI_L}${MBI_A}\\d-?${MBI_L}${MBI_L}\\d\\d\\b`, 'g');
const DATE = String.raw`(?:\d{1,2}[/.-]\d{1,2}[/.-](?:19|20)?\d{2}|(?:19|20)\d{2}-\d{2}-\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{1,2},? (?:19|20)\d{2})`;
const DOB = new RegExp(String.raw`\b(?:d\.?o\.?b\.?|date of birth|birth ?date|born on)\s*(?:[:#-]|is|was|of)?\s*${DATE}`, 'gi');
const MRN = /\b(?:mrn|medical record(?: number| no\.?| #)?|chart (?:number|no\.?|#))\s*[:#-]?\s*[A-Z0-9-]{4,}\b/gi;
const MEMBER = /\b(?:member|subscriber|insurance|policy|beneficiary)\s*(?:id|number|no\.?|#)\s*[:#-]?\s*[A-Z0-9-]{5,}\b/gi;
const PATIENT_DOB = new RegExp(String.raw`\b[Pp]atient\s*[:-]?\s*[A-Z][a-z]+\s+[A-Z][a-z]+\b[^.\n]{0,40}${DATE}`, 'g');

const RULES: [PhiFinding['kind'], RegExp][] = [
  ['Social Security number', SSN],
  ['Medicare number', MBI],
  ['date of birth', DOB],
  ['medical record number', MRN],
  ['insurance member ID', MEMBER],
  ['patient name and date of birth', PATIENT_DOB],
];

/** Every likely piece of patient information in a text, in the order found. */
export function findPhi(text: unknown): PhiFinding[] {
  const s = typeof text === 'string' ? text : text == null ? '' : JSON.stringify(text);
  if (s.length < 6) return [];
  const out: PhiFinding[] = [];
  for (const [kind, re] of RULES) {
    re.lastIndex = 0;
    for (const m of s.matchAll(re)) out.push({ kind, match: m[0] });
  }
  return out;
}

/** One sentence for a refusal, naming what was found — never the value itself. */
export function phiRefusal(findings: PhiFinding[], where: string): string | null {
  if (!findings.length) return null;
  const kinds = [...new Set(findings.map(f => f.kind))];
  const named = kinds.length === 1 ? kinds[0] : `${kinds.slice(0, -1).join(', ')} and ${kinds[kinds.length - 1]}`;
  return `This looks like patient information (${named}). Remove it before sending it to ${where} — patient details stay in the practice’s own records system, and ${where} is not covered by a business associate agreement.`;
}

export const REDACTED = '[removed — looked like patient information]';

/** The text with every finding replaced, and how many were replaced. */
export function redactPhi(text: string): { text: string; removed: number } {
  let removed = 0;
  let out = text;
  for (const [, re] of RULES) {
    re.lastIndex = 0;
    out = out.replace(re, () => { removed++; return REDACTED; });
  }
  return { text: out, removed };
}
