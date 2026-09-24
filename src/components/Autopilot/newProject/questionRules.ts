/**
 * The rules a question screen is checked against, kept out of the component
 * file so it only exports components (fast refresh needs that).
 */
import type { Attachment, IntakeState, Screen } from '../../../services/projectIntake';

export const MANUAL_FIELDS = [
  { id: 'bizName', label: 'Business name', placeholder: 'Pike Plumbing & Heating' },
  { id: 'bizWhat', label: 'What it does', placeholder: 'Boiler repairs and installations across Leeds' },
  { id: 'bizWho', label: 'Who buys it', placeholder: 'Homeowners and small landlords' },
] as const;

/** What is still missing on a screen, said on the button. Empty when complete. */
export function screenBlocker(screen: Screen, state: IntakeState, files: Attachment[], profile: ProfileCheck): string {
  for (const q of screen.questions) {
    const v = state.known[q.id]?.value;
    const empty = v === undefined || (Array.isArray(v) ? !v.length : !String(v).trim());
    if (q.id === 'business') {
      if (empty) return 'Choose how to learn about the business';
      continue;
    }
    if (q.need === 'required' && empty) return `Answer: ${q.prompt.replace(/\?$/, '').toLowerCase()}`;
  }
  /* After the screen's own questions, so "add the website address" comes
     before "read the website first". */
  if (screen.questions.some(q => q.id === 'business')) return profileGap(state, files, profile);
  return '';
}


/**
 * The business profile, as far as the wizard has got with it.
 *
 * `draft` is what was read — from the website or the uploaded profile — and
 * then corrected by the customer on the business screen. `readFor` is what it
 * was read from, so changing the address after reading it is noticed rather
 * than building from a different site's profile.
 */
export interface ProfileCheck {
  draft: Record<string, string> | null;
  readFor: string;
  reading: boolean;
  error: string;
}

/** What the business screen shows once a site or document has been read. */
export const PROFILE_FIELDS = [
  { id: 'companyName', label: 'Business name', need: true, placeholder: 'Pike Plumbing & Heating' },
  { id: 'description', label: 'What it does', need: true, placeholder: 'Boiler repairs and installations across Leeds' },
  { id: 'audience', label: 'Who buys it', need: false, placeholder: 'Homeowners and small landlords' },
] as const;

/**
 * What is still missing from the business before anything can be built from
 * it. Empty when there is enough.
 *
 * This used to be found out at the very end: a site was read during the build,
 * the reading came back without a name, and the build stopped at 35% with "A
 * portfolio needs the client's name" — on a screen with no field to type it
 * into. Every project is written from this profile, so it is checked where it
 * is given, and checked again before Build.
 */
export function profileGap(state: IntakeState, files: Attachment[], p: ProfileCheck): string {
  const business = String(state.known.business?.value ?? '');
  if (business === 'manual') {
    if (!String(state.known.bizName?.value ?? '').trim()) return 'Add the business name';
    if (String(state.known.bizWhat?.value ?? '').trim().length < 8) return 'Say what the business does';
    return '';
  }
  if (business !== 'website' && business !== 'upload') return '';
  const source = business === 'website'
    ? String(state.known.website?.value ?? '').trim()
    : files.filter(f => f.kind === 'pdf' || f.kind === 'text').map(f => f.id).join(',');
  if (!source) return business === 'website' ? 'Add the website address' : 'Attach the company profile';
  if (p.reading) return business === 'website' ? 'Reading the website…' : 'Reading the profile…';
  if (p.readFor !== source || !p.draft) return business === 'website' ? 'Read the website first' : 'Read the profile first';
  if (!String(p.draft.companyName ?? '').trim()) return 'Add the business name';
  if (String(p.draft.description ?? '').trim().length < 8) return 'Say what the business does';
  return '';
}

/** What the business is being read from — the key `readFor` is compared to. */
export function profileSource(state: IntakeState, files: Attachment[]): string {
  const business = String(state.known.business?.value ?? '');
  if (business === 'website') return String(state.known.website?.value ?? '').trim();
  if (business === 'upload') return files.filter(f => f.kind === 'pdf' || f.kind === 'text').map(f => f.id).join(',');
  return '';
}
